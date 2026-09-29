// Le moteur des séquences automatiques : démarrer, arrêter, exécuter les étapes échues.
//
// Côté base, une séquence tient dans six colonnes de la fiche (sequence_*). Le cron des
// leads appelle runDueLeadSequences toutes les 15 minutes ; les Server Actions et les
// webhooks appellent startLeadSequence / stopLeadSequence quand la fiche bouge.
//
// Deux garde-fous rendent tout cela sûr à rejouer :
//   1. chaque envoi (e-mail ou SMS) laisse une marque de journal par fiche et par message,
//      donc un même message ne part jamais deux fois (dispatchBrevoLeadEvent, dispatchTwilioLeadSms) ;
//   2. avant d'exécuter une étape, le cron « prend » la fiche par une mise à jour conditionnelle
//      sur sequence_next_at : si deux crons passent en même temps (Vercel et l'action GitHub),
//      un seul obtient la ligne, l'autre ne fait rien.

import type { SupabaseClient } from "@supabase/supabase-js";
import { utcToLocalDate } from "@/lib/dates";
import {
  cancelBrevoScheduledEmail,
  dispatchBrevoLeadEvent,
  emailSuppressed,
  scheduleBrevoAppointmentReminders,
  type BrevoDispatchReason,
  type LeadForBrevo,
} from "@/lib/leads/brevo";
import { dispatchTwilioLeadSms, type TwilioSmsReason } from "@/lib/leads/twilio";
import { automationsEnabled, resolveLeadSettings, type LeadSettings } from "@/lib/leads/templates";
import { isFinalStatus } from "@/lib/leads/status";
import {
  BLOCKING_STOP_REASONS,
  SEQUENCES,
  isSequenceKind,
  isSequenceTask,
  nextStepAfter,
  planAfter,
  sequenceLabel,
  staleReason,
  stopReasonLabel,
  type SequenceKind,
  type SequenceStopReason,
  type SequenceTransition,
} from "@/lib/leads/sequences";

export type SequenceLead = LeadForBrevo & {
  org_id: string;
  rdv_outcome?: string | null;
  next_action?: string | null;
  next_action_on?: string | null;
  sequence_kind?: string | null;
  sequence_step?: string | null;
  sequence_started_at?: string | null;
  sequence_next_at?: string | null;
  sequence_last_sent_at?: string | null;
  sequence_stopped_at?: string | null;
  sequence_stop_reason?: string | null;
};

export type SequenceRunSummary = { executed: number; stopped: number; skipped: number; failed: number };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" });
}

function marker(...parts: string[]): string {
  return `[seq:${parts.join(":")}]`;
}

async function journal(supabase: SupabaseClient, orgId: string, leadId: string, note: string, byUserId?: string | null) {
  const { error } = await supabase.from("employer_lead_events").insert({
    org_id: orgId,
    lead_id: leadId,
    kind: "note",
    outcome: "autre",
    by_user_id: byUserId ?? null,
    note,
  });
  if (error) console.error("[sequences] journalisation impossible", error.message);
}

async function loadSettingsByOrg(supabase: SupabaseClient, orgIds: string[]): Promise<Map<string, LeadSettings>> {
  const { data } = await supabase
    .from("organizations")
    .select("id, settings")
    .in("id", [...new Set(orgIds)]);
  return new Map((data ?? []).map((org) => [org.id as string, resolveLeadSettings(org.settings)]));
}

/** La fiche entière, telle que le moteur en a besoin (toutes les colonnes). */
export async function loadSequenceLead(supabase: SupabaseClient, orgId: string, leadId: string): Promise<SequenceLead | null> {
  const { data } = await supabase.from("employer_leads").select("*").eq("id", leadId).eq("org_id", orgId).maybeSingle();
  return (data as SequenceLead | null) ?? null;
}

// ── Démarrer ─────────────────────────────────────────────────────────────────

export async function startLeadSequence(
  supabase: SupabaseClient,
  params: {
    orgId: string;
    lead: SequenceLead;
    kind: SequenceKind;
    startedAt?: string; // T0 ; par défaut maintenant
    now?: Date;
    byUserId?: string | null;
    onlyIfNone?: boolean; // ne rien faire si une autre séquence tourne déjà
  },
): Promise<{ started: boolean; reason?: string }> {
  const { orgId, lead, kind } = params;
  const now = params.now ?? new Date();
  const def = SEQUENCES[kind];
  const active = Boolean(lead.sequence_next_at);
  if (active && lead.sequence_kind === kind) return { started: false, reason: "deja_active" };
  if (active && params.onlyIfNone) return { started: false, reason: "autre_active" };
  const stale = staleReason(kind, lead);
  if (stale) return { started: false, reason: stale };

  const startedAt = params.startedAt ?? now.toISOString();
  const plan = planAfter(def, startedAt, null, now);
  if (plan.finished) return { started: false, reason: "sans_etape" };

  if (active) {
    await journal(supabase, orgId, lead.id, `${marker("fin", "remplacee")} Séquence « ${sequenceLabel(lead.sequence_kind)} » arrêtée : ${stopReasonLabel("remplacee")}.`, params.byUserId);
  }
  const { error } = await supabase
    .from("employer_leads")
    .update({
      sequence_kind: kind,
      sequence_step: null,
      sequence_started_at: startedAt,
      sequence_next_at: plan.dueAt,
      sequence_stopped_at: null,
      sequence_stop_reason: null,
      next_action: plan.step.label,
      next_action_on: utcToLocalDate(plan.dueAt),
    })
    .eq("id", lead.id)
    .eq("org_id", orgId);
  if (error) return { started: false, reason: error.message };
  await journal(
    supabase,
    orgId,
    lead.id,
    `${marker("debut", kind)} Séquence « ${def.label} » démarrée. Première étape : ${plan.step.label}, le ${fmtDate(plan.dueAt)}.`,
    params.byUserId,
  );
  return { started: true };
}

// ── Arrêter ──────────────────────────────────────────────────────────────────

/**
 * Arrête la séquence en cours et, pour les motifs bloquants (opposition, désinscription,
 * bounce dur), annule aussi les rappels de rendez-vous déjà programmés chez Brevo et
 * marque la fiche pour que plus rien ne parte. Rend vrai si une séquence tournait.
 */
export async function stopLeadSequence(
  supabase: SupabaseClient,
  params: { orgId: string; lead: SequenceLead; reason: SequenceStopReason; byUserId?: string | null; now?: Date },
): Promise<boolean> {
  const { orgId, lead, reason } = params;
  const now = params.now ?? new Date();
  const active = Boolean(lead.sequence_next_at);
  const blocking = BLOCKING_STOP_REASONS.includes(reason);
  const patch: Record<string, unknown> = {};
  let remindersCancelled = 0;

  if ((reason === "opposition" || reason === "desinscription") && !lead.opt_out_at) patch.opt_out_at = now.toISOString();
  if (blocking) {
    const ids = [
      lead.qualification_reminder_j1_batch_id,
      lead.qualification_reminder_h2_batch_id,
      lead.rdv_reminder_j1_batch_id,
      lead.rdv_reminder_h2_batch_id,
    ].filter((id): id is string => Boolean(id));
    if (ids.length) {
      await Promise.all(ids.map((id) => cancelBrevoScheduledEmail(id)));
      remindersCancelled = ids.length;
      Object.assign(patch, {
        qualification_reminder_j1_batch_id: null,
        qualification_reminder_h2_batch_id: null,
        rdv_reminder_j1_batch_id: null,
        rdv_reminder_h2_batch_id: null,
      });
    }
  }
  if (active) {
    Object.assign(patch, { sequence_next_at: null, sequence_stopped_at: now.toISOString(), sequence_stop_reason: reason });
    if (isSequenceTask(lead.next_action)) Object.assign(patch, { next_action: null, next_action_on: null });
  }
  if (Object.keys(patch).length) {
    const { error } = await supabase.from("employer_leads").update(patch).eq("id", lead.id).eq("org_id", orgId);
    if (error) console.error("[sequences] arrêt impossible", error.message);
  }
  const rappels = remindersCancelled ? ` ${remindersCancelled} rappel${remindersCancelled > 1 ? "s" : ""} de rendez-vous programmé${remindersCancelled > 1 ? "s" : ""} chez Brevo annulé${remindersCancelled > 1 ? "s" : ""}.` : "";
  if (active) {
    await journal(supabase, orgId, lead.id, `${marker("fin", reason)} Séquence « ${sequenceLabel(lead.sequence_kind)} » arrêtée : ${stopReasonLabel(reason)}.${rappels}`, params.byUserId);
  } else if (blocking && (patch.opt_out_at || remindersCancelled)) {
    await journal(supabase, orgId, lead.id, `${marker("blocage", reason)} ${stopReasonLabel(reason)} : plus aucun message automatique vers cette fiche.${rappels}`, params.byUserId);
  }
  return active;
}

/** Applique ce qu'un statut ou un résultat d'appel implique pour la séquence (voir sequences.ts). */
export async function applySequenceTransition(
  supabase: SupabaseClient,
  params: { orgId: string; lead: SequenceLead; transition: SequenceTransition; byUserId?: string | null; now?: Date },
): Promise<void> {
  const { transition } = params;
  if (!transition) return;
  if ("stop" in transition) {
    await stopLeadSequence(supabase, { orgId: params.orgId, lead: params.lead, reason: transition.stop, byUserId: params.byUserId, now: params.now });
    return;
  }
  if ("start" in transition) {
    await startLeadSequence(supabase, { orgId: params.orgId, lead: params.lead, kind: transition.start, byUserId: params.byUserId, now: params.now });
    return;
  }
  await startLeadSequence(supabase, { orgId: params.orgId, lead: params.lead, kind: transition.startIfNone, byUserId: params.byUserId, now: params.now, onlyIfNone: true });
}

// ── Exécuter les étapes échues (cron) ────────────────────────────────────────

function describeEmail(result: { sent: boolean; reason?: BrevoDispatchReason }): string {
  if (result.sent) return "e-mail envoyé";
  switch (result.reason) {
    case "already_sent":
      return "e-mail déjà envoyé auparavant, non renvoyé";
    case "no_email":
      return "pas d'adresse e-mail sur la fiche";
    case "suppressed":
      return "e-mail bloqué (opposition ou adresse invalide)";
    case "not_configured":
      return "Brevo non configuré : e-mail à envoyer à la main";
    case "delivery_failed":
      return "échec Brevo : e-mail à envoyer à la main";
    case "automations_off":
      return "automatismes à l'arrêt";
    default:
      return "e-mail non envoyé";
  }
}

function describeSms(result: { sent: boolean; reason?: TwilioSmsReason }): string {
  if (result.sent) return "SMS envoyé";
  switch (result.reason) {
    case "already_sent":
      return "SMS déjà envoyé auparavant, non renvoyé";
    case "no_phone":
      return "pas de numéro exploitable";
    case "suppressed":
      return "SMS bloqué (opposition ou numéro invalide)";
    case "invalid_number":
      return "numéro refusé par Twilio";
    case "opt_out":
      return "le restaurateur a répondu STOP";
    case "not_configured":
      return "Twilio non configuré : SMS à envoyer à la main";
    case "delivery_failed":
      return "échec Twilio : SMS à envoyer à la main";
    case "automations_off":
      return "automatismes à l'arrêt";
    default:
      return "SMS non envoyé";
  }
}

const RETRYABLE: readonly string[] = ["not_configured", "delivery_failed"];

/**
 * Exécute, pour chaque fiche dont l'échéance est passée, l'étape suivante de sa séquence.
 * Une fiche à la fois : revérification (la séquence a-t-elle encore un sens ?), prise
 * de la ligne, envois, journal, échéance suivante. Cent fiches au plus par passage.
 */
export async function runDueLeadSequences(supabase: SupabaseClient, now: Date = new Date()): Promise<SequenceRunSummary> {
  const summary: SequenceRunSummary = { executed: 0, stopped: 0, skipped: 0, failed: 0 };
  const { data } = await supabase
    .from("employer_leads")
    .select("*")
    .not("sequence_next_at", "is", null)
    .lte("sequence_next_at", now.toISOString())
    .order("sequence_next_at", { ascending: true })
    .limit(100);
  const leads = (data ?? []) as SequenceLead[];
  if (!leads.length) return summary;
  const settingsByOrg = await loadSettingsByOrg(supabase, leads.map((lead) => lead.org_id));

  for (const lead of leads) {
    const settings = settingsByOrg.get(lead.org_id);
    // Automatismes à l'arrêt : la séquence attend, l'échéance reste due et partira à la réactivation.
    if (!settings || !automationsEnabled(settings)) {
      summary.skipped += 1;
      continue;
    }
    const kind = lead.sequence_kind;
    if (!isSequenceKind(kind) || !lead.sequence_started_at) {
      await stopLeadSequence(supabase, { orgId: lead.org_id, lead, reason: "manuel", now });
      summary.stopped += 1;
      continue;
    }
    const stale = staleReason(kind, lead);
    if (stale) {
      await stopLeadSequence(supabase, { orgId: lead.org_id, lead, reason: stale, now });
      summary.stopped += 1;
      continue;
    }
    const def = SEQUENCES[kind];
    const step = nextStepAfter(def, lead.sequence_step);
    if (!step) {
      await stopLeadSequence(supabase, { orgId: lead.org_id, lead, reason: "terminee", now });
      summary.stopped += 1;
      continue;
    }

    // Prise de la ligne : seule la mise à jour qui trouve encore l'ancienne échéance passe.
    const following = planAfter(def, lead.sequence_started_at, step.code, now);
    const claim: Record<string, unknown> = following.finished
      ? {
          sequence_step: step.code,
          sequence_next_at: null,
          sequence_stopped_at: now.toISOString(),
          sequence_stop_reason: "terminee",
          next_action: following.task,
          next_action_on: utcToLocalDate(following.dueAt),
        }
      : {
          sequence_step: step.code,
          sequence_next_at: following.dueAt,
          next_action: following.step.label,
          next_action_on: utcToLocalDate(following.dueAt),
        };
    const { data: claimed } = await supabase
      .from("employer_leads")
      .update(claim)
      .eq("id", lead.id)
      .eq("sequence_next_at", lead.sequence_next_at)
      .select("id");
    if (!claimed?.length) {
      summary.skipped += 1; // un autre passage du cron l'a prise
      continue;
    }

    const details: string[] = [];
    let sent = false;
    let failed = false;
    let stopAfter: SequenceStopReason | null = null;
    for (const action of step.actions) {
      if (action.type === "email") {
        const result = await dispatchBrevoLeadEvent(supabase, { orgId: lead.org_id, lead, settings, eventName: action.event });
        details.push(describeEmail(result));
        if (result.sent) sent = true;
        else if (RETRYABLE.includes(result.reason)) failed = true;
      } else {
        const result = await dispatchTwilioLeadSms(supabase, { orgId: lead.org_id, lead, settings, code: action.code, automatic: true });
        details.push(describeSms(result));
        if (result.sent) sent = true;
        else if (result.reason === "invalid_number") stopAfter = "numero_invalide";
        else if (result.reason === "opt_out") stopAfter = "opposition";
        else if (RETRYABLE.includes(result.reason)) failed = true;
      }
    }
    if (!step.actions.length) details.push("tâche posée pour le conseiller");

    const patch: Record<string, unknown> = {};
    if (sent) patch.sequence_last_sent_at = now.toISOString();
    if (failed) {
      // Rien n'est perdu : la marque de journal manquante permettra un envoi à la main,
      // et la fiche le demande explicitement au conseiller.
      patch.next_action = `À faire à la main (échec de l'envoi automatique) : ${step.label}`;
      patch.next_action_on = utcToLocalDate(now.toISOString());
    }
    if (Object.keys(patch).length) await supabase.from("employer_leads").update(patch).eq("id", lead.id);

    await journal(supabase, lead.org_id, lead.id, `${marker("etape", kind, step.code)} ${step.label} — ${details.join(" · ")}.`);
    if (following.finished) {
      await journal(supabase, lead.org_id, lead.id, `${marker("fin", "terminee")} Séquence « ${def.label} » terminée. Dernière tâche : ${following.task}, le ${fmtDate(following.dueAt)}.`);
    }
    if (stopAfter) {
      const fresh = { ...lead, ...claim } as SequenceLead;
      await stopLeadSequence(supabase, { orgId: lead.org_id, lead: fresh, reason: stopAfter, now });
      summary.stopped += 1;
    }
    summary.executed += 1;
    if (failed) summary.failed += 1;
  }
  return summary;
}

// ── Rattrapage des rappels J-1 / H-2 (Brevo ne programme qu'à 72 h) ──────────

/**
 * Brevo refuse de programmer un e-mail transactionnel à plus de 72 heures. Un créneau
 * réservé plus tôt n'a donc reçu aucun rappel à la réservation : ce passage, appelé par
 * le cron, programme J-1 puis H-2 dès qu'ils entrent dans la fenêtre. Les colonnes
 * *_batch_id déjà remplies sont ignorées, ce qui rend le passage rejouable à volonté.
 */
export async function scheduleUpcomingAppointmentReminders(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<{ scheduled: number; leads: number }> {
  const nowIso = now.toISOString();
  const horizon = new Date(now.getTime() + 72 * 3_600_000).toISOString();
  const [{ data: qualifications }, { data: rdvs }] = await Promise.all([
    supabase.from("employer_leads").select("*").not("qualification_at", "is", null).gte("qualification_at", nowIso).lte("qualification_at", horizon).limit(200),
    supabase.from("employer_leads").select("*").eq("status", "rdv_pris").not("rdv_at", "is", null).gte("rdv_at", nowIso).lte("rdv_at", horizon).limit(200),
  ]);
  type Candidate = { lead: SequenceLead; kind: "qualification" | "rdv"; at: string };
  const candidates: Candidate[] = [
    ...((qualifications ?? []) as SequenceLead[])
      .filter((lead) => !(lead.qualification_reminder_j1_batch_id && lead.qualification_reminder_h2_batch_id))
      .map((lead) => ({ lead, kind: "qualification" as const, at: lead.qualification_at! })),
    ...((rdvs ?? []) as SequenceLead[])
      .filter((lead) => (lead.rdv_outcome ?? "a_venir") === "a_venir")
      .filter((lead) => !(lead.rdv_reminder_j1_batch_id && lead.rdv_reminder_h2_batch_id))
      .map((lead) => ({ lead, kind: "rdv" as const, at: lead.rdv_at! })),
  ].filter(({ lead }) => !isFinalStatus(lead.status) && !emailSuppressed(lead));
  if (!candidates.length) return { scheduled: 0, leads: 0 };

  const settingsByOrg = await loadSettingsByOrg(supabase, candidates.map(({ lead }) => lead.org_id));
  let scheduled = 0;
  let touched = 0;
  for (const { lead, kind, at } of candidates) {
    const settings = settingsByOrg.get(lead.org_id);
    if (!settings) continue;
    const result = await scheduleBrevoAppointmentReminders(supabase, { orgId: lead.org_id, lead, settings, kind, appointmentAt: at, now });
    if (!Object.keys(result.patch).length) continue;
    await supabase.from("employer_leads").update(result.patch).eq("id", lead.id).eq("org_id", lead.org_id);
    scheduled += result.scheduled;
    touched += 1;
  }
  return { scheduled, leads: touched };
}
