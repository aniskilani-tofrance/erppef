// Lecture partagée du volet Candidats POEI. Serveur uniquement.

export type CandidateRow = {
  id: string;
  candidate_no: number | null;
  source: string;
  learner_id: string | null;
  from_lead_id: string | null;
  placed_lead_id: string | null;
  first_name: string | null;
  last_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  ft_status: string;
  ft_id: string | null;
  income: string | null;
  french_level: string | null;
  goal: string | null;
  target_job: string | null;
  experience: string | null;
  availability: string | null;
  mobility: string | null;
  work_permit: string;
  constraints: string | null;
  consent_at: string | null;
  consent_channel: string | null;
  status: string;
  lost_reason: string | null;
  owner_user_id: string | null;
  next_action: string | null;
  next_action_on: string | null;
  attempts: number;
  last_contact_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const CANDIDATE_COLUMNS =
  "id, candidate_no, source, learner_id, from_lead_id, placed_lead_id, first_name, last_name, phone, email, city, ft_status, ft_id, " +
  "income, french_level, goal, target_job, experience, availability, mobility, work_permit, constraints, consent_at, consent_channel, " +
  "status, lost_reason, owner_user_id, next_action, next_action_on, attempts, last_contact_at, notes, created_at, updated_at";

export type CandidateEventRow = {
  id: string;
  at: string;
  kind: string;
  outcome: string | null;
  note: string | null;
  by_user_id: string | null;
};

// Combien de questions de qualification ont une réponse (sur 10, consentement compris).
export function qualificationProgress(c: CandidateRow): number {
  const answered = [
    c.ft_status !== "inconnu",
    Boolean(c.income),
    Boolean(c.goal),
    Boolean(c.target_job),
    Boolean(c.experience),
    Boolean(c.availability),
    Boolean(c.mobility),
    c.work_permit !== "inconnu",
    Boolean(c.constraints),
    Boolean(c.consent_at),
  ];
  return answered.filter(Boolean).length;
}
