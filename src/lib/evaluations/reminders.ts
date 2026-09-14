import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMail } from "@/lib/mailer";
import { KIND_LABELS, type EvaluationKind } from "@/lib/evaluations/grid";
import { computeMilestones, reminderStage, type MilestoneSession } from "@/lib/evaluations/milestones";

// Rappels aux formateurs avant chaque jalon d'évaluation : à J-7 (ou dès qu'on entre dans
// la semaine) puis à J-1 (ou le jour même). Un seul email par jalon et par palier
// (table evaluation_reminders), tant que la grille n'est pas complète.

const APP_URL = "https://pef-erp.vercel.app";

export async function sendEvaluationReminders(supabase: SupabaseClient, today = new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" })): Promise<number> {
  const [{ data: groups }, { data: sessions }, { data: enrollments }, { data: evals }, { data: sent }] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name, midterm_on, final_on, trainers:trainer_id(first_name, email)")
      .in("status", ["en_attente", "ouvert", "complet"]),
    supabase.from("sessions").select("group_id, starts_at, ends_at, status").neq("status", "annulee"),
    supabase.from("enrollments").select("group_id").eq("status", "inscrit"),
    supabase.from("evaluations").select("group_id, kind, co, po, ce, pe"),
    supabase.from("evaluation_reminders").select("group_id, kind, stage"),
  ]);
  const already = new Set((sent ?? []).map((r) => `${r.group_id}:${r.kind}:${r.stage}`));

  let count = 0;
  for (const g of groups ?? []) {
    const trainer = g.trainers as unknown as { first_name: string; email: string | null } | null;
    if (!trainer?.email) continue;
    const expected = (enrollments ?? []).filter((e) => e.group_id === g.id).length;
    if (expected === 0) continue;
    const m = computeMilestones((sessions ?? []).filter((s) => s.group_id === g.id) as MilestoneSession[], { midterm_on: g.midterm_on, final_on: g.final_on });
    for (const kind of ["mi_parcours", "finale"] as EvaluationKind[]) {
      const on = kind === "mi_parcours" ? m.midterm.on : m.final.on;
      const stage = reminderStage(on, today);
      if (!on || !stage || already.has(`${g.id}:${kind}:${stage}`)) continue;
      const done = (evals ?? []).filter((e) => e.group_id === g.id && e.kind === kind && (e.co || e.po || e.ce || e.pe)).length;
      if (done >= expected) continue;
      const when = new Date(`${on}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
      const url = `${APP_URL}/groupes/${g.id}/evaluations#${kind}`;
      const ok = await sendMail({
        to: trainer.email,
        subject: `${stage === "j1" ? "Demain" : "Cette semaine"} : évaluation ${kind === "finale" ? "finale" : "de mi-parcours"} — ${g.name}`,
        html: `<p>Bonjour ${trainer.first_name},</p>
<p>L'évaluation <b>${KIND_LABELS[kind].toLowerCase()}</b> du groupe <b>${g.name}</b> est prévue le <b>${when}</b>${stage === "j1" ? " (demain ou aujourd'hui)" : ""}.</p>
<p>À faire : ${expected - done} grille${expected - done > 1 ? "s" : ""} sur ${expected} (quatre compétences en trois crans, deux minutes par apprenant). Vous pouvez aussi lancer le petit test ciblé pour vous appuyer dessus.</p>
<p><a href="${url}">Ouvrir la grille d'évaluation</a></p>
<p>Merci !<br/>ParlerEmploi Formation</p>`,
      });
      if (ok) {
        await supabase.from("evaluation_reminders").insert({ group_id: g.id, kind, stage });
        count += 1;
      }
    }
  }
  return count;
}
