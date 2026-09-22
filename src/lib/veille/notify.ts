import type { SupabaseClient } from "@supabase/supabase-js";
import { mailerConfigured, sendMail } from "@/lib/mailer";
import type { VeilleOrg } from "@/lib/veille/auth";

// Résumé hebdomadaire de veille : envoyé à PEF_VEILLE_NOTIFY_TO quand le collecteur
// clôture une exécution (statut succes / partiel / echec) via POST /api/veille/runs.
// Contenu : compteurs, alertes du run (titre + lien, informations publiques), lien vers
// le module Veille. Aucune donnée personnelle, jamais le jeton.

export type RunRow = {
  run_id: string;
  status: string;
  received: number;
  created: number;
  ignored: number;
  rejected: number;
  replays: number;
  started_at: string | null;
  finished_at: string | null;
  csv_url: string | null;
  csv_name: string | null;
  message: string | null;
  stats: Record<string, number> | null;
};

export type NotifyOutcome = "envoyee" | "non_envoyee" | "non_configuree";

const BASE_URL = "https://pef-erp.vercel.app";
const STATUS_LABEL: Record<string, string> = { en_cours: "en cours", succes: "succès", partiel: "partiel", echec: "échec" };

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

export function buildRunSummaryHtml(org: VeilleOrg, run: RunRow, alerts: { title: string | null; url: string | null; indicator: number | null }[]): { subject: string; html: string } {
  const label = STATUS_LABEL[run.status] ?? run.status;
  const subject = `Veille Qualiopi — exécution ${run.run_id} : ${label} (${run.created} nouvelle${run.created > 1 ? "s" : ""} fiche${run.created > 1 ? "s" : ""})`;
  const when = run.finished_at ?? run.started_at;
  const stats = run.stats && Object.keys(run.stats).length
    ? `<ul>${Object.entries(run.stats).map(([k, v]) => `<li>${esc(k)} : ${esc(String(v))}</li>`).join("")}</ul>`
    : "";
  const alertsHtml = alerts.length
    ? `<p><b>Alertes signalées (${alerts.length}) :</b></p><ul>${alerts
        .map((a) => `<li>${a.indicator ? `ind. ${a.indicator} — ` : ""}${a.url ? `<a href="${esc(a.url)}">${esc(a.title ?? a.url)}</a>` : esc(a.title ?? "")}</li>`)
        .join("")}</ul>`
    : "<p>Aucune alerte signalée.</p>";
  const html = `<p>Le collecteur de veille Qualiopi a terminé une exécution pour ${esc(org.name)}.</p>
<ul>
<li><b>Exécution :</b> ${esc(run.run_id)} — ${esc(label)}${when ? ` (${esc(new Date(when).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }))})` : ""}</li>
<li><b>Fiches :</b> ${run.received} reçue${run.received > 1 ? "s" : ""}, ${run.created} créée${run.created > 1 ? "s" : ""} (à valider), ${run.ignored} doublon${run.ignored > 1 ? "s" : ""} ignoré${run.ignored > 1 ? "s" : ""}${run.rejected ? `, ${run.rejected} rejetée${run.rejected > 1 ? "s" : ""}` : ""}${run.replays ? `, ${run.replays} rejeu${run.replays > 1 ? "x" : ""}` : ""}</li>
${run.csv_url ? `<li><b>CSV de secours :</b> <a href="${esc(run.csv_url)}">${esc(run.csv_name ?? run.csv_url)}</a></li>` : ""}
${run.message ? `<li><b>Message :</b> ${esc(run.message)}</li>` : ""}
</ul>
${stats}
${alertsHtml}
<p><a href="${BASE_URL}/qualite">Ouvrir le module Veille</a> — lisez les fiches « À valider », passez-les en « Validée » (ou « Écartée ») et cochez « Diffusée » quand l'information a été partagée à l'équipe.</p>`;
  return { subject, html };
}

export async function notifyVeilleRun(admin: SupabaseClient, org: VeilleOrg, run: RunRow): Promise<NotifyOutcome> {
  const to = process.env.PEF_VEILLE_NOTIFY_TO;
  if (!to || !mailerConfigured()) return "non_configuree";
  const { data: alerts } = await admin
    .from("watch_entries")
    .select("title, url, indicator")
    .eq("org_id", org.id)
    .eq("run_id", run.run_id)
    .eq("alert", true)
    .order("created_at")
    .limit(20);
  const { subject, html } = buildRunSummaryHtml(org, run, (alerts ?? []) as { title: string | null; url: string | null; indicator: number | null }[]);
  const sent = await sendMail({ to: to.split(",").map((s) => s.trim()).filter(Boolean), subject, html }).catch(() => false);
  if (sent) {
    await admin.from("veille_runs").update({ notified_at: new Date().toISOString() }).eq("org_id", org.id).eq("run_id", run.run_id);
  }
  return sent ? "envoyee" : "non_envoyee";
}
