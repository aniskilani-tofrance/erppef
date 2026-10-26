import { DEFAULT_TZ, isoWeekday, localToUtc, overlaps, utcToLocalDate, utcToLocalTime, weekStartOf } from "@/lib/dates";
import { intervalHours } from "@/lib/engine/constraints";
import { replacementReason } from "@/lib/remplacements/load";
import { trainerStatusSuffix } from "@/lib/referentiels";

// « Changer de formateur » (fiche du groupe) : une autre personne devient formatrice
// principale du groupe pour toutes les séances À VENIR, en un clic. PUR (testé sans base) :
// la Server Action charge les données, ce module décide quelles séances changent, lesquelles
// restent à régler, et écrit la trace.
//
// Règles :
//  - séances concernées : celles du groupe, planifiées, qui commencent à partir de la date
//    d'effet (et pas déjà commencées), feuille d'émargement non clôturée. Les séances
//    passées, annulées ou à feuille clôturée ne bougent JAMAIS ;
//  - conflits BLOQUANTS (la séance garde son formateur actuel, ou reste sans formateur) :
//    la personne a déjà un cours sur le créneau (formatrice ou co-animatrice d'un autre
//    groupe), ou un congé validé ou demandé ce jour-là (mêmes règles que « Remplacements ») ;
//  - simples avertissements : plafond d'heures de la semaine dépassé (calcul du moteur :
//    séances où elle est formatrice principale), créneau hors de ses disponibilités déclarées ;
//  - si elle co-animait ces séances, elle quitte la co-animation (jamais formatrice et
//    co-animatrice de la même séance).

export type GroupSession = {
  id: string;
  startsAt: string; // ISO UTC
  endsAt: string;
  status: string; // planifiee | realisee | annulee
  attendanceClosedAt: string | null;
  trainerId: string | null;
  trainerName: string | null; // formateur actuel de la séance (affichage des conflits)
  coTrainerId: string | null;
};

// Autre séance de la personne (dans un autre groupe), comme formatrice ou co-animatrice.
export type BusySession = {
  id: string;
  groupName: string;
  startsAt: string;
  endsAt: string;
  asCoTrainer: boolean;
};

export type AbsenceRow = { trainer_id: string; starts_on: string; ends_on: string; status: string };

export type Availability = { weekday: number; start: string; end: string }; // 'HH:mm' locales

export type ChangeAssignment = {
  sessionId: string;
  startsAt: string;
  endsAt: string;
  previousTrainerId: string | null;
  removeCoTrainer: boolean; // elle co-animait cette séance : la co-animation est retirée
};

export type ChangeConflict = {
  sessionId: string;
  startsAt: string;
  endsAt: string;
  keptTrainerId: string | null; // qui garde la séance (null = reste sans formateur)
  keptTrainerName: string | null;
  kind: "chevauchement" | "conge" | "conge_a_valider" | "refus_base";
  reason: string; // phrase prête à afficher
};

export type TrainerChangePlan = {
  toAssign: ChangeAssignment[];
  alreadyAssigned: string[]; // séances déjà à elle : rien à changer
  conflicts: ChangeConflict[];
  warnings: string[];
};

/** Instant (ms) à partir duquel une séance change : minuit (Paris) de la date d'effet, et jamais avant maintenant. */
export function changeStartMs(effectiveFrom: string, now: Date, tz: string = DEFAULT_TZ): number {
  return Math.max(now.getTime(), Date.parse(localToUtc(effectiveFrom, "00:00", tz)));
}

/** Séance qui peut changer de formateur : planifiée, pas encore commencée, après la date d'effet, feuille non clôturée. */
export function isChangeable(s: GroupSession, fromMs: number): boolean {
  return s.status === "planifiee" && !s.attendanceClosedAt && Date.parse(s.startsAt) >= fromMs;
}

const iso = (s: string) => new Date(s).toISOString(); // « +00:00 » (Postgres) et « Z » comparables

/** « 14h30 », « 9h » (heure de Paris, même écriture que les plannings). */
export function hm(at: string, tz: string = DEFAULT_TZ): string {
  return utcToLocalTime(at, tz).replace(/^0/, "").replace(":00", "h").replace(":", "h");
}

/** « lundi 3 novembre » pour une date 'YYYY-MM-DD'. */
export function dayLabel(day: string, withYear = false): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}), timeZone: "Europe/Paris",
  });
}

/** « lundi 3 novembre, 14h30–17h45 ». */
export function sessionLabel(s: { startsAt: string; endsAt: string }, tz: string = DEFAULT_TZ): string {
  return `${dayLabel(utcToLocalDate(s.startsAt, tz))}, ${hm(s.startsAt, tz)}–${hm(s.endsAt, tz)}`;
}

const hours = (n: number) => `${String(Math.round(n * 10) / 10).replace(".", ",")} h`; // « 5,3 h »
const DAYS = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/** « lundi 14h30-17h45 » : le créneau hebdomadaire d'une séance. */
export function slotLabel(s: { startsAt: string; endsAt: string }, tz: string = DEFAULT_TZ): string {
  return `${DAYS[isoWeekday(utcToLocalDate(s.startsAt, tz))]} ${hm(s.startsAt, tz)}-${hm(s.endsAt, tz)}`;
}

export function planTrainerChange(input: {
  sessions: GroupSession[];
  newTrainerId: string;
  effectiveFrom: string; // 'YYYY-MM-DD'
  now: Date;
  busy: BusySession[];
  absences: AbsenceRow[];
  weeklyHoursMax: number | null;
  availabilities: Availability[];
  tz?: string;
}): TrainerChangePlan {
  const tz = input.tz ?? DEFAULT_TZ;
  const fromMs = changeStartMs(input.effectiveFrom, input.now, tz);
  const concerned = input.sessions
    .filter((s) => isChangeable(s, fromMs))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  const toAssign: ChangeAssignment[] = [];
  const alreadyAssigned: string[] = [];
  const conflicts: ChangeConflict[] = [];

  for (const s of concerned) {
    if (s.trainerId === input.newTrainerId) {
      alreadyAssigned.push(s.id);
      continue;
    }
    const base = { sessionId: s.id, startsAt: s.startsAt, endsAt: s.endsAt, keptTrainerId: s.trainerId, keptTrainerName: s.trainerName };

    // Congé : même décision que la page « Remplacements » (validé, ou demandé et pas encore validé).
    const absence = replacementReason({ trainerId: input.newTrainerId, startsAt: s.startsAt }, input.absences);
    if (absence === "absence") {
      conflicts.push({ ...base, kind: "conge", reason: "en congé ce jour-là" });
      continue;
    }
    if (absence === "absence_a_valider") {
      conflicts.push({ ...base, kind: "conge_a_valider", reason: "congé demandé ce jour-là (pas encore validé)" });
      continue;
    }

    // Déjà en cours ailleurs (formatrice ou co-animatrice) : même verrou que le planning.
    const clash = input.busy.find((b) => overlaps(iso(s.startsAt), iso(s.endsAt), iso(b.startsAt), iso(b.endsAt)));
    if (clash) {
      conflicts.push({
        ...base,
        kind: "chevauchement",
        reason: `déjà ${clash.asCoTrainer ? "en co-animation" : "en cours"} avec « ${clash.groupName} » de ${hm(clash.startsAt, tz)} à ${hm(clash.endsAt, tz)}`,
      });
      continue;
    }

    toAssign.push({ ...base, previousTrainerId: s.trainerId, removeCoTrainer: s.coTrainerId === input.newTrainerId });
  }

  return { toAssign, alreadyAssigned, conflicts, warnings: changeWarnings(input, toAssign, tz) };
}

// Avertissements non bloquants : plafond hebdo (comme le moteur, heures de formatrice
// principale) et créneaux hors des disponibilités déclarées sur sa fiche.
function changeWarnings(
  input: Parameters<typeof planTrainerChange>[0],
  toAssign: ChangeAssignment[],
  tz: string,
): string[] {
  const warnings: string[] = [];
  if (!toAssign.length) return warnings;

  const max = input.weeklyHoursMax;
  if (max != null && max > 0) {
    const load = new Map<string, number>();
    const add = (startsAt: string, endsAt: string) => {
      const week = weekStartOf(utcToLocalDate(startsAt, tz));
      load.set(week, (load.get(week) ?? 0) + intervalHours(startsAt, endsAt));
    };
    for (const b of input.busy) if (!b.asCoTrainer) add(b.startsAt, b.endsAt);
    for (const s of input.sessions) if (s.status !== "annulee" && s.trainerId === input.newTrainerId) add(s.startsAt, s.endsAt);
    const touched = new Set<string>();
    for (const a of toAssign) {
      add(a.startsAt, a.endsAt);
      touched.add(weekStartOf(utcToLocalDate(a.startsAt, tz)));
    }
    const over = [...touched].sort().filter((w) => (load.get(w) ?? 0) > max + 1e-9);
    if (over.length) {
      const first = `la semaine du ${dayLabel(over[0])} : ${hours(load.get(over[0])!)} pour ${hours(max)} prévues sur sa fiche`;
      warnings.push(
        over.length === 1
          ? `Plafond d'heures dépassé ${first} (simple avertissement).`
          : `Plafond d'heures dépassé sur ${over.length} semaines, dès ${first} (simple avertissement).`,
      );
    }
  }

  if (input.availabilities.length) {
    const outside = new Set<string>();
    for (const a of toAssign) {
      const weekday = isoWeekday(utcToLocalDate(a.startsAt, tz));
      const start = utcToLocalTime(a.startsAt, tz);
      const end = utcToLocalTime(a.endsAt, tz);
      const covered = input.availabilities.some((d) => d.weekday === weekday && d.start <= start && d.end >= end);
      if (!covered) outside.add(slotLabel(a, tz));
    }
    if (outside.size) warnings.push(`En dehors de ses disponibilités déclarées : ${[...outside].join(", ")} (simple avertissement).`);
  }
  return warnings;
}

// ───────────── Aperçu pour le dialogue (sérialisable, sans données personnelles inutiles) ─────────────

export type TrainerChangePreview = {
  trainerFirstName: string;
  assign: number;
  already: number;
  coTrainerRemoved: number;
  firstOn: string | null; // « jeudi 29 octobre, 14h30–17h45 »
  lastOn: string | null;
  conflicts: { sessionId: string; when: string; reason: string; keeps: string | null }[];
  warnings: string[];
  emailTo: string[]; // prénoms qui recevront un email à la validation
  noEmail: string[]; // prénoms sans adresse sur leur fiche
};

export function summarizePlan(
  plan: TrainerChangePlan,
  opts: { trainerFirstName: string; emailTo?: string[]; noEmail?: string[] },
): TrainerChangePreview {
  const first = plan.toAssign[0];
  const last = plan.toAssign[plan.toAssign.length - 1];
  return {
    trainerFirstName: opts.trainerFirstName,
    assign: plan.toAssign.length,
    already: plan.alreadyAssigned.length,
    coTrainerRemoved: plan.toAssign.filter((a) => a.removeCoTrainer).length,
    firstOn: first ? sessionLabel(first) : null,
    lastOn: last ? sessionLabel(last) : null,
    conflicts: conflictLines(plan.conflicts),
    warnings: plan.warnings,
    emailTo: opts.emailTo ?? [],
    noEmail: opts.noEmail ?? [],
  };
}

export function conflictLines(conflicts: ChangeConflict[]): TrainerChangePreview["conflicts"] {
  return conflicts.map((c) => ({ sessionId: c.sessionId, when: sessionLabel(c), reason: c.reason, keeps: c.keptTrainerName }));
}

export const seances = (n: number) => `${n} séance${n > 1 ? "s" : ""}`;

/** Phrase de tête du dialogue : « 12 séances confiées à Anne, 2 restent à régler : ». */
export function previewHeadline(p: Pick<TrainerChangePreview, "trainerFirstName" | "assign" | "already" | "conflicts">): string {
  const who = p.trainerFirstName;
  const left = p.conflicts.length;
  const rest = `${left} ${left > 1 ? "restent" : "reste"} à régler :`;
  if (p.assign === 0 && left === 0) {
    return p.already > 0
      ? `Les séances à venir sont déjà à ${who} : seul le formateur du groupe change.`
      : "Aucune séance à venir à partir de cette date : seul le formateur du groupe change.";
  }
  if (p.assign === 0) return `Aucune séance ne peut être confiée à ${who} : ${rest}`;
  if (left === 0) return `${seances(p.assign)} à venir ${p.assign > 1 ? "seront confiées" : "sera confiée"} à ${who}.`;
  return `${seances(p.assign)} ${p.assign > 1 ? "confiées" : "confiée"} à ${who}, ${rest}`;
}

// ───────────── Choix de la personne ─────────────

export type TrainerChoice = { id: string; label: string };

/** Formateurs actifs proposés (le formateur actuel exclu), avec la mention (stagiaire) / (bénévole). */
export function trainerChoices(
  trainers: { id: string; first_name: string; last_name: string | null; contract_type: string; is_active?: boolean }[],
  currentTrainerId: string | null,
): TrainerChoice[] {
  return trainers
    .filter((t) => t.is_active !== false && t.id !== currentTrainerId)
    .map((t) => ({ id: t.id, label: `${t.first_name} ${t.last_name ?? ""}`.trim() + trainerStatusSuffix(t.contract_type) }));
}

// ───────────── Trace dans les notes du groupe ─────────────

export const TRACE_PREFIX = "Formateur changé le ";

const ddmm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** « Formateur changé le 26/10 par Anis : Non affecté → Anne Philippon, à partir du 26/10 » (date de Paris). */
export function trainerChangeTrace(input: {
  at: Date;
  actorName: string | null;
  fromName: string | null;
  toName: string;
  effectiveFrom: string;
}): string {
  const by = input.actorName?.trim().split(/\s+/)[0];
  return `${TRACE_PREFIX}${ddmm(utcToLocalDate(input.at.toISOString()))}${by ? ` par ${by}` : ""} : ${input.fromName?.trim() || "Non affecté"} → ${input.toName.trim()}, à partir du ${ddmm(input.effectiveFrom)}`;
}

export function appendTrace(notes: string | null | undefined, line: string): string {
  const current = (notes ?? "").trim();
  return current ? `${current}\n${line}` : line;
}

/** Dernière trace de changement de formateur (affichée sur la fiche du groupe). */
export function lastTrainerChangeTrace(notes: string | null | undefined): string | null {
  const lines = (notes ?? "").split("\n").map((l) => l.trim()).filter((l) => l.startsWith(TRACE_PREFIX));
  return lines.length ? lines[lines.length - 1] : null;
}

/** Notes sans les traces de changement (groupe reconduit : l'historique reste sur l'ancien groupe). */
export function withoutTrainerChangeTraces(notes: string | null | undefined): string | null {
  const kept = (notes ?? "").split("\n").filter((l) => !l.trim().startsWith(TRACE_PREFIX)).join("\n").trim();
  return kept || null;
}
