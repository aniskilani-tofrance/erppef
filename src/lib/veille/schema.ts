import { z } from "zod";

// Contrat de l'API de veille (collecteur Manus → ERP). Tout est validé ici, côté
// serveur, avant la moindre écriture : une fiche invalide = lot refusé en entier.
// Les noms de champs de l'API sont en français (ceux du cahier des charges) ; les
// colonnes de la base sont en anglais (voir toRow / ENTRY_FIELDS).

export const VEILLE_API_VERSION = "1.0";
export const VEILLE_INDICATORS = [23, 24, 25, 26] as const;
export const VEILLE_CATEGORIES = ["legale", "metiers", "pedagogique", "handicap"] as const;
export const VEILLE_STATUS_INITIAL = "a_valider";
export const VEILLE_RUN_STATUSES = ["en_cours", "succes", "partiel", "echec"] as const;
export const VEILLE_MAX_BATCH = 200;

export type VeilleCategory = (typeof VEILLE_CATEGORIES)[number];
export type VeilleRunStatus = (typeof VEILLE_RUN_STATUSES)[number];

export const CATEGORY_LABELS: Record<VeilleCategory, string> = {
  legale: "Légale & réglementaire",
  metiers: "Métiers & compétences",
  pedagogique: "Pédagogique & innovations",
  handicap: "Handicap & accessibilité",
};

// Indicateur Qualiopi → catégorie attendue (indicatif : la cohérence n'est pas imposée).
export const INDICATOR_CATEGORY: Record<(typeof VEILLE_INDICATORS)[number], VeilleCategory> = {
  23: "legale",
  24: "metiers",
  25: "pedagogique",
  26: "handicap",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/;
const DEDUPE_RE = /^[A-Za-z0-9][A-Za-z0-9._:/#=-]{7,199}$/;

function isRealDate(s: string): boolean {
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// « à valider », « A valider », « a_valider » → a_valider ; « succès » → succes
export function normalizeCode(v: unknown): unknown {
  if (typeof v !== "string") return v;
  return v
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s-]+/g, "_");
}

function todayParis(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const dateField = z
  .string({ message: "chaîne attendue (AAAA-MM-JJ)" })
  .trim()
  .regex(DATE_RE, "format attendu AAAA-MM-JJ")
  .refine(isRealDate, "date inexistante");

const urlField = z
  .string({ message: "chaîne attendue" })
  .trim()
  .min(1, "obligatoire")
  .max(2000, "2000 caractères maximum")
  .refine((u) => {
    try {
      const p = new URL(u);
      return p.protocol === "https:" || p.protocol === "http:";
    } catch {
      return false;
    }
  }, "URL http(s) invalide");

const indicatorField = z.preprocess(
  (v) => (typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : v),
  z
    .number({ message: "nombre attendu" })
    .int()
    .refine((n): n is (typeof VEILLE_INDICATORS)[number] => (VEILLE_INDICATORS as readonly number[]).includes(n), "indicateur autorisé : 23, 24, 25 ou 26"),
);

export const ficheSchema = z
  .object({
    date_publication: dateField,
    date_collecte: dateField,
    indicateur: indicatorField,
    categorie: z.preprocess(normalizeCode, z.enum(VEILLE_CATEGORIES, { message: "catégorie autorisée : legale, metiers, pedagogique, handicap" })),
    titre: z.string({ message: "chaîne attendue" }).trim().min(1, "obligatoire").max(300, "300 caractères maximum"),
    source: z.string({ message: "chaîne attendue" }).trim().min(1, "obligatoire").max(200, "200 caractères maximum"),
    url: urlField,
    resume: z.string({ message: "chaîne attendue" }).trim().min(1, "obligatoire").max(4000, "4000 caractères maximum"),
    impact_parleremploi: z.string({ message: "chaîne attendue (vide acceptée)" }).trim().max(4000, "4000 caractères maximum"),
    exploitation_proposee: z.string({ message: "chaîne attendue (vide acceptée)" }).trim().max(4000, "4000 caractères maximum"),
    alerte: z.boolean({ message: "booléen attendu (true / false)" }),
    statut: z.preprocess(normalizeCode, z.literal(VEILLE_STATUS_INITIAL, { message: "seul le statut initial « à valider » est accepté" })),
    dedupe_key: z.string({ message: "chaîne attendue" }).trim().regex(DEDUPE_RE, "8 à 200 caractères : lettres, chiffres, . _ : / # = -"),
    run_id: z.string().trim().regex(RUN_ID_RE, "3 à 120 caractères : lettres, chiffres, . _ : -").optional(),
  })
  .superRefine((f, ctx) => {
    if (f.date_publication > f.date_collecte) {
      ctx.addIssue({ code: "custom", path: ["date_publication"], message: "postérieure à la date de collecte" });
    }
    if (f.date_collecte > addDays(todayParis(), 1)) {
      ctx.addIssue({ code: "custom", path: ["date_collecte"], message: "dans le futur" });
    }
  });

export type Fiche = z.infer<typeof ficheSchema>;

export type FicheError = { champ: string; message: string };
export type Rejected = { index: number; dedupe_key: string | null; erreurs: FicheError[] };

export type BatchValidation =
  | { ok: true; runId: string; fiches: Fiche[] }
  | { ok: false; status: 400 | 413 | 422; erreur: string; runId: string | null; recues: number; rejetees: Rejected[] };

function issuesOf(error: z.ZodError): FicheError[] {
  return error.issues.map((i) => ({ champ: i.path.map(String).join(".") || "(fiche)", message: i.message }));
}

// Valide un lot complet. Aucune écriture n'est décidée ici : on rend soit la liste
// des fiches prêtes à insérer, soit la liste exhaustive des rejets (index + champs).
export function validateBatch(body: unknown): BatchValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, erreur: "Corps attendu : objet JSON { run_id, fiches: [...] }", runId: null, recues: 0, rejetees: [] };
  }
  const b = body as Record<string, unknown>;
  const runRaw = typeof b.run_id === "string" ? b.run_id.trim() : "";
  const runId = RUN_ID_RE.test(runRaw) ? runRaw : null;
  const list = Array.isArray(b.fiches) ? b.fiches : Array.isArray(b.entries) ? b.entries : null;
  if (!runId) {
    return { ok: false, status: 400, erreur: "run_id manquant ou invalide (3 à 120 caractères : lettres, chiffres, . _ : -)", runId: null, recues: list?.length ?? 0, rejetees: [] };
  }
  if (!list || list.length === 0) {
    return { ok: false, status: 400, erreur: "fiches manquantes : tableau non vide attendu", runId, recues: 0, rejetees: [] };
  }
  if (list.length > VEILLE_MAX_BATCH) {
    return { ok: false, status: 413, erreur: `Lot trop grand : ${list.length} fiches, maximum ${VEILLE_MAX_BATCH}`, runId, recues: list.length, rejetees: [] };
  }

  const fiches: Fiche[] = [];
  const rejetees: Rejected[] = [];
  const seen = new Map<string, number>();
  list.forEach((raw, index) => {
    const parsed = ficheSchema.safeParse(raw);
    const key = raw && typeof raw === "object" && typeof (raw as { dedupe_key?: unknown }).dedupe_key === "string"
      ? String((raw as { dedupe_key: string }).dedupe_key).trim()
      : null;
    if (!parsed.success) {
      rejetees.push({ index, dedupe_key: key, erreurs: issuesOf(parsed.error) });
      return;
    }
    const f = parsed.data;
    const erreurs: FicheError[] = [];
    if (f.run_id && f.run_id !== runId) erreurs.push({ champ: "run_id", message: `différent du run_id du lot (${runId})` });
    const first = seen.get(f.dedupe_key);
    if (first !== undefined) erreurs.push({ champ: "dedupe_key", message: `en double dans le lot (déjà à l'index ${first})` });
    else seen.set(f.dedupe_key, index);
    if (erreurs.length) {
      rejetees.push({ index, dedupe_key: f.dedupe_key, erreurs });
      return;
    }
    fiches.push(f);
  });

  if (rejetees.length) {
    return {
      ok: false,
      status: 422,
      erreur: `Lot refusé : ${rejetees.length} fiche${rejetees.length > 1 ? "s" : ""} invalide${rejetees.length > 1 ? "s" : ""} sur ${list.length}, aucune écriture effectuée`,
      runId,
      recues: list.length,
      rejetees,
    };
  }
  return { ok: true, runId, fiches };
}

// Ligne prête pour veille_ingest_batch (colonnes de la base).
export function toRow(f: Fiche) {
  return {
    dedupe_key: f.dedupe_key,
    published_on: f.date_publication,
    collected_on: f.date_collecte,
    indicator: f.indicateur,
    category: f.categorie,
    title: f.titre,
    source: f.source,
    url: f.url,
    summary: f.resume,
    impact: f.impact_parleremploi,
    exploitation: f.exploitation_proposee,
    alert: f.alerte,
  };
}

// GET /entries : champs demandables (nom API → colonne).
export const ENTRY_FIELDS: Record<string, string> = {
  id: "id",
  dedupe_key: "dedupe_key",
  titre: "title",
  url: "url",
  source: "source",
  date_publication: "published_on",
  date_collecte: "collected_on",
  indicateur: "indicator",
  categorie: "category",
  statut: "status",
  alerte: "alert",
  run_id: "run_id",
  origine: "origin",
  created_at: "created_at",
};
export const DEFAULT_ENTRY_FIELDS = ["dedupe_key", "titre", "url"];

export function parseFields(raw: string | null): { ok: true; fields: string[] } | { ok: false; inconnus: string[] } {
  if (!raw || !raw.trim()) return { ok: true, fields: [...DEFAULT_ENTRY_FIELDS] };
  const asked = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const inconnus = asked.filter((f) => !(f in ENTRY_FIELDS));
  if (inconnus.length) return { ok: false, inconnus };
  return { ok: true, fields: [...new Set(asked)] };
}

export function parseFromDate(raw: string | null): { ok: true; from: string } | { ok: false; erreur: string } {
  if (!raw) return { ok: true, from: addDays(todayParis(), -90) };
  const v = raw.trim();
  if (!DATE_RE.test(v) || !isRealDate(v)) return { ok: false, erreur: "from : format attendu AAAA-MM-JJ" };
  return { ok: true, from: v };
}

export function parseIntParam(raw: string | null, def: number, min: number, max: number): number {
  if (raw === null || raw.trim() === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n)) return def;
  return Math.min(max, Math.max(min, n));
}

// POST /monthly-notes
export const monthlyNoteSchema = z.object({
  mois: z.string({ message: "chaîne attendue (AAAA-MM)" }).trim().regex(MONTH_RE, "format attendu AAAA-MM"),
  titre: z.string().trim().min(1).max(200).optional(),
  contenu: z.string({ message: "chaîne attendue" }).trim().min(1, "obligatoire").max(20000, "20000 caractères maximum"),
  run_id: z.string().trim().regex(RUN_ID_RE, "3 à 120 caractères : lettres, chiffres, . _ : -").optional(),
  nb_fiches: z.number().int().min(0).max(100000).optional(),
});
export type MonthlyNoteInput = z.infer<typeof monthlyNoteSchema>;

// Tolère les alias anglais (month/content) avant validation.
export function normalizeMonthlyNoteBody(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const b = body as Record<string, unknown>;
  return {
    mois: b.mois ?? b.month,
    titre: b.titre ?? b.title,
    contenu: b.contenu ?? b.content,
    run_id: b.run_id,
    nb_fiches: b.nb_fiches ?? b.entries_count,
  };
}

// POST /runs
const isoDateTime = z.string().trim().refine((s) => !Number.isNaN(new Date(s).getTime()), "date-heure ISO 8601 attendue");
const statsSchema = z
  .record(z.string().min(1).max(40), z.number())
  .refine((r) => Object.keys(r).length <= 30, "30 compteurs maximum");

export const runSchema = z.object({
  run_id: z.string({ message: "chaîne attendue" }).trim().regex(RUN_ID_RE, "3 à 120 caractères : lettres, chiffres, . _ : -"),
  statut: z.preprocess(normalizeCode, z.enum(VEILLE_RUN_STATUSES, { message: "statut autorisé : en_cours, succes, partiel, echec" })),
  debut: isoDateTime.optional(),
  fin: isoDateTime.optional(),
  message: z.string().trim().max(2000, "2000 caractères maximum").optional(),
  stats: statsSchema.optional(),
  csv_secours: z
    .object({
      url: urlField,
      nom: z.string().trim().max(200).optional(),
    })
    .nullable()
    .optional(),
  notifier: z.boolean().optional(),
});
export type RunInput = z.infer<typeof runSchema>;

export function normalizeRunBody(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const b = body as Record<string, unknown>;
  return {
    run_id: b.run_id,
    statut: b.statut ?? b.status,
    debut: b.debut ?? b.started_at,
    fin: b.fin ?? b.finished_at,
    message: b.message,
    stats: b.stats,
    csv_secours: b.csv_secours ?? b.csv_fallback,
    notifier: b.notifier ?? b.notify,
  };
}
