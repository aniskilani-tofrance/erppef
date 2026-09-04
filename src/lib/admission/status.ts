// Parcours d'admission d'un apprenant : du premier contact à l'inscription.
// Les statuts sont ordonnés ; on avance, on ne recule jamais automatiquement
// (un « injoignable » qui répond redevient « contacté », mais un « convoqué »
// qui ne répond pas à une relance reste « convoqué »). Seul « sans suite »
// est une sortie explicite, et « inscrit » (dans un groupe) est définitif.

export const ADMISSION_STATUSES = [
  { code: "nouveau", label: "Nouveau", rank: 0, hint: "Jamais contacté" },
  { code: "injoignable", label: "Injoignable", rank: 1, hint: "Sans réponse — à relancer" },
  { code: "contacte", label: "Contacté", rank: 2, hint: "Échange engagé" },
  { code: "convoque", label: "Convoqué", rank: 3, hint: "Convoqué à une réunion d'information" },
  { code: "evalue", label: "Évalué", rank: 4, hint: "Test oral fait" },
  { code: "inscrit", label: "Inscrit", rank: 5, hint: "Inscrit dans un groupe" },
  { code: "sans_suite", label: "Sans suite", rank: 6, hint: "Ne donne pas suite" },
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

// Statut résultant d'un événement automatique (convocation envoyée, test oral fait,
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
  { code: "refus", label: "Ne donne pas suite", status: "sans_suite" },
  { code: "autre", label: "Autre", status: null },
] as const;
export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number]["code"];

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
