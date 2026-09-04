import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeLearnerStats,
  sessionHours,
  type AttendanceRecord,
} from "@/lib/attendance-stats";

// Bilan par financeur : la donnée brute (loadFunderReportData, requêtes) est
// séparée du calcul (computeFunderReport, fonction PURE testable sans base).

import { CONTACT_SOURCES } from "@/lib/referentiels";

export const SOURCE_LABELS: Record<string, string> = Object.fromEntries(CONTACT_SOURCES.map((s) => [s.code, s.label]));

export const GENDER_LABELS: Record<string, string> = {
  femme: "Femmes",
  homme: "Hommes",
  autre: "Autre",
};
export const ACTIVITY_LABELS: Record<string, string> = {
  demandeur_emploi: "Demandeurs d'emploi",
  rsa: "Bénéficiaires du RSA",
  salarie: "Salariés",
  scolaire_etudiant: "Scolaires / étudiants",
  inactif_autre: "Inactifs / autre",
};
export const EDUCATION_LABELS: Record<string, string> = {
  non_scolarise: "Jamais scolarisé",
  primaire: "Niveau primaire",
  secondaire: "Niveau secondaire",
  superieur: "Niveau supérieur",
};
export const UNKNOWN_LABEL = "Non renseigné";

export type ReportLearner = {
  id: string;
  firstName: string;
  lastName: string;
  learnerNo?: number | null;
  gender: string | null;
  birthDate: string | null; // 'YYYY-MM-DD'
  city: string | null;
  district: string | null;
  qpv: boolean | null;
  activityStatus: string | null;
  rqth: boolean | null;
  educationLevel: string | null;
  contactSource?: string | null; // canal par lequel la personne nous a contactés
};

export type ReportEnrollment = {
  learnerId: string;
  groupId: string;
  status: string; // inscrit | abandon | termine
};

export type ReportSession = {
  groupId: string;
  startsAt: string;
  endsAt: string;
  status: string; // planifiee | realisee | annulee
  closed: boolean;
};

export type ReportGroup = {
  id: string;
  name: string;
  programName: string | null;
  startsOn: string;
  endsOn: string | null;
};

export type FunderReportData = {
  funderName: string;
  from: string; // 'YYYY-MM-DD' inclus
  to: string;
  groups: ReportGroup[];
  sessions: ReportSession[]; // séances de la période, groupes du financeur
  enrollments: ReportEnrollment[];
  learners: ReportLearner[];
  attendanceRecords: AttendanceRecord[]; // séances CLÔTURÉES de la période uniquement
};

export type Distribution = { label: string; count: number }[];

export type FunderReport = {
  funderName: string;
  from: string;
  to: string;
  totals: {
    groupCount: number;
    sessionsDone: number;
    hoursDone: number; // heures réalisées (séances passées non annulées)
    hoursPlanned: number; // heures encore à venir sur la période
    uniqueLearners: number;
    exits: { abandon: number; termine: number };
    averageAttendanceRate: number | null; // % moyen, null si aucun émargement
  };
  distributions: {
    gender: Distribution;
    age: Distribution;
    activity: Distribution;
    qpv: Distribution;
    rqth: Distribution;
    education: Distribution;
    cities: Distribution; // triées par effectif décroissant
    districts: Distribution; // quartiers (découpage du financeur municipal)
    sources: Distribution; // canal de premier contact (d'où viennent les demandes)
  };
  groupDetails: {
    groupId: string;
    name: string;
    programName: string | null;
    learnerCount: number;
    sessionsDone: number;
    hoursDone: number;
    attendanceRate: number | null;
  }[];
  learnerDetails: {
    learnerId: string;
    name: string;
    ref: string;
    groups: string[];
    hoursAttended: number;
    rate: number | null;
  }[];
};

// Âge au DERNIER jour de la période (convention des bilans annuels).
export function ageBucket(birthDate: string | null, refDate: string): string {
  if (!birthDate) return UNKNOWN_LABEL;
  const birth = new Date(`${birthDate}T12:00:00Z`);
  const ref = new Date(`${refDate}T12:00:00Z`);
  let age = ref.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    ref.getUTCMonth() < birth.getUTCMonth() ||
    (ref.getUTCMonth() === birth.getUTCMonth() && ref.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  if (age < 18) return "Moins de 18 ans";
  if (age <= 25) return "18-25 ans";
  if (age <= 44) return "26-44 ans";
  return "45 ans et plus";
}

function distribute<T>(
  items: T[],
  key: (item: T) => string | null,
  labels?: Record<string, string>,
  order?: string[],
): Distribution {
  const counts = new Map<string, number>();
  for (const item of items) {
    const raw = key(item);
    const label = raw == null ? UNKNOWN_LABEL : (labels?.[raw] ?? raw);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const entries = [...counts.entries()].map(([label, count]) => ({ label, count }));
  if (order) {
    const rank = (l: string) => {
      const i = order.indexOf(l);
      return i === -1 ? (l === UNKNOWN_LABEL ? order.length + 1 : order.length) : i;
    };
    entries.sort((a, b) => rank(a.label) - rank(b.label));
  } else {
    // Par effectif décroissant, « Non renseigné » toujours en dernier
    entries.sort((a, b) =>
      a.label === UNKNOWN_LABEL ? 1 : b.label === UNKNOWN_LABEL ? -1 : b.count - a.count,
    );
  }
  return entries;
}

export function computeFunderReport(data: FunderReportData): FunderReport {
  const now = new Date().toISOString();

  // Bénéficiaires : apprenants inscrits (statuts confondus — un abandon a bénéficié) sur les groupes du financeur.
  const learnerIds = new Set(data.enrollments.map((e) => e.learnerId));
  const learners = data.learners.filter((l) => learnerIds.has(l.id));

  // Heures : réalisées = séances non annulées déjà passées (règle des vues SQL), planifiées = à venir.
  const active = data.sessions.filter((s) => s.status !== "annulee");
  const done = active.filter((s) => s.status === "realisee" || s.endsAt < now);
  const upcoming = active.filter((s) => s.status === "planifiee" && s.endsAt >= now);
  const hoursOf = (list: ReportSession[]) =>
    Math.round(list.reduce((sum, s) => sum + sessionHours(s.startsAt, s.endsAt), 0) * 10) / 10;

  // Assiduité : uniquement sur les émargements des séances clôturées (règle attendance-stats).
  const stats = computeLearnerStats(data.attendanceRecords);
  const rates = [...stats.values()].map((s) => s.rate);
  const averageAttendanceRate = rates.length
    ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)
    : null;

  const exits = {
    abandon: data.enrollments.filter((e) => e.status === "abandon").length,
    termine: data.enrollments.filter((e) => e.status === "termine").length,
  };

  const bool = (v: boolean | null) => (v == null ? null : v ? "oui" : "non");

  const groupNames = new Map(data.groups.map((g) => [g.id, g.name]));
  const groupDetails = data.groups.map((g) => {
    const gSessions = done.filter((s) => s.groupId === g.id);
    const gLearnerIds = new Set(
      data.enrollments.filter((e) => e.groupId === g.id).map((e) => e.learnerId),
    );
    const gRecords = data.attendanceRecords.filter((r) => gLearnerIds.has(r.learnerId));
    const gStats = computeLearnerStats(gRecords);
    const gRates = [...gStats.entries()]
      .filter(([id]) => gLearnerIds.has(id))
      .map(([, s]) => s.rate);
    return {
      groupId: g.id,
      name: g.name,
      programName: g.programName,
      learnerCount: gLearnerIds.size,
      sessionsDone: gSessions.length,
      hoursDone: hoursOf(gSessions),
      attendanceRate: gRates.length
        ? Math.round(gRates.reduce((a, b) => a + b, 0) / gRates.length)
        : null,
    };
  });

  const learnerDetails = learners
    .map((l) => {
      const st = stats.get(l.id);
      const groups = data.enrollments
        .filter((e) => e.learnerId === l.id)
        .map((e) => groupNames.get(e.groupId) ?? "?");
      return {
        learnerId: l.id,
        name: `${l.firstName} ${l.lastName}`.trim(),
        ref: l.learnerNo != null ? `A-${String(l.learnerNo).padStart(4, "0")}` : "—",
        groups,
        hoursAttended: st ? Math.round(st.hoursAttended * 10) / 10 : 0,
        rate: st?.rate ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return {
    funderName: data.funderName,
    from: data.from,
    to: data.to,
    totals: {
      groupCount: data.groups.length,
      sessionsDone: done.length,
      hoursDone: hoursOf(done),
      hoursPlanned: hoursOf(upcoming),
      uniqueLearners: learners.length,
      exits,
      averageAttendanceRate,
    },
    distributions: {
      gender: distribute(learners, (l) => l.gender, GENDER_LABELS),
      age: distribute(learners, (l) => ageBucket(l.birthDate, data.to), undefined, [
        "Moins de 18 ans", "18-25 ans", "26-44 ans", "45 ans et plus",
      ]),
      activity: distribute(learners, (l) => l.activityStatus, ACTIVITY_LABELS),
      qpv: distribute(learners, (l) => bool(l.qpv), { oui: "Résidents QPV", non: "Hors QPV" }),
      rqth: distribute(learners, (l) => bool(l.rqth), { oui: "RQTH", non: "Sans RQTH" }),
      education: distribute(learners, (l) => l.educationLevel, EDUCATION_LABELS),
      cities: distribute(learners, (l) => l.city?.trim() || null),
      districts: distribute(learners, (l) => l.district?.trim() || null),
      sources: distribute(learners, (l) => l.contactSource ?? null, SOURCE_LABELS),
    },
    groupDetails,
    learnerDetails,
  };
}

// Charge la donnée brute. À appeler APRÈS requireRole (client service_role,
// org_id explicite partout — pattern de lib/emargement/pdf.ts).
export async function loadFunderReportData(
  orgId: string,
  funderId: string,
  from: string,
  to: string,
): Promise<FunderReportData | null> {
  const supabase = createAdminClient();

  const { data: funder } = await supabase
    .from("funders")
    .select("name")
    .eq("id", funderId)
    .eq("org_id", orgId)
    .single();
  if (!funder) return null;

  // Groupes du financeur dont la période chevauche [from, to]
  const { data: groups } = await supabase
    .from("groups")
    .select("id, name, starts_on, ends_on, programs(name)")
    .eq("org_id", orgId)
    .eq("funder_id", funderId)
    .lte("starts_on", to)
    .or(`ends_on.gte.${from},ends_on.is.null`);

  const groupIds = (groups ?? []).map((g) => g.id);
  if (groupIds.length === 0) {
    return {
      funderName: funder.name,
      from,
      to,
      groups: [],
      sessions: [],
      enrollments: [],
      learners: [],
      attendanceRecords: [],
    };
  }

  const fromIso = `${from}T00:00:00Z`;
  const toIso = `${to}T23:59:59Z`;

  const [{ data: sessions }, { data: enrollments }, { data: attendances }] = await Promise.all([
    supabase
      .from("sessions")
      .select("group_id, starts_at, ends_at, status, attendance_closed_at")
      .in("group_id", groupIds)
      .gte("starts_at", fromIso)
      .lte("starts_at", toIso),
    supabase
      .from("enrollments")
      .select("learner_id, group_id, status")
      .in("group_id", groupIds),
    supabase
      .from("attendances")
      .select("learner_id, status, sessions!inner(group_id, starts_at, ends_at, attendance_closed_at)")
      .in("sessions.group_id", groupIds)
      .gte("sessions.starts_at", fromIso)
      .lte("sessions.starts_at", toIso)
      .not("sessions.attendance_closed_at", "is", null),
  ]);

  const learnerIds = [...new Set((enrollments ?? []).map((e) => e.learner_id))];
  const { data: learners } = learnerIds.length
    ? await supabase
        .from("learners")
        .select("id, first_name, last_name, learner_no, gender, birth_date, city, district, qpv, activity_status, rqth, education_level, contact_source")
        .in("id", learnerIds)
    : { data: [] };

  return {
    funderName: funder.name,
    from,
    to,
    groups: (groups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      programName: (g.programs as unknown as { name: string } | null)?.name ?? null,
      startsOn: g.starts_on,
      endsOn: g.ends_on,
    })),
    sessions: (sessions ?? []).map((s) => ({
      groupId: s.group_id,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      status: s.status,
      closed: s.attendance_closed_at != null,
    })),
    enrollments: (enrollments ?? []).map((e) => ({
      learnerId: e.learner_id,
      groupId: e.group_id,
      status: e.status,
    })),
    learners: (learners ?? []).map((l) => ({
      id: l.id,
      firstName: l.first_name,
      lastName: l.last_name,
      learnerNo: l.learner_no ?? null,
      gender: l.gender,
      birthDate: l.birth_date,
      city: l.city,
      district: l.district ?? null,
      qpv: l.qpv,
      activityStatus: l.activity_status,
      rqth: l.rqth,
      educationLevel: l.education_level,
      contactSource: l.contact_source ?? null,
    })),
    attendanceRecords: (attendances ?? []).map((a) => {
      const s = a.sessions as unknown as { starts_at: string; ends_at: string };
      return {
        learnerId: a.learner_id,
        status: a.status as AttendanceRecord["status"],
        startsAt: s.starts_at,
        hours: sessionHours(s.starts_at, s.ends_at),
      };
    }),
  };
}
