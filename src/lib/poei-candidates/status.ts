// Candidats POEI : les PERSONNES à placer en POEI restauration (les employeurs sont dans
// les leads resto). Deux entrées : un apprenant de l'association (« Proposer en POEI »)
// ou un lead resto mal qualifié (« C'est un candidat, pas un employeur »).
// Garde-fou RGPD : association et SASU sont deux entités — sans consentement recueilli,
// pas de qualification ni de positionnement chez un employeur.

export const CANDIDATE_STATUSES = [
  { code: "a_qualifier", label: "À qualifier", hint: "Appeler, poser les questions, recueillir le consentement", final: false, needsConsent: false },
  { code: "a_rappeler", label: "À rappeler", hint: "Injoignable ou créneau convenu", final: false, needsConsent: false },
  { code: "qualifie", label: "Qualifié", hint: "Questions posées, consentement recueilli, profil compatible", final: false, needsConsent: true },
  { code: "positionne", label: "Positionné", hint: "Présenté à un restaurateur (lead resto)", final: false, needsConsent: true },
  { code: "poei_signee", label: "POEI signée", hint: "Convention signée — en formation", final: true, needsConsent: true },
  { code: "sans_suite", label: "Sans suite", hint: "Pas intéressé, pas éligible ou injoignable — raison notée", final: true, needsConsent: false },
] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number]["code"];
export const CANDIDATE_STATUS_CODES = CANDIDATE_STATUSES.map((s) => s.code) as [CandidateStatus, ...CandidateStatus[]];

export function candidateStatusLabel(code: string | null | undefined): string {
  return CANDIDATE_STATUSES.find((s) => s.code === code)?.label ?? "À qualifier";
}
export function isFinalCandidateStatus(code: string | null | undefined): boolean {
  return CANDIDATE_STATUSES.find((s) => s.code === code)?.final ?? false;
}
export function statusNeedsConsent(code: string | null | undefined): boolean {
  return CANDIDATE_STATUSES.find((s) => s.code === code)?.needsConsent ?? false;
}

/** Le passage à un statut est-il permis ? (même règle que la contrainte en base) */
export function canMoveTo(status: string, consentAt: string | null | undefined): { ok: true } | { ok: false; error: string } {
  if (statusNeedsConsent(status) && !consentAt) {
    return { ok: false, error: "Recueillez d'abord le consentement du candidat (transmission de ses coordonnées pour la POEI)." };
  }
  return { ok: true };
}

export function candidateStatusBadgeClass(code: string | null | undefined): string {
  switch (code) {
    case "a_rappeler":
      return "border-amber-300 bg-amber-50 text-amber-800";
    case "qualifie":
      return "border-violet-300 bg-violet-50 text-violet-800";
    case "positionne":
      return "border-teal-300 bg-teal-50 text-teal-800";
    case "poei_signee":
      return "border-emerald-400 bg-emerald-100 text-emerald-900";
    case "sans_suite":
      return "border-zinc-300 bg-zinc-100 text-zinc-600";
    default:
      return "border-red-300 bg-red-50 text-red-700"; // à qualifier
  }
}

export const CANDIDATE_SOURCES = [
  { code: "asso_pef", label: "Apprenant de l'association" },
  { code: "lead_resto", label: "Lead resto requalifié" },
  { code: "direct", label: "Contact direct" },
  { code: "prescripteur", label: "Prescripteur (France Travail, mission locale…)" },
  { code: "autre", label: "Autre" },
] as const;
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number]["code"];
export const CANDIDATE_SOURCE_CODES = CANDIDATE_SOURCES.map((s) => s.code) as [CandidateSource, ...CandidateSource[]];
export function candidateSourceLabel(code: string | null | undefined): string {
  return CANDIDATE_SOURCES.find((s) => s.code === code)?.label ?? "—";
}

export const FT_STATUSES = [
  { code: "inscrit", label: "Inscrit(e)" },
  { code: "non_inscrit", label: "Pas inscrit(e) — à faire avant la POEI" },
  { code: "inconnu", label: "Pas demandé" },
] as const;
export const FT_STATUS_CODES = FT_STATUSES.map((s) => s.code) as [string, ...string[]];

export const WORK_PERMITS = [
  { code: "oui", label: "Oui" },
  { code: "non", label: "Non" },
  { code: "a_verifier", label: "À vérifier (document à voir)" },
  { code: "inconnu", label: "Pas demandé" },
] as const;
export const WORK_PERMIT_CODES = WORK_PERMITS.map((s) => s.code) as [string, ...string[]];

export const CONSENT_CHANNELS = [
  { code: "telephone", label: "Au téléphone" },
  { code: "sur_place", label: "Sur place" },
  { code: "whatsapp", label: "Par WhatsApp" },
  { code: "sms", label: "Par SMS" },
  { code: "email", label: "Par email" },
  { code: "formulaire", label: "Formulaire signé" },
] as const;
export const CONSENT_CHANNEL_CODES = CONSENT_CHANNELS.map((s) => s.code) as [string, ...string[]];

export const CANDIDATE_EVENT_KINDS = [
  { code: "appel", label: "Appel" },
  { code: "whatsapp", label: "WhatsApp" },
  { code: "sms", label: "SMS" },
  { code: "email", label: "Email" },
  { code: "note", label: "Note" },
] as const;
export const CANDIDATE_EVENT_KIND_CODES = CANDIDATE_EVENT_KINDS.map((s) => s.code) as [string, ...string[]];
export const CANDIDATE_EVENT_OUTCOMES = [
  { code: "joint", label: "Joint(e)" },
  { code: "messagerie", label: "Messagerie / pas de réponse" },
  { code: "rappel_convenu", label: "Rappel convenu" },
  { code: "envoye", label: "Message envoyé" },
  { code: "refus", label: "Pas intéressé(e)" },
  { code: "autre", label: "Autre" },
] as const;
export const CANDIDATE_EVENT_OUTCOME_CODES = CANDIDATE_EVENT_OUTCOMES.map((s) => s.code) as [string, ...string[]];

export function candidateEventKindLabel(code: string): string {
  const all: { code: string; label: string }[] = [
    ...CANDIDATE_EVENT_KINDS,
    { code: "statut", label: "Statut" },
    { code: "consentement", label: "Consentement" },
    { code: "creation", label: "Création" },
  ];
  return all.find((k) => k.code === code)?.label ?? code;
}
export function candidateEventOutcomeLabel(code: string | null | undefined): string | null {
  return code ? CANDIDATE_EVENT_OUTCOMES.find((o) => o.code === code)?.label ?? code : null;
}

export const CANDIDATE_LOST_REASONS = [
  "Pas intéressé(e) par la restauration",
  "Injoignable après 5 tentatives",
  "Pas d'autorisation de travail",
  "A trouvé un emploi / une formation",
  "Indisponible (horaires, garde d'enfants, santé)",
  "Refuse la transmission de ses coordonnées",
  "Autre",
] as const;

// Les questions à poser AVANT de positionner un candidat — l'ordre de l'appel.
export const QUALIFICATION_QUESTIONS = [
  { field: "ft_status", label: "1. France Travail", question: "Êtes-vous inscrit(e) à France Travail ? Depuis quand, avec quel identifiant ?" },
  { field: "income", label: "2. Ressources", question: "Touchez-vous l'ARE, le RSA, autre chose ?" },
  { field: "goal", label: "3. Projet", question: "Quel est votre projet (et pourquoi viser ce niveau de français) ?" },
  { field: "target_job", label: "4. Restauration", question: "La restauration vous intéresse-t-elle ? Quel poste : salle, cuisine, polyvalent, plonge ?" },
  { field: "experience", label: "5. Expérience", question: "Avez-vous déjà travaillé en restauration, en France ou ailleurs ?" },
  { field: "availability", label: "6. Disponibilités", question: "Horaires coupés, soirs, week-ends : c'est possible ?" },
  { field: "mobility", label: "7. Mobilité", question: "Jusqu'où pouvez-vous aller, et comment ?" },
  { field: "work_permit", label: "8. Autorisation de travail", question: "Avez-vous une autorisation de travail valable ?" },
  { field: "constraints", label: "9. Contraintes", question: "Enfants, santé, station debout : une contrainte à connaître ?" },
  { field: "consent", label: "10. Consentement", question: "Acceptez-vous que ParlerEmploi transmette vos coordonnées à un restaurateur pour la POEI ?" },
] as const;

export function candidateRef(no: number | null | undefined): string {
  return no == null ? "—" : `C-${String(no).padStart(4, "0")}`;
}

/** Découpe « Prénom Nom » d'un contact de lead : le dernier mot est le nom. */
export function splitContactName(raw: string | null | undefined): { firstName: string | null; lastName: string } {
  const parts = (raw ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: "À compléter" };
  if (parts.length === 1) return { firstName: null, lastName: parts[0] };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/** Nom affiché : « Prénom NOM », sans les « ? » des fiches importées incomplètes. */
export function candidateDisplayName(c: { first_name: string | null; last_name: string }): string {
  const first = (c.first_name ?? "").trim();
  return [first && first !== "?" ? first : null, c.last_name].filter(Boolean).join(" ");
}

// Premier message WhatsApp (relu et envoyé par la personne connectée).
export function firstContactMessage(c: { first_name: string | null; last_name: string; source: string }, senderFirstName: string | null): string {
  const first = (c.first_name ?? "").trim();
  const hello = first && first !== "?" ? `Bonjour ${first}` : "Bonjour";
  const who = senderFirstName ? `${senderFirstName}, de ParlerEmploi` : "ParlerEmploi";
  const context = c.source === "asso_pef"
    ? "Vous êtes inscrit(e) chez nous pour les cours de français."
    : "Vous nous avez laissé vos coordonnées au sujet de la restauration.";
  return `${hello}, c'est ${who}. ${context} Nous préparons des personnes à un poste en restauration chez un employeur qui recrute (POEI, avec France Travail). Est-ce que cela vous intéresse ? Si oui, à quel moment puis-je vous appeler 10 minutes ?`;
}
