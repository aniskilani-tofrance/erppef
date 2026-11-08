import { google, type sheets_v4 } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { WAITLIST_COLUMNS, waitlistTable, type WaitlistContact, type WaitlistLearner } from "@/lib/admission/waitlist-export";

// Liste d'attente → onglet « Liste d'attente (ERP) » d'un Google Sheet de l'organisme, réécrit
// chaque lundi matin (cron) ou à la demande (carte « Liste d'attente »). Les autres onglets du
// Sheet restent à l'équipe. Le Sheet doit être partagé en Éditeur avec le compte de service de
// l'ERP (le même que les agendas). Lien et dernier passage : organizations.settings.waitlist_sheet.

export const WAITLIST_SHEET_TAB = "Liste d'attente (ERP)";

export type WaitlistSheetState = { id: string; syncedAt: string | null; rows: number | null; error: string | null };

/** Identifiant d'un Google Sheet, depuis son lien (…/spreadsheets/d/<id>/edit…) ou l'identifiant seul. */
export function parseSpreadsheetId(input: string | null | undefined): string | null {
  const t = (input ?? "").trim();
  const fromUrl = /docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(t)?.[1];
  if (fromUrl) return fromUrl;
  return /^[A-Za-z0-9_-]{20,}$/.test(t) ? t : null;
}

export function spreadsheetUrl(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

export function readWaitlistSheetState(settings: unknown): WaitlistSheetState | null {
  const raw = (settings as { waitlist_sheet?: Partial<WaitlistSheetState> } | null)?.waitlist_sheet;
  if (!raw?.id) return null;
  return { id: raw.id, syncedAt: raw.syncedAt ?? null, rows: raw.rows ?? null, error: raw.error ?? null };
}

/** Plage A1 d'un onglet dont le nom a des espaces et une apostrophe : 'Liste d''attente (ERP)'!A1. */
export function a1(tab: string, range: string): string {
  return `'${tab.replace(/'/g, "''")}'!${range}`;
}

const stamp = (now: Date) =>
  `${now.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} à ${now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(":", "h")}`;

/** Contenu de l'onglet : une ligne de titre, une ligne vide, l'en-tête, puis la liste. */
export function sheetValues(rows: string[][], now: Date = new Date()): string[][] {
  return [
    [`Liste d'attente — mise à jour par l'ERP le ${stamp(now)} (${rows.length} personne${rows.length > 1 ? "s" : ""}). Onglet réécrit chaque lundi : écrivez vos notes dans un autre onglet.`],
    [],
    [...WAITLIST_COLUMNS],
    ...rows,
  ];
}

/** Message clair pour l'équipe à partir d'une erreur Google. */
export function explainSheetError(err: unknown, serviceEmail: string | null): string {
  const e = err as { code?: number; status?: number; message?: string } | null;
  const code = e?.code ?? e?.status;
  const msg = e?.message ?? String(err);
  if (/has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(msg)) {
    return "L'API Google Sheets n'est pas activée pour le compte de l'ERP (projet Google Cloud « erp-pef »).";
  }
  if (code === 403 || /permission/i.test(msg)) {
    return `Le compte de l'ERP n'a pas accès au Sheet : partagez-le en Éditeur avec ${serviceEmail ?? "le compte de service de l'ERP"}.`;
  }
  if (code === 404 || /not found|Requested entity was not found/i.test(msg)) return "Google Sheet introuvable : vérifiez le lien.";
  return `Mise à jour impossible : ${msg.slice(0, 160)}`;
}

export function sheetsConfigured(): boolean {
  return Boolean(process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL && process.env.GDRIVE_SERVICE_ACCOUNT_KEY);
}

export function sheetsClient(): Pick<sheets_v4.Sheets, "spreadsheets"> {
  const auth = new google.auth.JWT({
    email: process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GDRIVE_SERVICE_ACCOUNT_KEY!.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

/** Réécrit l'onglet de la liste d'attente (créé s'il n'existe pas). Valeurs brutes : jamais de formule. */
export async function pushWaitlist(sheets: Pick<sheets_v4.Sheets, "spreadsheets">, spreadsheetId: string, values: string[][]): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === WAITLIST_SHEET_TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: WAITLIST_SHEET_TAB } } }] } });
  }
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: a1(WAITLIST_SHEET_TAB, "A:Z") });
  await sheets.spreadsheets.values.update({ spreadsheetId, range: a1(WAITLIST_SHEET_TAB, "A1"), valueInputOption: "RAW", requestBody: { values } });
}

export type SyncResult = { ok: true; rows: number } | { ok: false; error: string };

async function saveState(admin: SupabaseClient, orgId: string, state: WaitlistSheetState | null): Promise<void> {
  const { data: org } = await admin.from("organizations").select("settings").eq("id", orgId).single();
  const settings = { ...((org?.settings as Record<string, unknown> | null) ?? {}), waitlist_sheet: state };
  await admin.from("organizations").update({ settings }).eq("id", orgId);
}

/** Relie (ou délie, id null) le Google Sheet de l'organisme. Client service_role, après contrôle du rôle. */
export async function setWaitlistSheet(admin: SupabaseClient, orgId: string, id: string | null): Promise<void> {
  await saveState(admin, orgId, id ? { id, syncedAt: null, rows: null, error: null } : null);
}

/** Met à jour l'onglet du Google Sheet relié à l'organisme et garde le résultat (date, nombre, erreur). */
export async function syncWaitlistSheet(
  admin: SupabaseClient,
  orgId: string,
  opts: { now?: Date; sheets?: Pick<sheets_v4.Sheets, "spreadsheets"> } = {},
): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  const { data: org } = await admin.from("organizations").select("settings").eq("id", orgId).single();
  const state = readWaitlistSheetState(org?.settings ?? null);
  if (!state) return { ok: false, error: "Aucun Google Sheet relié à la liste d'attente." };
  if (!opts.sheets && !sheetsConfigured()) return { ok: false, error: "Compte Google de l'ERP non configuré." };

  const { data: learners, error } = await admin
    .from("learners")
    .select("id, first_name, last_name, learner_no, phone, email, level_assessed, created_at, contact_source, contact_source_detail, prescriber")
    .eq("org_id", orgId)
    .eq("admission_status", "liste_attente")
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: "Lecture de la liste d'attente impossible." };
  const ids = (learners ?? []).map((l) => l.id as string);
  const { data: contacts } = ids.length
    ? await admin.from("learner_contacts").select("learner_id, contacted_at, reason").eq("org_id", orgId).in("learner_id", ids)
    : { data: [] };
  const rows = waitlistTable((learners ?? []) as WaitlistLearner[], (contacts ?? []) as WaitlistContact[]);

  try {
    await pushWaitlist(opts.sheets ?? sheetsClient(), state.id, sheetValues(rows, now));
  } catch (err) {
    const message = explainSheetError(err, process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL ?? null);
    await saveState(admin, orgId, { ...state, error: message });
    return { ok: false, error: message };
  }
  await saveState(admin, orgId, { id: state.id, syncedAt: now.toISOString(), rows: rows.length, error: null });
  return { ok: true, rows: rows.length };
}
