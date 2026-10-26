"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSignupOrg } from "@/lib/inscription/org";
import { provenanceFromSignupSource } from "@/lib/admission/sources";
import { toWhatsAppNumber } from "@/lib/admission/phone";
import { buildTestUrl, sanitizeSrc } from "@/lib/inscription/link";
import { toLocale, type SignupErrorCode, type SignupLocale } from "@/lib/inscription/i18n";
import { SANDBOX_SLUG } from "@/lib/production-orgs";
import { isAppointmentOverlap } from "@/lib/pg-errors";
import { BOOKED_ONLINE_NOTE } from "@/lib/admission/appointments";
import { advanceAdmissionStatus, createAdmissionAppointment } from "@/lib/admission/appointments-server";
import { loadFreeSlotsForOrg } from "@/lib/admission/slots-server";
import type { FreeSlot } from "@/lib/admission/slots";
import { utcToLocalDate, utcToLocalTime } from "@/lib/dates";
import { BOOKING_ADDRESS, PUBLIC_BOOKING_ENABLED, pickPublicSlots, type BookingOffer } from "@/lib/inscription/booking";
import { issueBookingToken, verifyBookingToken } from "@/lib/inscription/booking-token";
import { meetingJournalNote, type MeetingConfirmation, type PublicMeeting } from "@/lib/inscription/meeting";
import { loadPublicMeeting, registerForMeeting } from "@/lib/inscription/meeting-server";
import { ensureConvocationTests } from "@/lib/placement/convocation-test-server";
import {
  buildSignupNote,
  checkStamp,
  parseSignup,
  readSignupForm,
  stampSecret,
} from "@/lib/inscription/signup";

// Inscription rapide PUBLIQUE (/inscription), sans compte : la personne remplit le
// formulaire reçu sur WhatsApp et arrive dans l'onglet Admission (« À contacter »,
// statut « nouveau »). Écriture côté serveur uniquement (client service_role) ;
// l'organisation est choisie par le serveur (jamais le bac à sable).

export type SignupValues = {
  firstName: string;
  lastName: string;
  phone: string;
  french: string;
  cityChoice: string;
  city: string;
  consent: boolean;
};

export type SignupState =
  | { status: "idle" }
  // booking : créneaux à réserver sur l'écran de fin (absent pour un robot ignoré,
  // ou si les créneaux n'ont pas pu être chargés → « Nous vous appelons »).
  // testUrl : lien personnel du test de niveau, proposé tout de suite sur l'écran de fin.
  // meeting : lien d'une réunion d'information → inscrit(e), déjà inscrit(e), complète ou fermée
  // (ni créneau ni test écrit : le test oral individuel a lieu à la réunion).
  | { status: "done"; booking?: BookingOffer | null; testUrl?: string | null; meeting?: MeetingConfirmation }
  | { status: "error"; error: SignupErrorCode; values: SignupValues };

// Au-delà, on suspend (robot ou lien diffusé par erreur) : 30 inscriptions en 10 minutes.
const FLOOD_WINDOW_MS = 10 * 60_000;
const FLOOD_MAX = 30;
const NOTE_PREFIX = "Inscription formulaire";

function valuesOf(fd: FormData): SignupValues {
  const str = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v.slice(0, 120) : "";
  };
  return {
    firstName: str("firstName"),
    lastName: str("lastName"),
    phone: str("phone"),
    french: str("french"),
    cityChoice: str("cityChoice"),
    city: str("city"),
    consent: fd.get("consent") === "on",
  };
}

// Colonnes ajoutées par la migration 0051 : si elle n'est pas encore appliquée, on
// enregistre quand même la fiche (la note du journal garde tout).
const isMissingColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist|schema cache/i.test(e.message ?? ""));

export async function submitSignup(_prev: SignupState, fd: FormData): Promise<SignupState> {
  // Champ piège invisible rempli, ou formulaire envoyé sans être affiché / trop vite :
  // un robot. On répond « merci » sans rien enregistrer (il ne doit pas apprendre).
  const honeypot = fd.get("website");
  if (typeof honeypot === "string" && honeypot.trim()) return { status: "done" };
  const stamp = checkStamp(fd.get("t"), Date.now(), stampSecret());
  if (stamp !== "ok") {
    console.warn(`[inscription] envoi ignoré (${stamp})`);
    return { status: "done" };
  }

  const parsed = parseSignup(readSignupForm(fd));
  if (!parsed.ok) return { status: "error", error: parsed.error, values: valuesOf(fd) };
  const d = parsed.data;

  const admin = createAdminClient();
  // Lien d'une réunion d'information (champ caché « m ») : l'organisme est celui de la réunion,
  // jamais celui d'un paramètre ?o=. Un jeton inconnu = lien invalide, rien n'est enregistré.
  const rawMeeting = fd.get("m");
  const loaded = typeof rawMeeting === "string" && rawMeeting ? await loadPublicMeeting(admin, rawMeeting) : null;
  if (typeof rawMeeting === "string" && rawMeeting && !loaded) return { status: "error", error: "link", values: valuesOf(fd) };
  const meeting = loaded?.meeting ?? null;

  const org = loaded ? { id: loaded.orgId } : await resolveSignupOrg(typeof fd.get("o") === "string" ? (fd.get("o") as string) : null);
  if (!org) return { status: "error", error: "link", values: valuesOf(fd) };

  const src = sanitizeSrc(typeof fd.get("src") === "string" ? (fd.get("src") as string) : null);
  // Langue du formulaire : le test s'ouvre avec les consignes dans la même langue.
  const locale = toLocale(typeof fd.get("lang") === "string" ? (fd.get("lang") as string) : null);

  // Afflux anormal : on n'écrit plus rien (l'équipe garde la main).
  const since = new Date(Date.now() - FLOOD_WINDOW_MS).toISOString();
  const { count } = await admin
    .from("learner_contacts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.id)
    .gte("contacted_at", since)
    .like("note", `${NOTE_PREFIX}%`);
  if ((count ?? 0) >= FLOOD_MAX) {
    console.warn(`[inscription] afflux suspendu (${count} en 10 min)`);
    return { status: "error", error: "server", values: valuesOf(fd) };
  }

  // Même téléphone déjà connu dans l'organisme : pas de doublon, une ligne au journal.
  const { data: known, error: knownError } = await admin
    .from("learners")
    .select("id, phone, admission_status, level_assessed, created_at")
    .eq("org_id", org.id)
    .not("phone", "is", null)
    .order("created_at", { ascending: false });
  if (knownError) return { status: "error", error: "server", values: valuesOf(fd) };
  const existing = (known ?? []).find((l) => toWhatsAppNumber(l.phone as string) === d.phoneDigits);

  if (existing) {
    const { error } = await admin.from("learner_contacts").insert({
      org_id: org.id,
      learner_id: existing.id,
      channel: "whatsapp",
      outcome: "autre",
      note: buildSignupNote(d, { reinscription: true, src }),
    });
    if (error) return { status: "error", error: "server", values: valuesOf(fd) };
    // Dossier clos qui revient de lui-même : il reprend le parcours (« À contacter »).
    if (existing.admission_status === "sans_suite") {
      await admin.from("learners").update({ admission_status: "nouveau" }).eq("id", existing.id);
    }
    if (meeting) return finishMeetingSignup(admin, org.id, existing.id, meeting, valuesOf(fd), locale);
    revalidatePath("/apprenants", "layout");
    const testUrl = await signupTestUrl(admin, org.id, existing.id, Boolean(existing.level_assessed), locale);
    return { status: "done", booking: await offerBooking(org.id, existing.id, []), testUrl };
  }

  const provenance = provenanceFromSignupSource(src);
  const base = {
    org_id: org.id,
    first_name: d.firstName,
    last_name: d.lastName,
    phone: d.phone,
    city: d.city,
    postal_code: d.postalCode,
    admission_status: "nouveau",
    contact_source: provenance.contact_source,
    contact_source_detail: provenance.contact_source_detail,
  };
  const declared = {
    french_self_level: d.french,
    data_consent_at: new Date().toISOString(),
  };

  let { data: created, error } = await admin.from("learners").insert({ ...base, ...declared }).select("id").single();
  if (isMissingColumn(error)) {
    console.warn("[inscription] migration 0051 absente : fiche créée sans les colonnes déclaratives");
    ({ data: created, error } = await admin.from("learners").insert(base).select("id").single());
  }
  if (error || !created) {
    console.error(`[inscription] création impossible : ${error?.message}`);
    return { status: "error", error: "server", values: valuesOf(fd) };
  }

  await admin.from("learner_contacts").insert({
    org_id: org.id,
    learner_id: created.id,
    channel: "whatsapp",
    outcome: "autre",
    note: buildSignupNote(d, { src }),
  });
  if (meeting) return finishMeetingSignup(admin, org.id, created.id, meeting, valuesOf(fd), locale);
  // Pas de niveau connu → test de positionnement, proposé tout de suite sur l'écran de fin.
  const testUrl = await signupTestUrl(admin, org.id, created.id, false, locale);

  revalidatePath("/apprenants", "layout");
  return { status: "done", booking: await offerBooking(org.id, created.id, []), testUrl };
}

// Inscription à la réunion d'information dont le lien a été ouvert : la fiche existe (créée ou
// retrouvée), on la place dans la réunion tant qu'il reste une place (verrou en base, 0056).
// Complète ou fermée entre-temps : la fiche reste dans « À contacter » avec une note, l'équipe
// prévient pour la prochaine réunion. Pas de rendez-vous proposé ici ; le test de niveau, s'il reste
// à faire, s'ouvre dans la langue du formulaire.
async function finishMeetingSignup(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  learnerId: string,
  meeting: PublicMeeting,
  values: SignupValues,
  locale: SignupLocale,
): Promise<SignupState> {
  const outcome = await registerForMeeting(admin, meeting.token, learnerId);
  if (!outcome) return { status: "error", error: "server", values };

  if (outcome !== "already") {
    await admin.from("learner_contacts").insert({
      org_id: orgId,
      learner_id: learnerId,
      channel: "whatsapp",
      outcome: outcome === "registered" ? "convoque" : "autre",
      note: meetingJournalNote(outcome, meeting),
    });
  }
  if (outcome === "registered" || outcome === "already") await advanceAdmissionStatus(admin, [learnerId], "convoque");

  // Inscrit(e) : son test de niveau, créé POUR sa fiche, est proposé tout de suite (avant la réunion) ;
  // rien si elle l'a déjà fait ou si son niveau est connu. Jamais bloquant.
  let testUrl: string | null = null;
  if (outcome === "registered" || outcome === "already") {
    try {
      testUrl = (await ensureConvocationTests(admin, orgId, [learnerId], locale)).urls.get(learnerId) ?? null;
    } catch (e) {
      console.warn(`[inscription] test de niveau indisponible : ${e instanceof Error ? e.message : e}`);
    }
  }

  revalidatePath("/apprenants", "layout");
  return { status: "done", testUrl, meeting: { outcome, meeting: { ...meeting, state: outcome === "full" ? "full" : meeting.state } } };
}

// Adresse publique de l'ERP : le lien du test part aussi dans un message WhatsApp.
const PUBLIC_ERP_URL = "https://pef-erp.vercel.app";

// Test de positionnement de la personne : celui qui l'attend déjà, sinon un nouveau si
// son niveau n'est pas encore connu. Jamais bloquant : en cas de souci, pas de bouton
// (l'équipe envoie le lien sur WhatsApp comme avant).
async function signupTestUrl(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  learnerId: string,
  levelKnown: boolean,
  locale: SignupLocale,
): Promise<string | null> {
  try {
    const { data: pending } = await admin
      .from("placement_tests")
      .select("token")
      .eq("org_id", orgId)
      .eq("learner_id", learnerId)
      .eq("status", "en_attente")
      .eq("purpose", "positionnement")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pending?.token) return buildTestUrl(PUBLIC_ERP_URL, pending.token, locale);
    if (levelKnown) return null;
    const { data: created } = await admin
      .from("placement_tests")
      .insert({ org_id: orgId, learner_id: learnerId })
      .select("token")
      .single();
    return created?.token ? buildTestUrl(PUBLIC_ERP_URL, created.token, locale) : null;
  } catch (e) {
    console.warn(`[inscription] test de niveau indisponible : ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

// ── Réservation d'un créneau par la personne elle-même (écran de fin) ────────
// Uniquement pour la fiche que ce formulaire vient de créer ou de retrouver : l'action
// d'inscription renvoie un jeton signé (30 min) qui porte l'organisme et la personne.
// Le créneau est revérifié côté serveur (toujours dans les créneaux libres) et le verrou
// en base (0053) tranche si deux personnes touchent le même créneau au même instant.

type SlotRow = { starts_at: string; ends_at: string };

function asSlot(r: SlotRow): FreeSlot {
  return {
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    date: utcToLocalDate(r.starts_at),
    time: utcToLocalTime(r.starts_at),
    minutes: Math.round((Date.parse(r.ends_at) - Date.parse(r.starts_at)) / 60_000),
  };
}

// RDV « prévu » à venir de cette personne (une réservation suffit : on l'affiche).
async function upcomingAppointment(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  learnerId: string,
): Promise<FreeSlot | null> {
  const { data } = await admin
    .from("admission_appointments")
    .select("starts_at, ends_at")
    .eq("org_id", orgId)
    .eq("learner_id", learnerId)
    .eq("status", "prevu")
    .gt("ends_at", new Date().toISOString())
    .order("starts_at")
    .limit(1)
    .maybeSingle();
  return data ? asSlot(data as SlotRow) : null;
}

async function publicSlots(orgId: string, availability: readonly string[]): Promise<FreeSlot[]> {
  const now = new Date();
  return pickPublicSlots(await loadFreeSlotsForOrg(orgId, now), now, { availability });
}

// Après une inscription réussie : jeton + 4 créneaux (ou le RDV déjà prévu). Jamais
// bloquant : en cas de souci, l'écran dit simplement « Nous vous appelons ».
async function offerBooking(orgId: string, learnerId: string, availability: readonly string[]): Promise<BookingOffer | null> {
  if (!PUBLIC_BOOKING_ENABLED) return null; // écran de fin : « Nous vous contactons dès que possible »
  try {
    const token = issueBookingToken({ orgId, learnerId }, Date.now(), stampSecret());
    const existing = await upcomingAppointment(createAdminClient(), orgId, learnerId);
    if (existing) return { token, slots: [], existing };
    return { token, slots: await publicSlots(orgId, availability), existing: null };
  } catch (e) {
    console.warn(`[inscription] créneaux indisponibles : ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

// Personne visée par un jeton valide, dans un organisme réel (jamais le bac à sable).
async function bookingTarget(token: unknown) {
  if (!PUBLIC_BOOKING_ENABLED) return null; // réservation en ligne coupée : aucun jeton n'est accepté
  const claims = verifyBookingToken(token, Date.now(), stampSecret());
  if (!claims) return null;
  const admin = createAdminClient();
  const [{ data: org }, { data: learner }] = await Promise.all([
    admin.from("organizations").select("id, slug").eq("id", claims.orgId).maybeSingle(),
    admin.from("learners").select("*").eq("id", claims.learnerId).eq("org_id", claims.orgId).maybeSingle(),
  ]);
  if (!org || org.slug === SANDBOX_SLUG || !learner) return null;
  const availability = Array.isArray(learner.availability) ? (learner.availability as string[]) : [];
  return { admin, orgId: claims.orgId, learnerId: claims.learnerId, availability };
}

export type BookingResult =
  | { status: "booked"; slot: FreeSlot }
  | { status: "taken"; slots: FreeSlot[] }
  | { status: "expired" }
  | { status: "error" };

export async function bookSignupSlot(input: { token: string; startsAt: string }): Promise<BookingResult> {
  const target = await bookingTarget(input?.token);
  if (!target) return { status: "expired" };
  const { admin, orgId, learnerId, availability } = target;
  if (typeof input.startsAt !== "string" || Number.isNaN(Date.parse(input.startsAt))) return { status: "error" };

  const existing = await upcomingAppointment(admin, orgId, learnerId);
  if (existing) return { status: "booked", slot: existing };

  let free: FreeSlot[];
  try {
    free = await loadFreeSlotsForOrg(orgId);
  } catch {
    return { status: "error" };
  }
  const wanted = Date.parse(input.startsAt);
  const slot = free.find((s) => Date.parse(s.startsAt) === wanted);
  if (!slot) return { status: "taken", slots: pickPublicSlots(free, new Date(), { availability }) };

  const rdv = {
    orgId,
    learnerId,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    kind: "entretien" as const,
    mode: "sur_site" as const,
    location: BOOKING_ADDRESS,
    notes: BOOKED_ONLINE_NOTE,
    createdBy: null,
    bookedOnline: true,
  };
  let created = await createAdmissionAppointment(admin, rdv);
  // 0053 pas encore appliquée (colonne booked_online absente) : la note suffit.
  if (!created.ok && isMissingColumn(created.error)) created = await createAdmissionAppointment(admin, { ...rdv, bookedOnline: false });
  if (!created.ok) {
    if (isAppointmentOverlap(created.error)) {
      return { status: "taken", slots: await publicSlots(orgId, availability).catch(() => []) };
    }
    console.error(`[inscription] réservation impossible : ${created.error.message}`);
    return { status: "error" };
  }
  revalidatePath("/apprenants", "layout");
  return { status: "booked", slot };
}

// « Je préfère qu'on m'appelle » : une ligne au journal, rien d'autre.
export async function requestSignupCallback(input: { token: string }): Promise<{ ok: boolean }> {
  const target = await bookingTarget(input?.token);
  if (!target) return { ok: false };
  const { error } = await target.admin.from("learner_contacts").insert({
    org_id: target.orgId,
    learner_id: target.learnerId,
    channel: "whatsapp",
    outcome: "autre",
    note: "Formulaire : préfère être appelé(e) plutôt que de choisir un rendez-vous",
  });
  if (!error) revalidatePath("/apprenants", "layout");
  return { ok: !error };
}
