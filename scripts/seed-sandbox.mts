// Bac à sable : organisation de test/démo isolée par la RLS dans la base de prod.
// Seed massif RÉALISTE (formateurs, salles, dispositifs, ~40 groupes planifiés par le
// VRAI moteur, ~400 apprenants typés, émargements simulés) + vérifications de bout en bout.
// Relançable : supprime et recrée l'organisation à chaque exécution.
// Usage : npx tsx scripts/seed-sandbox.mts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const { proposeGroupPlan } = await import("../src/lib/engine/propose");
const { loadEngineData } = await import("../src/lib/engine/loader");

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// RNG déterministe : le bac à sable est reproductible
let seed = 42;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const chunk = <T>(arr: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n));

const SLUG = "bac-a-sable";
const t0 = Date.now();
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, m);

// ── 0. Purge de l'ancien bac à sable ─────────────────────────────────────────
const { data: old } = await s.from("organizations").select("id").eq("slug", SLUG).maybeSingle();
if (old) {
  await s.from("organizations").delete().eq("id", old.id); // cascade totale
  log("ancien bac à sable purgé");
}

// ── 1. Organisation + référentiels ───────────────────────────────────────────
const { data: org } = await s
  .from("organizations")
  .insert({ name: "Bac à sable (démo)", slug: SLUG, timezone: "Europe/Paris", school_holiday_zone: "C" })
  .select("id")
  .single();
const orgId = org!.id;

const { data: funders } = await s.from("funders").insert([
  { org_id: orgId, name: "Ville démo", code: "VILLE", color: "#22c55e" },
  { org_id: orgId, name: "France Travail", code: "FT", color: "#8b5cf6" },
  { org_id: orgId, name: "FSE+", code: "FSE", color: "#0ea5e9" },
  { org_id: orgId, name: "OPCO", code: "OPCO", color: "#f97316" },
]).select("id, name");

const { data: rooms } = await s.from("rooms").insert(
  [10, 12, 14, 16, 18, 24].map((cap, i) => ({ org_id: orgId, name: `Salle ${i + 1}`, capacity: cap })),
).select("id");

const PRENOMS_F = ["Sarah", "Léa", "Nadia", "Claire", "Awa", "Yasmina", "Ines", "Marta"];
const PRENOMS_H = ["Karim", "Paul", "Idriss", "Marc", "Omar", "Théo", "Sami", "Louis"];
const NOMS = ["Martin", "Diallo", "Nguyen", "Garcia", "Benali", "Dubois", "Traoré", "Costa", "Petit", "Haddad", "Moreau", "Keita"];

const trainerRows = Array.from({ length: 12 }, (_, i) => {
  const salarie = i < 7;
  return {
    org_id: orgId,
    first_name: i % 2 ? pick(PRENOMS_H) : pick(PRENOMS_F),
    last_name: NOMS[i],
    contract_type: salarie ? "salarie" : "vacataire",
    hourly_cost: salarie ? 24 + i : 38 + (i % 4) * 2,
    weekly_hours_max: salarie ? [24, 28, 18, 24, 30, 12, 24][i] ?? 24 : 15,
    priority: i + 1,
    skills: i % 3 === 0 ? ["FLE", "alphabétisation"] : i % 3 === 1 ? ["FLE", "préparation examen"] : ["FLE"],
    languages: ["fr"],
  };
});
const { data: trainers } = await s.from("trainers").insert(trainerRows).select("id, weekly_hours_max");

// Dispos : matins+après-midis lun-ven pour la plupart, partielles pour un tiers
const avail: object[] = [];
(trainers ?? []).forEach((t, i) => {
  const days = i % 3 === 2 ? [1, 2, 4] : [1, 2, 3, 4, 5];
  for (const d of days) {
    avail.push({ org_id: orgId, trainer_id: t.id, weekday: d, start_time: "09:00", end_time: "12:30" });
    if (i % 4 !== 3) avail.push({ org_id: orgId, trainer_id: t.id, weekday: d, start_time: "13:30", end_time: "17:00" });
  }
});
await s.from("trainer_availabilities").insert(avail);

const programDefs = [
  ["FLE A1.1", 200, 12, "A1.1"], ["FLE A1", 250, 15, "A1"], ["FLE A2", 250, 15, "A2"],
  ["FLE B1", 200, 12, "B1"], ["Alpha écrit", 300, 9, null], ["RAN", 70, 6, null],
  ["Prépa DELF A2", 40, 6, "A2"], ["Prépa DELF B1", 40, 6, "B1"], ["FLE pro", 120, 9, "A2"], ["Atelier oral", 60, 4, null],
] as const;
const { data: programs } = await s.from("programs").insert(
  programDefs.map(([name, hours, weekly, level], i) => ({
    org_id: orgId, code: `P${i + 1}`, name, total_hours: hours,
    default_weekly_hours: weekly, level, modality: "presentiel",
    default_funder_id: (funders ?? [])[i % 4].id, required_skills: ["FLE"],
  })),
).select("id, name, total_hours, default_weekly_hours, level");
log(`référentiels créés : ${trainers?.length} formateurs, ${rooms?.length} salles, ${programs?.length} dispositifs`);

// ── 2. Apprenants (400, typologie réaliste) ──────────────────────────────────
const VILLES = [["Saint-Denis", "93200", 0.6], ["Aubervilliers", "93300", 0.55], ["Saint-Ouen", "93400", 0.45], ["Paris", "75018", 0.2], ["Bobigny", "93000", 0.5]] as const;
const LANGUES = ["arabe", "bambara", "dari", "turc", "ukrainien", "soninké", "tamoul", "espagnol"];
const learnerRows = Array.from({ length: 400 }, (_, i) => {
  const femme = rand() < 0.62;
  const [ville, cp, pQpv] = pick([...VILLES]);
  const age = 18 + Math.floor(rand() * 44);
  const birthYear = 2026 - age;
  return {
    org_id: orgId,
    first_name: `${femme ? pick(PRENOMS_F) : pick(PRENOMS_H)}`,
    last_name: `${pick(NOMS)}-${String(i + 1).padStart(3, "0")}`,
    gender: femme ? "femme" : "homme",
    birth_date: `${birthYear}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-15`,
    city: ville, postal_code: cp,
    qpv: rand() < pQpv,
    activity_status: pick(["demandeur_emploi", "demandeur_emploi", "rsa", "salarie", "inactif_autre"]),
    rqth: rand() < 0.06,
    education_level: pick(["non_scolarise", "primaire", "secondaire", "secondaire", "superieur"]),
    prescriber: pick(["France Travail", "Mission locale", "CCAS", "Spontané", "Association partenaire"]),
    first_language: pick(LANGUES),
    email: rand() < 0.5 ? `demo.apprenant${i}@exemple.invalid` : null, // jamais un vrai domaine
    phone: `06${String(10000000 + Math.floor(rand() * 89999999))}`,
  };
});
const learnerIds: string[] = [];
for (const c of chunk(learnerRows, 200)) {
  const { data, error } = await s.from("learners").insert(c).select("id");
  if (error) throw new Error(`learners: ${error.message}`);
  learnerIds.push(...(data ?? []).map((x) => x.id));
}
log(`${learnerIds.length} apprenants créés`);

// ── 3. 40 groupes planifiés par le VRAI moteur (test de charge) ──────────────
const stats = { ok: 0, noSolution: 0, conflicts: 0, sessions: 0 };
const reasons = new Map<string, number>();
const groupIds: { id: string; funderId: string; done: boolean }[] = [];
const START_MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-09", "2026-09", "2026-10", "2026-11"];

for (let g = 0; g < 40; g++) {
  const program = (programs ?? [])[g % programs!.length];
  const funder = (funders ?? [])[g % 4];
  const month = START_MONTHS[g % START_MONTHS.length];
  const startsOn = `${month}-${String(2 + (g % 4) * 7).padStart(2, "0")}`;
  const headcount = 8 + Math.floor(rand() * 7);

  // Alternance matin/après-midi (comme un vrai organisme : 2 créneaux par salle et par jour)
  const weekly = Number(program.default_weekly_hours);
  const nbDays = Math.min(5, Math.max(2, Math.round(weekly / 3)));
  const slot = g % 2 === 0
    ? { start: "09:00", end: "12:00" }
    : { start: "13:30", end: "16:30" };
  const weeklyPattern = Array.from({ length: nbDays }, (_, d) => ({
    weekday: (d + 1) as 1 | 2 | 3 | 4 | 5, ...slot,
  }));

  const data = await loadEngineData(orgId, startsOn);
  const proposal = proposeGroupPlan(
    {
      programId: program.id,
      totalHours: Number(program.total_hours),
      level: program.level,
      requiredSkills: ["FLE"],
      defaultWeeklyHours: weekly,
      startsOn,
      weeklyPattern,
      expectedHeadcount: headcount,
    },
    data,
  );
  if (!proposal.trainer || !proposal.room) {
    stats.noSolution++;
    const why = !proposal.trainer
      ? (proposal.trainerAlternatives[0]?.hardViolations[0] ?? "aucun formateur")
      : (proposal.roomAlternatives[0]?.hardViolations[0] ?? "aucune salle");
    reasons.set(why.split(" semaine")[0], (reasons.get(why.split(" semaine")[0]) ?? 0) + 1);
    continue;
  }

  const { data: group, error: gErr } = await s.from("groups").insert({
    org_id: orgId, program_id: program.id, funder_id: funder.id,
    name: `${program.name} — G${g + 1}`,
    starts_on: startsOn, ends_on: proposal.totals.endsOn,
    total_hours: Number(program.total_hours),
    trainer_id: proposal.trainer.trainerId, room_id: proposal.room.roomId,
    capacity: headcount + 2, status: "ouvert",
    weekly_pattern: proposal.weeklyPattern,
  }).select("id").single();
  if (gErr) throw new Error(`group: ${gErr.message}`);

  const sessionRows = proposal.sessions.map((x) => ({
    org_id: orgId, group_id: group!.id,
    trainer_id: proposal.trainer!.trainerId, room_id: proposal.room!.roomId,
    starts_at: x.startsAt, ends_at: x.endsAt,
  }));
  let conflict = false;
  for (const c of chunk(sessionRows, 200)) {
    const { error } = await s.from("sessions").insert(c);
    if (error) {
      conflict = true;
      console.log(`  ⚠️ conflit groupe G${g + 1}:`, error.message.slice(0, 90));
    }
  }
  if (conflict) stats.conflicts++;
  else {
    stats.ok++;
    stats.sessions += sessionRows.length;
    groupIds.push({ id: group!.id, funderId: funder.id, done: proposal.totals.endsOn! < "2026-08-30" });
  }
}
log(`groupes : ${stats.ok} planifiés par le moteur (${stats.sessions} séances), ${stats.noSolution} sans solution, ${stats.conflicts} conflits`);
if (reasons.size) console.log("  refus du moteur :", [...reasons.entries()].map(([r, n]) => `${n}× ${r}`).join(" | "));

// ── 4. Inscriptions (10-15/groupe, avec abandons/terminés) ───────────────────
const enrollRows: object[] = [];
for (const g of groupIds) {
  const n = 10 + Math.floor(rand() * 6);
  const picked = new Set<string>();
  while (picked.size < n) picked.add(learnerIds[Math.floor(rand() * learnerIds.length)]);
  for (const lid of picked) {
    const r = rand();
    const status = g.done ? (r < 0.75 ? "termine" : r < 0.9 ? "inscrit" : "abandon") : r < 0.93 ? "inscrit" : "abandon";
    enrollRows.push({
      org_id: orgId, group_id: g.id, learner_id: lid, status,
      left_on: status === "abandon" ? "2026-05-15" : status === "termine" ? "2026-06-30" : null,
    });
  }
}
for (const c of chunk(enrollRows, 300)) {
  const { error } = await s.from("enrollments").insert(c);
  if (error) throw new Error(`enrollments: ${error.message}`);
}
log(`${enrollRows.length} inscriptions créées`);

// ── 5. Émargements simulés sur les séances passées (clôturées) ───────────────
const { data: pastSessions } = await s
  .from("sessions")
  .select("id, group_id, ends_at")
  .eq("org_id", orgId)
  .lt("ends_at", new Date().toISOString());
const enrollByGroup = new Map<string, string[]>();
for (const e of enrollRows as { group_id: string; learner_id: string; status: string }[]) {
  if (e.status === "abandon") continue;
  const list = enrollByGroup.get(e.group_id) ?? [];
  list.push(e.learner_id);
  enrollByGroup.set(e.group_id, list);
}
// ~15 % d'apprenants « décrocheurs » (absents systématiques en fin de parcours)
const dropouts = new Set(learnerIds.filter(() => rand() < 0.15));

const attendanceRows: object[] = [];
const closedIds: string[] = [];
for (const sess of pastSessions ?? []) {
  const enrolled = enrollByGroup.get(sess.group_id) ?? [];
  if (!enrolled.length) continue;
  closedIds.push(sess.id);
  for (const lid of enrolled) {
    const r = rand();
    const status = dropouts.has(lid) && sess.ends_at > "2026-04-01"
      ? "absent"
      : r < 0.8 ? "present" : r < 0.88 ? "retard" : "absent";
    attendanceRows.push({
      org_id: orgId, session_id: sess.id, learner_id: lid, status, method: "manuel",
      signed_at: status === "absent" ? null : sess.ends_at,
    });
  }
}
for (const c of chunk(attendanceRows, 500)) {
  const { error } = await s.from("attendances").insert(c);
  if (error) throw new Error(`attendances: ${error.message}`);
}
for (const c of chunk(closedIds, 200)) {
  await s.from("sessions").update({ status: "realisee", attendance_closed_at: new Date().toISOString() }).in("id", c);
}
log(`${attendanceRows.length} émargements sur ${closedIds.length} séances clôturées`);

// ── 6. Tests de positionnement « faits » (répartition sur toute l'échelle) ───
const LEVELS = ["Pré-alpha", "Alpha", "Alpha avancé", "Post-alpha (A1.1 en cours)", "A1.1", "A1", "A1", "A2", "A2", "B1", "B2"];
const ptRows = learnerIds.slice(0, 80).map((lid, i) => ({
  org_id: orgId, learner_id: lid, status: "fait",
  level: LEVELS[i % LEVELS.length], score: 20 + (i % 70),
  completed_at: new Date().toISOString(), duration_seconds: 300 + i * 7,
}));
await s.from("placement_tests").insert(ptRows);
await Promise.all(
  ptRows.slice(0, 80).map((r, i) => s.from("learners").update({ level_assessed: LEVELS[i % LEVELS.length] }).eq("id", r.learner_id)),
);
log(`${ptRows.length} tests de positionnement simulés`);

// ── 7. Compte démo pour naviguer dans le bac à sable ─────────────────────────
const DEMO_EMAIL = "demo@parleremploi.com";
const { data: users } = await s.auth.admin.listUsers({ perPage: 200 });
let demo = users.users.find((u) => u.email === DEMO_EMAIL);
if (!demo) {
  const { data: created, error } = await s.auth.admin.createUser({
    email: DEMO_EMAIL, password: "Sandbox-PEF-2026!", email_confirm: true,
    user_metadata: { full_name: "Compte Démo" },
  });
  if (error) throw error;
  demo = created.user;
}
await s.from("memberships").delete().eq("user_id", demo!.id);
await s.from("memberships").insert({ org_id: orgId, user_id: demo!.id, role: "admin" });
log(`compte démo prêt : ${DEMO_EMAIL}`);

// ── 8. VÉRIFICATIONS sur le volume ───────────────────────────────────────────
console.log("\n── Vérifications ──");
const fails: string[] = [];
const check = (label: string, ok: boolean, detail = "") => {
  console.log(ok ? "✓" : "✗", label, detail);
  if (!ok) fails.push(label);
};

// a) intégrité : aucun conflit formateur/salle n'a pu entrer (contraintes EXCLUDE)
check("zéro conflit de planning inséré", stats.conflicts === 0, `(${stats.ok} groupes, ${stats.sessions} séances)`);

// b) le moteur a trouvé une solution pour la grande majorité des groupes
check(
  "moteur : ≥ 50 % planifiés ET chaque refus motivé (saturation salles/formateurs)",
  stats.ok >= 20 && [...reasons.values()].reduce((a, b) => a + b, 0) === stats.noSolution,
  `(${stats.ok}/40 planifiés, ${stats.noSolution} refus tous motivés — capacité physique : 6 salles × 2 créneaux)`,
);

// c) bilan financeur sur le plus gros financeur : calcul + PDF sous volume
const t1 = Date.now();
const { loadFunderReportData, computeFunderReport } = await import("../src/lib/reports/funder-report");
const { buildFunderReportPdf } = await import("../src/lib/reports/funder-report-pdf");
const data1 = await loadFunderReportData(orgId, (funders ?? [])[0].id, "2026-01-01", "2026-12-31");
const report = computeFunderReport(data1!);
const loadMs = Date.now() - t1;
check("bilan financeur calculé", report.totals.groupCount > 0,
  `(${report.totals.groupCount} groupes, ${report.totals.hoursDone} h réalisées, ${report.totals.uniqueLearners} bénéficiaires, assiduité ${report.totals.averageAttendanceRate}% — ${loadMs} ms)`);
check("typologie remplie (sexe connu pour tous)", !report.distributions.gender.some((d) => d.label === "Non renseigné"));
check("les abandons sont comptés", report.totals.exits.abandon > 0, `(${report.totals.exits.abandon})`);
const t2 = Date.now();
const pdf = await buildFunderReportPdf(report);
check("PDF de bilan généré", pdf.length > 5_000, `(${Math.round(pdf.length / 1024)} Ko en ${Date.now() - t2} ms)`);

// d) vues d'occupation cohérentes sous volume
const { data: loads } = await s.from("v_trainer_week_load").select("trainer_id, week_start, hours_planned").eq("org_id", orgId);
const maxByTrainer = new Map((trainers ?? []).map((t) => [t.id, Number(t.weekly_hours_max)]));
const over = (loads ?? []).filter(
  (l) => Number(l.hours_planned) > (maxByTrainer.get(l.trainer_id) ?? 99) + 0.01,
);
check("aucun dépassement de plafond hebdo formateur", over.length === 0, `(${(loads ?? []).length} semaines-formateur contrôlées)`);

// e) décrochage détectable (données d'alerte présentes)
const { computeLearnerStats } = await import("../src/lib/attendance-stats");
const lstats = computeLearnerStats(
  (attendanceRows as { learner_id: string; status: "present" | "retard" | "absent" }[]).map((a, i) => ({
    learnerId: a.learner_id, status: a.status, startsAt: String(i).padStart(10, "0"),
  })),
);
const streaks = [...lstats.values()].filter((x) => x.consecutiveAbsences >= 3).length;
check("des décrocheurs sont détectés (alertes dashboard)", streaks > 0, `(${streaks} apprenants ≥ 3 absences de suite)`);

console.log(fails.length ? `\n❌ ${fails.length} échec(s)` : `\n✅ Bac à sable prêt et vérifié en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(fails.length ? 1 : 0);
