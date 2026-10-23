import { afterEach, describe, expect, it, vi } from "vitest";
import { alertSetterOfNewLead, SETTER_ALERT_MARKER, setterAlertEnabled, setterAlertText } from "@/lib/leads/setter-alert";
import { DEFAULT_LEAD_SETTINGS, resolveLeadSettings, type LeadSettings } from "@/lib/leads/templates";
import { noteLisible } from "@/lib/leads/journal";
import type { LeadForBrevo } from "@/lib/leads/brevo";

// Le setter doit être prévenu sur son téléphone dans la minute qui suit l'arrivée d'un
// lead. L'alerte part à SON numéro (Réglages), jamais au restaurateur, une seule fois,
// et une panne de Twilio ne doit jamais faire échouer la réception du lead.

const ORG = "5f5a6f2e-2f3f-4cf7-b1f4-9bd4f7a2c001";
const URL_FICHE = "https://pef-erp.vercel.app/leads/0f0e6b6c-6c51-4c1e-9a6d-5a2f5a8b9a11";

const lead: LeadForBrevo = {
  id: "0f0e6b6c-6c51-4c1e-9a6d-5a2f5a8b9a11",
  lead_no: 21,
  company: "Le Comptoir de Saint-Ouen",
  contact_name: "Sonia Amrani",
  email: "sonia@lecomptoir.fr",
  phone: "+33612345678",
  city: "Saint-Ouen",
  postal_code: "93400",
  positions: "Serveur",
  positions_count: 1,
  segment: "traditionnel",
  status: "nouveau",
  source: "site",
  rdv_at: null,
  rdv_mode: null,
};

const settings: LeadSettings = { ...DEFAULT_LEAD_SETTINGS, setterPhone: "07 59 11 90 97" };

function fakeSupabase(options: { prior?: boolean } = {}) {
  const inserts: Record<string, unknown>[] = [];
  const query = {
    select: () => query,
    eq: () => query,
    ilike: () => query,
    limit: async () => ({ data: options.prior ? [{ id: "evt" }] : [], error: null }),
    insert: async (row: Record<string, unknown>) => {
      inserts.push(row);
      return { error: null };
    },
  };
  return { client: { from: () => query } as never, inserts };
}

function stubTwilio() {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "token_test");
  vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MG_test");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("alerte SMS au setter", () => {
  it("est activée par défaut et ne s'éteint que sur « off »", () => {
    expect(setterAlertEnabled(DEFAULT_LEAD_SETTINGS)).toBe(true);
    expect(setterAlertEnabled(resolveLeadSettings({ leads: {} }))).toBe(true);
    expect(setterAlertEnabled(resolveLeadSettings({ leads: { setterSmsAlert: "non" } }))).toBe(true);
    expect(setterAlertEnabled(resolveLeadSettings({ leads: { setterSmsAlert: "off" } }))).toBe(false);
  });

  it("donne au setter tout ce qu'il faut pour rappeler, avec le lien de la fiche", () => {
    expect(setterAlertText(lead, URL_FICHE)).toBe(
      `Nouveau lead POEI : Le Comptoir de Saint-Ouen (Saint-Ouen), Sonia Amrani 06 12 34 56 78. Rappelle sous 15 min. ${URL_FICHE}`,
    );
  });

  it("reste correct quand la ville, le contact ou le téléphone manquent", () => {
    expect(setterAlertText({ ...lead, city: null, postal_code: null, contact_name: null, phone: null }, URL_FICHE)).toBe(
      `Nouveau lead POEI : Le Comptoir de Saint-Ouen. Rappelle sous 15 min. ${URL_FICHE}`,
    );
    expect(setterAlertText({ ...lead, city: null, contact_name: null }, URL_FICHE)).toContain("(93400), 06 12 34 56 78.");
  });

  it("part au numéro du setter, jamais à celui du restaurateur, et se note sans compter de tentative", async () => {
    stubTwilio();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sid: "SM123" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const { client, inserts } = fakeSupabase();

    const result = await alertSetterOfNewLead(client, { orgId: ORG, lead, settings, leadUrl: URL_FICHE });

    expect(result).toEqual({ sent: true, sid: "SM123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(body.get("To")).toBe("+33759119097");
    expect(body.get("To")).not.toBe(`+${lead.phone!.replace(/\D/g, "")}`);
    expect(body.get("Body")).toContain("Le Comptoir de Saint-Ouen");
    expect(body.get("Body")).toContain(URL_FICHE);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].kind).toBe("note"); // pas « sms » : le trigger compterait une tentative auprès du prospect
    expect(String(inserts[0].note)).toContain(SETTER_ALERT_MARKER);
  });

  it("ne part qu'une fois par lead", async () => {
    stubTwilio();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { client } = fakeSupabase({ prior: true });
    const result = await alertSetterOfNewLead(client, { orgId: ORG, lead, settings, leadUrl: URL_FICHE });
    expect(result).toEqual({ sent: false, reason: "already_sent" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ne dépend pas de l'interrupteur des envois automatiques au prospect", async () => {
    stubTwilio();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ sid: "SM9" }), { status: 201 })));
    const { client } = fakeSupabase();
    const result = await alertSetterOfNewLead(client, { orgId: ORG, lead, settings: { ...settings, automations: "off" }, leadUrl: URL_FICHE });
    expect(result.sent).toBe(true);
  });

  it("ne part pas : réglage coupé, fiche terrain, pas de numéro du setter, Twilio absent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const untouched = { from: () => { throw new Error("la base ne doit pas être lue"); } } as never;

    stubTwilio();
    expect(await alertSetterOfNewLead(untouched, { orgId: ORG, lead, settings: { ...settings, setterSmsAlert: "off" }, leadUrl: URL_FICHE }))
      .toEqual({ sent: false, reason: "disabled" });
    expect(await alertSetterOfNewLead(untouched, { orgId: ORG, lead: { ...lead, source: "terrain" }, settings, leadUrl: URL_FICHE }))
      .toEqual({ sent: false, reason: "manual_source" });
    expect(await alertSetterOfNewLead(untouched, { orgId: ORG, lead, settings: { ...settings, setterPhone: "" }, leadUrl: URL_FICHE }))
      .toEqual({ sent: false, reason: "no_setter_phone" });

    vi.unstubAllEnvs();
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    expect(await alertSetterOfNewLead(untouched, { orgId: ORG, lead, settings, leadUrl: URL_FICHE }))
      .toEqual({ sent: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("une panne de Twilio ou de la base ne lève jamais d'erreur", async () => {
    stubTwilio();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("réseau coupé"); }));
    const { client, inserts } = fakeSupabase();
    expect(await alertSetterOfNewLead(client, { orgId: ORG, lead, settings, leadUrl: URL_FICHE }))
      .toEqual({ sent: false, reason: "delivery_failed" });
    expect(inserts).toHaveLength(0);

    const broken = { from: () => { throw new Error("base indisponible"); } } as never;
    await expect(alertSetterOfNewLead(broken, { orgId: ORG, lead, settings, leadUrl: URL_FICHE }))
      .resolves.toEqual({ sent: false, reason: "delivery_failed" });
  });

  it("le journal affiche la phrase sans la marque technique", () => {
    expect(noteLisible(`${SETTER_ALERT_MARKER} Alerte SMS envoyée au setter (07 59 11 90 97) — SM123.`))
      .toBe("Alerte SMS envoyée au setter (07 59 11 90 97) — SM123.");
    expect(noteLisible("Rappelé, il rappelle demain")).toBe("Rappelé, il rappelle demain");
    expect(noteLisible(null)).toBeNull();
  });
});
