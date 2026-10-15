"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";
import { todayParis } from "@/lib/leads/queries";
import { CALL_OUTCOME_CODES, transitionFor } from "@/lib/prospection/status";

// Rôles autorisés : les mêmes que pour les leads (direction + setter).
const ROLES = ["admin", "coordinator", "setter"] as const;

export type ActionResult = { ok: true } | { ok: false; error: string };

const uuid = z.string().uuid();
const optText = z.string().trim().nullable().optional().transform((v) => (v ? v : null));

// ── Import d'une liste ───────────────────────────────────────────────────────
const rowSchema = z.object({
  company: z.string().trim().min(1),
  legalName: z.string().nullable(),
  segment: z.string(),
  siret: z.string().regex(/^\d{14}$/).nullable(),
  address: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  department: z.string().nullable(),
  openedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  contactSource: z.string().nullable(),
});
const SEGMENTS = ["rapide_franchise", "traditionnel", "collective", "hotel_traiteur", "snacking", "hors_restauration", "inconnu"];

export type ImportResult = { ok: true; listId: string; imported: number; skipped: number } | { ok: false; error: string };

// Le client envoie la liste par paquets de 500 lignes : le premier crée la liste
// (listName), les suivants s'y ajoutent (listId). Un SIRET déjà connu de l'organisation,
// quelle que soit la liste, est ignoré : on n'appelle jamais deux fois le même restaurant.
export async function importProspects(raw: {
  listId?: string | null;
  listName?: string | null;
  rows: z.infer<typeof rowSchema>[];
}): Promise<ImportResult> {
  const parsed = z
    .object({ listId: uuid.nullable().optional(), listName: optText, rows: z.array(rowSchema).min(1).max(500) })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Aucune ligne exploitable (le nom du restaurant est obligatoire)." };
  const { orgId, userId } = await requireRole([...ROLES]);
  const supabase = await createClient();
  const d = parsed.data;

  let listId = d.listId ?? null;
  if (!listId) {
    if (!d.listName) return { ok: false, error: "Donnez un nom à la liste." };
    const { data, error } = await supabase
      .from("prospect_lists")
      .insert({ org_id: orgId, name: d.listName, created_by: userId })
      .select("id")
      .single();
    if (error) return { ok: false, error: translatePgError(error) };
    listId = data.id as string;
  }

  const sirets = d.rows.map((r) => r.siret).filter((s): s is string => Boolean(s));
  const known = new Set<string>();
  if (sirets.length) {
    const { data } = await supabase.from("prospects").select("siret").in("siret", sirets);
    for (const p of data ?? []) known.add(p.siret as string);
  }
  const rows = [];
  for (const r of d.rows) {
    if (r.siret && known.has(r.siret)) continue;
    if (r.siret) known.add(r.siret);
    rows.push({
      org_id: orgId,
      list_id: listId,
      company: r.company,
      legal_name: r.legalName,
      segment: SEGMENTS.includes(r.segment) ? r.segment : "inconnu",
      siret: r.siret,
      address: r.address,
      postal_code: r.postalCode,
      city: r.city,
      department: r.department,
      opened_on: r.openedOn,
      phone: r.phone,
      email: r.email,
      website: r.website,
      contact_source: r.contactSource,
      created_by: userId,
    });
  }
  if (rows.length) {
    const { error } = await supabase.from("prospects").insert(rows);
    if (error) return { ok: false, error: translatePgError(error) };
  }
  revalidatePath("/prospection");
  return { ok: true, listId, imported: rows.length, skipped: d.rows.length - rows.length };
}

// ── Résultat d'un appel ──────────────────────────────────────────────────────
const callSchema = z.object({
  prospectId: uuid,
  outcome: z.enum(CALL_OUTCOME_CODES),
  note: optText,
  callbackOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  contactName: optText,
});

export type CallResult = { ok: true; leadId: string | null } | { ok: false; error: string };

export async function logProspectCall(raw: z.input<typeof callSchema>): Promise<CallResult> {
  const parsed = callSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Résultat d'appel invalide." };
  const { orgId, userId } = await requireRole([...ROLES]);
  const supabase = await createClient();
  const d = parsed.data;

  const { data: p, error: readError } = await supabase
    .from("prospects")
    .select("id, list_id, company, segment, phone, email, city, postal_code, address, siret, opened_on, website, attempts, notes, lead_id, prospect_lists(name)")
    .eq("id", d.prospectId)
    .maybeSingle();
  if (readError) return { ok: false, error: translatePgError(readError) };
  if (!p) return { ok: false, error: "Prospect introuvable." };

  const today = todayParis();
  const t = transitionFor(d.outcome, (p.attempts as number) + 1, today, d.callbackOn ?? null);

  const { error: callError } = await supabase.from("prospect_calls").insert({
    org_id: orgId,
    prospect_id: p.id,
    outcome: d.outcome,
    note: d.note,
    by_user_id: userId,
  });
  if (callError) return { ok: false, error: translatePgError(callError) };

  let leadId = (p.lead_id as string | null) ?? null;
  if (t.createsLead && !leadId) {
    const listName = (p.prospect_lists as unknown as { name: string } | null)?.name ?? null;
    const notes = [
      `Issu de la prospection${listName ? ` (liste « ${listName} »)` : ""}${p.opened_on ? `, restaurant ouvert le ${String(p.opened_on).split("-").reverse().join("/")}` : ""}.`,
      d.note ? `Appel : ${d.note}` : null,
      p.address ? `Adresse : ${p.address}` : null,
      p.siret ? `SIRET : ${p.siret}` : null,
      p.website ? `Site : ${p.website}` : null,
      p.notes,
    ].filter(Boolean).join("\n");
    const { data: lead, error: leadError } = await supabase
      .from("employer_leads")
      .insert({
        org_id: orgId,
        company: p.company,
        segment: p.segment,
        contact_name: d.contactName,
        phone: p.phone,
        email: p.email,
        city: p.city,
        postal_code: p.postal_code,
        source: "prospection",
        campaign: listName,
        status: "contacte",
        owner_user_id: userId,
        created_by: userId,
        next_action: "Qualifier le besoin (7 questions) et poser le RDV direction",
        next_action_on: today,
        notes,
      })
      .select("id")
      .single();
    if (leadError) return { ok: false, error: translatePgError(leadError) };
    leadId = lead.id as string;
    await supabase.from("employer_lead_events").insert({
      org_id: orgId,
      lead_id: leadId,
      kind: "appel",
      outcome: "joint",
      note: `Appel de prospection : intéressé.${d.note ? ` ${d.note}` : ""}`,
      by_user_id: userId,
    });
  }

  const { error: updateError } = await supabase
    .from("prospects")
    .update({
      status: t.status,
      callback_on: t.callbackOn,
      callback_note: d.outcome === "rappeler" || d.outcome === "barrage" ? d.note : null,
      lead_id: leadId,
      owner_user_id: userId,
    })
    .eq("id", p.id);
  if (updateError) return { ok: false, error: translatePgError(updateError) };

  revalidatePath("/prospection");
  revalidatePath(`/prospection/${p.list_id}`);
  if (leadId) revalidatePath("/leads");
  return { ok: true, leadId: t.createsLead ? leadId : null };
}

// ── Coordonnées trouvées pendant la session (Google Maps, site…) ─────────────
const contactSchema = z.object({
  prospectId: uuid,
  phone: optText,
  email: optText,
  notes: optText,
});

export async function updateProspectContact(raw: z.input<typeof contactSchema>): Promise<ActionResult> {
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Coordonnées invalides." };
  await requireRole([...ROLES]);
  const supabase = await createClient();
  const d = parsed.data;
  const { data, error } = await supabase
    .from("prospects")
    .update({ phone: d.phone, email: d.email, notes: d.notes })
    .eq("id", d.prospectId)
    .select("list_id")
    .single();
  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath(`/prospection/${data.list_id}`);
  return { ok: true };
}

// ── Suppression d'une liste (import raté) — direction uniquement ─────────────
export async function deleteProspectList(raw: { listId: string }): Promise<ActionResult> {
  const parsed = z.object({ listId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Liste invalide." };
  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { count } = await supabase
    .from("prospects")
    .select("id", { count: "exact", head: true })
    .eq("list_id", parsed.data.listId)
    .gt("attempts", 0);
  if (count) return { ok: false, error: `Impossible : ${count} restaurant${count > 1 ? "s ont" : " a"} déjà été appelé${count > 1 ? "s" : ""} dans cette liste.` };
  const { error } = await supabase.from("prospect_lists").delete().eq("id", parsed.data.listId);
  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath("/prospection");
  return { ok: true };
}
