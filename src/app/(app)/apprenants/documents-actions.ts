"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { translatePgError } from "@/lib/pg-errors";
import { loadTemplates } from "@/lib/admission/load-templates";
import { baseVars, buildStageMessage } from "@/lib/admission/templates";
import { whatsappLink } from "@/lib/admission/phone";
import {
  MIGRATION_MISSING,
  PAYMENT_METHOD_CODES,
  documentsPermissions,
  isMissingRelation,
  parisDay,
  receiptNumber,
  type DocsPermissions,
  type DocState,
  type MembershipRow,
  type SignedDocumentKind,
} from "@/lib/documents-apprenant/regles";
import { createSigningLink, isGroupTrainer, loadLearnerDocuments } from "@/lib/documents-apprenant/serveur";

// Bulletin d'adhésion, contrat de formation, règlement intérieur : actions de l'équipe
// (fiche apprenant, fiche groupe). Lectures et liens via le client service_role APRÈS
// contrôle du rôle (et, pour une formatrice, du groupe) ; cotisations via la RLS.

export type ActionResult = { ok: true } | { ok: false; error: string };

export type LearnerSignatures =
  | {
      ok: true;
      available: boolean;
      firstName: string;
      phone: string | null;
      groups: { groupId: string; groupName: string; year: number; states: Record<SignedDocumentKind, DocState> }[];
      memberships: MembershipRow[];
      perms: DocsPermissions;
    }
  | { ok: false; error: string };

/** Fiche apprenant : groupes concernés (cours PEF, ateliers), état des 3 documents, cotisations. */
export async function loadLearnerSignatures(learnerId: string): Promise<LearnerSignatures> {
  if (!z.string().uuid().safeParse(learnerId).success) return { ok: false, error: "Apprenant invalide" };
  const { orgId, role } = await requireRole(["admin", "coordinator"]);
  const data = await loadLearnerDocuments(createAdminClient(), orgId, learnerId, parisDay());
  if (!data) return { ok: false, error: "Apprenant introuvable" };
  return { ok: true, ...data, perms: documentsPermissions(role, false) };
}

const linkSchema = z.object({
  learnerId: z.string().uuid(),
  groupId: z.string().uuid(),
  channel: z.enum(["sur_place", "lien"]),
});

export type SigningLinkResult =
  | { ok: true; url: string; message: string | null; whatsappUrl: string | null }
  | { ok: false; error: string };

async function origin(): Promise<string> {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

/**
 * « Faire signer sur cette tablette » (sur_place : 2 heures) ou « Envoyer le lien WhatsApp »
 * (lien : 30 jours, message prérempli). Admin et coordination ; formatrice de SON groupe.
 */
export async function prepareSigningLink(raw: z.infer<typeof linkSchema>): Promise<SigningLinkResult> {
  const parsed = linkSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;
  const { orgId, role, userId } = await requireRole(["admin", "coordinator", "trainer"]);
  const admin = createAdminClient();
  const perms = documentsPermissions(role, role === "trainer" ? await isGroupTrainer(admin, orgId, d.groupId, userId) : false);
  if (d.channel === "sur_place" ? !perms.signHere : !perms.sendLink) {
    return { ok: false, error: "Seules la coordination et la formatrice du groupe peuvent faire signer ces documents." };
  }

  const link = await createSigningLink(admin, { orgId, learnerId: d.learnerId, groupId: d.groupId, channel: d.channel, userId });
  if (!link.ok) return link;
  const url = `${await origin()}/signer/${link.token}`;
  if (d.channel === "sur_place") return { ok: true, url, message: null, whatsappUrl: null };

  const [templates, { data: profile }] = await Promise.all([
    loadTemplates(admin, orgId),
    admin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  const sender = (profile?.full_name as string | null)?.trim().split(/\s+/)[0] ?? null;
  const message = buildStageMessage("documents_a_signer", { ...baseVars(link.learnerFirstName, sender), groupe: link.groupName, lien: url }, templates);
  await admin
    .from("learner_contacts")
    .insert({
      org_id: orgId,
      learner_id: d.learnerId,
      channel: "whatsapp",
      outcome: "message_envoye",
      note: `Lien des documents à signer (adhésion, contrat, règlement) préparé — ${link.groupName}`,
      created_by: userId,
    })
    .then(() => undefined, () => undefined);
  return { ok: true, url, message, whatsappUrl: whatsappLink(link.phone, message) };
}

const paymentSchema = z.object({
  learnerId: z.string().uuid(),
  year: z.number().int().min(2020).max(2100),
  amountEuros: z.number().min(0).max(1000),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(PAYMENT_METHOD_CODES),
  note: z.string().max(300).optional(),
});

/** Saisie de la cotisation payée (admin, coordination) : montant, date, mode, n° de reçu. */
export async function recordMembershipPayment(raw: z.infer<typeof paymentSchema>): Promise<ActionResult> {
  const parsed = paymentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Montant, date ou mode de paiement invalide." };
  const d = parsed.data;
  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  if (d.paidOn > parisDay()) return { ok: false, error: "La date de paiement ne peut pas être dans le futur." };
  const supabase = await createClient();

  const { data: learner } = await supabase.from("learners").select("id, learner_no").eq("id", d.learnerId).eq("org_id", orgId).maybeSingle();
  if (!learner) return { ok: false, error: "Apprenant introuvable" };

  const { error } = await supabase.from("learner_memberships").upsert(
    {
      org_id: orgId,
      learner_id: d.learnerId,
      membership_year: d.year,
      amount_cents: Math.round(d.amountEuros * 100),
      paid: true,
      paid_on: d.paidOn,
      payment_method: d.method,
      receipt_no: receiptNumber(d.year, learner.learner_no as number | null, d.learnerId),
      note: d.note?.trim() || null,
      recorded_by: userId,
    },
    { onConflict: "learner_id,membership_year" },
  );
  if (error) return { ok: false, error: isMissingRelation(error) ? MIGRATION_MISSING : translatePgError(error) };
  revalidatePath("/apprenants");
  revalidatePath("/groupes", "layout");
  return { ok: true };
}

const cancelSchema = z.object({ learnerId: z.string().uuid(), year: z.number().int().min(2020).max(2100) });

/** Erreur de saisie : la cotisation repasse « non payée » (la ligne et le n° de reçu restent). */
export async function cancelMembershipPayment(raw: z.infer<typeof cancelSchema>): Promise<ActionResult> {
  const parsed = cancelSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("learner_memberships")
    .update({ paid: false, paid_on: null, payment_method: null, recorded_by: userId })
    .eq("learner_id", parsed.data.learnerId)
    .eq("membership_year", parsed.data.year)
    .eq("org_id", orgId);
  if (error) return { ok: false, error: isMissingRelation(error) ? MIGRATION_MISSING : translatePgError(error) };
  revalidatePath("/apprenants");
  revalidatePath("/groupes", "layout");
  return { ok: true };
}
