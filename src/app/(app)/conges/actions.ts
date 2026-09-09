"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { translatePgError } from "@/lib/pg-errors";
import { mailerConfigured, sendMail } from "@/lib/mailer";
import { initialStatus, KIND_LABELS, type ContractType } from "@/lib/conges/rules";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const BASE_URL = "https://pef-erp.vercel.app";
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function fmt(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
}

// Emails de l'équipe de coordination (admin + coordinator), via l'API admin.
async function teamEmails(orgId: string): Promise<string[]> {
  const admin = createAdminClient();
  const [{ data: members }, { data: users }] = await Promise.all([
    admin.from("memberships").select("user_id, role").eq("org_id", orgId).in("role", ["admin", "coordinator"]),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const byId = new Map((users?.users ?? []).map((u) => [u.id, u.email ?? null]));
  const emails = (members ?? []).map((m) => byId.get(m.user_id)).filter((e): e is string => Boolean(e) && !e!.endsWith(".invalid"));
  if (process.env.ALERTS_EMAIL && !emails.includes(process.env.ALERTS_EMAIL)) emails.push(process.env.ALERTS_EMAIL);
  return [...new Set(emails)];
}

const requestSchema = z.object({
  startsOn: day,
  endsOn: day,
  kind: z.enum(["conge", "maladie", "formation", "autre"]),
  note: z.string().max(500).nullable(),
});

// Demande (salarié) ou déclaration (vacataire, prestataire) d'absence par le formateur connecté.
export async function requestAbsence(raw: z.infer<typeof requestSchema>): Promise<ActionResult> {
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Renseignez les deux dates." };
  const d = parsed.data;
  if (d.endsOn < d.startsOn) return { ok: false, error: "La date de fin est avant la date de début." };

  const { orgId, userId } = await requireRole(["trainer", "admin", "coordinator"]);
  const supabase = await createClient();
  const { data: membership } = await supabase.from("memberships").select("trainer_id").eq("user_id", userId).maybeSingle();
  if (!membership?.trainer_id) return { ok: false, error: "Votre compte n'est pas relié à une fiche formateur." };

  // Type de contrat : la table trainers n'est pas lisible par un formateur (coût horaire) → client admin.
  const admin = createAdminClient();
  const { data: trainer } = await admin.from("trainers").select("first_name, last_name, contract_type, email").eq("id", membership.trainer_id).single();
  if (!trainer) return { ok: false, error: "Fiche formateur introuvable." };
  const status = initialStatus(trainer.contract_type as ContractType);

  const { error } = await supabase.from("trainer_absences").insert({
    org_id: orgId,
    trainer_id: membership.trainer_id,
    starts_on: d.startsOn,
    ends_on: d.endsOn,
    kind: d.kind,
    note: d.note?.trim() || null,
    status,
    requested_by: userId,
  });
  if (error) return { ok: false, error: translatePgError(error) };

  // Séances déjà planifiées sur la période : la coordination devra les déplacer
  const { count: impacted } = await admin
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("trainer_id", membership.trainer_id)
    .neq("status", "annulee")
    .gte("starts_at", `${d.startsOn}T00:00:00Z`)
    .lt("starts_at", `${d.endsOn}T23:59:59Z`);

  if (mailerConfigured()) {
    const name = `${trainer.first_name} ${trainer.last_name}`.trim();
    const period = d.startsOn === d.endsOn ? `le ${fmt(d.startsOn)}` : `du ${fmt(d.startsOn)} au ${fmt(d.endsOn)}`;
    const subject = status === "en_attente"
      ? `Demande de congé à valider — ${name} (${period})`
      : `Absence déclarée — ${name} (${period})`;
    const html = `<p>${status === "en_attente" ? `<strong>${name}</strong> demande un congé` : `<strong>${name}</strong> a déclaré une absence`} (${KIND_LABELS[d.kind].toLowerCase()}) ${period}.</p>
${d.note ? `<p>Motif : ${d.note.replace(/</g, "&lt;")}</p>` : ""}
<p>${impacted ? `<strong>${impacted} séance${impacted > 1 ? "s" : ""}</strong> déjà planifiée${impacted > 1 ? "s" : ""} sur cette période : à déplacer ou à remplacer.` : "Aucune séance planifiée sur cette période."}</p>
<p>${status === "en_attente" ? "Valider ou refuser" : "Voir"} : <a href="${BASE_URL}/formateurs/${membership.trainer_id}">${BASE_URL}/formateurs/${membership.trainer_id}</a></p>
<p>ERP PEF</p>`;
    for (const to of await teamEmails(orgId)) await sendMail({ to, subject, html });
  }

  revalidatePath("/conges");
  revalidatePath(`/formateurs/${membership.trainer_id}`);
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: status === "en_attente"
      ? `Demande envoyée. ${impacted ? `${impacted} séance${impacted > 1 ? "s" : ""} planifiée${impacted > 1 ? "s" : ""} sur cette période.` : ""}`.trim()
      : `Absence enregistrée, la coordination est prévenue.${impacted ? ` ${impacted} séance${impacted > 1 ? "s" : ""} à déplacer.` : ""}`,
  };
}

// Retrait par le formateur d'une demande encore en attente
export async function cancelAbsenceRequest(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Demande invalide" };
  await requireRole(["trainer", "admin", "coordinator"]);
  const supabase = await createClient();
  const { error, count } = await supabase.from("trainer_absences").delete({ count: "exact" }).eq("id", id).eq("status", "en_attente");
  if (error) return { ok: false, error: translatePgError(error) };
  if (!count) return { ok: false, error: "Cette demande n'est plus en attente." };
  revalidatePath("/conges");
  revalidatePath("/dashboard");
  return { ok: true, message: "Demande retirée." };
}

const decideSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approuvee", "refusee"]),
  note: z.string().max(500).nullable(),
});

// Validation ou refus par l'admin / la coordination ; le formateur est prévenu par email.
export async function decideAbsence(raw: z.infer<typeof decideSchema>): Promise<ActionResult> {
  const parsed = decideSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;
  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { data: abs } = await supabase
    .from("trainer_absences")
    .select("id, trainer_id, starts_on, ends_on, kind, trainers:trainer_id(first_name, email)")
    .eq("id", d.id)
    .eq("org_id", orgId)
    .single();
  if (!abs) return { ok: false, error: "Demande introuvable" };

  const { error } = await supabase
    .from("trainer_absences")
    .update({ status: d.decision, decided_by: userId, decided_at: new Date().toISOString(), decision_note: d.note?.trim() || null })
    .eq("id", d.id);
  if (error) return { ok: false, error: translatePgError(error) };

  const t = abs.trainers as unknown as { first_name: string; email: string | null } | null;
  if (t?.email && mailerConfigured()) {
    const period = abs.starts_on === abs.ends_on ? `le ${fmt(abs.starts_on)}` : `du ${fmt(abs.starts_on)} au ${fmt(abs.ends_on)}`;
    await sendMail({
      to: t.email,
      subject: d.decision === "approuvee" ? `Congé validé — ${period}` : `Congé refusé — ${period}`,
      html: `<p>Bonjour ${t.first_name},</p>
<p>Votre demande (${KIND_LABELS[abs.kind as keyof typeof KIND_LABELS].toLowerCase()}) ${period} est <strong>${d.decision === "approuvee" ? "validée" : "refusée"}</strong>.</p>
${d.note ? `<p>${d.note.replace(/</g, "&lt;")}</p>` : ""}
<p>Vos congés : <a href="${BASE_URL}/conges">${BASE_URL}/conges</a></p>
<p>ParlerEmploi Formation</p>`,
    });
  }

  revalidatePath("/conges");
  revalidatePath(`/formateurs/${abs.trainer_id}`);
  revalidatePath("/dashboard");
  revalidatePath("/planning");
  return { ok: true, message: d.decision === "approuvee" ? "Congé validé, le formateur est prévenu." : "Demande refusée, le formateur est prévenu." };
}
