// Simulation de la rentrée 2026-27 avec le VRAI moteur (src/lib/engine), sur les données
// de prod extraites en JSON (formateurs, dispos, absences, salles, fermetures).
// Usage : npx tsx scripts/simulate-rentree-2026.mts <planning-data.json> [scenario]
import { readFileSync, writeFileSync } from "node:fs";
import { proposeGroupPlan } from "../src/lib/engine/propose";
import type { EngineData, ProposalInput, SlotPattern, TrainerData, RoomData } from "../src/lib/engine/types";

const raw = JSON.parse(readFileSync(process.argv[2], "utf8"))[0].d;
const scenario = process.argv[3] ?? "base";

type J = { j: number; de: string; a: string };
const slots = (list: J[] | null) => (list ?? []).map((x) => ({ weekday: x.j, start: x.de.slice(0, 5), end: x.a.slice(0, 5) }));

function buildData(caps: Record<string, number> = {}): EngineData {
  const trainers: TrainerData[] = raw.trainers.map((t: any) => ({
    id: t.id, firstName: t.prenom, lastName: t.nom.trim(), contractType: t.contrat, hourlyCost: Number(t.cout),
    weeklyHoursMax: caps[t.prenom.trim()] ?? Number(t.max_sem), priority: t.prio, skills: t.skills ?? [], isActive: t.actif,
    availabilities: slots(t.dispos), absences: (t.absences ?? []).map((a: any) => ({ startsOn: a.du, endsOn: a.au })),
    busy: [], currentGroupLevels: [],
  }));
  const rooms: RoomData[] = raw.rooms.map((r: any) => ({
    id: r.id, name: r.nom, capacity: r.cap, isActive: r.actif, availabilities: slots(r.dispos),
    unavailabilities: (r.indispos ?? []).map((u: any) => ({ startsOn: u.du, endsOn: u.au })), busy: [],
  }));
  const closures = (raw.fermetures ?? []).map((c: any) => ({ startsOn: c.du, endsOn: c.au, label: c.label, kind: c.k }));
  return { trainers, rooms, closures, timezone: "Europe/Paris" };
}

const P = (weekday: number, start: string, end: string): SlotPattern => ({ weekday: weekday as SlotPattern["weekday"], start, end });
const prog = (code: string) => raw.programs.find((p: any) => p.code === code);
const trainerId = (prenom: string) => raw.trainers.find((t: any) => t.prenom.trim() === prenom).id;
const roomId = (nom: string) => raw.rooms.find((r: any) => r.nom === nom).id;

type G = { label: string; code: string; pattern: SlotPattern[]; trainer: string; room: string; startsOn: string; skipHolidays: boolean };

const START = "2026-10-05";
const SCENARIOS: Record<string, { caps: Record<string, number>; groups: G[] }> = {
  // Plafonds actuels : PEF A2 → Marie-Joëlle (imposé), le reste au moteur
  base: {
    caps: {},
    groups: [
      { label: "PEF A2", code: "PEF_A2", pattern: [P(1, "09:00", "12:00"), P(1, "13:00", "16:00"), P(2, "09:00", "12:00")], trainer: "Marie Joelle", room: "Cordon", startsOn: START, skipHolidays: false },
      { label: "PEF A1", code: "PEF_A1", pattern: [P(1, "09:00", "12:00"), P(2, "09:00", "12:00"), P(4, "09:00", "12:00")], trainer: "Sabrina", room: "Landy", startsOn: START, skipHolidays: false },
      { label: "Cours municipaux A2", code: "CMSTOA2", pattern: [P(1, "13:00", "16:00"), P(4, "13:00", "16:00")], trainer: "Sabrina", room: "Landy", startsOn: START, skipHolidays: true },
      { label: "Cours municipaux A1", code: "CMSTOA1", pattern: [P(1, "13:00", "16:00"), P(2, "13:00", "16:00")], trainer: "Marie", room: "Salle 13", startsOn: START, skipHolidays: true },
      { label: "Cours municipaux B1", code: "CMSTOB1", pattern: [P(2, "13:00", "16:00"), P(4, "13:00", "16:00")], trainer: "Sabrina", room: "Salle 13", startsOn: START, skipHolidays: true },
    ],
  },
};
// Variante : Sabrina à 21 h/sem, B1 le mardi après-midi + jeudi après-midi (Salle 13)
SCENARIOS.sabrina21 = { caps: { Sabrina: 21 }, groups: SCENARIOS.base.groups };
// Variante : Marie à 12 h/sem, B1 en soirée à Berthoud (lun/mar/mer 18h-20h)
SCENARIOS.marie12soir = {
  caps: { Marie: 12 },
  groups: [
    ...SCENARIOS.base.groups.slice(0, 4),
    { label: "Cours municipaux B1 (soir)", code: "CMSTOB1", pattern: [P(1, "18:00", "20:00"), P(2, "18:00", "20:00"), P(3, "18:00", "20:00")], trainer: "Marie", room: "Berthoud", startsOn: START, skipHolidays: true },
  ],
};
// Recommandation : Marie le matin (ses dispos commencent à 13h30, les salles ferment à 16h),
// B1 avec Sabrina (21 h) mardi après-midi + samedi matin (Berthoud, 8 places)
const RECO: G[] = [
  { label: "PEF A2", code: "PEF_A2", pattern: [P(1, "09:00", "12:00"), P(1, "13:00", "16:00"), P(2, "09:00", "12:00")], trainer: "Marie Joelle", room: "Cordon", startsOn: START, skipHolidays: false },
  { label: "PEF A1", code: "PEF_A1", pattern: [P(1, "09:00", "12:00"), P(2, "09:00", "12:00"), P(4, "09:00", "12:00")], trainer: "Sabrina", room: "Landy", startsOn: START, skipHolidays: false },
  { label: "Cours municipaux A1", code: "CMSTOA1", pattern: [P(1, "09:00", "12:00"), P(2, "09:00", "12:00")], trainer: "Marie", room: "Salle 13", startsOn: START, skipHolidays: true },
  { label: "Cours municipaux A2", code: "CMSTOA2", pattern: [P(1, "13:00", "16:00"), P(4, "13:00", "16:00")], trainer: "Sabrina", room: "Landy", startsOn: START, skipHolidays: true },
  { label: "Cours municipaux B1 (mar. + sam. matin)", code: "CMSTOB1", pattern: [P(2, "13:00", "16:00"), P(6, "09:00", "12:00")], trainer: "Sabrina", room: "Berthoud", startsOn: START, skipHolidays: true },
];
SCENARIOS.reco = { caps: { Sabrina: 21 }, groups: RECO };
SCENARIOS.recoVacances = { caps: { Sabrina: 21 }, groups: RECO.map((g) => ({ ...g, skipHolidays: false })) };
// Variante : un 4e formateur vacataire (6 h/sem, mar. + jeu. après-midi) prend le B1
SCENARIOS.vacataire = {
  caps: {},
  groups: [...RECO.slice(0, 4), { label: "Cours municipaux B1 (vacataire)", code: "CMSTOB1", pattern: [P(2, "13:00", "16:00"), P(4, "13:00", "16:00")], trainer: "Vacataire", room: "Cordon", startsOn: START, skipHolidays: true }],
};
// Variante : la Ville ouvre Cordon le mercredi → B1 avec Sabrina (21 h) le mercredi matin + après-midi
SCENARIOS.mercredi = {
  caps: { Sabrina: 21 },
  groups: [...RECO.slice(0, 4), { label: "Cours municipaux B1 (mercredi)", code: "CMSTOB1", pattern: [P(3, "09:00", "12:00"), P(3, "13:00", "16:00")], trainer: "Sabrina", room: "Cordon", startsOn: START, skipHolidays: true }],
};
// OPTIMISÉ : PEF en salles 12/13 (salle 12 ouverte le mercredi matin), Marie sur PEF A1 le matin,
// Marie-Joëlle sur PEF A2, Sabrina sur les 3 cours municipaux à Cordon (18 h, sous son plafond).
const OPTI: G[] = [
  { label: "PEF A2", code: "PEF_A2", pattern: [P(1, "09:00", "12:00"), P(1, "13:00", "16:00"), P(2, "09:00", "12:00")], trainer: "Marie Joelle", room: "Salle 13", startsOn: START, skipHolidays: false },
  { label: "PEF A1", code: "PEF_A1", pattern: [P(1, "09:00", "12:00"), P(2, "09:00", "12:00"), P(3, "09:00", "12:00")], trainer: "Marie", room: "Salle 12", startsOn: START, skipHolidays: false },
  { label: "Cours municipaux A1", code: "CMSTOA1", pattern: [P(1, "09:00", "12:00"), P(2, "09:00", "12:00")], trainer: "Sabrina", room: "Cordon", startsOn: START, skipHolidays: true },
  { label: "Cours municipaux A2", code: "CMSTOA2", pattern: [P(1, "13:00", "16:00"), P(4, "13:00", "16:00")], trainer: "Sabrina", room: "Cordon", startsOn: START, skipHolidays: true },
  { label: "Cours municipaux B1", code: "CMSTOB1", pattern: [P(2, "13:00", "16:00"), P(4, "09:00", "12:00")], trainer: "Sabrina", room: "Cordon", startsOn: START, skipHolidays: true },
];
SCENARIOS.opti = { caps: {}, groups: OPTI };
SCENARIOS.optiVacances = { caps: {}, groups: OPTI.map((g) => ({ ...g, skipHolidays: false })) };
// UN COURS MUNICIPAL PAR SALLE MUNICIPALE : A1 à Cordon, B1 à Landy, A2 à Berthoud (soir, 8 places).
// Berthoud n'ouvre que le soir (18h-20h) et le samedi matin : il faut une formatrice disponible le soir.
const MUNI = (b1Room: string, berthoudTrainer: string, berthoudPattern: SlotPattern[]): G[] => [
  { label: "PEF A2", code: "PEF_A2", pattern: [P(1, "09:00", "12:00"), P(1, "13:00", "16:00"), P(2, "09:00", "12:00")], trainer: "Marie Joelle", room: "Salle 13", startsOn: START, skipHolidays: false },
  { label: "PEF A1", code: "PEF_A1", pattern: [P(1, "09:00", "12:00"), P(2, "09:00", "12:00"), P(3, "09:00", "12:00")], trainer: "Marie", room: "Salle 12", startsOn: START, skipHolidays: false },
  { label: "Cours municipaux A1 (Cordon)", code: "CMSTOA1", pattern: [P(1, "09:00", "12:00"), P(2, "09:00", "12:00")], trainer: "Sabrina", room: "Cordon", startsOn: START, skipHolidays: true },
  { label: "Cours municipaux B1 (Landy)", code: "CMSTOB1", pattern: [P(1, "13:00", "16:00"), P(4, "13:00", "16:00")], trainer: "Sabrina", room: b1Room, startsOn: START, skipHolidays: true },
  { label: "Cours municipaux A2 (Berthoud, soir)", code: "CMSTOA2", pattern: berthoudPattern, trainer: berthoudTrainer, room: "Berthoud", startsOn: START, skipHolidays: true },
];
const SOIR3 = [P(1, "18:00", "20:00"), P(2, "18:00", "20:00"), P(4, "18:00", "20:00")];
const SOIR2SAM = [P(2, "18:00", "20:00"), P(4, "18:00", "20:00"), P(6, "09:00", "12:00")];
// Hypothèse : Sabrina accepte 3 soirées (lun/mar/jeu 18h-20h)
SCENARIOS.muniSabrinaSoir = { caps: {}, groups: MUNI("Landy", "Sabrina", SOIR3) };
// Hypothèse : Sabrina accepte 2 soirées + le samedi matin (7 h/sem → fin plus tôt)
SCENARIOS.muniSabrinaSam = { caps: {}, groups: MUNI("Landy", "Sabrina", SOIR2SAM) };
// Un vacataire du soir prend Berthoud (lun/mar/jeu 18h-20h)
SCENARIOS.muniVacataireSoir = { caps: {}, groups: MUNI("Landy", "Vacataire", SOIR3) };
// FINAL (Anis, 09/09) : B1 à Berthoud = 1 soir (mardi 18h-20h) + samedi matin ; A1 Cordon et A2 Landy
// 2 × 3 h ; PEF en salles 12/13. Sabrina assure les 3 cours municipaux (17 h) si elle accepte le mardi soir.
const FINAL: G[] = [
  { label: "PEF A2", code: "PEF_A2", pattern: [P(1, "09:00", "12:00"), P(1, "13:00", "16:00"), P(2, "09:00", "12:00")], trainer: "Marie Joelle", room: "Salle 13", startsOn: START, skipHolidays: false },
  { label: "PEF A1", code: "PEF_A1", pattern: [P(1, "09:00", "12:00"), P(2, "09:00", "12:00"), P(3, "09:00", "12:00")], trainer: "Marie", room: "Salle 12", startsOn: START, skipHolidays: false },
  { label: "Cours municipaux A1 (Cordon)", code: "CMSTOA1", pattern: [P(1, "09:00", "12:00"), P(2, "09:00", "12:00")], trainer: "Sabrina", room: "Cordon", startsOn: START, skipHolidays: true },
  { label: "Cours municipaux A2 (Landy)", code: "CMSTOA2", pattern: [P(1, "13:00", "16:00"), P(4, "13:00", "16:00")], trainer: "Sabrina", room: "Landy", startsOn: START, skipHolidays: true },
  { label: "Cours municipaux B1 (Berthoud, mar. soir + sam. matin)", code: "CMSTOB1", pattern: [P(2, "18:00", "20:00"), P(6, "09:00", "12:00")], trainer: "Sabrina", room: "Berthoud", startsOn: START, skipHolidays: true },
];
SCENARIOS.final = { caps: {}, groups: FINAL };
SCENARIOS.finalVacances = { caps: {}, groups: FINAL.map((g) => ({ ...g, skipHolidays: false })) };
// CHARGER MARIE-JOËLLE — option 1 : PEF A2 en rythme intensif 12 h/sem (lun + mar, matin et après-midi)
SCENARIOS.mj12 = { caps: {}, groups: [
  { label: "PEF A2 (12 h/sem)", code: "PEF_A2", pattern: [P(1, "09:00", "12:00"), P(1, "13:00", "16:00"), P(2, "09:00", "12:00"), P(2, "13:00", "16:00")], trainer: "Marie Joelle", room: "Salle 13", startsOn: START, skipHolidays: false },
  ...FINAL.slice(1),
] };
// CHARGER MARIE-JOËLLE — option 2 : elle se libère le mercredi matin → PEF A2 lun/mar/mer matin (salle 13)
// + Cours municipaux A1 lun/mar après-midi à Cordon = 15 h ; Sabrina garde A2 et B1 (11 h)
SCENARIOS.mjMercredi = { caps: {}, groups: [
  { label: "PEF A2", code: "PEF_A2", pattern: [P(1, "09:00", "12:00"), P(2, "09:00", "12:00"), P(3, "09:00", "12:00")], trainer: "Marie Joelle", room: "Salle 13", startsOn: START, skipHolidays: false },
  FINAL[1],
  { label: "Cours municipaux A1 (Cordon)", code: "CMSTOA1", pattern: [P(1, "13:00", "16:00"), P(2, "13:00", "16:00")], trainer: "Marie Joelle", room: "Cordon", startsOn: START, skipHolidays: true },
  FINAL[3], FINAL[4],
] };
// OPTION 2 RETENUE (09/09) + Sabrina regroupée sur 3 jours : mardi après-midi (Landy) puis soir
// (Berthoud), jeudi après-midi (Landy), samedi matin (Berthoud).
const OPT2: G[] = [
  { label: "PEF A2", code: "PEF_A2", pattern: [P(1, "09:00", "12:00"), P(2, "09:00", "12:00"), P(3, "09:00", "12:00")], trainer: "Marie Joelle", room: "Salle 13", startsOn: START, skipHolidays: false },
  { label: "PEF A1", code: "PEF_A1", pattern: [P(1, "09:00", "12:00"), P(2, "09:00", "12:00"), P(3, "09:00", "12:00")], trainer: "Marie", room: "Salle 12", startsOn: START, skipHolidays: false },
  { label: "Cours municipaux A1", code: "CMSTOA1", pattern: [P(1, "13:00", "16:00"), P(2, "13:00", "16:00")], trainer: "Marie Joelle", room: "Cordon", startsOn: START, skipHolidays: true },
  { label: "Cours municipaux A2", code: "CMSTOA2", pattern: [P(2, "13:00", "16:00"), P(4, "13:00", "16:00")], trainer: "Sabrina", room: "Landy", startsOn: START, skipHolidays: true },
  { label: "Cours municipaux B1", code: "CMSTOB1", pattern: [P(2, "18:00", "20:00"), P(6, "09:00", "12:00")], trainer: "Sabrina", room: "Berthoud", startsOn: START, skipHolidays: true },
];
SCENARIOS.opt2 = { caps: {}, groups: OPT2 };
// Variante : cours municipaux AUSSI pendant les vacances scolaires (fin plus tôt)
SCENARIOS.cmVacances = { caps: { Sabrina: 21 }, groups: SCENARIOS.base.groups.map((g) => ({ ...g, skipHolidays: false })) };

const sc = SCENARIOS[scenario];
if (!sc) throw new Error(`scénario inconnu : ${scenario}`);
const data = buildData(sc.caps);
if (scenario === "opti" || scenario === "optiVacances") {
  data.rooms.find((r) => r.name === "Salle 12")!.availabilities.push({ weekday: 3, start: "09:00", end: "12:00" });
}
if (scenario.startsWith("muni")) {
  data.rooms.find((r) => r.name === "Salle 12")!.availabilities.push({ weekday: 3, start: "09:00", end: "12:00" });
}
if (scenario === "muniSabrinaSoir" || scenario === "muniSabrinaSam") {
  const sab = data.trainers.find((t) => t.firstName.trim() === "Sabrina")!;
  sab.availabilities.push({ weekday: 1, start: "18:00", end: "20:00" }, { weekday: 2, start: "18:00", end: "20:00" }, { weekday: 4, start: "18:00", end: "20:00" });
}
if (scenario === "muniVacataireSoir") {
  data.trainers.push({ id: "vacataire-soir", firstName: "Vacataire", lastName: "(soir, à recruter)", contractType: "vacataire", hourlyCost: 25, weeklyHoursMax: 6, priority: 9, skills: ["FLE"], isActive: true,
    availabilities: [{ weekday: 1, start: "18:00", end: "20:00" }, { weekday: 2, start: "18:00", end: "20:00" }, { weekday: 4, start: "18:00", end: "20:00" }], absences: [], busy: [], currentGroupLevels: [] });
  raw.trainers.push({ id: "vacataire-soir", prenom: "Vacataire" });
}
if (scenario.startsWith("final")) {
  data.rooms.find((r) => r.name === "Salle 12")!.availabilities.push({ weekday: 3, start: "09:00", end: "12:00" });
  data.trainers.find((t) => t.firstName.trim() === "Sabrina")!.availabilities.push({ weekday: 2, start: "18:00", end: "20:00" });
}
if (scenario === "mj12" || scenario === "mjMercredi") {
  data.rooms.find((r) => r.name === "Salle 12")!.availabilities.push({ weekday: 3, start: "09:00", end: "12:00" });
  data.trainers.find((t) => t.firstName.trim() === "Sabrina")!.availabilities.push({ weekday: 2, start: "18:00", end: "20:00" });
}
if (scenario === "mjMercredi") {
  data.rooms.find((r) => r.name === "Salle 13")!.availabilities.push({ weekday: 3, start: "09:00", end: "12:00" });
  data.trainers.find((t) => t.firstName.trim() === "Marie Joelle")!.availabilities.push({ weekday: 3, start: "09:00", end: "12:00" });
}
if (scenario === "opt2") {
  data.rooms.find((r) => r.name === "Salle 12")!.availabilities.push({ weekday: 3, start: "09:00", end: "12:00" });
  data.rooms.find((r) => r.name === "Salle 13")!.availabilities.push({ weekday: 3, start: "09:00", end: "12:00" });
  data.trainers.find((t) => t.firstName.trim() === "Sabrina")!.availabilities.push({ weekday: 2, start: "18:00", end: "20:00" });
  data.trainers.find((t) => t.firstName.trim() === "Marie Joelle")!.availabilities.push({ weekday: 3, start: "09:00", end: "12:00" });
}
if (scenario === "mercredi") {
  const cordon = data.rooms.find((r) => r.name === "Cordon")!;
  cordon.availabilities.push({ weekday: 3, start: "09:00", end: "12:00" }, { weekday: 3, start: "13:00", end: "16:00" });
}
if (scenario === "vacataire") {
  data.trainers.push({ id: "vacataire-a-recruter", firstName: "Vacataire", lastName: "(à recruter)", contractType: "vacataire", hourlyCost: 25, weeklyHoursMax: 6, priority: 9, skills: ["FLE"], isActive: true,
    availabilities: [{ weekday: 2, start: "13:00", end: "16:00" }, { weekday: 4, start: "13:00", end: "16:00" }], absences: [], busy: [], currentGroupLevels: [] });
  raw.trainers.push({ id: "vacataire-a-recruter", prenom: "Vacataire" });
}
const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
const jours = ["", "lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

console.log(`\n=== Scénario « ${scenario} » — plafonds modifiés : ${JSON.stringify(sc.caps)} ===`);
for (const g of sc.groups) {
  const p = prog(g.code);
  const input: ProposalInput = {
    programId: p.id, totalHours: Number(p.h), level: p.vise, requiredSkills: p.skills ?? [], defaultWeeklyHours: Number(p.h_sem),
    startsOn: g.startsOn, weeklyPattern: g.pattern, preferredTrainerId: trainerId(g.trainer), preferredRoomId: roomId(g.room),
    expectedHeadcount: g.room === "Berthoud" ? 8 : 12, skipSchoolHolidays: g.skipHolidays,
  };
  // 1) proposition réelle ; 2) même chose SANS les absences du formateur voulu, pour compter
  //    les séances qu'il faudra faire remplacer (le moteur, lui, l'exclut dès la 1re absence).
  const real = proposeGroupPlan(input, data);
  const wanted = data.trainers.find((t) => t.id === input.preferredTrainerId)!;
  const savedAbs = wanted.absences;
  wanted.absences = [];
  const forced = proposeGroupPlan(input, data);
  wanted.absences = savedAbs;
  const chosen = forced.trainerAlternatives.find((t) => t.trainerId === wanted.id)!;
  const absentSessions = forced.sessions.filter((s) => savedAbs.some((a) => s.localDate >= a.startsOn && s.localDate <= a.endsOn));
  const room = forced.room;

  console.log(`\n▶ ${g.label} — ${p.h} h — ${g.pattern.map((s) => `${jours[s.weekday]} ${s.start}-${s.end}`).join(", ")} — début ${fmt(g.startsOn)}${g.skipHolidays ? " (pas de cours pendant les vacances scolaires)" : " (cours pendant les vacances)"}`);
  console.log(`   Formateur voulu : ${wanted.firstName} ${wanted.lastName} → ${chosen.hardViolations.length ? "❌ " + chosen.hardViolations.join(" ; ") : "✅ éligible"}${chosen.softNotes.length ? " · " + chosen.softNotes.join(" · ") : ""}`);
  if (absentSessions.length) console.log(`   ⚠️ ${absentSessions.length} séance(s) sur ses jours d'absence : ${absentSessions.map((s) => fmt(s.localDate)).join(", ")}`);
  console.log(`   Salle : ${room ? room.name + (room.hardViolations.length ? " ❌ " + room.hardViolations.join(" ; ") : " ✅") : "aucune ✅"}${forced.roomAlternatives.filter((r) => !r.hardViolations.length && r.roomId !== room?.roomId).length ? " · autres possibles : " + forced.roomAlternatives.filter((r) => !r.hardViolations.length && r.roomId !== room?.roomId).map((r) => r.name).join(", ") : ""}`);
  console.log(`   ${forced.sessions.length} séances, ${forced.totals.hours} h, fin le ${fmt(forced.totals.endsOn)}, coût formateur ≈ ${forced.totals.cost ?? "?"} €, ${forced.totals.skippedClosures.length} jours sautés`);
  for (const w of forced.warnings) console.log(`   ⚠️ ${w.message}`);
  const others = real.trainerAlternatives.filter((t) => t.trainerId !== wanted.id);
  console.log(`   Moteur seul aurait choisi : ${real.trainer ? real.trainer.name : "personne"} · autres : ${others.map((t) => `${t.name} (${t.hardViolations.length ? t.hardViolations[0] : "éligible"})`).join(" | ")}`);

  // Occupation pour les groupes suivants (formateur voulu + salle retenue)
  for (const s of forced.sessions) {
    wanted.busy.push({ startsAt: s.startsAt, endsAt: s.endsAt });
    if (room) data.rooms.find((r) => r.id === room.roomId)!.busy.push({ startsAt: s.startsAt, endsAt: s.endsAt });
  }
}
// Export du payload de création (groupes + séances) si OUT=fichier.json — mêmes champs que
// la RPC create_group_with_sessions (voir commitProposal dans groupes/actions.ts).
if (process.env.OUT) {
  const out: unknown[] = [];
  const names: Record<string, string> = { PEF_A2: "PEF A2 — 2026-27", PEF_A1: "PEF A1 — 2026-27", CMSTOA1: "Cours municipaux A1 — Cordon", CMSTOA2: "Cours municipaux A2 — Landy", CMSTOB1: "Cours municipaux B1 — Berthoud" };
  for (const g of sc.groups) {
    const p = prog(g.code);
    const wanted = data.trainers.find((t) => t.id === trainerId(g.trainer))!;
    const savedAbs = wanted.absences; wanted.absences = [];
    // busy déjà rempli par la boucle ci-dessus → on retire ses propres séances avant de recalculer
    const proposal = proposeGroupPlan({
      programId: p.id, totalHours: Number(p.h), level: p.vise, requiredSkills: p.skills ?? [], defaultWeeklyHours: Number(p.h_sem),
      startsOn: g.startsOn, weeklyPattern: g.pattern, preferredTrainerId: wanted.id, preferredRoomId: roomId(g.room),
      expectedHeadcount: g.room === "Berthoud" ? 8 : 12, skipSchoolHolidays: g.skipHolidays,
    }, { ...data, trainers: data.trainers.map((t) => ({ ...t, busy: [] })), rooms: data.rooms.map((r) => ({ ...r, busy: [] })) });
    wanted.absences = savedAbs;
    out.push({
      org_id: raw.org.id, program_id: p.id, funder_id: p.financeur_id, name: names[g.code] ?? g.label,
      starts_on: g.startsOn, ends_on: proposal.totals.endsOn, total_hours: Number(p.h), trainer_id: wanted.id, room_id: roomId(g.room),
      capacity: g.room === "Berthoud" ? 8 : 12, weekly_pattern: g.pattern, skip_school_holidays: g.skipHolidays,
      notes: `Créé le 09/09/2026 depuis la simulation de rentrée (scénario ${scenario}).`,
      sessions: proposal.sessions.map((x) => ({ starts_at: x.startsAt, ends_at: x.endsAt })),
    });
  }
  writeFileSync(process.env.OUT, JSON.stringify({ groups: out }, null, 1));
  console.log(`payload écrit : ${process.env.OUT} (${out.length} groupes, ${out.reduce((n: number, g: any) => n + g.sessions.length, 0)} séances)`);
}

// Charge hebdo résultante par formateur (semaine type d'octobre)
console.log("\nCharge hebdo (semaine du 5 oct.) :");
for (const t of data.trainers) {
  const h = t.busy.filter((b) => b.startsAt >= "2026-10-05" && b.startsAt < "2026-10-12").reduce((s, b) => s + (new Date(b.endsAt).getTime() - new Date(b.startsAt).getTime()) / 3600000, 0);
  console.log(`   ${t.firstName.trim()} : ${h} h / ${t.weeklyHoursMax} h`);
}
