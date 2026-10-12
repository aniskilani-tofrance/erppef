import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildVcf,
  canExportContacts,
  selectContacts,
  vcfFileName,
  type ContactMode,
  type ContactSelection,
  type GroupInfo,
  type GroupMember,
} from "@/lib/contacts/vcard";

// Chargement des contacts d'un groupe et journal des imports. Toujours appelé avec le
// client service_role (le lien « téléphone » est ouvert sans session) : chaque requête
// est donc bornée explicitement à l'organisme, et le droit d'accès revérifié ici.

export type ContactContext = {
  group: GroupInfo;
  members: GroupMember[];
  alreadyImported: Set<string>;
};

/** Droit d'un utilisateur (rôle lu dans son membership) sur les contacts du groupe. */
export async function userCanExportContacts(admin: SupabaseClient, orgId: string, groupId: string, userId: string): Promise<boolean> {
  const [{ data: membership }, { data: group }, { data: sessions }, { data: interns }] = await Promise.all([
    admin.from("memberships").select("role, trainer_id").eq("org_id", orgId).eq("user_id", userId).maybeSingle(),
    admin.from("groups").select("trainer_id").eq("id", groupId).eq("org_id", orgId).maybeSingle(),
    admin.from("sessions").select("trainer_id, co_trainer_id").eq("group_id", groupId).eq("org_id", orgId),
    admin.from("group_interns").select("group_id").eq("org_id", orgId).eq("user_id", userId),
  ]);
  if (!membership || !group) return false;
  const groupTrainerIds = [
    group.trainer_id as string | null,
    ...(sessions ?? []).flatMap((s) => [s.trainer_id as string | null, s.co_trainer_id as string | null]),
  ].filter((x): x is string => !!x);
  return canExportContacts({
    role: membership.role as string,
    groupId,
    myTrainerId: (membership.trainer_id as string | null) ?? null,
    groupTrainerIds,
    myInternGroupIds: (interns ?? []).map((i) => i.group_id as string),
  });
}

export async function loadContactContext(admin: SupabaseClient, orgId: string, groupId: string, userId: string): Promise<ContactContext | null> {
  const [{ data: group }, { data: enrollments }, { data: exports }] = await Promise.all([
    admin.from("groups").select("name, group_no").eq("id", groupId).eq("org_id", orgId).maybeSingle(),
    admin
      .from("enrollments")
      .select("learner_id, status, learners(first_name, last_name, learner_no, phone)")
      .eq("group_id", groupId)
      .eq("org_id", orgId),
    admin
      .from("group_contact_exports")
      .select("learner_ids")
      .eq("org_id", orgId)
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .not("downloaded_at", "is", null),
  ]);
  if (!group) return null;
  const members: GroupMember[] = (enrollments ?? []).flatMap((e) => {
    const l = e.learners as unknown as { first_name: string; last_name: string; learner_no: number | null; phone: string | null } | null;
    return l
      ? [{ learnerId: e.learner_id as string, firstName: l.first_name, lastName: l.last_name, learnerNo: l.learner_no, phone: l.phone, status: e.status as string }]
      : [];
  });
  return {
    group: { name: group.name as string, groupNo: (group.group_no as number | null) ?? null },
    members,
    alreadyImported: new Set((exports ?? []).flatMap((x) => (x.learner_ids as string[] | null) ?? [])),
  };
}

export function selectionOf(ctx: ContactContext, mode: ContactMode): ContactSelection {
  return selectContacts(ctx.members, ctx.alreadyImported, mode);
}

/** Réponse .vcf + nom de fichier (le contenu est déjà filtré). */
export function vcfResponse(ctx: ContactContext, selection: ContactSelection, mode: ContactMode): Response {
  const exportedOn = new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  return new Response(buildVcf(selection.toExport, ctx.group, exportedOn), {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${vcfFileName(ctx.group, mode)}"`,
      "Cache-Control": "no-store",
    },
  });
}

export function emptyResponse(mode: ContactMode): Response {
  const text = mode === "nouveaux"
    ? "Aucun nouveau contact depuis votre dernier import : votre téléphone est à jour."
    : "Aucun inscrit avec un numéro de téléphone exploitable dans ce groupe.";
  return new Response(text, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
