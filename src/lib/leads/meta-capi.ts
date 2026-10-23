import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { toWhatsAppNumber } from "@/lib/admission/phone";
import { manualOnlyLead } from "@/lib/leads/templates";
import { SANDBOX_SLUG } from "@/lib/production-orgs";
import type { InboundTracking } from "@/lib/leads/inbound";

// API Conversions de Meta (côté serveur) : l'ERP dit à Meta quels leads de la campagne
// restauration avancent vraiment, pour que l'algorithme cherche des restaurateurs qui
// se qualifient et prennent rendez-vous, pas seulement des formulaires remplis.
//
//   Lead          à la réception du formulaire (même event_id que le pixel si la landing
//                 le transmet, sinon l'identifiant de la fiche)
//   LeadQualifie  quand la fiche passe « Qualifié » (ou directement « RDV pris »)
//   RdvPris       quand la fiche passe « RDV pris »
//
// Garde-fous : rien sans META_PIXEL_ID et META_CAPI_TOKEN (no-op écrit dans les journaux),
// rien hors de l'organisation de production, rien sans le consentement de recontact
// donné sur la landing, rien pour les fiches terrain ou prospection. Aucune donnée
// personnelle en clair : e-mail, téléphone, prénom, nom, ville et code postal partent
// hachés en SHA-256 après normalisation. Une marque de journal par événement rend
// l'envoi idempotent ; une panne de Meta est écrite dans les journaux et n'interrompt rien.
//
// Format vérifié le 23/10/2026 sur developers.facebook.com/docs/marketing-api/conversions-api :
// POST https://graph.facebook.com/{version}/{PIXEL_ID}/events?access_token=…,
// corps { data: [événement], test_event_code? }.

export const META_GRAPH_VERSION = "v26.0";
export const DEFAULT_LANDING_URL = "https://parlerresto.com/";

export const META_EVENTS = {
  lead: "Lead",
  qualifie: "LeadQualifie",
  rdvPris: "RdvPris",
} as const;

export type MetaLeadEvent = (typeof META_EVENTS)[keyof typeof META_EVENTS];

const LIBELLES: Record<MetaLeadEvent, string> = {
  Lead: "Lead (formulaire reçu)",
  LeadQualifie: "Lead qualifié",
  RdvPris: "RDV pris",
};

export type LeadForMeta = {
  id: string;
  lead_no: number | null;
  source?: string | null;
  campaign?: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  postal_code: string | null;
  // Colonnes de la migration 20261023000054 (absentes tant qu'elle n'est pas appliquée).
  recontact_consent?: boolean | null;
  meta_fbc?: string | null;
  meta_fbp?: string | null;
};

export type MetaCapiConfig = { pixelId: string; token: string; testCode: string | null; version: string };

export type MetaCapiResult =
  | { sent: true; eventId: string }
  | { sent: false; reason: "not_configured" | "no_consent" | "manual_source" | "not_production" | "already_sent" | "delivery_failed" };

/** Configuration lue dans l'environnement ; null si le pixel ou le jeton manque. */
export function metaCapiConfig(): MetaCapiConfig | null {
  const pixelId = process.env.META_PIXEL_ID?.trim();
  const token = process.env.META_CAPI_TOKEN?.trim();
  if (!pixelId || !token || !/^\d+$/.test(pixelId)) return null;
  const version = process.env.META_GRAPH_VERSION?.trim();
  return {
    pixelId,
    token,
    testCode: process.env.META_CAPI_TEST_CODE?.trim() || null,
    version: version && /^v\d+\.\d+$/.test(version) ? version : META_GRAPH_VERSION,
  };
}

// ── Normalisation et hachage (règles « customer information parameters » de Meta) ──

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Espaces retirés, minuscules. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = raw?.trim().toLowerCase();
  return v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

/** Chiffres seuls avec l'indicatif, sans « + » ni zéro de tête : 06 12 34 56 78 → 33612345678. */
export function normalizePhone(raw: string | null | undefined): string | null {
  return toWhatsAppNumber(raw);
}

/** Minuscules, sans ponctuation ni espace ; les lettres accentuées restent (UTF-8). */
export function normalizeName(raw: string | null | undefined): string | null {
  const v = raw?.normalize("NFC").toLowerCase().replace(/[^\p{L}]/gu, "");
  return v || null;
}

/** Minuscules, sans accent, ponctuation ni espace : « Saint-Ouen » → « saintouen ». */
export function normalizeCity(raw: string | null | undefined): string | null {
  const v = raw?.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  return v || null;
}

/** Sans espace ni tiret : « 93 400 » → « 93400 ». */
export function normalizeZip(raw: string | null | undefined): string | null {
  const v = raw?.toLowerCase().replace(/[\s-]/g, "");
  return v && v.length >= 2 ? v : null;
}

/** « Sonia Ben Amrani » → prénom « Sonia », nom « Ben Amrani ». */
export function splitContactName(full: string | null | undefined): { first: string | null; last: string | null } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? null, last: parts.length > 1 ? parts.slice(1).join(" ") : null };
}

/**
 * Identifiant de clic Meta : le cookie _fbc s'il a été transmis, sinon reconstruit depuis
 * le fbclid du lien publicitaire, daté du moment où l'ERP l'a reçu (règle Meta).
 */
export function metaFbcFor(tracking: Pick<InboundTracking, "fbc" | "fbclid">, receivedAtMs: number): string | null {
  if (tracking.fbc) return tracking.fbc;
  return tracking.fbclid ? `fb.1.${Math.round(receivedAtMs)}.${tracking.fbclid}` : null;
}

type UserData = {
  em?: string[];
  ph?: string[];
  fn?: string[];
  ln?: string[];
  ct?: string[];
  zp?: string[];
  country: string[];
  external_id: string[];
  fbc?: string;
  fbp?: string;
  client_user_agent?: string;
};

function hashed(value: string | null): string[] | undefined {
  return value ? [sha256(value)] : undefined;
}

export function buildUserData(lead: LeadForMeta, extra: { fbc?: string | null; fbp?: string | null; userAgent?: string | null } = {}): UserData {
  const { first, last } = splitContactName(lead.contact_name);
  const data: UserData = {
    em: hashed(normalizeEmail(lead.email)),
    ph: hashed(normalizePhone(lead.phone)),
    fn: hashed(normalizeName(first)),
    ln: hashed(normalizeName(last)),
    ct: hashed(normalizeCity(lead.city)),
    zp: hashed(normalizeZip(lead.postal_code)),
    country: [sha256("fr")],
    // Identifiant de la fiche, haché : relie entre eux les événements d'un même lead.
    external_id: [sha256(lead.id)],
    // fbc, fbp et navigateur ne se hachent pas (règle Meta) et ne nomment personne.
    fbc: extra.fbc ?? lead.meta_fbc ?? undefined,
    fbp: extra.fbp ?? lead.meta_fbp ?? undefined,
    client_user_agent: extra.userAgent ?? undefined,
  };
  for (const key of Object.keys(data) as (keyof UserData)[]) {
    if (data[key] === undefined) delete data[key];
  }
  return data;
}

export type MetaServerEvent = {
  event_name: MetaLeadEvent;
  event_time: number;
  event_id: string;
  action_source: "website" | "system_generated";
  event_source_url?: string;
  user_data: UserData;
  custom_data: Record<string, string | number>;
};

/** Identifiant de déduplication : stable pour un même lead et un même événement. */
export function metaEventId(eventName: MetaLeadEvent, leadId: string, fromLanding?: string | null): string {
  if (eventName === META_EVENTS.lead) return fromLanding || leadId;
  return `${leadId}:${eventName === META_EVENTS.qualifie ? "qualifie" : "rdv_pris"}`;
}

/**
 * Un événement « website » exige chez Meta le navigateur (client_user_agent) et la page
 * (event_source_url). Sans navigateur transmis par la landing, le Lead part en
 * « system_generated », comme les étapes suivantes, qui se passent dans l'ERP.
 */
export function buildMetaEvent(params: {
  eventName: MetaLeadEvent;
  lead: LeadForMeta;
  eventId: string;
  eventTime: number;
  tracking?: { fbc?: string | null; fbp?: string | null; userAgent?: string | null; pageUrl?: string | null };
}): MetaServerEvent {
  const tracking = params.tracking ?? {};
  const website = params.eventName === META_EVENTS.lead && Boolean(tracking.userAgent);
  const custom: Record<string, string | number> = {};
  if (params.lead.lead_no != null) custom.lead_no = params.lead.lead_no;
  if (params.lead.source) custom.source = params.lead.source;
  if (params.lead.campaign) custom.campaign = params.lead.campaign;
  return {
    event_name: params.eventName,
    event_time: params.eventTime,
    event_id: params.eventId,
    action_source: website ? "website" : "system_generated",
    ...(website ? { event_source_url: tracking.pageUrl || DEFAULT_LANDING_URL } : {}),
    user_data: buildUserData(params.lead, { fbc: tracking.fbc, fbp: tracking.fbp, userAgent: website ? tracking.userAgent : null }),
    custom_data: custom,
  };
}

/** Étapes signalées à Meta pour un statut ; « RDV pris » vaut aussi lead qualifié. */
export function metaEventsForStatus(status: string | null | undefined): MetaLeadEvent[] {
  if (status === "qualifie") return [META_EVENTS.qualifie];
  if (status === "rdv_pris") return [META_EVENTS.qualifie, META_EVENTS.rdvPris];
  return [];
}

function marker(eventName: MetaLeadEvent): string {
  return `[meta:${eventName}]`;
}

async function isProductionOrg(supabase: SupabaseClient, orgId: string): Promise<boolean> {
  const { data } = await supabase.from("organizations").select("slug").eq("id", orgId).maybeSingle();
  return Boolean(data) && (data as { slug: string | null }).slug !== SANDBOX_SLUG;
}

/** Envoie un événement de lead à Meta. Ne lève jamais. */
export async function sendMetaLeadEvent(
  supabase: SupabaseClient,
  params: {
    orgId: string;
    lead: LeadForMeta;
    eventName: MetaLeadEvent;
    eventId?: string | null;
    consent?: boolean | null;
    tracking?: { fbc?: string | null; fbp?: string | null; userAgent?: string | null; pageUrl?: string | null };
    now?: Date;
  },
): Promise<MetaCapiResult> {
  const config = metaCapiConfig();
  if (!config) {
    console.info(`[meta-capi] ${params.eventName} non envoyé : META_PIXEL_ID ou META_CAPI_TOKEN absent`);
    return { sent: false, reason: "not_configured" };
  }
  try {
    const consent = params.consent ?? params.lead.recontact_consent ?? null;
    if (consent !== true) return { sent: false, reason: "no_consent" };
    if (manualOnlyLead(params.lead)) return { sent: false, reason: "manual_source" };
    if (!(await isProductionOrg(supabase, params.orgId))) return { sent: false, reason: "not_production" };

    const mark = marker(params.eventName);
    const { data: prior } = await supabase
      .from("employer_lead_events")
      .select("id")
      .eq("org_id", params.orgId)
      .eq("lead_id", params.lead.id)
      .ilike("note", `%${mark}%`)
      .limit(1);
    if (prior?.[0]) return { sent: false, reason: "already_sent" };

    const eventId = metaEventId(params.eventName, params.lead.id, params.eventId);
    const event = buildMetaEvent({
      eventName: params.eventName,
      lead: params.lead,
      eventId,
      eventTime: Math.floor((params.now ?? new Date()).getTime() / 1000),
      tracking: params.tracking,
    });
    const body = { data: [event], ...(config.testCode ? { test_event_code: config.testCode } : {}) };
    const url = `https://graph.facebook.com/${config.version}/${config.pixelId}/events?access_token=${encodeURIComponent(config.token)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const result = (await response.json().catch(() => ({}))) as { events_received?: number; fbtrace_id?: string; error?: { message?: string; code?: number } };
    if (!response.ok) {
      console.error(`[meta-capi] ${params.eventName} refusé par Meta : ${response.status}`, result.error?.message ?? "", result.error?.code ?? "");
      return { sent: false, reason: "delivery_failed" };
    }

    const { error } = await supabase.from("employer_lead_events").insert({
      org_id: params.orgId,
      lead_id: params.lead.id,
      kind: "note",
      outcome: null,
      note: `${mark} Signal « ${LIBELLES[params.eventName]} » transmis à Meta (API Conversions${config.testCode ? ", mode test" : ""}).`,
    });
    if (error) console.error(`[meta-capi] ${params.eventName} journalisation impossible`, error.message);
    return { sent: true, eventId };
  } catch (error) {
    console.error(`[meta-capi] ${params.eventName} envoi impossible`, error instanceof Error ? error.message : error);
    return { sent: false, reason: "delivery_failed" };
  }
}

/** Lead reçu par le webhook : consentement et données de suivi viennent du formulaire. */
export async function dispatchMetaInboundLead(
  supabase: SupabaseClient,
  params: { orgId: string; lead: LeadForMeta; consent: boolean | null; tracking: InboundTracking; fbc: string | null },
): Promise<MetaCapiResult> {
  return sendMetaLeadEvent(supabase, {
    orgId: params.orgId,
    lead: params.lead,
    eventName: META_EVENTS.lead,
    eventId: params.tracking.eventId,
    consent: params.consent,
    tracking: { fbc: params.fbc, fbp: params.tracking.fbp, userAgent: params.tracking.userAgent, pageUrl: params.tracking.pageUrl },
  });
}

/** Changement de statut : consentement et identifiants publicitaires lus sur la fiche. */
export async function dispatchMetaStatusEvents(
  supabase: SupabaseClient,
  params: { orgId: string; lead: LeadForMeta; status: string | null | undefined },
): Promise<MetaCapiResult[]> {
  const results: MetaCapiResult[] = [];
  for (const eventName of metaEventsForStatus(params.status)) {
    results.push(await sendMetaLeadEvent(supabase, { orgId: params.orgId, lead: params.lead, eventName }));
  }
  return results;
}
