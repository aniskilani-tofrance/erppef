import type { AppRole } from "@/lib/auth";

// Documents que signe chaque apprenant des COURS PEF et des ATELIERS : bulletin d'adhésion
// à l'association (cotisation annuelle), contrat de formation (L6353-3 à L6353-7) et
// règlement intérieur (L6352-3, R6352-1 et suivants). Règles pures, sans base : testables.
//
// RÈGLE « qui signe » : un groupe est concerné quand il est financé par l'association
// elle-même — financeur de code « PEF » (« ParlerEmploi Formation »), celui du groupe ou, à
// défaut, celui du dispositif. C'est le cas des cours PEF A1/A2 et des ateliers bénévoles
// (dispositifs BEN_…). Les cours municipaux de la Ville de Saint-Ouen (financeur STO…,
// dispositif CMSTO…, nom « Cours municipaux ») ne le sont JAMAIS : ils ont leur propre cadre
// financeur. Les autres financeurs (France Travail, CPF, Ville RH…) ont leur convention.

export const SIGNED_DOCUMENT_KINDS = ["adhesion", "contrat_formation", "reglement_interieur"] as const;
export type SignedDocumentKind = (typeof SIGNED_DOCUMENT_KINDS)[number];

export const DOCUMENT_LABELS: Record<SignedDocumentKind, string> = {
  adhesion: "Bulletin d'adhésion",
  contrat_formation: "Contrat de formation",
  reglement_interieur: "Règlement intérieur",
};

/** Version des textes : changer la date quand un texte change (la nouvelle version est à re-signer). */
export const DOCUMENT_TEXT_VERSIONS: Record<SignedDocumentKind, string> = {
  adhesion: "2026-11-01",
  contrat_formation: "2026-11-01",
  reglement_interieur: "2026-11-01",
};

export const ASSOCIATION_FUNDER_CODE = "PEF";
export const COTISATION_EUROS = 40;
// Année d'adhésion : du 1er septembre au 31 août (l'année des cours).
export const MEMBERSHIP_YEAR_START_MONTH = 9;
// Délai pour changer d'avis : 10 jours (L6353-5), 14 jours pour un contrat signé à distance.
export const RETRACTATION_DAYS = { sur_place: 10, lien: 14 } as const;
// Durée de validité des liens : lien WhatsApp 30 jours, tablette sur place 2 heures.
export const LINK_TTL_MS = { sur_place: 2 * 3_600_000, lien: 30 * 24 * 3_600_000 } as const;

export type SigningChannel = keyof typeof RETRACTATION_DAYS;

export const PAYMENT_METHODS = [
  { code: "especes", label: "Espèces" },
  { code: "cheque", label: "Chèque" },
  { code: "virement", label: "Virement" },
  { code: "carte", label: "Carte bancaire" },
  { code: "helloasso", label: "HelloAsso (en ligne)" },
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["code"];
export const PAYMENT_METHOD_CODES = PAYMENT_METHODS.map((m) => m.code) as [PaymentMethod, ...PaymentMethod[]];

export function paymentMethodLabel(code: string | null | undefined): string {
  return PAYMENT_METHODS.find((m) => m.code === code)?.label ?? "—";
}

// ── Quels groupes ? ─────────────────────────────────────────────────────────

export type GroupForRule = {
  funderCode: string | null; // financeur du groupe
  programDefaultFunderCode?: string | null; // financeur par défaut du dispositif
  programCode?: string | null;
  programName?: string | null;
  groupName?: string | null;
};

const up = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

/** Cours municipaux de la Ville de Saint-Ouen : jamais concernés (cadre financeur propre). */
export function isMunicipalCourse(g: GroupForRule): boolean {
  return (
    up(g.funderCode).startsWith("STO") ||
    up(g.programCode).startsWith("CMSTO") ||
    /cours\s+municipaux/i.test(g.programName ?? "") ||
    /cours\s+municipaux/i.test(g.groupName ?? "")
  );
}

/** Le groupe demande-t-il adhésion + contrat + règlement ? (cours PEF et ateliers) */
export function learnerDocumentsRequired(g: GroupForRule): boolean {
  if (isMunicipalCourse(g)) return false;
  const funder = up(g.funderCode) || up(g.programDefaultFunderCode);
  return funder === ASSOCIATION_FUNDER_CODE;
}

/** Atelier (bénévoles) ou cours : change quelques phrases du contrat. */
export function groupKind(g: GroupForRule): "atelier" | "cours" {
  if (up(g.programCode).startsWith("BEN_")) return "atelier";
  if (/^\s*atelier/i.test(g.programName ?? "") || /^\s*atelier/i.test(g.groupName ?? "")) return "atelier";
  return "cours";
}

// ── Année d'adhésion ────────────────────────────────────────────────────────

/** Date du jour à Paris (AAAA-MM-JJ). */
export function parisDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Année d'adhésion d'un jour (AAAA-MM-JJ) : 2026 pour le 1er septembre 2026 → 31 août 2027. */
export function membershipYear(day: string): number {
  const [y, m] = day.slice(0, 10).split("-").map(Number);
  return m >= MEMBERSHIP_YEAR_START_MONTH ? y : y - 1;
}

/** Année d'adhésion qui couvre l'inscription : celle d'aujourd'hui, ou du début du groupe s'il commence plus tard. */
export function membershipYearFor(today: string, groupStartsOn: string | null | undefined): number {
  const start = groupStartsOn?.slice(0, 10);
  return membershipYear(start && start > today ? start : today);
}

export function membershipYearLabel(year: number): string {
  return `${year}-${year + 1}`;
}

export function membershipPeriod(year: number): string {
  return `du 1er septembre ${year} au 31 août ${year + 1}`;
}

/** Dernier jour pour changer d'avis (AAAA-MM-JJ, Paris) : signature + 10 jours (14 à distance). */
export function retractationDeadline(signedAtIso: string, channel: SigningChannel): string {
  const day = parisDay(new Date(signedAtIso));
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + RETRACTATION_DAYS[channel]);
  return d.toISOString().slice(0, 10);
}

/** Numéro de reçu de cotisation, stable et unique par apprenant et par année : ADH-2026-0042. */
export function receiptNumber(year: number, learnerNo: number | null | undefined, learnerId: string): string {
  const who = learnerNo != null ? String(learnerNo).padStart(4, "0") : learnerId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `ADH-${year}-${who}`;
}

export function euros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

// ── Statuts ─────────────────────────────────────────────────────────────────

export type SignedDocRow = {
  id: string;
  kind: SignedDocumentKind;
  groupId: string | null;
  year: number;
  textVersion: string;
  signedAt: string;
  channel: SigningChannel;
};

export type DocState = {
  kind: SignedDocumentKind;
  state: "signe" | "a_signer" | "ancienne_version";
  signedAt: string | null;
  docId: string | null;
  version: string | null;
  channel: SigningChannel | null;
};

/**
 * État des trois documents pour une inscription : adhésion et règlement valent pour l'année
 * d'adhésion, le contrat pour le groupe. Une signature d'une ancienne version du texte est à refaire.
 */
export function documentStates(rows: SignedDocRow[], scope: { groupId: string; year: number }): Record<SignedDocumentKind, DocState> {
  const out = {} as Record<SignedDocumentKind, DocState>;
  for (const kind of SIGNED_DOCUMENT_KINDS) {
    const mine = rows
      .filter((r) => r.kind === kind && (kind === "contrat_formation" ? r.groupId === scope.groupId : r.year === scope.year))
      .sort((a, b) => b.signedAt.localeCompare(a.signedAt));
    const current = mine.find((r) => r.textVersion === DOCUMENT_TEXT_VERSIONS[kind]);
    const last = current ?? mine[0];
    out[kind] = {
      kind,
      state: current ? "signe" : last ? "ancienne_version" : "a_signer",
      signedAt: last?.signedAt ?? null,
      docId: last?.id ?? null,
      version: last?.textVersion ?? null,
      channel: last?.channel ?? null,
    };
  }
  return out;
}

/** Documents encore à signer (jamais signés, ou signés dans une ancienne version). */
export function pendingKinds(states: Record<SignedDocumentKind, DocState>): SignedDocumentKind[] {
  return SIGNED_DOCUMENT_KINDS.filter((k) => states[k].state !== "signe");
}

export type MembershipRow = {
  year: number;
  amountCents: number;
  paid: boolean;
  paidOn: string | null;
  paymentMethod: PaymentMethod | null;
  receiptNo: string | null;
  note: string | null;
};

export type LearnerDocsLine = {
  learnerId: string;
  name: string;
  states: Record<SignedDocumentKind, DocState>;
  membership: MembershipRow | null;
};

/** Vue d'ensemble d'un groupe : qui n'a pas tout signé, qui n'a pas payé. */
export function groupDocumentsOverview(lines: LearnerDocsLine[]): {
  total: number;
  complete: number;
  unsigned: LearnerDocsLine[];
  unpaid: LearnerDocsLine[];
} {
  const unsigned = lines.filter((l) => pendingKinds(l.states).length > 0);
  const unpaid = lines.filter((l) => !l.membership?.paid);
  const complete = lines.filter((l) => pendingKinds(l.states).length === 0 && l.membership?.paid).length;
  return { total: lines.length, complete, unsigned, unpaid };
}

const dayFr = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" });

/** Libellé court d'un état : « signé le 01/11 », « à signer », « à re-signer (nouvelle version) ». */
export function stateLabel(s: DocState): string {
  if (s.state === "signe" && s.signedAt) return `signé le ${dayFr(s.signedAt)}`;
  if (s.state === "ancienne_version") return "à re-signer (texte modifié)";
  return "à signer";
}

/** Libellé court de la cotisation : « payée le 01/11 (espèces) » ou « non payée ». */
export function membershipLabel(m: MembershipRow | null): string {
  if (!m?.paid || !m.paidOn) return "non payée";
  return `payée le ${dayFr(`${m.paidOn}T12:00:00Z`)} (${paymentMethodLabel(m.paymentMethod).toLowerCase()})`;
}

// ── Droits ──────────────────────────────────────────────────────────────────

export type DocsPermissions = {
  view: boolean; // voir les statuts
  signHere: boolean; // « Faire signer sur cette tablette »
  sendLink: boolean; // « Envoyer le lien WhatsApp »
  recordPayment: boolean; // saisir la cotisation, reçu
  download: boolean; // télécharger les PDF signés (dossier privé)
};

const NONE: DocsPermissions = { view: false, signHere: false, sendLink: false, recordPayment: false, download: false };

/**
 * Admin et coordination : tout. Formatrice : seulement pour SES groupes, voir les statuts et
 * faire signer (tablette ou lien) — ni cotisation, ni PDF du dossier (réservés à la coordination,
 * comme le dossier administratif). Autres rôles : rien.
 */
export function documentsPermissions(role: AppRole, isGroupTrainer: boolean): DocsPermissions {
  if (role === "admin" || role === "coordinator") return { view: true, signHere: true, sendLink: true, recordPayment: true, download: true };
  if (role === "trainer" && isGroupTrainer) return { ...NONE, view: true, signHere: true, sendLink: true };
  return NONE;
}

// ── Lien personnel ──────────────────────────────────────────────────────────

export type LinkCheck =
  | { ok: true }
  | { ok: false; reason: "introuvable" | "expire" | "autre_organisation" | "non_inscrit" | "non_concerne" };

/**
 * Le lien ouvre-t-il la signature ? Jeton connu, pas expiré, et la personne, le groupe et le lien
 * appartiennent au même organisme ; la personne est inscrite dans le groupe, qui est concerné.
 */
export function checkSigningLink(input: {
  link: { orgId: string; expiresAt: string } | null;
  learner: { orgId: string } | null;
  group: (GroupForRule & { orgId: string }) | null;
  enrolled: boolean;
  now: Date;
}): LinkCheck {
  const { link, learner, group } = input;
  if (!link || !learner || !group) return { ok: false, reason: "introuvable" };
  if (learner.orgId !== link.orgId || group.orgId !== link.orgId) return { ok: false, reason: "autre_organisation" };
  if (input.now.getTime() > new Date(link.expiresAt).getTime()) return { ok: false, reason: "expire" };
  if (!input.enrolled) return { ok: false, reason: "non_inscrit" };
  if (!learnerDocumentsRequired(group)) return { ok: false, reason: "non_concerne" };
  return { ok: true };
}

/** Table ou colonne absente : la migration 0059 n'est pas encore appliquée. */
export function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  return (
    !!error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      error.code === "42703" ||
      error.code === "PGRST204" ||
      /does not exist|schema cache|could not find the table/i.test(error.message ?? ""))
  );
}

export const MIGRATION_MISSING = "Fonction pas encore activée sur la base : la migration 0059 (documents de l'apprenant) est à appliquer.";

// ── Fichiers ────────────────────────────────────────────────────────────────

/** Chemin du PDF signé dans le bucket privé « dossiers », au même endroit que les pièces du dossier. */
export function signedDocumentPath(orgId: string, learnerId: string, kind: SignedDocumentKind, id: string): string {
  return `${orgId}/apprenants/${learnerId}/signe-${kind}-${id}.pdf`;
}
