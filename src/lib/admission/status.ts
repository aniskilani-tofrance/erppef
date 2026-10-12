// Parcours d'admission d'un apprenant : du premier contact à l'inscription.
// Les statuts sont ordonnés ; on avance, on ne recule jamais automatiquement
// (un « injoignable » qui répond redevient « contacté », mais un « convoqué »
// qui ne répond pas à une relance reste « convoqué »). Seul « sans suite »
// est une sortie explicite, et « inscrit » (dans un groupe) est définitif.
// « Liste d'attente » ≠ « Sans suite » :
// - liste d'attente = la personne VEUT venir, mais la place proposée ne convenait pas
//   (horaire, garde d'enfant…) ou aucun groupe compatible n'existe : on la reproposera ;
// - sans suite = le dossier est CLOS (plus intéressé, déménagé, injoignable après
//   relances…) : on ne relance plus, sauf si la personne revient d'elle-même.
// Chacun porte un motif (ADMISSION_REASONS), noté dans le carnet de contact.

export const ADMISSION_STATUSES = [
  { code: "nouveau", label: "Nouveau", rank: 0, hint: "Jamais contacté" },
  { code: "injoignable", label: "Injoignable", rank: 1, hint: "Sans réponse — à relancer" },
  { code: "contacte", label: "Contacté", rank: 2, hint: "Échange engagé" },
  { code: "convoque", label: "Convoqué", rank: 3, hint: "Convoqué à une réunion d'information" },
  { code: "evalue", label: "Évalué", rank: 4, hint: "Entretien oral fait" },
  { code: "liste_attente", label: "Liste d'attente", rank: 5, hint: "Veut venir, pas de place qui convient — à reproposer" },
  { code: "inscrit", label: "Inscrit", rank: 6, hint: "Inscrit dans un groupe" },
  { code: "sans_suite", label: "Sans suite", rank: 7, hint: "Dossier clos — on ne relance plus" },
] as const;

export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number]["code"];
export const ADMISSION_STATUS_CODES = ADMISSION_STATUSES.map((s) => s.code) as [AdmissionStatus, ...AdmissionStatus[]];

export function admissionLabel(code: string | null | undefined): string {
  return ADMISSION_STATUSES.find((s) => s.code === code)?.label ?? "Nouveau";
}

// Classes Tailwind du badge (variant outline + couleur) : lisible d'un coup d'œil dans la liste.
export function admissionBadgeClass(code: string | null | undefined): string {
  switch (code) {
    case "injoignable":
      return "border-red-300 bg-red-50 text-red-700";
    case "contacte":
      return "border-sky-300 bg-sky-50 text-sky-800";
    case "convoque":
      return "border-violet-300 bg-violet-50 text-violet-800";
    case "evalue":
      return "border-teal-300 bg-teal-50 text-teal-800";
    case "liste_attente":
      return "border-orange-300 bg-orange-50 text-orange-800";
    case "inscrit":
      return "border-emerald-300 bg-emerald-50 text-emerald-800";
    case "sans_suite":
      return "border-gray-300 bg-gray-100 text-gray-600";
    default:
      return "border-amber-300 bg-amber-50 text-amber-800";
  }
}

function rankOf(code: string | null | undefined): number {
  return ADMISSION_STATUSES.find((s) => s.code === code)?.rank ?? 0;
}

// Statut résultant d'un événement automatique (convocation envoyée, entretien oral fait,
// inscription…) : on ne recule jamais, « inscrit » est définitif, « sans suite »
// redevient actif si la personne reprend contact.
export function nextAdmissionStatus(
  current: string | null | undefined,
  candidate: AdmissionStatus,
): AdmissionStatus {
  const cur = (ADMISSION_STATUSES.some((s) => s.code === current) ? current : "nouveau") as AdmissionStatus;
  if (cur === "inscrit") return "inscrit";
  if (candidate === "inscrit") return "inscrit";
  if (candidate === "sans_suite") return "sans_suite";
  if (cur === "sans_suite") return candidate;
  return rankOf(candidate) > rankOf(cur) ? candidate : cur;
}

export const CONTACT_CHANNELS = [
  { code: "whatsapp", label: "WhatsApp" },
  { code: "telephone", label: "Appel téléphonique" },
  { code: "sms", label: "SMS" },
  { code: "email", label: "Email" },
  { code: "presentiel", label: "En personne" },
] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number]["code"];

export const CONTACT_OUTCOMES = [
  { code: "message_envoye", label: "Message envoyé (en attente de réponse)", status: "contacte" },
  { code: "joint", label: "Joint — échange fait", status: "contacte" },
  { code: "sans_reponse", label: "Sans réponse", status: "injoignable" },
  { code: "convoque", label: "Convoqué à une réunion", status: "convoque" },
  { code: "place_refusee", label: "Place refusée — liste d'attente", status: "liste_attente" },
  { code: "refus", label: "Ne donne pas suite — dossier clos", status: "sans_suite" },
  { code: "autre", label: "Autre", status: null },
] as const;
export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number]["code"];

// Motifs de sortie du parcours : ce qui distingue une liste d'attente (on reproposera)
// d'un « sans suite » (dossier clos). Obligatoire dans « Noter un contact » quand le
// statut choisi est l'un des deux ; enregistré sur le contact (learner_contacts.reason).
export const ADMISSION_REASONS = [
  { code: "horaire_incompatible", label: "Horaires incompatibles", status: "liste_attente" },
  { code: "garde_enfant", label: "Garde d'enfant", status: "liste_attente" },
  { code: "groupe_complet", label: "Groupe complet", status: "liste_attente" },
  { code: "pas_de_groupe_niveau", label: "Pas de groupe à son niveau", status: "liste_attente" },
  { code: "indisponible_temporaire", label: "Indisponible pour l'instant (santé, voyage…)", status: "liste_attente" },
  { code: "attente_autre", label: "Autre raison (voir la note)", status: "liste_attente" },
  { code: "plus_interesse", label: "Ne souhaite plus suivre la formation", status: "sans_suite" },
  { code: "injoignable_definitif", label: "Injoignable après plusieurs relances", status: "sans_suite" },
  { code: "demenagement", label: "A déménagé, hors territoire", status: "sans_suite" },
  { code: "emploi_ou_formation", label: "A trouvé un emploi ou une autre formation", status: "sans_suite" },
  { code: "hors_public", label: "Ne correspond pas au public du cours", status: "sans_suite" },
  { code: "sans_suite_autre", label: "Autre raison (voir la note)", status: "sans_suite" },
] as const;
export type AdmissionReason = (typeof ADMISSION_REASONS)[number]["code"];
export const ADMISSION_REASON_CODES = ADMISSION_REASONS.map((r) => r.code) as [AdmissionReason, ...AdmissionReason[]];

export function needsReason(status: string | null | undefined): status is "liste_attente" | "sans_suite" {
  return status === "liste_attente" || status === "sans_suite";
}
export function reasonsFor(status: string | null | undefined) {
  return ADMISSION_REASONS.filter((r) => r.status === status);
}
export function reasonLabel(code: string | null | undefined): string | null {
  return ADMISSION_REASONS.find((r) => r.code === code)?.label ?? null;
}
// Un motif n'a de sens qu'avec son statut : un motif de liste d'attente sur un
// « sans suite » (ou sur tout autre statut) est ignoré.
export function reasonFits(reason: string | null | undefined, status: string | null | undefined): boolean {
  return !!reason && ADMISSION_REASONS.some((r) => r.code === reason && r.status === status);
}

export function channelLabel(code: string | null | undefined): string {
  return CONTACT_CHANNELS.find((c) => c.code === code)?.label ?? (code ?? "—");
}
export function outcomeLabel(code: string | null | undefined): string {
  return CONTACT_OUTCOMES.find((o) => o.code === code)?.label ?? (code ?? "—");
}

// Statut proposé dans le dialog « Noter un contact » à partir du résultat choisi.
export function suggestedStatus(outcome: ContactOutcome, current: string | null | undefined): AdmissionStatus {
  const target = CONTACT_OUTCOMES.find((o) => o.code === outcome)?.status;
  const cur = (ADMISSION_STATUSES.some((s) => s.code === current) ? current : "nouveau") as AdmissionStatus;
  if (!target) return cur;
  // « Sans réponse » sur quelqu'un déjà convoqué/évalué : on garde l'avancement.
  if (target === "injoignable" && rankOf(cur) >= rankOf("contacte") && cur !== "sans_suite") return cur;
  return nextAdmissionStatus(cur, target);
}

export const INVITATION_STATUSES = [
  { code: "a_envoyer", label: "À envoyer" },
  { code: "envoyee", label: "Envoyée" },
  { code: "confirmee", label: "Confirmée" },
  { code: "presente", label: "Présent(e)" },
  { code: "absente", label: "Absent(e)" },
  { code: "excusee", label: "Excusé(e)" },
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number]["code"];
export const INVITATION_STATUS_CODES = INVITATION_STATUSES.map((s) => s.code) as [InvitationStatus, ...InvitationStatus[]];

export function invitationLabel(code: string | null | undefined): string {
  return INVITATION_STATUSES.find((s) => s.code === code)?.label ?? "À envoyer";
}
export function invitationBadgeClass(code: string | null | undefined): string {
  switch (code) {
    case "envoyee":
      return "border-sky-300 bg-sky-50 text-sky-800";
    case "confirmee":
      return "border-violet-300 bg-violet-50 text-violet-800";
    case "presente":
      return "border-emerald-300 bg-emerald-50 text-emerald-800";
    case "absente":
      return "border-red-300 bg-red-50 text-red-700";
    case "excusee":
      return "border-gray-300 bg-gray-100 text-gray-600";
    default:
      return "border-amber-300 bg-amber-50 text-amber-800";
  }
}
