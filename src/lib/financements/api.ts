import { z } from "zod";
import { localToUtc } from "@/lib/dates";
import { FAMILIES, type Family } from "./constants";
import { addDays, parisDay } from "./echeances";

// Contrat de l'API du collecteur de veille des financements :
//   POST /api/financements/opportunites  (une opportunité, un tableau, ou { opportunites: [...] })
//   GET  /api/financements/opportunites?from=AAAA-MM-JJ&fields=dedupe_key,title,url
// Même authentification que /api/veille (jeton de service), même format de réponse
// ({ ok, ... } / { ok: false, erreur }). Tout est validé AVANT la moindre écriture : une
// seule opportunité invalide → lot refusé en entier (422), rien n'est écrit.
// Les noms de champs sont ceux de la base (spécification §3.1) ; les alias français
// (titre, famille, lien, financeur, date_limite, resume…) sont acceptés.

export const OPPORTUNITES_MAX_BATCH = 200;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEDUPE_RE = /^[A-Za-z0-9][A-Za-z0-9._:/#=-]{2,199}$/;

function isRealDate(s: string): boolean {
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function fold(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[\s_-]+/g, " ")
    .trim();
}

const FAMILY_ALIASES: Record<string, Family> = {
  aap: "aap",
  "appel a projets": "aap",
  "appel a projet": "aap",
  ami: "aap",
  "appel a manifestation d interet": "aap",
  subvention: "aap",
  "appel offres": "appel_offres",
  "appel d offres": "appel_offres",
  "appel d offre": "appel_offres",
  ao: "appel_offres",
  marche: "appel_offres",
  "marche public": "appel_offres",
  mecenat: "mecenat",
  fondation: "mecenat",
  prix: "mecenat",
};

export function normalizeFamily(v: unknown): unknown {
  if (typeof v !== "string") return v;
  return FAMILY_ALIASES[fold(v)] ?? v;
}

const optText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v === null ? undefined : v),
    z.string({ message: "chaîne attendue" }).trim().max(max, `${max} caractères maximum`).optional(),
  );

const optAmount = z.preprocess(
  (v) => {
    if (v === null || v === undefined || v === "") return undefined;
    if (typeof v === "string") {
      const n = Number(v.replace(/\s/g, "").replace(",", ".").replace(/€$/, ""));
      return Number.isFinite(n) ? n : v;
    }
    return v;
  },
  z.number({ message: "nombre attendu (euros)" }).min(0, "positif attendu").max(100_000_000, "montant trop grand").optional(),
);

const optUrl = z.preprocess(
  (v) => (v === null || (typeof v === "string" && v.trim() === "") ? undefined : v),
  z
    .string({ message: "chaîne attendue" })
    .trim()
    .max(2000, "2000 caractères maximum")
    .refine((u) => {
      try {
        const p = new URL(u);
        return p.protocol === "https:" || p.protocol === "http:";
      } catch {
        return false;
      }
    }, "URL http(s) invalide")
    .optional(),
);

const optDate = z.preprocess(
  (v) => (v === null || (typeof v === "string" && v.trim() === "") ? undefined : v),
  z.string({ message: "chaîne attendue (AAAA-MM-JJ)" }).trim().regex(DATE_RE, "format attendu AAAA-MM-JJ").refine(isRealDate, "date inexistante").optional(),
);

// Date limite : « AAAA-MM-JJ » (→ 23h59 heure de Paris) ou date-heure ISO 8601 avec fuseau.
export function normalizeDeadline(v: unknown): unknown {
  if (v === null || v === undefined) return undefined;
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (!s) return undefined;
  if (DATE_RE.test(s)) return isRealDate(s) ? localToUtc(s, "23:59") : "date inexistante";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? s : new Date(t).toISOString();
  }
  return s;
}
const optDeadline = z.preprocess(
  normalizeDeadline,
  z
    .string()
    .refine((s) => /^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s)), "AAAA-MM-JJ ou date-heure ISO 8601 avec fuseau attendue")
    .optional(),
);

export const opportuniteSchema = z
  .object({
    dedupe_key: z.string({ message: "obligatoire" }).trim().regex(DEDUPE_RE, "3 à 200 caractères : lettres, chiffres, . _ : / # = -"),
    family: z.preprocess(normalizeFamily, z.enum(FAMILIES, { message: "famille autorisée : aap, appel_offres, mecenat" })),
    title: z.string({ message: "obligatoire" }).trim().min(1, "obligatoire").max(300, "300 caractères maximum"),
    funder_code: optText(40),
    funder_name: optText(200),
    url: optUrl,
    opens_on: optDate,
    deadline_at: optDeadline,
    amount_min: optAmount,
    amount_max: optAmount,
    max_rate: z.preprocess(
      (v) => (v === null || v === "" ? undefined : typeof v === "string" ? Number(v.replace(",", ".").replace(/%$/, "")) : v),
      z.number({ message: "nombre attendu (pourcentage)" }).min(0).max(100, "100 % maximum").optional(),
    ),
    summary: optText(4000),
    eligibility_notes: optText(4000),
    next_window_note: optText(300),
  })
  .superRefine((o, ctx) => {
    if (o.amount_min !== undefined && o.amount_max !== undefined && o.amount_min > o.amount_max) {
      ctx.addIssue({ code: "custom", path: ["amount_min"], message: "supérieur au montant maximum" });
    }
  });

export type OpportuniteInput = z.infer<typeof opportuniteSchema>;

// Alias français → noms de la base (avant validation). Les champs inconnus sont ignorés.
const ALIASES: Record<string, string> = {
  cle: "dedupe_key",
  famille: "family",
  titre: "title",
  code_financeur: "funder_code",
  financeur: "funder_name",
  lien: "url",
  ouverture: "opens_on",
  date_ouverture: "opens_on",
  date_limite: "deadline_at",
  montant_min: "amount_min",
  montant_max: "amount_max",
  taux_max: "max_rate",
  resume: "summary",
  conditions: "eligibility_notes",
  prochaine_fenetre: "next_window_note",
};

export function normalizeOpportuniteBody(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = ALIASES[k] ?? k;
    if (out[key] === undefined) out[key] = v;
  }
  return out;
}

export type ApiError = { champ: string; message: string };
export type ApiRejected = { index: number; dedupe_key: string | null; erreurs: ApiError[] };

export type OpportunitesValidation =
  | { ok: true; items: OpportuniteInput[] }
  | { ok: false; status: 400 | 413 | 422; erreur: string; recues: number; rejetees: ApiRejected[] };

export function extractList(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  for (const k of ["opportunites", "opportunities", "items"]) if (Array.isArray(b[k])) return b[k] as unknown[];
  if ("dedupe_key" in b || "title" in b || "titre" in b) return [b];
  return null;
}

export function validateOpportunites(body: unknown): OpportunitesValidation {
  const list = extractList(body);
  if (!list) {
    return { ok: false, status: 400, erreur: "Corps attendu : une opportunité, un tableau, ou { opportunites: [...] }", recues: 0, rejetees: [] };
  }
  if (list.length === 0) return { ok: false, status: 400, erreur: "Lot vide", recues: 0, rejetees: [] };
  if (list.length > OPPORTUNITES_MAX_BATCH) {
    return { ok: false, status: 413, erreur: `Lot trop grand : ${list.length} opportunités, maximum ${OPPORTUNITES_MAX_BATCH}`, recues: list.length, rejetees: [] };
  }
  const items: OpportuniteInput[] = [];
  const rejetees: ApiRejected[] = [];
  const seen = new Map<string, number>();
  list.forEach((raw, index) => {
    const norm = normalizeOpportuniteBody(raw);
    const key = norm && typeof norm === "object" && typeof (norm as { dedupe_key?: unknown }).dedupe_key === "string"
      ? String((norm as { dedupe_key: string }).dedupe_key).trim()
      : null;
    const parsed = opportuniteSchema.safeParse(norm);
    if (!parsed.success) {
      rejetees.push({
        index,
        dedupe_key: key,
        erreurs: parsed.error.issues.map((i) => ({ champ: i.path.map(String).join(".") || "(opportunité)", message: i.message })),
      });
      return;
    }
    const first = seen.get(parsed.data.dedupe_key);
    if (first !== undefined) {
      rejetees.push({ index, dedupe_key: parsed.data.dedupe_key, erreurs: [{ champ: "dedupe_key", message: `en double dans le lot (déjà à l'index ${first})` }] });
      return;
    }
    seen.set(parsed.data.dedupe_key, index);
    items.push(parsed.data);
  });
  if (rejetees.length) {
    const n = rejetees.length;
    return {
      ok: false,
      status: 422,
      erreur: `Lot refusé : ${n} opportunité${n > 1 ? "s" : ""} invalide${n > 1 ? "s" : ""} sur ${list.length}, aucune écriture effectuée`,
      recues: list.length,
      rejetees,
    };
  }
  return { ok: true, items };
}

// Ligne prête à insérer. Le collecteur ne choisit ni le statut ni la source.
export function toOpportunityRow(o: OpportuniteInput, orgId: string, funderIdByCode: Map<string, string>) {
  const code = o.funder_code?.toUpperCase();
  const funderId = code ? funderIdByCode.get(code) ?? null : null;
  return {
    org_id: orgId,
    dedupe_key: o.dedupe_key,
    family: o.family,
    title: o.title,
    funder_id: funderId,
    funder_name: funderId ? null : o.funder_name ?? o.funder_code ?? null,
    url: o.url ?? null,
    opens_on: o.opens_on ?? null,
    deadline_at: o.deadline_at ?? null,
    amount_min: o.amount_min ?? null,
    amount_max: o.amount_max ?? null,
    max_rate: o.max_rate ?? null,
    summary: o.summary ?? "",
    eligibility_notes: o.eligibility_notes ?? null,
    next_window_note: o.next_window_note ?? null,
    watch_status: "nouveau" as const,
    source: "collecteur" as const,
  };
}

// GET : champs demandables (même nom côté API et côté base).
export const OPPORTUNITE_FIELDS = [
  "id", "dedupe_key", "title", "url", "family", "funder_id", "funder_name", "opens_on", "deadline_at",
  "amount_min", "amount_max", "max_rate", "watch_status", "source", "next_window_note", "created_at", "updated_at",
] as const;
export const DEFAULT_OPPORTUNITE_FIELDS = ["dedupe_key", "title", "url"];

const FIELD_ALIASES: Record<string, string> = { titre: "title", lien: "url", famille: "family", date_limite: "deadline_at", statut: "watch_status" };

export function parseOpportuniteFields(raw: string | null): { ok: true; fields: string[] } | { ok: false; inconnus: string[] } {
  if (!raw || !raw.trim()) return { ok: true, fields: [...DEFAULT_OPPORTUNITE_FIELDS] };
  const asked = raw.split(",").map((s) => s.trim()).filter(Boolean).map((f) => FIELD_ALIASES[f] ?? f);
  const inconnus = asked.filter((f) => !(OPPORTUNITE_FIELDS as readonly string[]).includes(f));
  if (inconnus.length) return { ok: false, inconnus };
  return { ok: true, fields: [...new Set(asked)] };
}

// from : date (Paris) de création à partir de laquelle lister ; 90 jours par défaut.
export function parseFrom(raw: string | null, now: Date = new Date()): { ok: true; from: string; fromIso: string } | { ok: false; erreur: string } {
  const v = raw?.trim() || addDays(parisDay(now), -90);
  if (!DATE_RE.test(v) || !isRealDate(v)) return { ok: false, erreur: "from : format attendu AAAA-MM-JJ" };
  return { ok: true, from: v, fromIso: localToUtc(v, "00:00") };
}
