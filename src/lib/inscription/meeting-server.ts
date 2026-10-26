import { createAdminClient } from "@/lib/supabase/admin";
import { SANDBOX_SLUG } from "@/lib/production-orgs";
import {
  isMeetingToken,
  meetingState,
  placesLeft,
  SEATED_STATUSES,
  type MeetingOutcome,
  type PublicMeeting,
} from "@/lib/inscription/meeting";

// Inscription à une réunion d'information par lien public : lecture de la réunion et
// inscription atomique. Serveur UNIQUEMENT (client service_role) ; le jeton du lien est le
// seul secret, la réunion d'un bac à sable n'est jamais servie.

type Admin = ReturnType<typeof createAdminClient>;

type MeetingRow = {
  id: string;
  org_id: string;
  signup_token: string;
  series_token: string | null;
  stagger_minutes: number | null;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  capacity: number | null;
  signup_open: boolean;
  oral_test_included: boolean;
  rooms: { name: string; address: string | null; access_notes: string | null } | null;
  org: { slug: string } | null;
  info_meeting_invitations: { status: string }[];
};


// Salle + adresse, comme dans les convocations : l'adresse saisie sur la réunion prime sur celle de la salle.
function placeOf(row: Pick<MeetingRow, "rooms" | "location">): string | null {
  const room = row.rooms;
  if (!room?.name) return row.location;
  const detail = row.location ?? room.address;
  return detail ? `${room.name} — ${detail}` : room.name;
}

// orgId reste côté serveur : seule `meeting` part vers le navigateur.
export type LoadedMeeting = { orgId: string; meeting: PublicMeeting };

const COLUMNS =
  "id, org_id, signup_token, series_token, stagger_minutes, title, starts_at, ends_at, location, capacity, signup_open, oral_test_included, rooms:room_id(name, address, access_notes), org:org_id(slug), info_meeting_invitations(status)";

function toLoaded(row: MeetingRow, now: Date): LoadedMeeting {
  const taken = (row.info_meeting_invitations ?? []).filter((i) => SEATED_STATUSES.includes(i.status)).length;
  return {
    orgId: row.org_id,
    meeting: {
      token: row.signup_token,
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      place: placeOf(row),
      access: row.rooms?.access_notes ?? null,
      oralTest: row.oral_test_included,
      placesLeft: placesLeft(row.capacity, taken),
      state: meetingState({ signupOpen: row.signup_open, startsAt: row.starts_at, capacity: row.capacity, taken }, now),
      staggered: Boolean(row.stagger_minutes),
    },
  };
}

// Une réunion, par son jeton propre (champ « m » du formulaire).
export async function loadPublicMeeting(admin: Admin, token: unknown, now: Date = new Date()): Promise<LoadedMeeting | null> {
  if (!isMeetingToken(token)) return null;
  const { data, error } = await admin.from("info_meetings").select(COLUMNS).eq("signup_token", token).maybeSingle();
  if (error) {
    console.warn(`[inscription] réunion illisible : ${error.message}`);
    return null;
  }
  if (!data) return null;
  const row = data as unknown as MeetingRow;
  if (row.org?.slug === SANDBOX_SLUG) return null;
  return toLoaded(row, now);
}

/**
 * Ce que propose le lien : tous les créneaux de la réunion, du plus proche au plus lointain. Le jeton
 * COMMUN (series_token) les donne directement ; le jeton propre d'un créneau qui appartient à une série
 * (lien copié avant l'ajout des autres créneaux) les donne aussi. Même organisme pour tous, jamais le
 * bac à sable. null = lien inconnu.
 */
export async function loadMeetingOffer(
  admin: Admin,
  token: unknown,
  now: Date = new Date(),
): Promise<{ orgId: string; meetings: PublicMeeting[] } | null> {
  if (!isMeetingToken(token)) return null; // 32 caractères hexadécimaux : sans danger dans le filtre
  const { data, error } = await admin
    .from("info_meetings")
    .select(COLUMNS)
    .or(`signup_token.eq.${token},series_token.eq.${token}`);
  if (error) {
    console.warn(`[inscription] réunions illisibles : ${error.message}`);
    return null;
  }
  let rows = ((data ?? []) as unknown as MeetingRow[]).filter((r) => r.org?.slug !== SANDBOX_SLUG);
  if (rows.length === 0) return null;

  // Lien propre d'un créneau qui fait partie d'une série : on rapatrie les autres créneaux.
  const own = rows.find((r) => r.signup_token === token);
  if (own?.series_token && own.series_token !== token) {
    const { data: more, error: moreError } = await admin.from("info_meetings").select(COLUMNS).eq("series_token", own.series_token);
    if (moreError) console.warn(`[inscription] créneaux de la série illisibles : ${moreError.message}`);
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const r of (more ?? []) as unknown as MeetingRow[]) if (r.org?.slug !== SANDBOX_SLUG) byId.set(r.id, r);
    rows = [...byId.values()];
  }
  const orgId = rows[0].org_id;
  const meetings = rows
    .filter((r) => r.org_id === orgId)
    .map((r) => toLoaded(r, now).meeting)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { orgId, meetings };
}

/**
 * Inscrit la personne à la réunion (fonction SQL atomique : le dernier siège ne se vend qu'une
 * fois). `token` = jeton du créneau où elle est inscrite (« already » : peut-être un autre créneau du
 * même lien). null = erreur technique ; la fiche de la personne existe déjà, l'équipe la rappelle.
 */
export async function registerForMeeting(
  admin: Admin,
  token: string,
  learnerId: string,
): Promise<{ outcome: MeetingOutcome; token: string | null; convocationAt: string | null } | null> {
  const { data, error } = await admin.rpc("signup_for_info_meeting", { p_token: token, p_learner_id: learnerId });
  if (error) {
    console.error(`[inscription] inscription à la réunion impossible : ${error.message}`);
    return null;
  }
  const r = (data ?? null) as { result?: string; token?: string | null; convocation_at?: string | null } | null;
  const outcome = r?.result;
  if (outcome !== "registered" && outcome !== "already" && outcome !== "full" && outcome !== "closed") return null;
  return {
    outcome,
    token: typeof r?.token === "string" ? r.token : null,
    // Heure de passage attribuée (accueil échelonné, 0058) ; absente avant 0058 ou sans accueil échelonné.
    convocationAt: typeof r?.convocation_at === "string" ? r.convocation_at : null,
  };
}
