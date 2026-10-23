import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMetaEvent,
  buildUserData,
  dispatchMetaInboundLead,
  dispatchMetaStatusEvents,
  metaCapiConfig,
  metaEventId,
  metaEventsForStatus,
  metaFbcFor,
  normalizeCity,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeZip,
  sendMetaLeadEvent,
  sha256,
  splitContactName,
  type LeadForMeta,
} from "@/lib/leads/meta-capi";
import { normalizeInbound, parseConsent, type InboundTracking } from "@/lib/leads/inbound";
import { noteLisible } from "@/lib/leads/journal";

// L'API Conversions apprend à Meta quels restaurateurs se qualifient vraiment. Elle ne
// doit jamais envoyer de donnée personnelle en clair, jamais partir sans jeton, sans
// consentement ou hors production, jamais deux fois le même événement, et une panne de
// Meta ne doit rien bloquer.

const ORG = "5f5a6f2e-2f3f-4cf7-b1f4-9bd4f7a2c001";
const PIXEL = "1407849964096510";
const SHA_FR = "67ad8f41a7bb0a18c45f3efd8f6a32bdcd832bcf8f3f2eb44006c03d53076e18";

const lead: LeadForMeta = {
  id: "0f0e6b6c-6c51-4c1e-9a6d-5a2f5a8b9a11",
  lead_no: 21,
  source: "site",
  campaign: "poei_restauration",
  contact_name: "Sonia Amrani",
  email: " Sonia@LeComptoir.fr ",
  phone: "06 12 34 56 78",
  city: "Saint-Ouen",
  postal_code: "93 400",
  recontact_consent: true,
  meta_fbc: null,
  meta_fbp: null,
};

const noTracking: InboundTracking = { eventId: null, fbc: null, fbp: null, fbclid: null, userAgent: null, pageUrl: null };

function fakeSupabase(options: { prior?: boolean; slug?: string | null } = {}) {
  const inserts: Record<string, unknown>[] = [];
  const touched: string[] = [];
  const from = (table: string) => {
    touched.push(table);
    const query = {
      select: () => query,
      eq: () => query,
      ilike: () => query,
      maybeSingle: async () => ({ data: options.slug === null ? null : { slug: options.slug ?? "pef" }, error: null }),
      limit: async () => ({ data: options.prior ? [{ id: "evt" }] : [], error: null }),
      insert: async (row: Record<string, unknown>) => {
        inserts.push(row);
        return { error: null };
      },
    };
    return query;
  };
  return { client: { from } as never, inserts, touched };
}

function stubMeta(extra: Record<string, string> = {}) {
  vi.stubEnv("META_PIXEL_ID", PIXEL);
  vi.stubEnv("META_CAPI_TOKEN", "EAAB-jeton-de-test");
  vi.stubEnv("META_CAPI_TEST_CODE", "");
  vi.stubEnv("META_GRAPH_VERSION", "");
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
}

function okFetch() {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ events_received: 1, fbtrace_id: "Axyz" }), { status: 200 }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("API Conversions Meta : normalisation et hachage", () => {
  it("hache en SHA-256 hexadécimal minuscule", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256("fr")).toBe(SHA_FR);
  });

  it("normalise selon les règles de Meta avant de hacher", () => {
    expect(normalizeEmail(" Sonia@LeComptoir.fr ")).toBe("sonia@lecomptoir.fr");
    expect(normalizeEmail("pas-un-email")).toBeNull();
    expect(normalizePhone("06 12 34 56 78")).toBe("33612345678");
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("33612345678");
    expect(normalizeName("Jean-Pierre")).toBe("jeanpierre");
    expect(normalizeName("Hélène")).toBe("hélène");
    expect(normalizeCity("Saint-Ouen-sur-Seine")).toBe("saintouensurseine");
    expect(normalizeCity("Épinay")).toBe("epinay");
    expect(normalizeZip("93 400")).toBe("93400");
    expect(splitContactName("Sonia Ben Amrani")).toEqual({ first: "Sonia", last: "Ben Amrani" });
    expect(splitContactName("Yacine")).toEqual({ first: "Yacine", last: null });
  });

  it("n'envoie que des empreintes, jamais l'e-mail, le téléphone ou le nom en clair", () => {
    const data = buildUserData(lead);
    expect(data.em).toEqual(["d4e6b63c309c60516ceff9e2ff10069108d2aa565cec1d759b478182670dd11a"]);
    expect(data.ph).toEqual(["8a3e7886c9335e82e02299fa3e87b46e2de3b0c63d56003e30a5029394a47661"]);
    expect(data.fn).toEqual(["b90d33f2b12789d32691050a2083be28eb99985601a1f1a72efc9232e49306fd"]);
    expect(data.ln).toEqual(["f8bca1d7f19c5fbe3b227dfe9aee483a0ec71334893ee4fa3e963047e45dab20"]);
    expect(data.ct).toEqual(["8ba1232f4415071e41b1cf531a520fd937bfec8d97aa032e685df810f1ad89b1"]);
    expect(data.zp).toEqual(["e78170eca8ef732a1ac79a0c246e24c2a49887cdc09f6532131c20f21ac0f286"]);
    expect(data.country).toEqual([SHA_FR]);
    expect(data.external_id).toEqual([sha256(lead.id)]);
    const json = JSON.stringify(data).toLowerCase();
    for (const clair of ["sonia", "amrani", "lecomptoir", "33612345678", "0612345678", "saint", "93400", lead.id]) {
      expect(json).not.toContain(clair);
    }
  });

  it("omet les champs absents au lieu d'envoyer des empreintes vides", () => {
    const data = buildUserData({ ...lead, email: null, phone: null, contact_name: null, city: null, postal_code: null });
    expect(Object.keys(data).sort()).toEqual(["country", "external_id"]);
  });
});

describe("API Conversions Meta : construction de l'événement", () => {
  it("Lead avec navigateur transmis : événement « website » avec la page d'origine", () => {
    const event = buildMetaEvent({
      eventName: "Lead",
      lead,
      eventId: "journey-abc",
      eventTime: 1_761_200_000,
      tracking: { fbc: "fb.1.1761199000000.IwAR123", fbp: "fb.1.1761199000000.987654321", userAgent: "Mozilla/5.0", pageUrl: "https://parlerresto.com/?utm_source=facebook" },
    });
    expect(event).toMatchObject({
      event_name: "Lead",
      event_time: 1_761_200_000,
      event_id: "journey-abc",
      action_source: "website",
      event_source_url: "https://parlerresto.com/?utm_source=facebook",
      custom_data: { lead_no: 21, source: "site", campaign: "poei_restauration" },
    });
    expect(event.user_data.fbc).toBe("fb.1.1761199000000.IwAR123");
    expect(event.user_data.fbp).toBe("fb.1.1761199000000.987654321");
    expect(event.user_data.client_user_agent).toBe("Mozilla/5.0");
  });

  it("sans navigateur, et pour les étapes de l'ERP : « system_generated », sans page ni navigateur", () => {
    const lead0 = buildMetaEvent({ eventName: "Lead", lead, eventId: lead.id, eventTime: 1 });
    expect(lead0.action_source).toBe("system_generated");
    expect(lead0.event_source_url).toBeUndefined();
    const rdv = buildMetaEvent({ eventName: "RdvPris", lead: { ...lead, meta_fbc: "fb.1.1.IwAR9" }, eventId: "x", eventTime: 1, tracking: { userAgent: "Mozilla/5.0" } });
    expect(rdv.action_source).toBe("system_generated");
    expect(rdv.user_data.client_user_agent).toBeUndefined();
    expect(rdv.user_data.fbc).toBe("fb.1.1.IwAR9"); // repris de la fiche
  });

  it("identifiants d'événement stables : celui de la landing, sinon la fiche", () => {
    expect(metaEventId("Lead", lead.id, "journey-abc")).toBe("journey-abc");
    expect(metaEventId("Lead", lead.id, null)).toBe(lead.id);
    expect(metaEventId("LeadQualifie", lead.id)).toBe(`${lead.id}:qualifie`);
    expect(metaEventId("RdvPris", lead.id)).toBe(`${lead.id}:rdv_pris`);
  });

  it("reconstruit _fbc depuis le fbclid, daté de la réception", () => {
    expect(metaFbcFor({ fbc: null, fbclid: "IwAR3x" }, 1_761_200_000_123)).toBe("fb.1.1761200000123.IwAR3x");
    expect(metaFbcFor({ fbc: "fb.1.5.IwARcookie", fbclid: "IwAR3x" }, 1)).toBe("fb.1.5.IwARcookie");
    expect(metaFbcFor({ fbc: null, fbclid: null }, 1)).toBeNull();
  });

  it("étapes signalées selon le statut", () => {
    expect(metaEventsForStatus("qualifie")).toEqual(["LeadQualifie"]);
    expect(metaEventsForStatus("rdv_pris")).toEqual(["LeadQualifie", "RdvPris"]);
    expect(metaEventsForStatus("a_rappeler")).toEqual([]);
    expect(metaEventsForStatus(null)).toEqual([]);
  });
});

describe("API Conversions Meta : envoi", () => {
  it("ne fait rien sans jeton ou sans pixel, sans toucher la base ni le réseau", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { client, touched } = fakeSupabase();

    vi.stubEnv("META_PIXEL_ID", PIXEL);
    vi.stubEnv("META_CAPI_TOKEN", "");
    expect(metaCapiConfig()).toBeNull();
    expect(await sendMetaLeadEvent(client, { orgId: ORG, lead, eventName: "Lead" })).toEqual({ sent: false, reason: "not_configured" });

    vi.stubEnv("META_PIXEL_ID", "");
    vi.stubEnv("META_CAPI_TOKEN", "EAAB");
    expect(await sendMetaLeadEvent(client, { orgId: ORG, lead, eventName: "Lead" })).toEqual({ sent: false, reason: "not_configured" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(touched).toEqual([]);
  });

  it("ne part pas sans consentement de recontact, pour une fiche terrain, ni hors production", async () => {
    stubMeta();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendMetaLeadEvent(fakeSupabase().client, { orgId: ORG, lead: { ...lead, recontact_consent: null }, eventName: "LeadQualifie" }))
      .toEqual({ sent: false, reason: "no_consent" });
    expect(await sendMetaLeadEvent(fakeSupabase().client, { orgId: ORG, lead, eventName: "Lead", consent: false }))
      .toEqual({ sent: false, reason: "no_consent" });
    expect(await sendMetaLeadEvent(fakeSupabase().client, { orgId: ORG, lead: { ...lead, source: "terrain" }, eventName: "LeadQualifie" }))
      .toEqual({ sent: false, reason: "manual_source" });
    expect(await sendMetaLeadEvent(fakeSupabase({ slug: "bac-a-sable" }).client, { orgId: ORG, lead, eventName: "LeadQualifie" }))
      .toEqual({ sent: false, reason: "not_production" });
    expect(await sendMetaLeadEvent(fakeSupabase({ slug: null }).client, { orgId: ORG, lead, eventName: "LeadQualifie" }))
      .toEqual({ sent: false, reason: "not_production" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envoie la charge attendue au jeu de données et note l'envoi dans le journal", async () => {
    stubMeta();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { client, inserts } = fakeSupabase();
    const now = new Date("2026-10-23T10:00:00Z");

    const result = await sendMetaLeadEvent(client, { orgId: ORG, lead, eventName: "LeadQualifie", now });

    expect(result).toEqual({ sent: true, eventId: `${lead.id}:qualifie` });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://graph.facebook.com/v26.0/${PIXEL}/events?access_token=EAAB-jeton-de-test`);
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body.test_event_code).toBeUndefined();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      event_name: "LeadQualifie",
      event_time: Math.floor(now.getTime() / 1000),
      event_id: `${lead.id}:qualifie`,
      action_source: "system_generated",
      custom_data: { lead_no: 21, source: "site", campaign: "poei_restauration" },
    });
    expect(String(init.body).toLowerCase()).not.toContain("sonia");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].kind).toBe("note");
    expect(String(inserts[0].note)).toContain("[meta:LeadQualifie]");
  });

  it("ajoute le code de test et la version demandée quand ils sont réglés", async () => {
    stubMeta({ META_CAPI_TEST_CODE: "TEST123", META_GRAPH_VERSION: "v27.0" });
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    await sendMetaLeadEvent(fakeSupabase().client, { orgId: ORG, lead, eventName: "RdvPris" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v27.0/");
    expect(JSON.parse(String(init.body)).test_event_code).toBe("TEST123");
  });

  it("idempotent : un événement déjà noté pour la fiche ne repart pas", async () => {
    stubMeta();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { client, inserts } = fakeSupabase({ prior: true });
    expect(await sendMetaLeadEvent(client, { orgId: ORG, lead, eventName: "RdvPris" })).toEqual({ sent: false, reason: "already_sent" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it("une panne ou un refus de Meta ne lève jamais et ne note rien", async () => {
    stubMeta();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, inserts } = fakeSupabase();

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("réseau coupé"); }));
    expect(await sendMetaLeadEvent(client, { orgId: ORG, lead, eventName: "Lead" })).toEqual({ sent: false, reason: "delivery_failed" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid OAuth access token", code: 190 } }), { status: 400 })));
    expect(await sendMetaLeadEvent(client, { orgId: ORG, lead, eventName: "Lead" })).toEqual({ sent: false, reason: "delivery_failed" });
    expect(inserts).toHaveLength(0);

    const broken = { from: () => { throw new Error("base indisponible"); } } as never;
    await expect(sendMetaLeadEvent(broken, { orgId: ORG, lead, eventName: "LeadQualifie" })).resolves.toEqual({ sent: false, reason: "delivery_failed" });
  });

  it("Lead entrant : consentement et identifiants du formulaire, event_id de la landing", async () => {
    stubMeta();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const tracking: InboundTracking = { ...noTracking, eventId: "journey-42", fbclid: "IwAR3x", userAgent: "Mozilla/5.0" };
    const fbc = metaFbcFor(tracking, 1_761_200_000_000);
    const result = await dispatchMetaInboundLead(fakeSupabase().client, {
      orgId: ORG,
      lead: { ...lead, recontact_consent: undefined },
      consent: true,
      tracking,
      fbc,
    });
    expect(result).toEqual({ sent: true, eventId: "journey-42" });
    const event = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).data[0];
    expect(event.action_source).toBe("website");
    expect(event.event_source_url).toBe("https://parlerresto.com/");
    expect(event.user_data.fbc).toBe("fb.1.1761200000000.IwAR3x");
  });

  it("« RDV pris » signale aussi la qualification, une seule requête par événement", async () => {
    stubMeta();
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const results = await dispatchMetaStatusEvents(fakeSupabase().client, { orgId: ORG, lead, status: "rdv_pris" });
    expect(results).toEqual([
      { sent: true, eventId: `${lead.id}:qualifie` },
      { sent: true, eventId: `${lead.id}:rdv_pris` },
    ]);
    const names = fetchMock.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)).data[0].event_name);
    expect(names).toEqual(["LeadQualifie", "RdvPris"]);
    expect(await dispatchMetaStatusEvents(fakeSupabase().client, { orgId: ORG, lead, status: "contacte" })).toEqual([]);
  });

  it("le journal affiche la phrase sans la marque technique", () => {
    expect(noteLisible("[meta:RdvPris] Signal « RDV pris » transmis à Meta (API Conversions).")).toBe("Signal « RDV pris » transmis à Meta (API Conversions).");
  });
});

describe("webhook : consentement et données de suivi de la landing", () => {
  it("lit la case de recontact et les identifiants publicitaires", () => {
    const r = normalizeInbound({
      restaurant: "Le Comptoir",
      telephone: "0612345678",
      consentement_recontact: true,
      utm_source: "facebook",
      fbclid: "IwAR3xYz_-1",
      _fbp: "fb.1.1761199000000.987654321",
      journey_id: "j-7f3a",
      user_agent: "Mozilla/5.0 (iPhone)",
      page_url: "https://parlerresto.com/?fbclid=IwAR3xYz_-1",
    });
    expect(r?.kind).toBe("lead");
    if (r?.kind !== "lead") return;
    expect(r.recontactConsent).toBe(true);
    expect(r.tracking).toEqual({
      eventId: "j-7f3a",
      fbc: null,
      fbp: "fb.1.1761199000000.987654321",
      fbclid: "IwAR3xYz_-1",
      userAgent: "Mozilla/5.0 (iPhone)",
      pageUrl: "https://parlerresto.com/?fbclid=IwAR3xYz_-1",
    });
  });

  it("préfère un event_id explicite et rejette les valeurs mal formées", () => {
    const r = normalizeInbound({ email: "a@b.fr", event_id: "lead.123", journey_id: "j-1", fbc: "pas un fbc", fbclid: "<script>", page_url: "javascript:alert(1)" });
    if (r?.kind !== "lead") throw new Error("lead attendu");
    expect(r.tracking.eventId).toBe("lead.123");
    expect(r.tracking.fbc).toBeNull();
    expect(r.tracking.fbclid).toBeNull();
    expect(r.tracking.pageUrl).toBeNull();
    expect(r.recontactConsent).toBeNull();
  });

  it("comprend les formes courantes du consentement", () => {
    for (const oui of ["true", "on", "oui", "1", "TRUE"]) expect(parseConsent(oui)).toBe(true);
    for (const non of ["false", "off", "non", "0"]) expect(parseConsent(non)).toBe(false);
    expect(parseConsent(null)).toBeNull();
    expect(parseConsent("peut-être")).toBeNull();
  });
});
