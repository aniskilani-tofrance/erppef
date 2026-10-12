import { toWhatsAppNumber } from "@/lib/admission/phone";

// Contacts d'un groupe au format vCard (.vcf) : un seul fichier, une fiche par inscrit,
// à ouvrir sur le téléphone (iPhone : « Ajouter les n contacts » ; Android : Contacts →
// Importer). Le fichier est une copie : le téléphone ne revient jamais le relire. D'où
// « Nouveaux depuis mon dernier import » (pas de doublons) et « À retirer » (départs),
// calculés d'après le journal des imports de chaque utilisateur (group_contact_exports).

export type ContactMode = "tout" | "nouveaux";

export type GroupMember = {
  learnerId: string;
  firstName: string;
  lastName: string;
  learnerNo: number | null;
  phone: string | null;
  status: string; // statut de l'inscription : inscrit, abandon, termine…
};

export type GroupInfo = { name: string; groupNo: number | null };

export type ContactSelection = {
  toExport: GroupMember[]; // dans le fichier
  noPhone: GroupMember[]; // inscrits sans numéro exploitable (exclus, listés à l'écran)
  newCount: number; // inscrits avec numéro jamais importés par cet utilisateur
  toRemove: GroupMember[]; // importés par cet utilisateur, qui ne sont plus inscrits
};

const byName = (a: GroupMember, b: GroupMember) =>
  `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "fr");

/** Numéro au format international (+33612345678), ou null s'il est inexploitable. */
export function internationalPhone(raw: string | null | undefined): string | null {
  const digits = toWhatsAppNumber(raw);
  return digits ? `+${digits}` : null;
}

/**
 * Qui mettre dans le fichier. `alreadyImported` = apprenants déjà présents dans un
 * import précédent de cet utilisateur pour ce groupe.
 */
export function selectContacts(members: GroupMember[], alreadyImported: Set<string>, mode: ContactMode): ContactSelection {
  const active = members.filter((m) => m.status === "inscrit");
  const withPhone = active.filter((m) => internationalPhone(m.phone));
  const fresh = withPhone.filter((m) => !alreadyImported.has(m.learnerId));
  const activeIds = new Set(active.map((m) => m.learnerId));
  return {
    toExport: (mode === "nouveaux" ? fresh : withPhone).sort(byName),
    noPhone: active.filter((m) => !internationalPhone(m.phone)).sort(byName),
    newCount: fresh.length,
    toRemove: members.filter((m) => alreadyImported.has(m.learnerId) && !activeIds.has(m.learnerId)).sort(byName),
  };
}

/** Référence courte du groupe telle qu'on la dit à l'oral (G-5). */
export function shortGroupRef(groupNo: number | null): string | null {
  return groupNo == null ? null : `G-${groupNo}`;
}

// Échappement d'une valeur texte vCard (RFC 6350 §3.4).
function esc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\;");
}

// Lignes de plus de 75 octets repliées (CRLF + espace), sans couper un caractère UTF-8.
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  const limit = () => (parts.length === 0 ? 75 : 74); // la suite commence par une espace
  for (const ch of line) {
    const size = enc.encode(ch).length;
    if (bytes + size > limit()) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** Une fiche contact : « Prénom NOM · G-5 », société « ParlerEmploi Formation · groupe ». */
export function buildVCard(m: GroupMember, group: GroupInfo, exportedOn: string): string {
  const ref = shortGroupRef(group.groupNo);
  const phone = internationalPhone(m.phone);
  const learnerNo = m.learnerNo == null ? null : `A-${String(m.learnerNo).padStart(4, "0")}`;
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(m.lastName)};${esc(m.firstName)};;;`,
    `FN:${esc(`${m.firstName} ${m.lastName}${ref ? ` · ${ref}` : ""}`)}`,
    `ORG:ParlerEmploi Formation;${esc(group.name)}`,
    ...(phone ? [`TEL;TYPE=CELL:${phone}`] : []),
    `NOTE:${esc([learnerNo, `Groupe ${group.name}`, `importé de l'ERP le ${exportedOn}`].filter(Boolean).join(" — "))}`,
    `UID:urn:uuid:${m.learnerId}`,
    "END:VCARD",
  ];
  return lines.map(foldLine).join("\r\n");
}

/** Le fichier complet (plusieurs fiches à la suite), terminé par CRLF. */
export function buildVcf(members: GroupMember[], group: GroupInfo, exportedOn: string): string {
  return members.map((m) => buildVCard(m, group, exportedOn)).join("\r\n") + "\r\n";
}

/** Nom du fichier téléchargé : contacts-g-5-nouveaux.vcf */
export function vcfFileName(group: GroupInfo, mode: ContactMode): string {
  const base = (shortGroupRef(group.groupNo) ?? group.name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `contacts-${base || "groupe"}${mode === "nouveaux" ? "-nouveaux" : ""}.vcf`;
}

/**
 * Droit de télécharger les contacts d'un groupe : direction et coordination partout ;
 * formatrice seulement si elle anime le groupe (formatrice principale, ou une séance en
 * animation ou co-animation) ; stagiaire seulement s'il est rattaché au groupe.
 */
export function canExportContacts(input: {
  role: string;
  groupId: string;
  myTrainerId: string | null;
  groupTrainerIds: string[]; // formatrice principale + formatrices des séances (co-animation comprise)
  myInternGroupIds: string[];
}): boolean {
  if (input.role === "admin" || input.role === "coordinator") return true;
  if (input.role === "trainer") return !!input.myTrainerId && input.groupTrainerIds.includes(input.myTrainerId);
  if (input.role === "stagiaire") return input.myInternGroupIds.includes(input.groupId);
  return false;
}
