// Import d'une liste d'appels par collage depuis Excel (tabulations) ou un CSV (;).
// En-têtes reconnus : ceux des fichiers « restaurants ouverts en 2026 » (Nom / enseigne,
// Raison sociale, Type, Date de création, Adresse, CP, Commune, Dépt, Téléphone, E-mail,
// Site web, Source du contact, SIRET, État). Sans en-têtes, l'ordre du fichier
// « priorité 1 » : Nom ; Type ; Date de création ; Adresse ; CP ; Commune ; Dépt ;
// Téléphone ; E-mail ; Site web ; SIRET.

export type ProspectImportRow = {
  company: string;
  legalName: string | null;
  segment: string;
  siret: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  department: string | null;
  openedOn: string | null; // 'YYYY-MM-DD'
  phone: string | null;
  email: string | null;
  website: string | null;
  contactSource: string | null;
};

type Key = keyof ProspectImportRow | "state";

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

const HEADERS: { key: Key; match: RegExp }[] = [
  { key: "company", match: /^(nom|enseigne|restaurant|entreprise)/ },
  { key: "legalName", match: /^raison sociale/ },
  { key: "segment", match: /^(type|segment|secteur)/ },
  { key: "openedOn", match: /^date (de )?(creation|ouverture)/ },
  { key: "address", match: /^adresse/ },
  { key: "postalCode", match: /^(cp|code postal)$/ },
  { key: "city", match: /^(commune|ville)/ },
  { key: "department", match: /^(dept|departement)/ },
  { key: "phone", match: /^tel/ },
  { key: "email", match: /^e-?mail/ },
  { key: "website", match: /^site/ },
  { key: "contactSource", match: /^source du contact/ },
  { key: "siret", match: /^siret/ },
  { key: "state", match: /^etat$/ },
];

const DEFAULT_ORDER: Key[] = [
  "company", "segment", "openedOn", "address", "postalCode", "city", "department", "phone", "email", "website", "siret",
];

export function segmentFromType(v: string | null | undefined): string {
  const t = norm(v ?? "");
  if (/rapide|fast|snack/.test(t)) return "rapide_franchise";
  if (/cafeteria|self|collectiv/.test(t)) return "collective";
  if (/tradition|brasserie|bistro|restaurant/.test(t)) return "traditionnel";
  return "inconnu";
}

export function dateFromCell(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

// Numéro au format international compact (+33…) ; les numéros étrangers restent tels quels.
export function phoneFromCell(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const digits = t.replace(/[^\d+]/g, "");
  if (/^0\d{9}$/.test(digits)) return `+33${digits.slice(1)}`;
  if (/^\+?33\d{9}$/.test(digits)) return `+33${digits.slice(-9)}`;
  return t;
}

// Garde la première adresse, écarte les adresses manifestement factices.
export function emailFromCell(v: string | null | undefined): string | null {
  const first = (v ?? "").split(/[,;\s]+/).find((e) => e.includes("@"));
  if (!first) return null;
  const e = first.trim().toLowerCase();
  if (/@(e-mail|example|exemple|domain)\.(com|fr)$/.test(e)) return null;
  return e;
}

function splitLine(line: string): string[] {
  const sep = line.includes("\t") ? "\t" : ";";
  return line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
}

export function parseProspectImport(text: string): ProspectImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const first = splitLine(lines[0]).map(norm);
  const mapped = first.map((h) => HEADERS.find((x) => x.match.test(h))?.key ?? null);
  const hasHeader = mapped.filter(Boolean).length >= 3;
  const order: (Key | null)[] = hasHeader ? mapped : DEFAULT_ORDER;
  const body = hasHeader ? lines.slice(1) : lines;

  const rows: ProspectImportRow[] = [];
  for (const line of body) {
    const cells = splitLine(line);
    const get = (k: Key) => {
      const i = order.indexOf(k);
      const v = i >= 0 ? cells[i]?.trim() : "";
      return v ? v : null;
    };
    const company = get("company");
    if (!company) continue;
    if (norm(get("state") ?? "") === "ferme") continue;
    const siret = (get("siret") ?? "").replace(/\D/g, "");
    rows.push({
      company,
      legalName: get("legalName"),
      segment: segmentFromType(get("segment")),
      siret: siret.length === 14 ? siret : null,
      address: get("address"),
      postalCode: get("postalCode"),
      city: get("city"),
      department: get("department") ?? get("postalCode")?.slice(0, 2) ?? null,
      openedOn: dateFromCell(get("openedOn")),
      phone: phoneFromCell(get("phone")),
      email: emailFromCell(get("email")),
      website: get("website"),
      contactSource: get("contactSource"),
    });
  }
  return rows;
}
