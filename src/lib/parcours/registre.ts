import type { SupabaseClient } from "@supabase/supabase-js";
import { csvCell } from "@/lib/admission/waitlist-export";
import { learnerRef } from "@/lib/refs";
import { describeLeaveReason, exitTrace, type ExitTrace } from "@/lib/parcours/sortie";

// Registre des ruptures de parcours (page Qualité, export pour l'auditeur Qualiopi) : chaque
// abandon de la période avec son motif, les absences qui l'ont précédé, les relances notées au
// carnet et la dernière présence ; puis le taux d'abandon par groupe. Le calcul est pur
// (buildRuptures, testé) ; loadRuptures lit la base.

export type RuptureEnrollment = {
  learnerId: string;
  learnerName: string;
  learnerNo: number | null;
  groupId: string;
  groupName: string;
  status: string; // inscrit | abandon | termine
  leftOn: string | null; // AAAA-MM-JJ
  leaveReason: string | null;
};
export type RuptureAttendance = { learnerId: string; groupId: string; startsAt: string; status: string };
export type RuptureContact = { learnerId: string; contactedAt: string };

export type RuptureRow = {
  learnerRef: string;
  learnerName: string;
  groupName: string;
  leftOn: string;
  reason: string;
  trace: ExitTrace;
};
export type GroupRate = { groupName: string; total: number; abandons: number; rate: number };

export function buildRuptures(
  enrollments: readonly RuptureEnrollment[],
  attendances: readonly RuptureAttendance[],
  contacts: readonly RuptureContact[],
  since: string,
): { rows: RuptureRow[]; groups: GroupRate[] } {
  const inPeriod = (e: RuptureEnrollment) => e.status === "abandon" && !!e.leftOn && e.leftOn >= since;
  const rows = enrollments
    .filter(inPeriod)
    .map((e) => ({
      learnerRef: learnerRef(e.learnerNo),
      learnerName: e.learnerName,
      groupName: e.groupName,
      leftOn: e.leftOn!,
      reason: describeLeaveReason(e.leaveReason),
      trace: exitTrace(
        attendances.filter((a) => a.learnerId === e.learnerId && a.groupId === e.groupId),
        contacts.filter((c) => c.learnerId === e.learnerId),
        e.leftOn,
      ),
    }))
    .sort((a, b) => b.leftOn.localeCompare(a.leftOn) || a.learnerName.localeCompare(b.learnerName, "fr"));

  const byGroup = new Map<string, GroupRate>();
  for (const e of enrollments) {
    const g = byGroup.get(e.groupId) ?? { groupName: e.groupName, total: 0, abandons: 0, rate: 0 };
    g.total += 1;
    if (inPeriod(e)) g.abandons += 1;
    byGroup.set(e.groupId, g);
  }
  const groups = [...byGroup.values()]
    .filter((g) => g.abandons > 0)
    .map((g) => ({ ...g, rate: Math.round((g.abandons / g.total) * 100) }))
    .sort((a, b) => b.rate - a.rate || a.groupName.localeCompare(b.groupName, "fr"));
  return { rows, groups };
}

export const RUPTURE_COLUMNS = ["Date de sortie", "N°", "Apprenant", "Groupe", "Motif", "Absences de suite", "Relances (dates)", "Dernière présence"];

const dayFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });
const dmy = (day: string) => day.split("-").reverse().join("/");

export function rupturesCsv(rows: readonly RuptureRow[]): string {
  const lines = rows.map((r) =>
    [
      dmy(r.leftOn),
      r.learnerRef,
      r.learnerName,
      r.groupName,
      r.reason,
      String(r.trace.absencesInRow),
      r.trace.relances.length ? `${r.trace.relances.length} : ${r.trace.relances.map(dayFr).join(", ")}` : "aucune",
      r.trace.lastPresenceOn ? dmy(r.trace.lastPresenceOn) : "aucune",
    ]
      .map(csvCell)
      .join(";"),
  );
  return "﻿" + [RUPTURE_COLUMNS.join(";"), ...lines].join("\r\n");
}

/** Début de l'année de formation en cours (1er septembre), AAAA-MM-JJ, heure de Paris. */
export function schoolYearStart(now: Date = new Date()): string {
  const [y, m] = now.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" }).split("-").map(Number);
  return `${m >= 9 ? y : y - 1}-09-01`;
}

/** Lit les inscriptions, émargements clôturés et contacts de l'organisme, puis calcule le registre. */
export async function loadRuptures(supabase: SupabaseClient, orgId: string, since: string) {
  const { data: enr } = await supabase
    .from("enrollments")
    .select("learner_id, group_id, status, left_on, leave_reason, learners(first_name, last_name, learner_no), groups(name)")
    .eq("org_id", orgId);
  const enrollments: RuptureEnrollment[] = (enr ?? []).map((e) => {
    const l = e.learners as unknown as { first_name: string; last_name: string; learner_no: number | null } | null;
    return {
      learnerId: e.learner_id as string,
      learnerName: l ? `${l.first_name} ${l.last_name}` : "—",
      learnerNo: l?.learner_no ?? null,
      groupId: e.group_id as string,
      groupName: (e.groups as unknown as { name: string } | null)?.name ?? "—",
      status: e.status as string,
      leftOn: (e.left_on as string | null) ?? null,
      leaveReason: (e.leave_reason as string | null) ?? null,
    };
  });
  const leavers = [...new Set(enrollments.filter((e) => e.status === "abandon" && e.leftOn && e.leftOn >= since).map((e) => e.learnerId))];
  const [{ data: att }, { data: con }] = leavers.length
    ? await Promise.all([
        supabase
          .from("attendances")
          .select("learner_id, status, sessions!inner(starts_at, group_id, attendance_closed_at)")
          .in("learner_id", leavers)
          .not("sessions.attendance_closed_at", "is", null),
        supabase.from("learner_contacts").select("learner_id, contacted_at").eq("org_id", orgId).in("learner_id", leavers),
      ])
    : [{ data: [] }, { data: [] }];
  const attendances: RuptureAttendance[] = (att ?? []).map((a) => {
    const s = a.sessions as unknown as { starts_at: string; group_id: string };
    return { learnerId: a.learner_id as string, groupId: s.group_id, startsAt: s.starts_at, status: a.status as string };
  });
  const contacts: RuptureContact[] = (con ?? []).map((c) => ({ learnerId: c.learner_id as string, contactedAt: c.contacted_at as string }));
  return buildRuptures(enrollments, attendances, contacts, since);
}
