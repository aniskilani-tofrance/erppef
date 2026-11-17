import { z } from "zod";
import { DEADLINE_KINDS, FAMILIES, FUNDER_KINDS, PORTALS, STAGES, WATCH_STATUSES } from "./constants";
import { deadlineFromInput } from "./echeances";
import { cleanContacts } from "./regles";

// Validation des formulaires du module (Server Actions). Les champs arrivent en chaînes
// depuis l'écran ; on rend des lignes prêtes pour la base (null pour « vide »).

const s = (max: number) => z.string().max(max, `${max} caractères maximum`).optional().nullable();
const blank = (v: string | null | undefined) => (v ?? "").trim() || null;

function amount(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const raw = typeof v === "number" ? String(v) : v.replace(/\s/g, "").replace(",", ".").replace(/€$/, "");
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error("Montant invalide : un nombre positif en euros est attendu.");
  return Math.round(n * 100) / 100;
}

function httpUrl(v: string | null | undefined, label: string): string | null {
  const u = blank(v);
  if (!u) return null;
  try {
    const p = new URL(u);
    if (p.protocol === "http:" || p.protocol === "https:") return u;
  } catch {
    /* plus bas */
  }
  throw new Error(`${label} : lien http(s) attendu (https://…).`);
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal(""));
const uuid = z.string().uuid().optional().nullable().or(z.literal(""));

// ── Opportunité ──────────────────────────────────────────────────────────────
export const opportunityFormSchema = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire.").max(300),
  family: z.enum(FAMILIES),
  url: s(2000),
  funder_id: uuid,
  funder_name: s(200),
  deadline_day: day,
  deadline_time: s(5),
  opens_on: day,
  amount_min: z.union([z.string(), z.number()]).optional().nullable(),
  amount_max: z.union([z.string(), z.number()]).optional().nullable(),
  max_rate: z.union([z.string(), z.number()]).optional().nullable(),
  summary: s(4000),
  eligibility_notes: s(4000),
  next_window_note: s(300),
  watch_status: z.enum(WATCH_STATUSES).optional(),
  discard_reason: s(500),
});
export type OpportunityForm = z.input<typeof opportunityFormSchema>;

export function opportunityRowFromForm(raw: unknown): Record<string, unknown> {
  const p = opportunityFormSchema.safeParse(raw);
  if (!p.success) throw new Error(p.error.issues[0]?.message ?? "Formulaire incomplet.");
  const f = p.data;
  const min = amount(f.amount_min);
  const max = amount(f.amount_max);
  if (min !== null && max !== null && min > max) throw new Error("Le montant minimum dépasse le maximum.");
  const rate = amount(f.max_rate);
  if (rate !== null && rate > 100) throw new Error("Le taux maximum est un pourcentage (100 au plus).");
  const status = f.watch_status;
  const reason = blank(f.discard_reason);
  if (status === "ecarte" && !reason) throw new Error("Pour écarter une opportunité, indiquez la raison (une ligne).");
  const row: Record<string, unknown> = {
    title: f.title.trim(),
    family: f.family,
    url: httpUrl(f.url, "Lien de l'appel"),
    funder_id: blank(f.funder_id),
    funder_name: blank(f.funder_id) ? null : blank(f.funder_name),
    deadline_at: deadlineFromInput(blank(f.deadline_day), blank(f.deadline_time)),
    opens_on: blank(f.opens_on),
    amount_min: min,
    amount_max: max,
    max_rate: rate,
    summary: blank(f.summary) ?? "",
    eligibility_notes: blank(f.eligibility_notes),
    next_window_note: blank(f.next_window_note),
  };
  if (status) {
    row.watch_status = status;
    row.discard_reason = status === "ecarte" ? reason : null;
  }
  return row;
}

// Tri rapide (« À trier ») : Écarter (raison obligatoire), À surveiller, Évaluer.
export const triageSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["a_surveiller", "a_evaluer", "ecarte", "nouveau", "retenu"]),
  reason: z.string().max(500).optional().nullable(),
});
export function triagePatch(raw: unknown): { id: string; patch: Record<string, unknown> } {
  const p = triageSchema.safeParse(raw);
  if (!p.success) throw new Error("Demande invalide.");
  const reason = blank(p.data.reason);
  if (p.data.status === "ecarte" && !reason) throw new Error("Indiquez en une ligne pourquoi vous écartez cette opportunité.");
  return {
    id: p.data.id,
    patch: { watch_status: p.data.status, discard_reason: p.data.status === "ecarte" ? reason : null },
  };
}

// ── Dossier ──────────────────────────────────────────────────────────────────
export const applicationFormSchema = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire.").max(300),
  funder_id: z.string().uuid("Choisissez le financeur."),
  owner_id: uuid,
  next_step: s(500),
  next_step_due: day,
  deadline_day: day,
  deadline_time: s(5),
  amount_requested: z.union([z.string(), z.number()]).optional().nullable(),
  amount_granted: z.union([z.string(), z.number()]).optional().nullable(),
  portal: z.enum(PORTALS).optional().nullable().or(z.literal("")),
  portal_ref: s(100),
  drive_url: s(2000),
  notes: s(8000),
  stage: z.enum(STAGES).optional(),
});
export type ApplicationForm = z.input<typeof applicationFormSchema>;

export function applicationRowFromForm(raw: unknown): Record<string, unknown> {
  const p = applicationFormSchema.safeParse(raw);
  if (!p.success) throw new Error(p.error.issues[0]?.message ?? "Formulaire incomplet.");
  const f = p.data;
  const row: Record<string, unknown> = {
    title: f.title.trim(),
    funder_id: f.funder_id,
    owner_id: blank(f.owner_id),
    next_step: blank(f.next_step),
    next_step_due: blank(f.next_step_due),
    deadline_at: deadlineFromInput(blank(f.deadline_day), blank(f.deadline_time)),
    amount_requested: amount(f.amount_requested),
    amount_granted: amount(f.amount_granted),
    portal: blank(f.portal),
    portal_ref: blank(f.portal_ref),
    drive_url: httpUrl(f.drive_url, "Lien du Word"),
    notes: blank(f.notes),
  };
  if (f.stage) row.stage = f.stage;
  return row;
}

// ── Échéance ─────────────────────────────────────────────────────────────────
export const deadlineFormSchema = z.object({
  kind: z.enum(DEADLINE_KINDS),
  title: z.string().trim().min(1, "Le titre est obligatoire.").max(300),
  due_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date est obligatoire."),
  due_time: s(5),
  application_id: uuid,
  opportunity_id: uuid,
  funder_id: uuid,
  reminder_days: z.array(z.number().int().min(0).max(365)).max(6).optional(),
});
export type DeadlineForm = z.input<typeof deadlineFormSchema>;

export function deadlineRowFromForm(raw: unknown): Record<string, unknown> {
  const p = deadlineFormSchema.safeParse(raw);
  if (!p.success) throw new Error(p.error.issues[0]?.message ?? "Formulaire incomplet.");
  const f = p.data;
  const links = { application_id: blank(f.application_id), opportunity_id: blank(f.opportunity_id), funder_id: blank(f.funder_id) };
  if (!links.application_id && !links.opportunity_id && !links.funder_id) {
    throw new Error("Rattachez l'échéance à un dossier, une opportunité ou un financeur.");
  }
  const reminders = f.reminder_days === undefined ? undefined : [...new Set(f.reminder_days)].sort((a, b) => b - a);
  return {
    kind: f.kind,
    title: f.title.trim(),
    due_at: deadlineFromInput(f.due_day, blank(f.due_time)),
    ...links,
    ...(reminders ? { reminder_days: reminders } : {}),
  };
}

// ── Financeur ────────────────────────────────────────────────────────────────
export const funderFormSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(200),
  kind: z.enum(FUNDER_KINDS).optional().nullable().or(z.literal("")),
  website: s(2000),
  portal: z.enum(PORTALS).optional().nullable().or(z.literal("")),
  portal_account_ref: s(300),
  contacts: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
  usual_rules: s(4000),
  notes: s(8000),
});
export type FunderForm = z.input<typeof funderFormSchema>;

export function funderRowFromForm(raw: unknown): Record<string, unknown> {
  const p = funderFormSchema.safeParse(raw);
  if (!p.success) throw new Error(p.error.issues[0]?.message ?? "Formulaire incomplet.");
  const f = p.data;
  return {
    name: f.name.trim(),
    kind: blank(f.kind),
    website: httpUrl(f.website, "Site du financeur"),
    portal: blank(f.portal),
    portal_account_ref: blank(f.portal_account_ref),
    contacts: cleanContacts(f.contacts ?? []),
    usual_rules: blank(f.usual_rules),
    notes: blank(f.notes),
  };
}
