// Recette accélérée des séquences automatiques du tunnel POEI Restauration.
//
// Aucun prospect réel, aucun appel réseau : la base est en mémoire (le faux client des
// tests), Brevo et Twilio sont simulés, et l'horloge avance jour par jour. Le script
// rejoue chaque embranchement et chaque règle d'arrêt, imprime la chronologie, et sort
// en erreur si un point attendu n'est pas au rendez-vous.
//
//   npx tsx scripts/recette-sequences.mts

process.env.BREVO_API_KEY = "xkeysib-recette-factice";
process.env.TWILIO_ACCOUNT_SID = "AC_recette";
process.env.TWILIO_AUTH_TOKEN = "jeton_recette";
process.env.TWILIO_MESSAGING_SERVICE_SID = "MG_recette";

import { FakeSupabase, asSupabase } from "../tests/helpers/fake-supabase";
import { applySequenceTransition, runDueLeadSequences, scheduleUpcomingAppointmentReminders, startLeadSequence, stopLeadSequence } from "../src/lib/leads/sequence-engine";
import { SEQUENCES, transitionForOutcome, transitionForStatus } from "../src/lib/leads/sequences";
import { emailStatusForBrevoEvent, mergeEmailStatus, parseBrevoWebhook, stopReasonForEmailStatus } from "../src/lib/leads/brevo-webhook";

const ORG = "a0000000-0000-4000-8000-000000000001";
const H = 3_600_000;
let now = new Date("2026-09-28T09:15:00.000Z"); // lundi 28/09/2026, 11h15 à Paris
const fails: string[] = [];
const check = (label: string, ok: boolean) => {
  console.log(`   ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) fails.push(label);
};
const fr = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }) : "—");

// ── Fournisseurs simulés : on note chaque message, rien ne part ───────────────
type Envoi = { quand: string; canal: "e-mail" | "SMS" | "annulation"; detail: string };
const envois: Envoi[] = [];
let twilioRefus: { code: number } | null = null;
globalThis.fetch = (async (url: string, init?: { method?: string; body?: unknown }) => {
  const method = init?.method ?? "GET";
  if (String(url).includes("api.brevo.com")) {
    if (method === "DELETE") {
      envois.push({ quand: now.toISOString(), canal: "annulation", detail: decodeURIComponent(String(url).split("/").pop()!) });
      return { ok: true, status: 204, json: async () => ({}) };
    }
    const body = JSON.parse(String(init?.body));
    envois.push({ quand: now.toISOString(), canal: "e-mail", detail: `${body.tags[1]} → ${body.to[0].email}${body.scheduledAt ? ` (programmé pour ${fr(body.scheduledAt)})` : ""}` });
    return { ok: true, status: 201, json: async () => ({ messageId: `<recette-${envois.length}@smtp-relay.mailin.fr>` }) };
  }
  if (String(url).includes("api.twilio.com")) {
    if (twilioRefus) return { ok: false, status: 400, json: async () => ({ code: twilioRefus!.code, message: "refus simulé" }) };
    const params = new URLSearchParams(String(init?.body));
    envois.push({ quand: now.toISOString(), canal: "SMS", detail: `${params.get("To")} : « ${params.get("Body")!.slice(0, 60)}… »` });
    return { ok: true, status: 201, json: async () => ({ sid: `SM${envois.length}` }) };
  }
  throw new Error(`appel réseau interdit en recette : ${url}`);
}) as typeof fetch;

// ── Base en mémoire ──────────────────────────────────────────────────────────
const db = new FakeSupabase(() => now);
db.seed("organizations", [{ id: ORG, name: "ParlerEmploi Formation (recette)", slug: "pef", settings: { leads: { automations: "on", nextGroupLabel: "le 2 novembre" } } }]);
const supabase = asSupabase(db);
let compteur = 0;
function fiche(company: string, extra: Record<string, unknown> = {}) {
  compteur += 1;
  const id = `d0000000-0000-4000-8000-0000000000${String(compteur).padStart(2, "0")}`;
  db.seed("employer_leads", [{
    id, org_id: ORG, lead_no: compteur, received_at: now.toISOString(), source: "formulaire_meta", campaign: "recette",
    company, segment: "traditionnel", contact_name: `Contact ${compteur}`, phone: `+3361234567${compteur % 10}`, email: `contact${compteur}@recette.invalid`,
    positions: "commis de cuisine", positions_count: 1, status: "a_rappeler", attempts: 0, first_contact_at: null, last_contact_at: null,
    next_action: null, next_action_on: null, rdv_at: null, rdv_mode: null, rdv_outcome: null, qualification_at: null,
    qualification_reminder_j1_batch_id: null, qualification_reminder_h2_batch_id: null, rdv_reminder_j1_batch_id: null, rdv_reminder_h2_batch_id: null,
    sequence_kind: null, sequence_step: null, sequence_started_at: null, sequence_next_at: null, sequence_last_sent_at: null,
    sequence_stopped_at: null, sequence_stop_reason: null, email_status: null, email_status_at: null, phone_status: null, opt_out_at: null,
    ...extra,
  }]);
  return db.rows("employer_leads").find((l) => l.id === id)!;
}
const lead = (id: string) => db.lead(id);
const derniereNote = (id: string) => db.notesOf(id).at(-1) ?? "";

// Avance l'horloge jusqu'à une date et fait passer le cron (10h05 Paris = 08:05 UTC en heure d'été, 09:05 en heure d'hiver).
async function cronLe(jour: string) {
  const hiver = jour >= "2026-10-25";
  now = new Date(`${jour}T${hiver ? "09" : "08"}:05:00.000Z`);
  const avant = envois.length;
  const r = await runDueLeadSequences(supabase, now);
  const nouveaux = envois.slice(avant);
  console.log(`   ${jour} cron → exécutées ${r.executed}, arrêtées ${r.stopped}, ignorées ${r.skipped}, échecs ${r.failed}${nouveaux.length ? " · " + nouveaux.map((e) => `${e.canal} ${e.detail}`).join(" · ") : ""}`);
  return r;
}

console.log("\n══ Recette des séquences automatiques — fournisseurs simulés, aucun prospect réel ══\n");

// ── A. Injoignable, de bout en bout ──────────────────────────────────────────
console.log("A. Injoignable : appel sur messagerie le lundi 28/09 à 11h15");
const a = fiche("Le Bistrot des Docks");
await applySequenceTransition(supabase, { orgId: ORG, lead: a as never, transition: transitionForOutcome("appel", "messagerie", "a_rappeler"), now });
check("la séquence démarre, prochaine action J+1 mardi 29/09 10h", lead(a.id as string).sequence_next_at === "2026-09-29T08:00:00.000Z");
await cronLe("2026-09-29");
check("J+1 : tâche d'appel posée, aucun message", lead(a.id as string).sequence_step === "j1" && envois.length === 0);
await cronLe("2026-10-01");
check("J+3 : e-mail de relance n°3 parti", envois.filter((e) => e.canal === "e-mail").length === 1);
await cronLe("2026-10-03"); // samedi : rien
check("J+6 tombe un dimanche : reporté au lundi 05/10", lead(a.id as string).sequence_next_at === "2026-10-05T08:00:00.000Z");
await cronLe("2026-10-05");
check("J+6 : SMS « dernière tentative » parti", envois.filter((e) => e.canal === "SMS").length === 1);
await cronLe("2026-10-08");
check("J+10 : e-mail de rupture parti, séquence terminée", envois.filter((e) => e.canal === "e-mail").length === 2 && lead(a.id as string).sequence_stop_reason === "terminee");
check("la fiche n'est PAS close automatiquement", lead(a.id as string).status === "a_rappeler");
check(`la tâche de fin est posée : « ${lead(a.id as string).next_action} »`, lead(a.id as string).next_action === SEQUENCES.injoignable.end.task);
await cronLe("2026-10-09");
check("plus rien ne part ensuite", envois.length === 3);

// ── B. Injoignable arrêté par une réservation Calendly ───────────────────────
console.log("\nB. Injoignable arrêté par une réservation Calendly à J+2");
now = new Date("2026-10-12T09:00:00.000Z");
const b = fiche("Chez Karim");
await startLeadSequence(supabase, { orgId: ORG, lead: b as never, kind: "injoignable", now });
await cronLe("2026-10-13");
// Ce que fait /api/leads/inbound à la réservation : qualification_at posé, puis stopLeadSequence(reservation).
now = new Date("2026-10-14T15:00:00.000Z");
Object.assign(lead(b.id as string), { qualification_at: "2026-10-16T09:00:00.000Z", next_action: "Appel de qualification réservé via Calendly" });
await stopLeadSequence(supabase, { orgId: ORG, lead: lead(b.id as string) as never, reason: "reservation", now });
const avantB = envois.length;
await cronLe("2026-10-15");
check("l'e-mail J+3 ne part pas : séquence arrêtée « créneau réservé »", envois.length === avantB && lead(b.id as string).sequence_stop_reason === "reservation");
check("la prochaine action du conseiller (Calendly) est conservée", String(lead(b.id as string).next_action).includes("Calendly"));

// ── C. Rendez-vous manqué : J+1, J+3, puis décision humaine ──────────────────
console.log("\nC. Rendez-vous manqué constaté le vendredi 16/10 à 17h");
now = new Date("2026-10-16T15:00:00.000Z");
const c = fiche("La Table de Sonia", { status: "a_rappeler", rdv_outcome: "no_show" });
await applySequenceTransition(supabase, { orgId: ORG, lead: c as never, transition: transitionForOutcome("rdv", "no_show", "a_rappeler"), now });
check("J+1 tombe un samedi : e-mail n°7 prévu lundi 19/10 10h", lead(c.id as string).sequence_next_at === "2026-10-19T08:00:00.000Z");
const avantC = envois.length;
await cronLe("2026-10-19");
await cronLe("2026-10-20");
check("J+3 tombe le lundi 19/10, déjà pris par J+1 décalé du samedi : il part le lendemain, deux e-mails à un jour d'écart", envois.length === avantC + 2);
check("séquence terminée, tâche « mettre en veille ou classer perdu »", lead(c.id as string).sequence_stop_reason === "terminee" && lead(c.id as string).next_action === SEQUENCES.no_show.end.task);

// ── D. Proposition : J+2 ouvré puis J+7 ─────────────────────────────────────
console.log("\nD. Proposition envoyée le jeudi 22/10 à 18h");
now = new Date("2026-10-22T16:00:00.000Z");
const d = fiche("Brasserie du Marché", { status: "proposition" });
await applySequenceTransition(supabase, { orgId: ORG, lead: d as never, transition: transitionForStatus("proposition"), now });
check("J+2 ouvré depuis jeudi = lundi 26/10 à 10h (heure d'hiver : 09:00 UTC)", lead(d.id as string).sequence_next_at === "2026-10-26T09:00:00.000Z");
const avantD = envois.length;
await cronLe("2026-10-26");
await cronLe("2026-10-29");
check("e-mails n°11 (J+2 ouvré) et n°12 (J+7) partis", envois.length === avantD + 2 && lead(d.id as string).sequence_stop_reason === "terminee");

// ── E. Veille : J+30, J+60, J+90 ─────────────────────────────────────────────
console.log("\nE. Mise en veille (nurturing) le 02/11");
now = new Date("2026-11-02T10:00:00.000Z");
const e = fiche("Pizzeria Nino", { status: "nurturing" });
await applySequenceTransition(supabase, { orgId: ORG, lead: e as never, transition: transitionForStatus("nurturing"), now });
const avantE = envois.length;
await cronLe("2026-12-02");
await cronLe("2027-01-01"); // J+60 = vendredi 01/01 → part (jour ouvré ; les fériés ne sont pas gérés, c'est documenté)
await cronLe("2027-02-01"); // J+90 = 31/01 dimanche → lundi 01/02
check("trois e-mails de veille partis, à un mois d'écart", envois.slice(avantE).filter((x) => x.canal === "e-mail").length === 3);
check("la fiche reste « En veille », la décision revient à l'équipe", lead(e.id as string).status === "nurturing" && lead(e.id as string).next_action === SEQUENCES.nurturing.end.task);

// ── F. Retours Brevo et Twilio ───────────────────────────────────────────────
console.log("\nF. Retours des canaux");
now = new Date("2026-11-03T10:00:00.000Z");
const f = fiche("Snack de la Gare", { status: "nurturing" });
await startLeadSequence(supabase, { orgId: ORG, lead: f as never, kind: "nurturing", now });
// Un bounce dur arrive de Brevo (ce que fait /api/leads/brevo-webhook).
const [retour] = parseBrevoWebhook({ event: "hard_bounce", email: f.email, "message-id": "<x@smtp-relay.mailin.fr>", "X-Mailin-custom": `lead_ref:L-000${f.lead_no}|event:poei_lead_nurturing_j30`, reason: "550 user unknown" }, now);
const statut = emailStatusForBrevoEvent(retour.event)!;
Object.assign(lead(f.id as string), { email_status: mergeEmailStatus(null, statut) });
await stopLeadSequence(supabase, { orgId: ORG, lead: lead(f.id as string) as never, reason: stopReasonForEmailStatus(statut)!, now });
check("bounce dur : séquence arrêtée « adresse invalide », plus aucun e-mail", lead(f.id as string).sequence_stop_reason === "bounce_dur");
const g = fiche("Kebab du Centre", { sequence_kind: "injoignable", sequence_step: "j3", sequence_started_at: "2026-10-28T10:00:00.000Z", sequence_next_at: "2026-11-03T09:00:00.000Z" });
twilioRefus = { code: 21211 };
await cronLe("2026-11-03");
twilioRefus = null;
check("numéro refusé par Twilio : fiche marquée, séquence arrêtée « numéro invalide »", lead(g.id as string).phone_status === "invalide" && lead(g.id as string).sequence_stop_reason === "numero_invalide");
check("le journal explique le refus", derniereNote(g.id as string).includes("Numéro de téléphone invalide"));

// ── G. Opposition : plus rien, rappels annulés ───────────────────────────────
console.log("\nG. Opposition du prospect");
const h = fiche("Café des Sports", { qualification_at: "2026-11-05T09:00:00.000Z", qualification_reminder_j1_batch_id: "<j1@smtp-relay.mailin.fr>", qualification_reminder_h2_batch_id: "<h2@smtp-relay.mailin.fr>" });
await startLeadSequence(supabase, { orgId: ORG, lead: h as never, kind: "injoignable", now });
await stopLeadSequence(supabase, { orgId: ORG, lead: lead(h.id as string) as never, reason: "opposition", now });
check("opposition : opt_out posé, 2 rappels Brevo annulés", Boolean(lead(h.id as string).opt_out_at) && envois.filter((x) => x.canal === "annulation").length === 2);
const refus = await startLeadSequence(supabase, { orgId: ORG, lead: lead(h.id as string) as never, kind: "nurturing", now });
check("plus aucune séquence ne peut démarrer", refus.started === false && refus.reason === "opposition");

// ── H. Concurrence : deux crons en même temps ────────────────────────────────
console.log("\nH. Deux crons simultanés sur la même étape");
const i = fiche("Restaurant Concurrence", { sequence_kind: "injoignable", sequence_step: "j1", sequence_started_at: "2026-10-31T10:00:00.000Z", sequence_next_at: "2026-11-03T09:00:00.000Z" });
const avantI = envois.length;
const [r1, r2] = await Promise.all([runDueLeadSequences(supabase, now), runDueLeadSequences(supabase, now)]);
check(`un seul passage exécute l'étape (${r1.executed}+${r2.executed} exécutée, ${r1.skipped}+${r2.skipped} ignorée), un seul e-mail`, r1.executed + r2.executed === 1 && envois.length === avantI + 1 && lead(i.id as string).sequence_step === "j3");

// ── I. Rattrapage des rappels J-1 / H-2 au-delà de 72 h ──────────────────────
console.log("\nI. Rappels J-1 / H-2 d'un créneau réservé 5 jours à l'avance");
{
  // scheduleBrevoLeadEvent mesure la fenêtre sur l'horloge réelle : ce point tourne en temps réel.
  const reel = new Date();
  now = reel;
  const j = fiche("Auberge du Lac", { qualification_at: new Date(reel.getTime() + 120 * H).toISOString() });
  const r0 = await scheduleUpcomingAppointmentReminders(supabase, reel);
  check("à la réservation (H-120) : rien n'est programmable", r0.scheduled === 0);
  const realDateNow = Date.now;
  const plusTard = new Date(reel.getTime() + 50 * H); // le créneau est alors à H-70
  Date.now = () => plusTard.getTime();
  now = plusTard;
  const r1b = await scheduleUpcomingAppointmentReminders(supabase, plusTard);
  const r2b = await scheduleUpcomingAppointmentReminders(supabase, plusTard);
  Date.now = realDateNow;
  check("à H-70 : J-1 et H-2 programmés chez Brevo, une seule fois", r1b.scheduled === 2 && r2b.scheduled === 0 && Boolean(lead(j.id as string).qualification_reminder_h2_batch_id));
}

// ── Bilan ────────────────────────────────────────────────────────────────────
console.log(`\n${envois.length} messages simulés au total (${envois.filter((x) => x.canal === "e-mail").length} e-mails, ${envois.filter((x) => x.canal === "SMS").length} SMS, ${envois.filter((x) => x.canal === "annulation").length} annulations). Aucun appel réseau réel.`);
if (fails.length) {
  console.log(`\n✗ ${fails.length} point(s) en échec :\n - ${fails.join("\n - ")}`);
  process.exit(1);
}
console.log("\n✓ Recette complète : tous les embranchements et toutes les règles d'arrêt se comportent comme attendu.\n");
