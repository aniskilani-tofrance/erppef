// Origines autorisées à appeler l'API publique d'inscription (/api/inscription) depuis
// un navigateur. Liste séparée par des virgules dans INSCRIPTION_ALLOWED_ORIGINS ; par
// défaut, le site ParlerEmploi seulement. Client et serveur (aucune dépendance).

export const DEFAULT_ALLOWED_ORIGINS = ["https://parleremploiformation.pro", "https://www.parleremploiformation.pro"];

export function allowedOrigins(raw: string | null | undefined = process.env.INSCRIPTION_ALLOWED_ORIGINS): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, "").toLowerCase())
    .filter((s) => /^https?:\/\/[a-z0-9.-]+(:\d+)?$/.test(s));
  return list.length ? list : DEFAULT_ALLOWED_ORIGINS;
}

/** « ok » : origine autorisée ; « none » : pas d'en-tête Origin (appel serveur, curl) ; « denied » sinon. */
export function checkOrigin(origin: string | null, allowed: readonly string[] = allowedOrigins()): "ok" | "none" | "denied" {
  if (!origin) return "none";
  return allowed.includes(origin.replace(/\/+$/, "").toLowerCase()) ? "ok" : "denied";
}

/** En-têtes CORS : renvoyés seulement pour une origine autorisée (jamais « * »). */
export function corsHeaders(origin: string | null, allowed: readonly string[] = allowedOrigins()): Record<string, string> {
  const base: Record<string, string> = { Vary: "Origin" };
  if (checkOrigin(origin, allowed) !== "ok") return base;
  return {
    ...base,
    "Access-Control-Allow-Origin": origin!,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}
