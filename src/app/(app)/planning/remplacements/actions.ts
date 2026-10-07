"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadEngineData } from "@/lib/engine/loader";
import { rankReplacements } from "@/lib/engine/replacement";
import { translatePgError } from "@/lib/pg-errors";
import { mailerConfigured, sendMail } from "@/lib/mailer";
import { utcToLocalDate, utcToLocalTime } from "@/lib/dates";

export type AssignResult = { ok: true; emailed: boolean } | { ok: false; error: string };

const assignSchema = z.object({ sessionId: z.string().uuid(), trainerId: z.string().uuid() });

// Confier une séance à une remplaçante. L'éligibilité est revérifiée ici avec les
// mêmes règles que le moteur (disponibilité, absence validée, plafond, conflit) : la
// liste affichée a pu vieillir. La remplaçante est prévenue par email ; son agenda
// Google se met à jour à la synchronisation de la nuit.
export async function assignReplacement(raw: z.infer<typeof assignSchema>): Promise<AssignResult> {
  const parsed = assignSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Paramètres invalides" };
  const { sessionId, trainerId } = parsed.data;

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = createAdminClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, group_id, trainer_id, starts_at, ends_at, status, groups(name, programs(level)), rooms:room_id(name, address, access_notes)")
    .eq("id", sessionId)
    .eq("org_id", orgId)
    .single();
  if (!session) return { ok: false, error: "Séance introuvable" };
  if (session.status !== "planifiee") return { ok: false, error: "Seule une séance planifiée peut être confiée." };

  const group = session.groups as unknown as { name: string; programs: { level: string | null } | null } | null;
  const data = await loadEngineData(orgId, utcToLocalDate(session.starts_at));
  const candidate = rankReplacements(
    { startsAt: session.starts_at, endsAt: session.ends_at, level: group?.programs?.level ?? null, excludeTrainerId: session.trainer_id },
    data,
  ).find((c) => c.trainerId === trainerId);
  if (!candidate) return { ok: false, error: "Cette personne ne peut pas être proposée sur cette séance." };
  if (candidate.hardViolations.length) return { ok: false, error: `Plus disponible : ${candidate.hardViolations.join(" ; ")}` };

  const { error } = await supabase
    .from("sessions")
    .update({ trainer_id: trainerId })
    .eq("id", sessionId)
    .eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };

  let emailed = false;
  const { data: trainer } = await supabase.from("trainers").select("first_name, email").eq("id", trainerId).eq("org_id", orgId).single();
  if (trainer?.email && mailerConfigured()) {
    const room = session.rooms as unknown as { name: string; address: string | null; access_notes: string | null } | null;
    const day = new Date(session.starts_at).toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris",
    });
    emailed = await sendMail({
      to: trainer.email,
      subject: `Remplacement : ${group?.name ?? "un groupe"} le ${day}`,
      html: `<p>Bonjour ${trainer.first_name.trim()},</p>
<p>La coordination vous confie une séance en remplacement :</p>
<ul>
<li><strong>${group?.name ?? "Groupe"}</strong></li>
<li>${day}, ${utcToLocalTime(session.starts_at)}–${utcToLocalTime(session.ends_at)}</li>
${room ? `<li>${room.name}${room.address ? ` — ${room.address}` : ""}${room.access_notes ? `<br/><em>${room.access_notes}</em>` : ""}</li>` : ""}
</ul>
<p>La feuille d'émargement et le cahier de séance (ce qui a été fait la dernière fois) sont ici : https://pef-erp.vercel.app/seances/${session.id}/emargement</p>
<p>La séance apparaît aussi dans votre agenda « Cours PEF » après la synchronisation de la nuit.</p>
<p>Merci !<br/>ParlerEmploi Formation</p>`,
    });
  }

  revalidatePath("/planning/remplacements");
  revalidatePath("/dashboard");
  return { ok: true, emailed };
}
