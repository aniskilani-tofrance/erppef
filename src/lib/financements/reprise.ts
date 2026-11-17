import { z } from "zod";
import { DEADLINE_KINDS, FAMILIES, FUNDER_KINDS, PORTALS, STAGES, WATCH_STATUSES } from "./constants";
import { normalizeDeadline } from "./api";
import { parisDay } from "./echeances";
import { cleanContacts } from "./regles";

// Reprise des données existantes (scripts/import-financements.mts) : lecture et contrôle du
// fichier préparé par le bureau Financements, puis plan d'import PUR (aucune écriture ici).
// Relançable : chaque ligne porte une clé stable (code du financeur, dedupe_key de
// l'opportunité, import_key du dossier et de l'échéance) ; ce qui existe déjà n'est jamais
// recréé ni écrasé (le travail fait dans l'écran entre deux imports est préservé).

const isoDateTime = z.preprocess(normalizeDeadline, z.string().refine((s) => !Number.isNaN(Date.parse(s)), "date attendue"));
const optStr = z.string().trim().optional();

const financeurSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  kind: z.enum(FUNDER_KINDS).optional(),
  portal: z.enum(PORTALS).optional(),
  portal_account_ref: optStr,
  website: optStr,
  contacts: z.array(z.record(z.string(), z.unknown())).optional(),
  usual_rules: optStr,
});

const opportuniteSchema = z.object({
  dedupe_key: z.string().trim().min(3).max(200),
  family: z.enum(FAMILIES),
  title: z.string().trim().min(1).max(300),
  funder_code: optStr,
  funder_name: optStr,
  url: optStr,
  opens_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  deadline_at: isoDateTime.optional(),
  amount_min: z.number().min(0).optional(),
  amount_max: z.number().min(0).optional(),
  max_rate: z.number().min(0).max(100).optional(),
  summary: optStr,
  eligibility_notes: optStr,
  next_window_note: optStr,
  watch_status: z.enum(WATCH_STATUSES),
  discard_reason: optStr,
  a_confirmer: optStr,
});

const dossierSchema = z.object({
  opportunity_key: optStr,
  funder_code: z.string().trim().min(1),
  title: z.string().trim().min(1).max(300),
  stage: z.enum(STAGES),
  owner: optStr,
  next_step: optStr,
  next_step_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount_requested: z.number().min(0).optional(),
  portal: z.enum(PORTALS).optional(),
  portal_ref: optStr,
  drive_url: optStr,
  a_confirmer: optStr,
});

const subventionSchema = z.object({
  funder_code: z.string().trim().min(1),
  title: z.string().trim().min(1).max(300),
  portal_ref: optStr,
  amount_granted: z.number().min(0).optional(),
  acte: optStr,
  stage: z.enum(STAGES),
});

const echeanceSchema = z.object({
  kind: z.enum(DEADLINE_KINDS),
  due_at: isoDateTime,
  title: z.string().trim().min(1).max(300),
  opportunity_key: optStr,
  dossier_key: optStr,
  funder_code: optStr,
});

export const repriseSchema = z.object({
  version: z.literal(1),
  financeurs: z.array(financeurSchema),
  opportunites: z.array(opportuniteSchema),
  dossiers: z.array(dossierSchema),
  subventions_en_cours: z.array(subventionSchema).default([]),
  echeances: z.array(echeanceSchema),
});
export type Reprise = z.infer<typeof repriseSchema>;

export function slug(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Couleurs (planning) des financeurs créés par la reprise : palette sobre, stable.
const PALETTE = ["#0f766e", "#7c3aed", "#b45309", "#be123c", "#1d4ed8", "#4d7c0f", "#a21caf", "#475569"];

// « PREFD93-26-0000 du 21/10/2026 » → 2026-10-21 (date de l'acte d'attribution).
export function acteDate(acte: string | undefined): string | null {
  const m = acte ? /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(acte) : null;
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export type ImportPlan = {
  funders: { code: string; insert: Record<string, unknown>; enrich: Record<string, unknown> }[];
  opportunities: (Record<string, unknown> & { dedupe_key: string; funder_code: string | null })[];
  applications: (Record<string, unknown> & { import_key: string; funder_code: string; opportunity_key: string | null; owner_hint: string | null })[];
  deadlines: (Record<string, unknown> & {
    import_key: string;
    opportunity_key: string | null;
    dossier_import_key: string | null;
    funder_code: string | null;
  })[];
  warnings: string[];
};

// Contrôle de cohérence + plan. Lève une erreur lisible si le fichier est inutilisable.
export function planImport(raw: unknown): ImportPlan {
  const parsed = repriseSchema.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new Error(`Fichier de reprise invalide : ${i.path.join(".")} — ${i.message}`);
  }
  const r = parsed.data;
  const warnings: string[] = [];
  const funderCodes = new Set(r.financeurs.map((f) => f.code));
  const oppKeys = new Map(r.opportunites.map((o) => [o.dedupe_key, o]));
  if (oppKeys.size !== r.opportunites.length) throw new Error("Fichier de reprise : dedupe_key en double dans les opportunités.");

  const checkFunder = (code: string | undefined, where: string) => {
    if (code && !funderCodes.has(code)) warnings.push(`${where} : financeur « ${code} » absent de la liste des financeurs du fichier (recherché dans la base).`);
  };

  const funders = r.financeurs.map((f, i) => {
    const enrich = {
      kind: f.kind ?? null,
      website: f.website ?? null,
      portal: f.portal ?? null,
      portal_account_ref: f.portal_account_ref ?? null,
      contacts: cleanContacts(f.contacts ?? []),
      usual_rules: f.usual_rules ?? null,
    };
    return { code: f.code, insert: { code: f.code, name: f.name, color: PALETTE[i % PALETTE.length], ...enrich }, enrich };
  });

  const opportunities = r.opportunites.map((o) => {
    checkFunder(o.funder_code, `Opportunité ${o.dedupe_key}`);
    const confirm = o.a_confirmer ? `À confirmer : ${o.a_confirmer}` : null;
    if (o.watch_status === "ecarte" && !o.discard_reason) throw new Error(`Opportunité ${o.dedupe_key} : écartée sans raison.`);
    return {
      dedupe_key: o.dedupe_key,
      funder_code: o.funder_code ?? null,
      family: o.family,
      title: o.title,
      funder_name: o.funder_code ? null : o.funder_name ?? null,
      url: o.url ?? null,
      opens_on: o.opens_on ?? null,
      deadline_at: o.deadline_at ? new Date(o.deadline_at).toISOString() : null,
      amount_min: o.amount_min ?? null,
      amount_max: o.amount_max ?? null,
      max_rate: o.max_rate ?? null,
      summary: o.summary ?? "",
      eligibility_notes: [o.eligibility_notes, confirm].filter(Boolean).join("\n") || null,
      next_window_note: o.next_window_note ?? null,
      watch_status: o.watch_status,
      discard_reason: o.watch_status === "ecarte" ? o.discard_reason : null,
      source: "saisie",
    };
  });

  const applications: ImportPlan["applications"] = [];
  for (const d of r.dossiers) {
    checkFunder(d.funder_code, `Dossier ${d.title}`);
    const opp = d.opportunity_key ? oppKeys.get(d.opportunity_key) : undefined;
    if (d.opportunity_key && !opp) throw new Error(`Dossier « ${d.title} » : opportunité ${d.opportunity_key} introuvable dans le fichier.`);
    applications.push({
      import_key: d.opportunity_key ? `dossier:${d.opportunity_key}` : `dossier:${d.funder_code}:${slug(d.title)}`,
      funder_code: d.funder_code,
      opportunity_key: d.opportunity_key ?? null,
      owner_hint: d.owner ?? null,
      title: d.title,
      stage: d.stage,
      next_step: d.next_step ?? null,
      next_step_due: d.next_step_due ?? null,
      deadline_at: opp?.deadline_at ? new Date(opp.deadline_at).toISOString() : null,
      amount_requested: d.amount_requested ?? null,
      portal: d.portal ?? null,
      portal_ref: d.portal_ref ?? null,
      drive_url: d.drive_url ?? null,
      notes: d.a_confirmer ? `À confirmer : ${d.a_confirmer}` : null,
    });
  }
  for (const sv of r.subventions_en_cours) {
    checkFunder(sv.funder_code, `Subvention ${sv.title}`);
    const granted = sv.stage === "accorde" || sv.stage === "bilan_rendu";
    applications.push({
      import_key: `subvention:${sv.funder_code}:${slug(sv.title)}`,
      funder_code: sv.funder_code,
      opportunity_key: null,
      owner_hint: null,
      title: sv.title,
      stage: sv.stage,
      amount_granted: sv.amount_granted ?? null,
      granted_on: granted ? acteDate(sv.acte) : null,
      portal_ref: sv.portal_ref ?? null,
      notes: sv.acte ? `Acte : ${sv.acte}` : null,
    });
  }

  const dossierByOpp = new Map(applications.filter((a) => a.opportunity_key).map((a) => [a.opportunity_key as string, a.import_key]));
  const deadlines = r.echeances.map((e) => {
    checkFunder(e.funder_code, `Échéance ${e.title}`);
    const dossierImportKey = e.dossier_key ? dossierByOpp.get(e.dossier_key) ?? null : null;
    if (e.dossier_key && !dossierImportKey) throw new Error(`Échéance « ${e.title} » : dossier ${e.dossier_key} introuvable dans le fichier.`);
    if (e.opportunity_key && !oppKeys.has(e.opportunity_key)) throw new Error(`Échéance « ${e.title} » : opportunité ${e.opportunity_key} introuvable.`);
    if (!e.dossier_key && !e.opportunity_key && !e.funder_code) throw new Error(`Échéance « ${e.title} » : ni dossier, ni opportunité, ni financeur.`);
    const due = new Date(e.due_at).toISOString();
    return {
      import_key: `echeance:${e.kind}:${parisDay(due)}:${slug(e.title)}`,
      opportunity_key: e.opportunity_key ?? null,
      dossier_import_key: dossierImportKey,
      funder_code: e.funder_code ?? null,
      kind: e.kind,
      due_at: due,
      title: e.title,
    };
  });

  return { funders, opportunities, applications, deadlines, warnings };
}

// Correspondance « code du fichier → code d'un financeur déjà présent dans l'ERP ».
// Un même financeur peut exister sous un autre code (créé à la main avant le module) :
// on complète alors sa fiche au lieu d'en créer une seconde. « A=B,C=D » → { A: "B", C: "D" }.
export function parseFunderAliases(raw: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (raw ?? "").split(",")) {
    const p = part.trim();
    if (!p) continue;
    const [from, to, ...rest] = p.split("=").map((x) => x.trim());
    if (!from || !to || rest.length) throw new Error(`Correspondance illisible : « ${p} » (attendu CODE_DU_FICHIER=CODE_EXISTANT).`);
    out[from] = to;
  }
  return out;
}

// Applique la correspondance au plan. Les clés de reprise (import_key, dedupe_key) ne
// changent pas : l'import reste relançable, avec ou sans correspondance.
export function applyFunderAliases(plan: ImportPlan, aliases: Record<string, string>): ImportPlan {
  const known = new Set(plan.funders.map((f) => f.code));
  for (const from of Object.keys(aliases)) {
    if (!known.has(from)) throw new Error(`Correspondance : le financeur « ${from} » n'est pas dans le fichier de reprise.`);
  }
  const map = (code: string | null) => (code && aliases[code] ? aliases[code] : code);
  return {
    ...plan,
    funders: plan.funders.map((f) => (aliases[f.code] ? { ...f, code: aliases[f.code], insert: { ...f.insert, code: aliases[f.code] } } : f)),
    opportunities: plan.opportunities.map((o) => ({ ...o, funder_code: map(o.funder_code) })),
    applications: plan.applications.map((a) => ({ ...a, funder_code: map(a.funder_code) as string })),
    deadlines: plan.deadlines.map((d) => ({ ...d, funder_code: map(d.funder_code) })),
  };
}

// Une échéance « dépôt » du fichier qui tombe le même jour que l'échéance automatique du
// dossier (ou de l'opportunité) la précise au lieu d'en créer une seconde.
export function sameDepositDay(a: { kind: string; due_at: string }, auto: { due_at: string } | null | undefined): boolean {
  return !!auto && a.kind === "depot" && parisDay(a.due_at) === parisDay(auto.due_at);
}

// Champs d'enrichissement d'un financeur existant : on ne complète que ce qui est vide.
export function missingEnrichment(existing: Record<string, unknown>, enrich: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(enrich)) {
    const cur = existing[k];
    const empty = cur === null || cur === undefined || cur === "" || (Array.isArray(cur) && cur.length === 0);
    const hasValue = !(v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0));
    if (empty && hasValue) patch[k] = v;
  }
  return patch;
}
