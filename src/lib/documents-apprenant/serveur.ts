import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/auth";
import { describePattern } from "@/lib/reports/group-planning";
import { learnerRef } from "@/lib/refs";
import {
  COTISATION_EUROS,
  DOCUMENT_LABELS,
  LINK_TTL_MS,
  checkSigningLink,
  documentStates,
  documentsPermissions,
  groupKind,
  isMissingRelation,
  learnerDocumentsRequired,
  membershipYearFor,
  parisDay,
  pendingKinds,
  signedDocumentPath,
  type DocState,
  type GroupForRule,
  type LearnerDocsLine,
  type LinkCheck,
  type MembershipRow,
  type PaymentMethod,
  type SignedDocRow,
  type SignedDocumentKind,
  type SigningChannel,
} from "./regles";
import { documentText, learnerFullName, learnerIdentityLines, type DocumentText, type GroupForText, type LearnerForText } from "./textes";
import { buildSignedDocumentPdf, sha256 } from "./pdf";
import { loadAssociationSignature } from "@/lib/signature-association";
import { findOpenAttendanceSession } from "@/lib/emargement/open-session";

// Accès base des documents de l'apprenant. Toujours appelé avec le client service_role
// (page publique à jeton, ou action serveur APRÈS contrôle des droits) : chaque requête est
// donc bornée explicitement à l'organisme.

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => uuidRe.test(s);

type GroupRow = {
  id: string;
  org_id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  total_hours: number | string | null;
  capacity: number | null;
  weekly_pattern: { weekday: number; start: string; end: string }[] | null;
  funders: { code: string | null } | null;
  programs: { code: string | null; name: string | null; level: string | null; entry_level: string | null; default_funder: { code: string | null } | null } | null;
  rooms: { name: string; address: string | null } | null;
  trainers: { first_name: string; last_name: string | null } | null;
};

export const GROUP_SELECT =
  "id, org_id, name, starts_on, ends_on, total_hours, capacity, weekly_pattern, funders(code), programs(code, name, level, entry_level, default_funder:default_funder_id(code)), rooms:room_id(name, address), trainers:trainer_id(first_name, last_name)";

export function groupRuleOf(g: Pick<GroupRow, "name" | "funders" | "programs">): GroupForRule {
  return {
    funderCode: g.funders?.code ?? null,
    programDefaultFunderCode: g.programs?.default_funder?.code ?? null,
    programCode: g.programs?.code ?? null,
    programName: g.programs?.name ?? null,
    groupName: g.name,
  };
}

export function groupForText(g: GroupRow): GroupForText {
  const room = g.rooms;
  return {
    name: g.name,
    programName: g.programs?.name ?? null,
    level: g.programs?.level ?? null,
    entryLevel: g.programs?.entry_level ?? null,
    kind: groupKind(groupRuleOf(g)),
    startsOn: g.starts_on,
    endsOn: g.ends_on,
    totalHours: g.total_hours == null ? null : Number(g.total_hours),
    schedule: describePattern(g.weekly_pattern ?? [], ", ") || null,
    place: room ? [room.name, room.address].filter(Boolean).join(" — ") : null,
    capacity: g.capacity,
    trainerName: g.trainers ? `${g.trainers.first_name} ${g.trainers.last_name ?? ""}`.trim() : null,
    priceEuros: 0,
  };
}

type LearnerRow = {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  gender: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  learner_no: number | null;
};
const LEARNER_SELECT = "id, org_id, first_name, last_name, birth_date, gender, address, postal_code, city, phone, email, learner_no";

export function learnerForText(l: LearnerRow): LearnerForText {
  return {
    firstName: l.first_name,
    lastName: l.last_name,
    birthDate: l.birth_date,
    gender: l.gender,
    address: l.address,
    postalCode: l.postal_code,
    city: l.city,
    phone: l.phone,
    email: l.email,
    ref: l.learner_no != null ? learnerRef(l.learner_no) : null,
  };
}

type DocRowDb = { id: string; kind: SignedDocumentKind; group_id: string | null; membership_year: number; text_version: string; signed_at: string; channel: SigningChannel; learner_id?: string };
export const DOC_SELECT = "id, learner_id, kind, group_id, membership_year, text_version, signed_at, channel";
export const toDocRow = (r: DocRowDb): SignedDocRow => ({
  id: r.id,
  kind: r.kind,
  groupId: r.group_id,
  year: Number(r.membership_year),
  textVersion: r.text_version,
  signedAt: r.signed_at,
  channel: r.channel,
});

type MembershipDb = { learner_id?: string; membership_year: number; amount_cents: number; paid: boolean; paid_on: string | null; payment_method: PaymentMethod | null; receipt_no: string | null; note: string | null };
export const MEMBERSHIP_SELECT = "learner_id, membership_year, amount_cents, paid, paid_on, payment_method, receipt_no, note";
export const toMembership = (m: MembershipDb): MembershipRow => ({
  year: Number(m.membership_year),
  amountCents: Number(m.amount_cents),
  paid: Boolean(m.paid),
  paidOn: m.paid_on,
  paymentMethod: m.payment_method,
  receiptNo: m.receipt_no,
  note: m.note,
});

// ── Page publique : le lien personnel ───────────────────────────────────────

export type SigningContext = {
  linkId: string;
  orgId: string;
  channel: SigningChannel;
  expiresAt: string;
  learnerId: string;
  learner: LearnerForText;
  learnerName: string;
  group: GroupForText & { id: string };
  year: number;
  states: Record<SignedDocumentKind, DocState>;
  pending: SignedDocumentKind[];
};

export type SigningLookup =
  | { ok: true; ctx: SigningContext }
  | { ok: false; reason: Extract<LinkCheck, { ok: false }>["reason"] | "indisponible" };

/** Lit le lien à jeton et tout ce qu'il faut pour signer — rien d'autre que la personne du lien. */
export async function loadSigningContext(admin: SupabaseClient, token: string, now: Date = new Date()): Promise<SigningLookup> {
  if (!isUuid(token)) return { ok: false, reason: "introuvable" };
  const { data: link, error } = await admin
    .from("learner_signature_links")
    .select("id, org_id, learner_id, group_id, channel, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error) return { ok: false, reason: isMissingRelation(error) ? "indisponible" : "introuvable" };
  if (!link) return { ok: false, reason: "introuvable" };

  const [{ data: learner }, { data: group }, { data: enrollment }] = await Promise.all([
    admin.from("learners").select(LEARNER_SELECT).eq("id", link.learner_id).maybeSingle(),
    admin.from("groups").select(GROUP_SELECT).eq("id", link.group_id).maybeSingle(),
    admin
      .from("enrollments")
      .select("id")
      .eq("group_id", link.group_id)
      .eq("learner_id", link.learner_id)
      .eq("org_id", link.org_id)
      .eq("status", "inscrit")
      .maybeSingle(),
  ]);
  const l = learner as LearnerRow | null;
  const g = group as unknown as GroupRow | null;
  const check = checkSigningLink({
    link: { orgId: link.org_id as string, expiresAt: link.expires_at as string },
    learner: l ? { orgId: l.org_id } : null,
    group: g ? { ...groupRuleOf(g), orgId: g.org_id } : null,
    enrolled: Boolean(enrollment),
    now,
  });
  if (!check.ok) return { ok: false, reason: check.reason };

  const { data: docs, error: docsError } = await admin
    .from("learner_signed_documents")
    .select(DOC_SELECT)
    .eq("learner_id", l!.id)
    .eq("org_id", link.org_id);
  if (docsError) return { ok: false, reason: isMissingRelation(docsError) ? "indisponible" : "introuvable" };

  const year = membershipYearFor(parisDay(now), g!.starts_on);
  const states = documentStates(((docs ?? []) as DocRowDb[]).map(toDocRow), { groupId: g!.id, year });
  const lt = learnerForText(l!);
  return {
    ok: true,
    ctx: {
      linkId: link.id as string,
      orgId: link.org_id as string,
      channel: link.channel as SigningChannel,
      expiresAt: link.expires_at as string,
      learnerId: l!.id,
      learner: lt,
      learnerName: learnerFullName(lt),
      group: { ...groupForText(g!), id: g!.id },
      year,
      states,
      pending: pendingKinds(states),
    },
  };
}

export function textsFor(ctx: Pick<SigningContext, "year" | "group">, kinds: SignedDocumentKind[]): DocumentText[] {
  return kinds.map((kind) => documentText(kind, { year: ctx.year, group: ctx.group }));
}

export const LINK_ERRORS: Record<Exclude<SigningLookup, { ok: true }>["reason"], string> = {
  introuvable: "Ce lien n'est pas reconnu.",
  expire: "Ce lien a expiré. Demandez un nouveau lien à l'équipe.",
  autre_organisation: "Ce lien n'est pas reconnu.",
  non_inscrit: "Vous n'êtes plus inscrit(e) dans ce groupe. Parlez-en à l'équipe.",
  non_concerne: "Aucun document à signer pour ce groupe.",
  indisponible: "La signature en ligne n'est pas encore ouverte. Parlez-en à l'équipe.",
};

export type SignInput = {
  token: string;
  accepted: SignedDocumentKind[];
  signature: string;
  ip: string | null;
  userAgent: string | null;
  now?: Date;
};

export type SignOutcome = { ok: true; signed: SignedDocumentKind[] } | { ok: false; error: string };

/**
 * Signe les documents en attente du lien : un PDF horodaté par document (texte lu, case
 * cochée, signature au doigt, preuve), rangé dans le dossier privé, puis une ligne en base.
 * Tout se recalcule ici : le navigateur ne choisit ni la personne, ni le groupe, ni le texte.
 */
export async function completeSignature(admin: SupabaseClient, input: SignInput): Promise<SignOutcome> {
  const now = input.now ?? new Date();
  const lookup = await loadSigningContext(admin, input.token, now);
  if (!lookup.ok) return { ok: false, error: LINK_ERRORS[lookup.reason] };
  const ctx = lookup.ctx;
  if (!ctx.pending.length) return { ok: true, signed: [] };
  if (ctx.pending.some((k) => !input.accepted.includes(k))) {
    return { ok: false, error: "Cochez « J'ai lu » pour chaque document avant de signer." };
  }

  const storage = admin.storage.from("dossiers");
  const associationSignature = await loadAssociationSignature(admin, ctx.orgId);
  const signedAt = now.toISOString();
  const signed: SignedDocumentKind[] = [];
  for (const kind of ctx.pending) {
    const id = randomUUID();
    const text = documentText(kind, { year: ctx.year, group: ctx.group });
    const pdf = await buildSignedDocumentPdf({
      text,
      identity: learnerIdentityLines(ctx.learner),
      membership: kind === "adhesion" ? { year: ctx.year, amountCents: COTISATION_EUROS * 100 } : null,
      proof: { docId: id, signerName: ctx.learnerName, signedAt, channel: ctx.channel, ip: input.ip, userAgent: input.userAgent, signaturePng: input.signature },
      associationSignature,
    });
    const path = signedDocumentPath(ctx.orgId, ctx.learnerId, kind, id);
    const { error: upErr } = await storage.upload(path, pdf, { contentType: "application/pdf", upsert: false });
    if (upErr) return { ok: false, error: "Enregistrement impossible, réessayez." };

    const { error } = await admin.from("learner_signed_documents").insert({
      id,
      org_id: ctx.orgId,
      learner_id: ctx.learnerId,
      group_id: ctx.group.id,
      kind,
      text_version: text.version,
      membership_year: ctx.year,
      signed_at: signedAt,
      signer_name: ctx.learnerName,
      channel: ctx.channel,
      link_id: ctx.linkId,
      ip: input.ip,
      user_agent: input.userAgent,
      file_path: path,
      file_sha256: sha256(pdf),
    });
    if (error) {
      await storage.remove([path]).then(() => undefined, () => undefined);
      if (error.code === "23505") continue; // déjà signé entre-temps (double appui)
      return { ok: false, error: "Enregistrement impossible, réessayez." };
    }
    signed.push(kind);
  }

  // Lien tablette : refermé tout de suite (la tablette passe à la personne suivante).
  await admin
    .from("learner_signature_links")
    .update({ completed_at: signedAt, ...(ctx.channel === "sur_place" ? { expires_at: signedAt } : {}) })
    .eq("id", ctx.linkId)
    .then(() => undefined, () => undefined);
  if (signed.length) {
    await admin
      .from("learner_contacts")
      .insert({
        org_id: ctx.orgId,
        learner_id: ctx.learnerId,
        channel: ctx.channel === "sur_place" ? "presentiel" : "whatsapp",
        outcome: "autre",
        note: `Documents signés (${signed.map((k) => DOCUMENT_LABELS[k].toLowerCase()).join(", ")}) — ${ctx.group.name}`,
      })
      .then(() => undefined, () => undefined);
  }
  return { ok: true, signed };
}

// ── Côté équipe ─────────────────────────────────────────────────────────────

/** La personne connectée anime-t-elle ce groupe (formateur du groupe ou d'une de ses séances) ? */
export async function isGroupTrainer(admin: SupabaseClient, orgId: string, groupId: string, userId: string): Promise<boolean> {
  const [{ data: membership }, { data: group }, { data: sessions }] = await Promise.all([
    admin.from("memberships").select("trainer_id").eq("org_id", orgId).eq("user_id", userId).maybeSingle(),
    admin.from("groups").select("trainer_id, co_trainer_id").eq("id", groupId).eq("org_id", orgId).maybeSingle(),
    admin.from("sessions").select("trainer_id, co_trainer_id").eq("group_id", groupId).eq("org_id", orgId),
  ]);
  const mine = membership?.trainer_id as string | null | undefined;
  if (!mine || !group) return false;
  const ids = [group.trainer_id, group.co_trainer_id, ...(sessions ?? []).flatMap((s) => [s.trainer_id, s.co_trainer_id])];
  return ids.includes(mine);
}

export type GroupDocsLine = LearnerDocsLine & { firstName: string; phone: string | null; photoUrl: string | null };

/** Inscrits actifs d'un groupe concerné, avec l'état de leurs documents et de leur cotisation. */
export async function loadGroupDocumentLines(
  admin: SupabaseClient,
  orgId: string,
  groupId: string,
  year: number,
): Promise<{ available: boolean; lines: GroupDocsLine[] }> {
  const { data: enrollments } = await admin
    .from("enrollments")
    .select("learner_id, learners(first_name, last_name, phone, photo_url)")
    .eq("group_id", groupId)
    .eq("org_id", orgId)
    .eq("status", "inscrit");
  const ids = (enrollments ?? []).map((e) => e.learner_id as string);
  if (!ids.length) {
    const probe = await admin.from("learner_signed_documents").select("id").eq("org_id", orgId).limit(1);
    return { available: !isMissingRelation(probe.error), lines: [] };
  }
  const [docs, memberships] = await Promise.all([
    admin.from("learner_signed_documents").select(DOC_SELECT).eq("org_id", orgId).in("learner_id", ids),
    admin.from("learner_memberships").select(MEMBERSHIP_SELECT).eq("org_id", orgId).eq("membership_year", year).in("learner_id", ids),
  ]);
  if (docs.error || memberships.error) return { available: false, lines: [] };
  const docsBy = new Map<string, SignedDocRow[]>();
  for (const d of (docs.data ?? []) as DocRowDb[]) docsBy.set(d.learner_id!, [...(docsBy.get(d.learner_id!) ?? []), toDocRow(d)]);
  const memBy = new Map(((memberships.data ?? []) as MembershipDb[]).map((m) => [m.learner_id!, toMembership(m)]));
  const lines = (enrollments ?? []).map((e) => {
    const l = e.learners as unknown as { first_name: string; last_name: string; phone: string | null; photo_url?: string | null } | null;
    const id = e.learner_id as string;
    return {
      learnerId: id,
      name: l ? learnerFullName({ firstName: l.first_name, lastName: l.last_name }) : "—",
      firstName: l?.first_name === "?" ? "" : (l?.first_name ?? ""),
      phone: l?.phone ?? null,
      photoUrl: l?.photo_url ?? null,
      states: documentStates(docsBy.get(id) ?? [], { groupId, year }),
      membership: memBy.get(id) ?? null,
    };
  });
  return { available: true, lines: lines.sort((a, b) => a.name.localeCompare(b.name, "fr")) };
}

export type LearnerGroupDocs = { groupId: string; groupName: string; year: number; states: Record<SignedDocumentKind, DocState> };

/** Fiche apprenant : ses groupes concernés (inscrit), l'état des documents, ses cotisations. */
export async function loadLearnerDocuments(
  admin: SupabaseClient,
  orgId: string,
  learnerId: string,
  today: string,
): Promise<{ available: boolean; firstName: string; phone: string | null; groups: LearnerGroupDocs[]; memberships: MembershipRow[] } | null> {
  const [{ data: learner }, { data: enrollments }] = await Promise.all([
    admin.from("learners").select("id, first_name, phone").eq("id", learnerId).eq("org_id", orgId).maybeSingle(),
    admin.from("enrollments").select(`group_id, groups(${GROUP_SELECT})`).eq("learner_id", learnerId).eq("org_id", orgId).eq("status", "inscrit"),
  ]);
  if (!learner) return null;
  const groups = (enrollments ?? [])
    .map((e) => e.groups as unknown as GroupRow | null)
    .filter((g): g is GroupRow => Boolean(g) && learnerDocumentsRequired(groupRuleOf(g!)));
  const [docs, memberships] = await Promise.all([
    admin.from("learner_signed_documents").select(DOC_SELECT).eq("org_id", orgId).eq("learner_id", learnerId),
    admin.from("learner_memberships").select(MEMBERSHIP_SELECT).eq("org_id", orgId).eq("learner_id", learnerId).order("membership_year", { ascending: false }),
  ]);
  const available = !docs.error && !memberships.error;
  const rows = ((docs.data ?? []) as DocRowDb[]).map(toDocRow);
  return {
    available,
    firstName: learner.first_name === "?" ? "" : (learner.first_name as string),
    phone: (learner.phone as string | null) ?? null,
    groups: groups.map((g) => {
      const year = membershipYearFor(today, g.starts_on);
      return { groupId: g.id, groupName: g.name, year, states: documentStates(rows, { groupId: g.id, year }) };
    }),
    memberships: available ? ((memberships.data ?? []) as MembershipDb[]).map(toMembership) : [],
  };
}

export type CreateLinkResult = { ok: true; token: string; groupName: string; learnerFirstName: string; phone: string | null } | { ok: false; error: string };

/** Crée le lien personnel (WhatsApp, 30 jours) ou la session tablette (2 heures), après vérification. */
export async function createSigningLink(
  admin: SupabaseClient,
  input: { orgId: string; learnerId: string; groupId: string; channel: SigningChannel; userId: string | null; now?: Date },
): Promise<CreateLinkResult> {
  const now = input.now ?? new Date();
  const [{ data: learner }, { data: group }, { data: enrollment }] = await Promise.all([
    admin.from("learners").select("id, org_id, first_name, phone").eq("id", input.learnerId).eq("org_id", input.orgId).maybeSingle(),
    admin.from("groups").select(GROUP_SELECT).eq("id", input.groupId).eq("org_id", input.orgId).maybeSingle(),
    admin
      .from("enrollments")
      .select("id")
      .eq("group_id", input.groupId)
      .eq("learner_id", input.learnerId)
      .eq("org_id", input.orgId)
      .eq("status", "inscrit")
      .maybeSingle(),
  ]);
  const g = group as unknown as GroupRow | null;
  if (!learner || !g) return { ok: false, error: "Apprenant ou groupe introuvable." };
  if (!enrollment) return { ok: false, error: "Cette personne n'est pas inscrite dans ce groupe." };
  if (!learnerDocumentsRequired(groupRuleOf(g))) return { ok: false, error: "Ce groupe ne demande pas ces documents (cours municipaux ou autre financeur)." };

  const { data: link, error } = await admin
    .from("learner_signature_links")
    .insert({
      org_id: input.orgId,
      learner_id: input.learnerId,
      group_id: input.groupId,
      channel: input.channel,
      expires_at: new Date(now.getTime() + LINK_TTL_MS[input.channel]).toISOString(),
      created_by: input.userId,
    })
    .select("token")
    .single();
  if (error || !link) return { ok: false, error: isMissingRelation(error) ? "Fonction pas encore activée sur la base : la migration 0059 est à appliquer." : "Lien impossible à créer, réessayez." };
  return {
    ok: true,
    token: link.token as string,
    groupName: g.name,
    learnerFirstName: learner.first_name === "?" ? "" : (learner.first_name as string),
    phone: (learner.phone as string | null) ?? null,
  };
}

export type GroupDocumentsCardData = { year: number; rows: GroupDocsLine[]; perms: ReturnType<typeof documentsPermissions>; available: boolean };

/**
 * Carte « Adhésion, contrat, règlement » de la fiche groupe : null si le groupe n'est pas
 * concerné (cours municipaux, autre financeur) ou si la personne n'y a pas droit. Une
 * formatrice ne voit pas les cotisations (réservées à la coordination).
 */
export async function loadGroupDocumentsCard(
  admin: SupabaseClient,
  user: { orgId: string; userId: string; role: AppRole },
  groupId: string,
  today: string,
): Promise<GroupDocumentsCardData | null> {
  const { data: group } = await admin
    .from("groups")
    .select("id, name, starts_on, funders(code), programs(code, name, default_funder:default_funder_id(code))")
    .eq("id", groupId)
    .eq("org_id", user.orgId)
    .maybeSingle();
  const g = group as unknown as Pick<GroupRow, "id" | "name" | "starts_on" | "funders" | "programs"> | null;
  if (!g || !learnerDocumentsRequired(groupRuleOf(g))) return null;
  const perms = documentsPermissions(user.role, user.role === "trainer" ? await isGroupTrainer(admin, user.orgId, groupId, user.userId) : false);
  if (!perms.view) return null;
  const year = membershipYearFor(today, g.starts_on);
  const { available, lines } = await loadGroupDocumentLines(admin, user.orgId, groupId, year);
  return { year, perms, available, rows: perms.recordPayment ? lines : lines.map((l) => ({ ...l, membership: null })) };
}

// ── Signature en classe (même lien et même téléphone que l'émargement) ─────────
// Les documents sont lus en classe ; la feuille d'émargement de la séance circule, puis la page
// « Documents à signer » du même jeton : chacun touche son nom, coche, signe au doigt et passe le
// téléphone. Le jeton d'émargement ouvert est le secret ; chaque signature passe par une session
// tablette personnelle (sur place, 2 heures), refermée dès la signature.

export type ClassSigningLearner = { learnerId: string; name: string; photoUrl: string | null; pending: SignedDocumentKind[] };
export type ClassSigning =
  | { ok: true; orgId: string; groupId: string; groupName: string; startsAt: string; endsAt: string; learners: ClassSigningLearner[] }
  | { ok: false; reason: "introuvable" | "non_concerne" | "indisponible" };

export const CLASS_SIGNING_ERRORS: Record<Extract<ClassSigning, { ok: false }>["reason"], string> = {
  introuvable: "Ce lien est invalide, expiré, ou la feuille d'émargement a été clôturée. Rapprochez-vous de votre formatrice.",
  non_concerne: "Aucun document à signer pour ce groupe.",
  indisponible: "La signature des documents n'est pas encore ouverte. Parlez-en à l'équipe.",
};

/** Inscrits du groupe de la séance (feuille d'émargement ouverte), avec les documents qu'il leur reste à signer. */
export async function loadClassSigning(admin: SupabaseClient, attendanceToken: string, now: Date = new Date()): Promise<ClassSigning> {
  const session = await findOpenAttendanceSession(admin, attendanceToken, now);
  if (!session) return { ok: false, reason: "introuvable" };
  const { data: group } = await admin.from("groups").select(GROUP_SELECT).eq("id", session.group_id).eq("org_id", session.org_id).maybeSingle();
  const g = group as unknown as GroupRow | null;
  if (!g || !learnerDocumentsRequired(groupRuleOf(g))) return { ok: false, reason: "non_concerne" };
  const year = membershipYearFor(parisDay(now), g.starts_on);
  const { available, lines } = await loadGroupDocumentLines(admin, session.org_id, g.id, year);
  if (!available) return { ok: false, reason: "indisponible" };
  return {
    ok: true,
    orgId: session.org_id,
    groupId: g.id,
    groupName: g.name,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    learners: lines.map((l) => ({ learnerId: l.learnerId, name: l.name, photoUrl: l.photoUrl, pending: pendingKinds(l.states) })),
  };
}

/** Un nom touché sur la page de la classe : session tablette personnelle, si la personne a encore à signer. */
export async function startClassSigning(
  admin: SupabaseClient,
  attendanceToken: string,
  learnerId: string,
  now: Date = new Date(),
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const cls = await loadClassSigning(admin, attendanceToken, now);
  if (!cls.ok) return { ok: false, error: CLASS_SIGNING_ERRORS[cls.reason] };
  const learner = cls.learners.find((l) => l.learnerId === learnerId);
  if (!learner) return { ok: false, error: "Cette personne n'est pas inscrite dans ce groupe." };
  if (!learner.pending.length) return { ok: false, error: "Tout est déjà signé pour cette personne." };
  const link = await createSigningLink(admin, { orgId: cls.orgId, learnerId, groupId: cls.groupId, channel: "sur_place", userId: null, now });
  return link.ok ? { ok: true, token: link.token } : link;
}
