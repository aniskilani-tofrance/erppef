import { DEFAULT_REMINDER_DAYS, DEADLINE_KIND_LABELS, BASE_URL, FAMILY_LABELS, type DeadlineKind, type Family } from "./constants";
import { isoWeekday } from "@/lib/dates";
import { daysUntil, parisDay } from "./echeances";
import { deadlineHref, formatDueAt } from "./liens";

// Rappels du cron du matin (/api/cron/alertes) : logique pure, testée sans base.
//  • chaque échéance non faite dont le nombre de jours restants figure dans ses
//    reminder_days (par défaut J-30, J-15, J-3) donne une ligne ;
//  • le lundi, les opportunités « nouveau » arrivées depuis 7 jours s'ajoutent.
// C'est ce qui remplace le mail de veille du lundi.

export type ReminderDeadline = {
  id: string;
  kind: DeadlineKind;
  title: string;
  due_at: string;
  done_at: string | null;
  reminder_days: number[] | null;
  application_id: string | null;
  opportunity_id: string | null;
  funder_id: string | null;
  funder_name?: string | null;
};

export function deadlinesToRemind<T extends ReminderDeadline>(deadlines: T[], now: Date = new Date()): (T & { days: number })[] {
  return deadlines
    .filter((d) => !d.done_at)
    .map((d) => ({ ...d, days: daysUntil(d.due_at, now) }))
    .filter((d) => {
      const steps = d.reminder_days && d.reminder_days.length ? d.reminder_days : [...DEFAULT_REMINDER_DAYS];
      return steps.includes(d.days);
    })
    .sort((a, b) => a.days - b.days || a.due_at.localeCompare(b.due_at));
}

export function formatDeadlineReminder(d: ReminderDeadline & { days: number }): string {
  const who = d.funder_name ? ` · ${d.funder_name}` : "";
  return `J-${d.days} · ${DEADLINE_KIND_LABELS[d.kind]} : ${d.title} (${formatDueAt(d.due_at)})${who} — ${BASE_URL}${deadlineHref(d)}`;
}

export function isMondayParis(now: Date = new Date()): boolean {
  return isoWeekday(parisDay(now)) === 1;
}

export type NewOpportunity = {
  id: string;
  title: string;
  family: Family;
  deadline_at: string | null;
  funder_label: string | null;
};

export function formatNewOpportunity(o: NewOpportunity): string {
  const when = o.deadline_at ? `, date limite ${formatDueAt(o.deadline_at, false)}` : "";
  const who = o.funder_label ? ` · ${o.funder_label}` : "";
  return `${o.title} (${FAMILY_LABELS[o.family].toLowerCase()}${when})${who} — ${BASE_URL}/financements/veille/${o.id}`;
}

// Destinataires du message « Financements » : les comptes administration et coordination
// de l'organisation. On retire l'adresse du résumé du matin (elle a déjà le bloc), les
// adresses fictives (.invalid) et les doublons.
export function teamRecipients(memberEmails: (string | null | undefined)[], alertsEmail?: string | null): string[] {
  const skip = (alertsEmail ?? "").trim().toLowerCase();
  const out = new Set<string>();
  for (const e of memberEmails) {
    const email = (e ?? "").trim().toLowerCase();
    if (!email || email.endsWith(".invalid") || email === skip) continue;
    out.add(email);
  }
  return [...out].sort();
}

export function financementsMailSubject(lines: string[]): string {
  const n = lines.filter((l) => l.startsWith("  • ")).length;
  return `ERP PEF — Financements : ${n} point${n > 1 ? "s" : ""} à regarder`;
}

// Le bloc texte du résumé du matin, en HTML simple (liens cliquables).
export function financementsMailHtml(lines: string[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = lines.map((l) => esc(l).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')).join("<br>");
  return (
    `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#0E271B">${body}` +
    `<p style="color:#666;font-size:12px">Message automatique de l'ERP PEF, envoyé aux comptes administration et coordination. ` +
    `Pour arrêter un rappel : cochez l'échéance « faite » dans Financements → Calendrier.</p></div>`
  );
}

// Bloc « Financements » du résumé du matin. Vide si rien à signaler.
export function financementsAlertLines(input: {
  reminders: (ReminderDeadline & { days: number })[];
  newOpportunities: NewOpportunity[];
  monday: boolean;
}): string[] {
  const lines: string[] = [];
  if (input.reminders.length) {
    lines.push("💶 Financements — échéances :", ...input.reminders.map((r) => `  • ${formatDeadlineReminder(r)}`), "");
  }
  if (input.monday && input.newOpportunities.length) {
    const n = input.newOpportunities.length;
    lines.push(
      `🔎 Financements — ${n} nouvelle${n > 1 ? "s" : ""} opportunité${n > 1 ? "s" : ""} à trier cette semaine :`,
      ...input.newOpportunities.map((o) => `  • ${formatNewOpportunity(o)}`),
      `  → Trier dans « Ma semaine » : ${BASE_URL}/financements`,
      "",
    );
  }
  return lines;
}
