// Pont lemlist ↔ ERP pour la prospection sortante (pilote POEI restauration, novembre 2026).
//
// lemlist → ERP : lemlist appelle POST /api/prospection/lemlist à chaque activité (webhook).
//   - réponse humaine            → lead (source « prospection », campagne LEMLIST_CAMPAGNE),
//                                   « Contacté », prochaine action « classer la réponse » ;
//   - « intéressé » dans lemlist → idem, et la fiche Prospection passe « Intéressé » ;
//   - stop / désinscription      → Prospection « Ne plus appeler », lead « Perdu » (Opposition),
//                                   et liste de blocage lemlist (e-mail, téléphone, LinkedIn) ;
//   - rebond                     → Prospection « Injoignable » s'il n'y a pas de téléphone ;
//   - message d'absence          → simple note, aucun statut.
// ERP → lemlist : un « Ne plus appeler » posé dans Prospection, ou un lead passé « Perdu » pour
//   opposition, met l'e-mail et le téléphone dans la liste de blocage lemlist.
//
// Règle absolue : tout lead créé ici a la source « prospection ». Avec cette source, l'ERP
// n'envoie aucun e-mail ni SMS automatique (MANUAL_ONLY_SOURCES), même automatismes activés.
// Ce module n'écrit jamais qu'à l'organisation passée en paramètre (filtre org_id partout).

export const LEMLIST_API = "https://api.lemlist.com/api";
export const DEFAULT_CAMPAIGN = "poei_sortante_2026-11";
export const OPPOSITION_REASON = "Opposition — ne plus contacter";
export const OPPOSITION_LIST_NAME = "Oppositions lemlist — ne jamais réimporter";

/** Campagne écrite sur les leads créés par le pont (variable LEMLIST_CAMPAGNE, sinon celle du pilote). */
export function bridgeCampaign(env: Record<string, string | undefined> = process.env): string {
  return env.LEMLIST_CAMPAGNE?.trim() || DEFAULT_CAMPAIGN;
}

// ── Lecture d'un événement ───────────────────────────────────────────────────

export type LemlistEvent = {
  activityId: string | null;
  type: string;
  campaignName: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  siret: string | null;
  /** SIREN (9 chiffres) : variable personnalisée « siren » des listes de restaurants, ou début du SIRET. */
  siren: string | null;
  city: string | null;
  postalCode: string | null;
  text: string | null;
  at: string | null;
  /** Rendez-vous pris (lemcal, événement meetingBooked). */
  meetingDate: string | null;
  meetingType: string | null;
  secret: string | null;
};

function str(v: unknown): string | null {
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Normalise le corps d'un webhook lemlist. Renvoie null s'il ne ressemble pas à une activité. */
export function parseLemlistEvent(body: unknown): LemlistEvent | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const type = str(b.type);
  if (!type) return null;
  const html = str(b.html) ?? str(b.bodyHtml);
  const text = str(b.text) ?? str(b.message) ?? str(b.body) ?? str(b.snippet) ?? str(b.messagePreview) ?? (html ? stripHtml(html) : null);
  const email = (str(b.leadEmail) ?? str(b.email))?.toLowerCase() ?? null;
  const siret = (str(b.siret) ?? "").replace(/\s/g, "");
  const sirenRaw = (str(b.siren) ?? "").replace(/\s/g, "");
  const siren = /^\d{9}$/.test(sirenRaw) ? sirenRaw : /^\d{14}$/.test(siret) ? siret.slice(0, 9) : null;
  const meetingRaw = str(b.meetingDate);
  return {
    activityId: str(b._id) ?? str(b.id),
    type,
    campaignName: str(b.campaignName),
    email: email && email.includes("@") ? email : null,
    phone: str(b.leadPhone) ?? str(b.phone),
    linkedinUrl: str(b.linkedinUrl) ?? str(b.leadLinkedinUrl),
    firstName: str(b.leadFirstName) ?? str(b.firstName),
    lastName: str(b.leadLastName) ?? str(b.lastName),
    companyName: str(b.leadCompanyName) ?? str(b.companyName),
    siret: /^\d{14}$/.test(siret) ? siret : null,
    siren,
    city: str(b.city) ?? str(b.ville),
    postalCode: str(b.postalCode) ?? str(b.codePostal),
    text: text ? text.slice(0, 2000) : null,
    at: str(b.createdAt),
    meetingDate: meetingRaw && !Number.isNaN(Date.parse(meetingRaw)) ? new Date(meetingRaw).toISOString() : null,
    meetingType: str(b.meetingType),
    secret: str(b.secret),
  };
}

// ── Classement ───────────────────────────────────────────────────────────────

// « En cas de doute : cas 5 » (grille du 02/11) : la détection du stop est volontairement large.
const STOP = /\bstop\b|unsubscribe|d[ée]sinscri|d[ée]sabonn|ne (?:plus )?(?:m['’]|me |nous )?(?:contactez|appelez|[ée]crivez|sollicitez|relancez)|(?:plus|pas) (?:me |nous )?(?:contacter|appeler|[ée]crire|relancer)|retirez[- ](?:moi|nous)|supprimez|arr[êe]tez|harc[eè]le|\bspam\b|\brgpd\b|\bcnil\b|pas int[ée]ress[ée].{0,40}(?:merci de|plus)/i;
const ABSENCE = /out of office|automatic reply|auto-?reply|r[ée]ponse automatique|message automatique|actuellement absente?|je suis absente?|en cong[ée]s? (?:jusqu|du)|je serai de retour|de retour le/i;

export function isStopText(text: string | null | undefined): boolean {
  return Boolean(text && STOP.test(text));
}
export function isOutOfOffice(text: string | null | undefined): boolean {
  return Boolean(text && ABSENCE.test(text));
}

export type LemlistAction = "opposition" | "reply" | "interested" | "not_interested" | "meeting" | "bounce" | "absence" | "ignore";

const UNSUBSCRIBE_TYPES = new Set(["emailsUnsubscribed", "entityUnsubscribed", "variableUnsubscribed", "apiUnsubscribed"]);
const REPLY_TYPES = new Set(["emailsReplied", "linkedinReplied", "smsReplied", "whatsappReplied"]);
const INTERESTED_TYPES = new Set(["interested", "emailsInterested", "linkedinInterested", "aircallInterested", "apiInterested", "manualInterested"]);
const NOT_INTERESTED_TYPES = new Set(["notInterested", "emailsNotInterested", "linkedinNotInterested", "aircallNotInterested", "apiNotInterested", "manualNotInterested"]);
const MEETING_TYPES = new Set(["meetingBooked"]);
const BOUNCE_TYPES = new Set(["emailsBounced"]);

/** Ce que le pont fait d'un événement. Tout le reste (envois, ouvertures, clics…) est ignoré. */
export function actionFor(e: Pick<LemlistEvent, "type" | "text">): LemlistAction {
  if (UNSUBSCRIBE_TYPES.has(e.type)) return "opposition";
  if (REPLY_TYPES.has(e.type)) {
    if (isStopText(e.text)) return "opposition";
    if (isOutOfOffice(e.text)) return "absence";
    return "reply";
  }
  if (INTERESTED_TYPES.has(e.type)) return "interested";
  if (NOT_INTERESTED_TYPES.has(e.type)) return "not_interested";
  if (MEETING_TYPES.has(e.type)) return "meeting";
  if (BOUNCE_TYPES.has(e.type)) return "bounce";
  return "ignore";
}

export function channelOf(type: string): { label: string; kind: "email" | "sms" | "whatsapp" | "appel" | "rdv" | "note" } {
  if (type.startsWith("emails")) return { label: "e-mail", kind: "email" };
  if (type.startsWith("linkedin")) return { label: "LinkedIn", kind: "note" };
  if (type.startsWith("sms")) return { label: "SMS", kind: "sms" };
  if (type.startsWith("whatsapp")) return { label: "WhatsApp", kind: "whatsapp" };
  if (type.startsWith("aircall")) return { label: "appel", kind: "appel" };
  if (type === "apiUnsubscribed") return { label: "lemlist (désinscription)", kind: "note" };
  if (type.endsWith("Unsubscribed")) return { label: "lien de désinscription", kind: "email" };
  if (type === "meetingBooked") return { label: "lemcal", kind: "rdv" };
  return { label: "lemlist", kind: "note" };
}

/** « 04/11/2026 » à Paris. */
export function frDate(iso: string | null | undefined, now: Date = new Date()): string {
  const d = iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso) : now;
  return d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
}

export function oppositionReason(e: Pick<LemlistEvent, "type" | "at">, now?: Date): string {
  return `${OPPOSITION_REASON} (${frDate(e.at, now)}, ${channelOf(e.type).label})`;
}

export function isOppositionReason(reason: string | null | undefined): boolean {
  return /opposition/i.test(reason ?? "");
}

/** Repère écrit dans le journal pour ne jamais traiter deux fois la même activité (lemlist réessaie). */
export function activityMarker(activityId: string | null): string | null {
  return activityId ? `[lemlist ${activityId}]` : null;
}

// ── Secret du webhook ────────────────────────────────────────────────────────

/** Comparaison à temps constant du secret reçu avec LEMLIST_WEBHOOK_SECRET. */
export function secretMatches(received: string | null | undefined, expected: string | null | undefined): boolean {
  if (!received || !expected || expected.length < 16) return false;
  const a = new TextEncoder().encode(received);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i += 1) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

// ── Liste de blocage lemlist (API publique, Basic auth : identifiant vide, clé en mot de passe) ──

export type UnsubscribeResult = { done: string[]; failed: string[]; skipped?: "no_api_key" };
type FetchLike = (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status">>;

/** Valeurs à bloquer : e-mail, téléphone et profil LinkedIn connus. */
export function blocklistValues(v: { email?: string | null; phone?: string | null; linkedinUrl?: string | null }): string[] {
  const out = [v.email?.trim().toLowerCase(), v.phone?.replace(/[\s.-]/g, ""), v.linkedinUrl?.trim()].filter((x): x is string => Boolean(x));
  return [...new Set(out)];
}

/**
 * Ajoute chaque valeur à la liste de blocage lemlist (POST /v2/unsubscribes/variables/{valeur},
 * idempotent). Sans LEMLIST_API_KEY, ne fait rien et le dit. Ne jette jamais d'erreur.
 */
export async function lemlistUnsubscribe(
  values: string[],
  opts: { apiKey?: string | null; fetchImpl?: FetchLike } = {},
): Promise<UnsubscribeResult> {
  const apiKey = opts.apiKey === undefined ? process.env.LEMLIST_API_KEY : opts.apiKey;
  if (!apiKey) return { done: [], failed: values, skipped: "no_api_key" };
  const doFetch: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init));
  const auth = `Basic ${Buffer.from(`:${apiKey}`).toString("base64")}`;
  const done: string[] = [];
  const failed: string[] = [];
  for (const v of values) {
    try {
      const res = await doFetch(`${LEMLIST_API}/v2/unsubscribes/variables/${encodeURIComponent(v)}`, {
        method: "POST",
        headers: { Authorization: auth },
        signal: AbortSignal.timeout(8000),
      });
      (res.ok ? done : failed).push(v);
    } catch {
      failed.push(v);
    }
  }
  return { done, failed };
}
