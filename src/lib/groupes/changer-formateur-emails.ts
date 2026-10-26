import { utcToLocalDate } from "@/lib/dates";
import { describePattern } from "@/lib/reports/group-planning";
import { dayLabel, seances, sessionLabel, slotLabel } from "@/lib/groupes/changer-formateur";

// Emails du « Changer de formateur » : même ton et même mise en forme que « Confier à… »
// (Planning → Remplacements). PUR : la Server Action les envoie avec le mailer de l'organisme.

const APP_URL = "https://pef-erp.vercel.app";

type Slot = { startsAt: string; endsAt: string };

export type TrainerChangeEmailContext = {
  groupName: string;
  effectiveFrom: string; // 'YYYY-MM-DD'
  pattern: { weekday: number; start: string; end: string }[]; // rythme hebdo du groupe
  room: { name: string; address: string | null; access_notes: string | null } | null;
  assigned: Slot[]; // séances confiées, dans l'ordre
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

const firstOf = (name: string) => name.trim().split(/\s+/)[0] ?? "";

// Jours et horaires : le rythme du groupe, sinon les créneaux réels des séances confiées.
function schedule(ctx: TrainerChangeEmailContext): string | null {
  if (ctx.pattern.length) return describePattern(ctx.pattern, ", ");
  const slots = [...new Set(ctx.assigned.map((s) => slotLabel(s)))];
  return slots.length ? slots.join(", ") : null;
}

function recap(ctx: TrainerChangeEmailContext): string {
  const when = schedule(ctx);
  const room = ctx.room;
  return [
    `<li>À partir du ${esc(dayLabel(ctx.effectiveFrom, true))}</li>`,
    when ? `<li>Jours et horaires : ${esc(when)}</li>` : "",
    room
      ? `<li>Lieu : ${esc(room.name)}${room.address ? ` — ${esc(room.address)}` : ""}${room.access_notes ? `<br/><em>${esc(room.access_notes)}</em>` : ""}</li>`
      : "",
  ].filter(Boolean).join("\n");
}

const list = (slots: Slot[]) => `<ul>\n${slots.map((s) => `<li>${esc(sessionLabel(s))}</li>`).join("\n")}\n</ul>`;

/** Email à la personne qui reçoit le groupe. */
export function newTrainerEmail(ctx: TrainerChangeEmailContext & { firstName: string; notAssigned: Slot[] }): { subject: string; html: string } {
  const first = ctx.assigned[0];
  const last = ctx.assigned[ctx.assigned.length - 1];
  const html = `<p>Bonjour ${esc(firstOf(ctx.firstName))},</p>
<p>La coordination vous confie le groupe <strong>${esc(ctx.groupName)}</strong> :</p>
<ul>
${recap(ctx)}
${first ? `<li>Première séance : ${esc(sessionLabel(first))}</li>` : ""}
${last ? `<li>${seances(ctx.assigned.length)}, jusqu'au ${esc(dayLabel(utcToLocalDate(last.startsAt)))}</li>` : ""}
</ul>
${ctx.notAssigned.length ? `<p>Ces séances ne vous sont pas confiées (vous avez déjà un cours ou un congé à ce moment-là). La coordination s'en occupe :</p>\n${list(ctx.notAssigned)}` : ""}
<p>Vos séances sont dans l'ERP, avec la feuille d'émargement et le cahier de séance de chaque cours : ${APP_URL}/dashboard</p>
<p>Elles apparaissent aussi dans votre agenda « Cours PEF » après la synchronisation de la nuit.</p>
<p>Merci !<br/>ParlerEmploi Formation</p>`;
  return {
    subject: `Nouveau groupe confié : ${ctx.groupName}, à partir du ${dayLabel(ctx.effectiveFrom)}`,
    html: html.replace(/\n{2,}/g, "\n"),
  };
}

/** Email à la personne qui avait le groupe jusque-là. */
export function previousTrainerEmail(ctx: TrainerChangeEmailContext & { firstName: string; newTrainerName: string; kept: Slot[] }): { subject: string; html: string } {
  const html = `<p>Bonjour ${esc(firstOf(ctx.firstName))},</p>
<p>Le groupe <strong>${esc(ctx.groupName)}</strong> est confié à ${esc(ctx.newTrainerName.trim())} :</p>
<ul>
${recap(ctx)}
</ul>
<p>${ctx.assigned.length ? `${seances(ctx.assigned.length)} à venir ${ctx.assigned.length > 1 ? "sortent" : "sort"} de votre planning, et de votre agenda « Cours PEF » après la synchronisation de la nuit. ` : ""}Les séances passées et leurs feuilles d'émargement ne changent pas.</p>
${ctx.kept.length ? `<p>Vous gardez pour l'instant ces séances (${esc(firstOf(ctx.newTrainerName))} n'est pas libre) :</p>\n${list(ctx.kept)}` : ""}
<p>Merci pour votre travail avec ce groupe !<br/>ParlerEmploi Formation</p>`;
  return {
    subject: `Changement de formateur : ${ctx.groupName}, à partir du ${dayLabel(ctx.effectiveFrom)}`,
    html: html.replace(/\n{2,}/g, "\n"),
  };
}
