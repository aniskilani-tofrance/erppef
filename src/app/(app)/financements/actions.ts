"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";
import { FINANCEMENTS_ROLES, STAGES, type Portal, type Stage } from "@/lib/financements/constants";
import { parisDay } from "@/lib/financements/echeances";
import {
  applicationRowFromForm, deadlineRowFromForm, funderRowFromForm, opportunityRowFromForm, triagePatch,
} from "@/lib/financements/formulaires";
import { applicationFromOpportunity, funderCodeFromName, NEW_FUNDER_COLOR } from "@/lib/financements/regles";
import { moveError, stagePatch } from "@/lib/financements/stages";

// Server Actions du module Financements. Chaque écriture commence par requireRole et
// filtre explicitement par org_id (en plus de la RLS) : jamais d'écriture hors de
// l'organisation de la session (production et bac à sable partagent la base).

export type ActionResult<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; error: string };

const ROLES = [...FINANCEMENTS_ROLES];
const uuid = z.string().uuid();

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof Error) return { ok: false, error: e.message };
  return { ok: false, error: "Erreur inattendue." };
}

function refresh(...extra: string[]) {
  revalidatePath("/financements", "layout");
  for (const p of extra) revalidatePath(p);
}

// ── Opportunités ─────────────────────────────────────────────────────────────
export async function createOpportunity(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { orgId, userId } = await requireRole(ROLES);
    const row = opportunityRowFromForm(raw);
    // Saisie par l'équipe : déjà vue, donc « à évaluer » plutôt que « nouveau » (à trier).
    if (!row.watch_status) row.watch_status = "a_evaluer";
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("funding_opportunities")
      .insert({ ...row, org_id: orgId, source: "saisie", created_by: userId })
      .select("id")
      .single();
    if (error) return { ok: false, error: translatePgError(error) };
    refresh();
    return { ok: true, message: "Opportunité ajoutée.", data: { id: data.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateOpportunity(id: string, raw: unknown): Promise<ActionResult> {
  try {
    if (!uuid.safeParse(id).success) return { ok: false, error: "Opportunité invalide." };
    const { orgId } = await requireRole(ROLES);
    const row = opportunityRowFromForm(raw);
    const supabase = await createClient();
    const { error, count } = await supabase.from("funding_opportunities").update(row, { count: "exact" }).eq("id", id).eq("org_id", orgId);
    if (error) return { ok: false, error: translatePgError(error) };
    if (!count) return { ok: false, error: "Opportunité introuvable." };
    refresh(`/financements/veille/${id}`);
    return { ok: true, message: "Opportunité enregistrée." };
  } catch (e) {
    return fail(e);
  }
}

// Tri rapide : Écarter (raison obligatoire), À surveiller, Évaluer.
export async function triageOpportunity(raw: unknown): Promise<ActionResult> {
  try {
    const { orgId } = await requireRole(ROLES);
    const { id, patch } = triagePatch(raw);
    const supabase = await createClient();
    const { error, count } = await supabase.from("funding_opportunities").update(patch, { count: "exact" }).eq("id", id).eq("org_id", orgId);
    if (error) return { ok: false, error: translatePgError(error) };
    if (!count) return { ok: false, error: "Opportunité introuvable." };
    refresh(`/financements/veille/${id}`);
    const label = { ecarte: "Écartée.", a_surveiller: "À surveiller.", a_evaluer: "À évaluer.", nouveau: "Remise à trier.", retenu: "Retenue." }[patch.watch_status as string];
    return { ok: true, message: label ?? "Enregistré." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteOpportunity(id: string): Promise<ActionResult> {
  try {
    if (!uuid.safeParse(id).success) return { ok: false, error: "Opportunité invalide." };
    const { orgId } = await requireRole(ROLES);
    const supabase = await createClient();
    const { count: linked } = await supabase.from("funding_applications").select("id", { count: "exact", head: true }).eq("opportunity_id", id).eq("org_id", orgId);
    if (linked) return { ok: false, error: "Un dossier est né de cette opportunité : écartez-la plutôt que de la supprimer." };
    const { error, count } = await supabase.from("funding_opportunities").delete({ count: "exact" }).eq("id", id).eq("org_id", orgId);
    if (error) return { ok: false, error: translatePgError(error) };
    if (!count) return { ok: false, error: "Opportunité introuvable." };
    refresh();
    return { ok: true, message: "Opportunité supprimée." };
  } catch (e) {
    return fail(e);
  }
}

// « Créer le dossier » : reprend tout ce qui est connu de l'opportunité (aucune ressaisie),
// crée au besoin la fiche du financeur, et passe l'opportunité en « retenu ».
export async function createApplicationFromOpportunity(opportunityId: string): Promise<ActionResult<{ id: string }>> {
  try {
    if (!uuid.safeParse(opportunityId).success) return { ok: false, error: "Opportunité invalide." };
    const { orgId, userId } = await requireRole(ROLES);
    const supabase = await createClient();

    const { data: existing } = await supabase.from("funding_applications").select("id").eq("opportunity_id", opportunityId).eq("org_id", orgId).limit(1).maybeSingle();
    if (existing) return { ok: true, message: "Le dossier existe déjà.", data: { id: existing.id } };

    const { data: opp } = await supabase
      .from("funding_opportunities")
      .select("id, org_id, title, family, funder_id, funder_name, url, deadline_at, amount_min, amount_max, summary, eligibility_notes")
      .eq("id", opportunityId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!opp) return { ok: false, error: "Opportunité introuvable." };

    let funderId = opp.funder_id as string | null;
    let portal: Portal | null = null;
    if (funderId) {
      const { data: f } = await supabase.from("funders").select("portal").eq("id", funderId).eq("org_id", orgId).maybeSingle();
      portal = (f?.portal ?? null) as Portal | null;
    } else {
      const name = (opp.funder_name ?? "").trim();
      if (!name) return { ok: false, error: "Indiquez d'abord le financeur de l'opportunité (bouton « Modifier »)." };
      const { data: funders } = await supabase.from("funders").select("id, name, code, portal").eq("org_id", orgId);
      const same = (funders ?? []).find((f) => f.name.trim().toLowerCase() === name.toLowerCase());
      if (same) {
        funderId = same.id;
        portal = (same.portal ?? null) as Portal | null;
      } else {
        const code = funderCodeFromName(name, (funders ?? []).map((f) => f.code));
        const kind = opp.family === "mecenat" ? "fondation" : null;
        const { data: created, error } = await supabase
          .from("funders")
          .insert({ org_id: orgId, name, code, color: NEW_FUNDER_COLOR, kind })
          .select("id")
          .single();
        if (error) return { ok: false, error: translatePgError(error) };
        funderId = created.id;
      }
      await supabase.from("funding_opportunities").update({ funder_id: funderId, funder_name: null }).eq("id", opp.id).eq("org_id", orgId);
    }

    const row = applicationFromOpportunity(opp as Parameters<typeof applicationFromOpportunity>[0], {
      funderId: funderId!,
      funderPortal: portal,
      ownerId: userId,
      createdBy: userId,
    });
    const { data: app, error } = await supabase.from("funding_applications").insert(row).select("id").single();
    if (error) return { ok: false, error: translatePgError(error) };
    await supabase.from("funding_opportunities").update({ watch_status: "retenu", discard_reason: null }).eq("id", opp.id).eq("org_id", orgId);
    refresh(`/financements/veille/${opp.id}`);
    return { ok: true, message: "Dossier créé : vous en êtes responsable.", data: { id: app.id } };
  } catch (e) {
    return fail(e);
  }
}

// ── Dossiers ─────────────────────────────────────────────────────────────────
export async function createApplication(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { orgId, userId } = await requireRole(ROLES);
    const row = applicationRowFromForm(raw);
    const supabase = await createClient();
    const { data: f } = await supabase.from("funders").select("id").eq("id", row.funder_id as string).eq("org_id", orgId).maybeSingle();
    if (!f) return { ok: false, error: "Financeur introuvable." };
    if (row.stage === "accorde") row.granted_on = parisDay(new Date());
    const { data, error } = await supabase
      .from("funding_applications")
      .insert({ ...row, org_id: orgId, owner_id: row.owner_id ?? userId, created_by: userId })
      .select("id")
      .single();
    if (error) return { ok: false, error: translatePgError(error) };
    refresh();
    return { ok: true, message: "Dossier créé.", data: { id: data.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateApplication(id: string, raw: unknown): Promise<ActionResult> {
  try {
    if (!uuid.safeParse(id).success) return { ok: false, error: "Dossier invalide." };
    const { orgId } = await requireRole(ROLES);
    const row = applicationRowFromForm(raw);
    delete row.stage; // le statut change par moveApplicationStage (historique, règles)
    const supabase = await createClient();
    const { error, count } = await supabase.from("funding_applications").update(row, { count: "exact" }).eq("id", id).eq("org_id", orgId);
    if (error) return { ok: false, error: translatePgError(error) };
    if (!count) return { ok: false, error: "Dossier introuvable." };
    refresh(`/financements/dossiers/${id}`);
    return { ok: true, message: "Dossier enregistré." };
  } catch (e) {
    return fail(e);
  }
}

const moveSchema = z.object({ id: uuid, to: z.enum(STAGES), comment: z.string().max(500).optional().nullable() });

// Changement de statut (glisser-déposer ou menu « Changer de statut »). L'historique est
// posé par la base (trigger) ; le commentaire éventuel est ajouté à cette ligne.
export async function moveApplicationStage(raw: unknown): Promise<ActionResult> {
  try {
    const p = moveSchema.safeParse(raw);
    if (!p.success) return { ok: false, error: "Demande invalide." };
    const { orgId, userId } = await requireRole(ROLES);
    const supabase = await createClient();
    const { data: app } = await supabase.from("funding_applications").select("id, stage, granted_on").eq("id", p.data.id).eq("org_id", orgId).maybeSingle();
    if (!app) return { ok: false, error: "Dossier introuvable." };
    const err = moveError(app.stage as Stage, p.data.to);
    if (err) return { ok: false, error: err };
    const patch = stagePatch(p.data.to, parisDay(new Date()), { granted_on: app.granted_on });
    const { error } = await supabase.from("funding_applications").update(patch).eq("id", app.id).eq("org_id", orgId).eq("stage", app.stage);
    if (error) return { ok: false, error: translatePgError(error) };
    const comment = p.data.comment?.trim();
    if (comment) {
      const { data: ev } = await supabase
        .from("funding_application_events")
        .select("id")
        .eq("application_id", app.id)
        .eq("org_id", orgId)
        .eq("to_stage", p.data.to)
        .eq("author_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ev) await supabase.from("funding_application_events").update({ comment }).eq("id", ev.id).eq("org_id", orgId);
    }
    refresh(`/financements/dossiers/${app.id}`);
    return { ok: true, message: "Statut changé." };
  } catch (e) {
    return fail(e);
  }
}

// ── Échéances ────────────────────────────────────────────────────────────────
export async function createDeadline(raw: unknown): Promise<ActionResult> {
  try {
    const { orgId, userId } = await requireRole(ROLES);
    const row = deadlineRowFromForm(raw);
    const supabase = await createClient();
    const { error } = await supabase.from("funding_deadlines").insert({ ...row, org_id: orgId, created_by: userId });
    if (error) return { ok: false, error: translatePgError(error) };
    refresh();
    return { ok: true, message: "Échéance ajoutée." };
  } catch (e) {
    return fail(e);
  }
}

export async function updateDeadline(id: string, raw: unknown): Promise<ActionResult> {
  try {
    if (!uuid.safeParse(id).success) return { ok: false, error: "Échéance invalide." };
    const { orgId } = await requireRole(ROLES);
    const row = deadlineRowFromForm(raw);
    const supabase = await createClient();
    const { error, count } = await supabase.from("funding_deadlines").update(row, { count: "exact" }).eq("id", id).eq("org_id", orgId);
    if (error) return { ok: false, error: translatePgError(error) };
    if (!count) return { ok: false, error: "Échéance introuvable." };
    refresh();
    return { ok: true, message: "Échéance enregistrée." };
  } catch (e) {
    return fail(e);
  }
}

export async function setDeadlineDone(id: string, done: boolean): Promise<ActionResult> {
  try {
    if (!uuid.safeParse(id).success) return { ok: false, error: "Échéance invalide." };
    const { orgId } = await requireRole(ROLES);
    const supabase = await createClient();
    const { error, count } = await supabase
      .from("funding_deadlines")
      .update({ done_at: done ? new Date().toISOString() : null }, { count: "exact" })
      .eq("id", id)
      .eq("org_id", orgId);
    if (error) return { ok: false, error: translatePgError(error) };
    if (!count) return { ok: false, error: "Échéance introuvable." };
    refresh();
    return { ok: true, message: done ? "Échéance faite." : "Échéance rouverte." };
  } catch (e) {
    return fail(e);
  }
}

// Les échéances de dépôt automatiques suivent la date de l'opportunité ou du dossier :
// on les modifie là-bas, on ne les supprime pas ici.
export async function deleteDeadline(id: string): Promise<ActionResult> {
  try {
    if (!uuid.safeParse(id).success) return { ok: false, error: "Échéance invalide." };
    const { orgId } = await requireRole(ROLES);
    const supabase = await createClient();
    const { error, count } = await supabase.from("funding_deadlines").delete({ count: "exact" }).eq("id", id).eq("org_id", orgId).is("auto_origin", null);
    if (error) return { ok: false, error: translatePgError(error) };
    if (!count) return { ok: false, error: "Échéance automatique (date limite) : changez la date sur le dossier ou l'opportunité, ou cochez « fait »." };
    refresh();
    return { ok: true, message: "Échéance supprimée." };
  } catch (e) {
    return fail(e);
  }
}

// ── Financeurs ───────────────────────────────────────────────────────────────
export async function createFunder(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { orgId } = await requireRole(ROLES);
    const row = funderRowFromForm(raw);
    const supabase = await createClient();
    const { data: funders } = await supabase.from("funders").select("code").eq("org_id", orgId);
    const code = funderCodeFromName(row.name as string, (funders ?? []).map((f) => f.code));
    const { data, error } = await supabase.from("funders").insert({ ...row, org_id: orgId, code, color: NEW_FUNDER_COLOR }).select("id").single();
    if (error) return { ok: false, error: translatePgError(error) };
    refresh();
    return { ok: true, message: "Financeur ajouté.", data: { id: data.id } };
  } catch (e) {
    return fail(e);
  }
}

// Ni le code ni la couleur (planning) ne sont modifiés ici.
export async function updateFunder(id: string, raw: unknown): Promise<ActionResult> {
  try {
    if (!uuid.safeParse(id).success) return { ok: false, error: "Financeur invalide." };
    const { orgId } = await requireRole(ROLES);
    const row = funderRowFromForm(raw);
    const supabase = await createClient();
    const { error, count } = await supabase.from("funders").update(row, { count: "exact" }).eq("id", id).eq("org_id", orgId);
    if (error) return { ok: false, error: translatePgError(error) };
    if (!count) return { ok: false, error: "Financeur introuvable." };
    refresh(`/financements/financeurs/${id}`);
    return { ok: true, message: "Financeur enregistré." };
  } catch (e) {
    return fail(e);
  }
}
