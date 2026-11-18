"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";
import { AiError, aiConfigured, askStructured, type AiUsage } from "@/lib/ai/client";
import { FINANCEMENTS_ROLES } from "@/lib/financements/constants";
import {
  AI_MODES, MAX_SECTIONS, SECTION_TEMPLATES, appendText, blockRowFromForm, cleanContent, countChars, isTemplateKey, modeNeedsText, reorder,
  sectionRowFromForm, type BlockCategory,
} from "@/lib/financements/atelier";
import { loadAiBudget } from "@/lib/financements/budget-ia";
import { figuresText, loadOrgFigures, periodByKey } from "@/lib/financements/chiffres";
import { parisDay } from "@/lib/financements/echeances";
import { AI_FEATURE_PREFIX, cleanDraftText, draftRemarks, draftSectionPrompt } from "@/lib/financements/ia";
import { formatDueAt } from "@/lib/financements/liens";
import type { ActionResult } from "./actions";

// Server Actions de l'atelier d'écriture (lot 2). Même règle que le lot 1 : chaque
// écriture commence par requireRole et filtre explicitement par org_id, en plus de la RLS.

type Supa = Awaited<ReturnType<typeof createClient>>;
const ROLES = [...FINANCEMENTS_ROLES];
const uuid = z.string().uuid();
const isId = (v: unknown): v is string => uuid.safeParse(v).success;

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof AiError) return { ok: false, error: e.message };
  if (e instanceof Error) return { ok: false, error: e.message };
  return { ok: false, error: "Erreur inattendue." };
}

// La fiche du dossier affiche l'avancement : on la rafraîchit. L'atelier, lui, garde son
// état à l'écran (on ne le recharge pas pendant qu'on écrit).
function refreshDossier(applicationId: string, withAtelier = false) {
  revalidatePath(`/financements/dossiers/${applicationId}`);
  if (withAtelier) revalidatePath(`/financements/dossiers/${applicationId}/atelier`);
}

type SectionRow = { id: string; application_id: string; position: number; title: string; guidance: string | null; max_chars: number | null; content: string };
const SECTION_COLS = "id, application_id, position, title, guidance, max_chars, content";

async function loadSection(supabase: Supa, orgId: string, id: string): Promise<SectionRow | null> {
  const { data } = await supabase.from("funding_application_sections").select(SECTION_COLS).eq("id", id).eq("org_id", orgId).maybeSingle();
  return (data as SectionRow | null) ?? null;
}

async function applicationExists(supabase: Supa, orgId: string, id: string): Promise<boolean> {
  const { data } = await supabase.from("funding_applications").select("id").eq("id", id).eq("org_id", orgId).maybeSingle();
  return !!data;
}

// ── Rubriques ────────────────────────────────────────────────────────────────
// Pose les rubriques d'un modèle sur un dossier qui n'en a pas encore.
export async function applyTemplate(applicationId: string, templateKey: string): Promise<ActionResult> {
  try {
    if (!isId(applicationId) || !isTemplateKey(templateKey)) return { ok: false, error: "Modèle ou dossier invalide." };
    const { orgId, userId } = await requireRole(ROLES);
    const supabase = await createClient();
    if (!(await applicationExists(supabase, orgId, applicationId))) return { ok: false, error: "Dossier introuvable." };
    const { count } = await supabase
      .from("funding_application_sections")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("application_id", applicationId);
    if (count) return { ok: false, error: "Ce dossier a déjà des rubriques : ajoutez les suivantes une à une." };
    const template = SECTION_TEMPLATES[templateKey];
    if (template.sections.length) {
      const { error } = await supabase.from("funding_application_sections").insert(
        template.sections.map((s, i) => ({
          org_id: orgId, application_id: applicationId, position: i, title: s.title, guidance: s.guidance, updated_by: userId,
        })),
      );
      if (error) return { ok: false, error: translatePgError(error) };
    }
    const { error: aErr } = await supabase.from("funding_applications").update({ template_key: templateKey }).eq("id", applicationId).eq("org_id", orgId);
    if (aErr) return { ok: false, error: translatePgError(aErr) };
    refreshDossier(applicationId, true);
    return { ok: true, message: template.sections.length ? `${template.sections.length} rubriques créées.` : "Dossier libre : ajoutez vos rubriques." };
  } catch (e) {
    return fail(e);
  }
}

export async function addSection(applicationId: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    if (!isId(applicationId)) return { ok: false, error: "Dossier invalide." };
    const { orgId, userId } = await requireRole(ROLES);
    const row = sectionRowFromForm(raw);
    const supabase = await createClient();
    if (!(await applicationExists(supabase, orgId, applicationId))) return { ok: false, error: "Dossier introuvable." };
    const { data: existing } = await supabase
      .from("funding_application_sections")
      .select("position")
      .eq("org_id", orgId)
      .eq("application_id", applicationId)
      .order("position", { ascending: false });
    if ((existing?.length ?? 0) >= MAX_SECTIONS) return { ok: false, error: `${MAX_SECTIONS} rubriques au maximum par dossier.` };
    const position = existing?.length ? (existing[0].position as number) + 1 : 0;
    const { data, error } = await supabase
      .from("funding_application_sections")
      .insert({ ...row, org_id: orgId, application_id: applicationId, position, updated_by: userId })
      .select("id")
      .single();
    if (error) return { ok: false, error: translatePgError(error) };
    refreshDossier(applicationId, true);
    return { ok: true, message: "Rubrique ajoutée.", data: { id: data.id } };
  } catch (e) {
    return fail(e);
  }
}

// Titre, consigne et limite de caractères d'une rubrique.
export async function updateSection(id: string, raw: unknown): Promise<ActionResult> {
  try {
    if (!isId(id)) return { ok: false, error: "Rubrique invalide." };
    const { orgId, userId } = await requireRole(ROLES);
    const row = sectionRowFromForm(raw);
    const supabase = await createClient();
    const section = await loadSection(supabase, orgId, id);
    if (!section) return { ok: false, error: "Rubrique introuvable." };
    const { error } = await supabase.from("funding_application_sections").update({ ...row, updated_by: userId }).eq("id", id).eq("org_id", orgId);
    if (error) return { ok: false, error: translatePgError(error) };
    refreshDossier(section.application_id, true);
    return { ok: true, message: "Rubrique enregistrée." };
  } catch (e) {
    return fail(e);
  }
}

// Enregistrement du texte pendant la saisie (automatique).
export async function saveSectionContent(id: string, content: unknown): Promise<ActionResult> {
  try {
    if (!isId(id)) return { ok: false, error: "Rubrique invalide." };
    const { orgId, userId } = await requireRole(ROLES);
    const text = cleanContent(content);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("funding_application_sections")
      .update({ content: text, updated_by: userId })
      .eq("id", id)
      .eq("org_id", orgId)
      .select("application_id")
      .maybeSingle();
    if (error) return { ok: false, error: translatePgError(error) };
    if (!data) return { ok: false, error: "Rubrique introuvable." };
    refreshDossier(data.application_id as string);
    return { ok: true, message: "Enregistré." };
  } catch (e) {
    return fail(e);
  }
}

export async function moveSection(id: string, direction: "up" | "down"): Promise<ActionResult> {
  try {
    if (!isId(id) || (direction !== "up" && direction !== "down")) return { ok: false, error: "Déplacement invalide." };
    const { orgId } = await requireRole(ROLES);
    const supabase = await createClient();
    const section = await loadSection(supabase, orgId, id);
    if (!section) return { ok: false, error: "Rubrique introuvable." };
    const { data: all } = await supabase
      .from("funding_application_sections")
      .select("id")
      .eq("org_id", orgId)
      .eq("application_id", section.application_id)
      .order("position")
      .order("created_at");
    const before = (all ?? []).map((s) => s.id as string);
    const after = reorder(before, id, direction);
    for (let i = 0; i < after.length; i++) {
      if (after[i] === before[i]) continue;
      const { error } = await supabase.from("funding_application_sections").update({ position: i }).eq("id", after[i]).eq("org_id", orgId);
      if (error) return { ok: false, error: translatePgError(error) };
    }
    refreshDossier(section.application_id, true);
    return { ok: true, message: "Ordre enregistré." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSection(id: string): Promise<ActionResult> {
  try {
    if (!isId(id)) return { ok: false, error: "Rubrique invalide." };
    const { orgId } = await requireRole(ROLES);
    const supabase = await createClient();
    const section = await loadSection(supabase, orgId, id);
    if (!section) return { ok: false, error: "Rubrique introuvable." };
    const { error } = await supabase.from("funding_application_sections").delete().eq("id", id).eq("org_id", orgId);
    if (error) return { ok: false, error: translatePgError(error) };
    refreshDossier(section.application_id, true);
    return { ok: true, message: "Rubrique supprimée." };
  } catch (e) {
    return fail(e);
  }
}

// ── Versions gardées ─────────────────────────────────────────────────────────
export type SectionVersion = { id: string; content: string; source: "manuel" | "ia"; createdAt: string; author: string | null };

async function snapshot(supabase: Supa, orgId: string, userId: string, sectionId: string, content: string, source: "manuel" | "ia") {
  if (!content.trim()) return;
  await supabase.from("funding_section_versions").insert({ org_id: orgId, section_id: sectionId, content, source, author_id: userId });
}

export async function keepVersion(id: string): Promise<ActionResult> {
  try {
    if (!isId(id)) return { ok: false, error: "Rubrique invalide." };
    const { orgId, userId } = await requireRole(ROLES);
    const supabase = await createClient();
    const section = await loadSection(supabase, orgId, id);
    if (!section) return { ok: false, error: "Rubrique introuvable." };
    if (!section.content.trim()) return { ok: false, error: "Rien à garder : la rubrique est vide." };
    await snapshot(supabase, orgId, userId, id, section.content, "manuel");
    return { ok: true, message: "Version gardée." };
  } catch (e) {
    return fail(e);
  }
}

export async function listVersions(sectionId: string): Promise<{ ok: true; versions: SectionVersion[] } | { ok: false; error: string }> {
  try {
    if (!isId(sectionId)) return { ok: false, error: "Rubrique invalide." };
    const { orgId } = await requireRole(ROLES);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("funding_section_versions")
      .select("id, content, source, created_at, author_id")
      .eq("org_id", orgId)
      .eq("section_id", sectionId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return { ok: false, error: translatePgError(error) };
    const authorIds = [...new Set((data ?? []).map((v) => v.author_id as string | null).filter((x): x is string => !!x))];
    const { data: profiles } = authorIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", authorIds)
      : { data: [] as { id: string; full_name: string | null }[] };
    const names = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name ?? "").trim() || null]));
    return {
      ok: true,
      versions: (data ?? []).map((v) => ({
        id: v.id as string,
        content: v.content as string,
        source: v.source as "manuel" | "ia",
        createdAt: v.created_at as string,
        author: v.author_id ? names.get(v.author_id as string) ?? null : null,
      })),
    };
  } catch (e) {
    return fail(e);
  }
}

// Reprend une version gardée ; le texte en place est gardé à son tour (rien n'est perdu).
export async function restoreVersion(versionId: string): Promise<ActionResult<{ content: string }>> {
  try {
    if (!isId(versionId)) return { ok: false, error: "Version invalide." };
    const { orgId, userId } = await requireRole(ROLES);
    const supabase = await createClient();
    const { data: v } = await supabase.from("funding_section_versions").select("section_id, content").eq("id", versionId).eq("org_id", orgId).maybeSingle();
    if (!v) return { ok: false, error: "Version introuvable." };
    const section = await loadSection(supabase, orgId, v.section_id as string);
    if (!section) return { ok: false, error: "Rubrique introuvable." };
    const content = v.content as string;
    if (section.content !== content) await snapshot(supabase, orgId, userId, section.id, section.content, "manuel");
    const { error } = await supabase.from("funding_application_sections").update({ content, updated_by: userId }).eq("id", section.id).eq("org_id", orgId);
    if (error) return { ok: false, error: translatePgError(error) };
    refreshDossier(section.application_id);
    return { ok: true, message: "Version reprise.", data: { content } };
  } catch (e) {
    return fail(e);
  }
}

// ── Écriture avec l'IA ───────────────────────────────────────────────────────
function usageLogger(supabase: Supa, orgId: string, userId: string, feature: string) {
  return async (u: AiUsage) => {
    await supabase.from("ai_calls").insert({
      org_id: orgId, feature, model: u.model, input_tokens: u.inputTokens, output_tokens: u.outputTokens, cache_read_tokens: u.cacheReadTokens, created_by: userId,
    });
  };
}

const draftSchema = z.object({
  sectionId: uuid,
  mode: z.enum(AI_MODES),
  instruction: z.string().max(1000).nullable(),
  blockIds: z.array(uuid).max(12),
  periodKey: z.string().max(40).nullable(), // période des chiffres de l'ERP à fournir, ou null
});
export type DraftRequest = z.infer<typeof draftSchema>;
export type DraftResult = { ok: true; text: string; remarks: string[]; chars: number } | { ok: false; error: string };

// Demande une proposition pour une rubrique. Rien n'est enregistré : la proposition
// s'affiche, la personne la relit puis choisit (acceptDraft) ou l'abandonne.
export async function draftSection(raw: DraftRequest): Promise<DraftResult> {
  try {
    const parsed = draftSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Demande invalide." };
    const input = parsed.data;
    const { orgId, userId } = await requireRole(ROLES);
    if (!aiConfigured()) return { ok: false, error: "L'écriture avec l'IA n'est pas activée sur cet ERP (clé du modèle absente)." };
    const supabase = await createClient();
    const budget = await loadAiBudget(supabase, orgId);
    if (budget.exceeded) {
      return { ok: false, error: `Plafond mensuel d'IA atteint pour les financements (${budget.capUsd.toLocaleString("fr-FR")} $). Il repart le 1er du mois, ou l'administration peut le relever.` };
    }
    const section = await loadSection(supabase, orgId, input.sectionId);
    if (!section) return { ok: false, error: "Rubrique introuvable." };
    if (modeNeedsText(input.mode) && !section.content.trim()) {
      return { ok: false, error: "Cette demande part du texte existant : écrivez d'abord quelques lignes, ou choisissez « Rédiger »." };
    }

    const [{ data: app }, { data: others }, { data: blocks }, { data: org }] = await Promise.all([
      supabase
        .from("funding_applications")
        .select("title, amount_requested, deadline_at, funders(name), funding_opportunities(title, summary, criteria, eligibility_notes)")
        .eq("id", section.application_id)
        .eq("org_id", orgId)
        .maybeSingle(),
      supabase
        .from("funding_application_sections")
        .select("id, title, content")
        .eq("org_id", orgId)
        .eq("application_id", section.application_id)
        .neq("id", section.id)
        .order("position"),
      input.blockIds.length
        ? supabase.from("funding_text_blocks").select("title, category, content").eq("org_id", orgId).in("id", input.blockIds)
        : Promise.resolve({ data: [] as { title: string; category: string; content: string }[] }),
      supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    ]);
    if (!app) return { ok: false, error: "Dossier introuvable." };

    let figures: string | null = null;
    if (input.periodKey) {
      const period = periodByKey(input.periodKey, parisDay(new Date()));
      figures = figuresText(await loadOrgFigures(orgId, period.from, period.to), period.label) || null;
    }

    const funder = app.funders as unknown as { name: string } | null;
    const opp = app.funding_opportunities as unknown as { title: string; summary: string | null; criteria: string | null; eligibility_notes: string | null } | null;
    const prompt = draftSectionPrompt({
      mode: input.mode,
      orgName: org?.name ?? "L'association",
      application: {
        title: app.title,
        funderName: funder?.name ?? null,
        amountRequested: app.amount_requested === null ? null : Number(app.amount_requested),
        deadline: app.deadline_at ? formatDueAt(app.deadline_at, false) : null,
      },
      call: opp ? { title: opp.title, summary: opp.summary, criteria: opp.criteria, eligibilityNotes: opp.eligibility_notes } : null,
      section: { title: section.title, guidance: section.guidance, maxChars: section.max_chars, content: section.content },
      otherSections: (others ?? []).map((o) => ({ title: o.title as string, content: o.content as string })),
      blocks: (blocks ?? []).map((b) => ({ title: b.title, category: b.category as BlockCategory, content: b.content })),
      figures,
      instruction: input.instruction,
    });
    // Écrire demande plus de soin que les messages courts de l'assistant : effort moyen,
    // et de la marge de jetons (la réflexion du modèle compte dans max_tokens).
    const out = await askStructured({
      ...prompt,
      effort: "medium",
      maxTokens: 16000,
      onUsage: usageLogger(supabase, orgId, userId, `${AI_FEATURE_PREFIX}rubrique_${input.mode}`),
    });
    const text = cleanDraftText(out.text);
    if (!text) return { ok: false, error: "L'IA n'a rien proposé : réessayez, ou précisez la demande." };
    return { ok: true, text, remarks: draftRemarks(text, section.max_chars, out.remarks), chars: countChars(text) };
  } catch (e) {
    return fail(e);
  }
}

// La personne accepte la proposition : le texte d'avant est gardé, puis remplacé (ou complété).
export async function acceptDraft(sectionId: string, text: unknown, how: "remplacer" | "ajouter"): Promise<ActionResult<{ content: string }>> {
  try {
    if (!isId(sectionId) || (how !== "remplacer" && how !== "ajouter")) return { ok: false, error: "Demande invalide." };
    const { orgId, userId } = await requireRole(ROLES);
    const proposal = cleanContent(text).trim();
    if (!proposal) return { ok: false, error: "Proposition vide." };
    const supabase = await createClient();
    const section = await loadSection(supabase, orgId, sectionId);
    if (!section) return { ok: false, error: "Rubrique introuvable." };
    const content = cleanContent(how === "ajouter" ? appendText(section.content, proposal) : proposal);
    await snapshot(supabase, orgId, userId, section.id, section.content, "manuel");
    await snapshot(supabase, orgId, userId, section.id, proposal, "ia");
    const { error } = await supabase.from("funding_application_sections").update({ content, updated_by: userId }).eq("id", section.id).eq("org_id", orgId);
    if (error) return { ok: false, error: translatePgError(error) };
    refreshDossier(section.application_id);
    return { ok: true, message: how === "ajouter" ? "Proposition ajoutée à la suite." : "Proposition reprise. Le texte d'avant est gardé dans l'historique.", data: { content } };
  } catch (e) {
    return fail(e);
  }
}

// Les chiffres de l'ERP pour une période, en texte à insérer dans une rubrique.
export async function figuresForPeriod(periodKey: string): Promise<{ ok: true; text: string; label: string } | { ok: false; error: string }> {
  try {
    const { orgId } = await requireRole(ROLES);
    const period = periodByKey(periodKey, parisDay(new Date()));
    const text = figuresText(await loadOrgFigures(orgId, period.from, period.to), period.label);
    if (!text) return { ok: false, error: `Aucune activité enregistrée dans l'ERP sur la période « ${period.label} ».` };
    return { ok: true, text, label: period.label };
  } catch (e) {
    return fail(e);
  }
}

// ── Bibliothèque de textes ───────────────────────────────────────────────────
export async function saveBlock(id: string | null, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    if (id !== null && !isId(id)) return { ok: false, error: "Texte invalide." };
    const { orgId, userId } = await requireRole(ROLES);
    const row = blockRowFromForm(raw);
    const supabase = await createClient();
    if (id) {
      const { error, count } = await supabase.from("funding_text_blocks").update({ ...row, updated_by: userId }, { count: "exact" }).eq("id", id).eq("org_id", orgId);
      if (error) return { ok: false, error: translatePgError(error) };
      if (!count) return { ok: false, error: "Texte introuvable." };
      revalidatePath("/financements/bibliotheque");
      return { ok: true, message: "Texte enregistré.", data: { id } };
    }
    const { data, error } = await supabase.from("funding_text_blocks").insert({ ...row, org_id: orgId, updated_by: userId }).select("id").single();
    if (error) return { ok: false, error: translatePgError(error) };
    revalidatePath("/financements/bibliotheque");
    return { ok: true, message: "Texte ajouté à la bibliothèque.", data: { id: data.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteBlock(id: string): Promise<ActionResult> {
  try {
    if (!isId(id)) return { ok: false, error: "Texte invalide." };
    const { orgId } = await requireRole(ROLES);
    const supabase = await createClient();
    const { error, count } = await supabase.from("funding_text_blocks").delete({ count: "exact" }).eq("id", id).eq("org_id", orgId);
    if (error) return { ok: false, error: translatePgError(error) };
    if (!count) return { ok: false, error: "Texte introuvable." };
    revalidatePath("/financements/bibliotheque");
    return { ok: true, message: "Texte supprimé." };
  } catch (e) {
    return fail(e);
  }
}
