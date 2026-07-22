// Types partagés du moteur d'affectation.
// Le moteur est PUR : il reçoit un EngineData déjà chargé (loader.ts) et ne touche jamais la base.

export type SlotPattern = {
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1 = lundi (ISO)
  start: string; // 'HH:mm' heure locale
  end: string;
};

export type ClosureKind = "jour_ferie" | "vacances_scolaires" | "fermeture_org";

export type Closure = {
  startsOn: string; // 'YYYY-MM-DD' inclusif
  endsOn: string;
  label: string;
  kind: ClosureKind;
};

export type ProposedSession = {
  startsAt: string; // ISO UTC
  endsAt: string;
  localDate: string; // 'YYYY-MM-DD' — jour local de la séance
  hours: number;
};

export type SkippedDay = { date: string; label: string };

export type Interval = { startsAt: string; endsAt: string };

export type TrainerData = {
  id: string;
  firstName: string;
  lastName: string;
  contractType: "salarie" | "vacataire";
  hourlyCost: number;
  weeklyHoursMax: number;
  priority: number;
  skills: string[];
  isActive: boolean;
  availabilities: { weekday: number; start: string; end: string }[];
  absences: { startsOn: string; endsOn: string }[];
  busy: Interval[]; // séances existantes non annulées
  currentGroupLevels: string[]; // niveaux des groupes en cours (bonus continuité)
};

export type RoomData = {
  id: string;
  name: string;
  capacity: number;
  isActive: boolean;
  unavailabilities: { startsOn: string; endsOn: string }[];
  busy: Interval[];
};

export type ProposalInput = {
  programId: string;
  totalHours: number;
  level: string | null;
  requiredSkills: string[];
  defaultWeeklyHours: number | null;
  startsOn: string; // 'YYYY-MM-DD'
  weeklyPattern?: SlotPattern[]; // si le coordinateur impose un rythme
  preferredTrainerId?: string;
  preferredRoomId?: string;
  expectedHeadcount?: number;
  // false = le groupe a cours pendant les vacances scolaires (fériés et fermetures org toujours exclus).
  skipSchoolHolidays?: boolean;
};

export type EngineData = {
  trainers: TrainerData[];
  rooms: RoomData[];
  closures: Closure[];
  timezone: string; // 'Europe/Paris'
};

export type RankedTrainer = {
  trainerId: string;
  name: string;
  contractType: "salarie" | "vacataire";
  hourlyCost: number;
  priority: number;
  score: number;
  projectedCost: number;
  hardViolations: string[]; // vide si éligible
  softNotes: string[];
};

export type RankedRoom = {
  roomId: string;
  name: string;
  capacity: number;
  hardViolations: string[];
  softNotes: string[];
};

export type Warning = { code: string; message: string };

export type Proposal = {
  trainer: RankedTrainer | null; // null = aucun formateur éligible
  trainerAlternatives: RankedTrainer[]; // classement complet, retenu inclus
  room: RankedRoom | null;
  roomAlternatives: RankedRoom[];
  weeklyPattern: SlotPattern[];
  sessions: ProposedSession[];
  totals: {
    hours: number;
    cost: number | null;
    endsOn: string | null;
    skippedClosures: SkippedDay[];
  };
  warnings: Warning[];
};
