// Détection « adresse en Quartier Prioritaire de la Ville » 100 % locale :
// périmètres officiels ANCT 2024 embarqués (src/lib/geo/qpv-2024.json, simplifiés ~5 m)
// + géocodage par la Base Adresse Nationale. Aucune API tierce fragile.
// Le résultat est une AIDE à la saisie : la case QPV reste surchargeable à la main.

type QpvFeature = {
  c: string; // code_qp
  n: string; // libellé
  d: string; // département
  b: [number, number, number, number]; // bbox [minx, miny, maxx, maxy]
  g: [number, number][][][]; // MultiPolygon (anneaux fermés, trous inclus)
};

let cache: QpvFeature[] | null = null;

async function loadQpv(): Promise<QpvFeature[]> {
  if (!cache) {
    const data = (await import("./qpv-2024.json")) as unknown as { features: QpvFeature[] };
    cache = data.features ?? (data as unknown as { default: { features: QpvFeature[] } }).default.features;
  }
  return cache;
}

// Ray casting sur tous les anneaux d'un polygone : les trous inversent la parité naturellement.
function inPolygon(x: number, y: number, rings: [number, number][][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

export async function qpvAtPoint(lon: number, lat: number): Promise<{ code: string; name: string } | null> {
  const features = await loadQpv();
  for (const f of features) {
    const [minx, miny, maxx, maxy] = f.b;
    if (lon < minx || lon > maxx || lat < miny || lat > maxy) continue;
    if (f.g.some((poly) => inPolygon(lon, lat, poly))) {
      return { code: f.c, name: f.n };
    }
  }
  return null;
}

export type QpvLookup =
  | { ok: true; matchedAddress: string; qpv: boolean; qpvName: string | null }
  | { ok: false; error: string };

// Géocode l'adresse via la BAN puis teste le point contre les périmètres officiels.
export async function lookupQpv(address: string, city: string, postalCode: string): Promise<QpvLookup> {
  const q = [address, city].filter(Boolean).join(" ").trim();
  if (!q) return { ok: false, error: "Adresse manquante" };

  const params = new URLSearchParams({ q, limit: "1" });
  if (/^\d{5}$/.test(postalCode)) params.set("postcode", postalCode);

  let feature: { properties: { label: string; score: number; type: string }; geometry: { coordinates: [number, number] } } | undefined;
  try {
    const res = await fetch(`https://api-adresse.data.gouv.fr/search/?${params}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    feature = data.features?.[0];
  } catch {
    return { ok: false, error: "Géocodage indisponible pour le moment — cochez la case à la main." };
  }

  if (!feature || feature.properties.score < 0.4) {
    return { ok: false, error: "Adresse introuvable — vérifiez la saisie ou cochez la case à la main." };
  }
  // Une commune seule ne suffit pas : un QPV est un quartier, pas une ville.
  if (feature.properties.type === "municipality") {
    return { ok: false, error: "Précisez la rue : le QPV se détermine à l'adresse, pas à la commune." };
  }

  const [lon, lat] = feature.geometry.coordinates;
  const hit = await qpvAtPoint(lon, lat);
  return {
    ok: true,
    matchedAddress: feature.properties.label,
    qpv: hit !== null,
    qpvName: hit?.name ?? null,
  };
}
