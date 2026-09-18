import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelBrevoScheduledEmail, scheduleBrevoAppointmentReminders, type LeadForBrevo } from "@/lib/leads/brevo";
import { DEFAULT_LEAD_SETTINGS } from "@/lib/leads/templates";

// Vérifié en production le 18/09/2026 : Brevo ignore le batchId fourni par l'appelant
// et ne renvoie qu'un messageId ; annuler avec ce batchId répond 404, annuler avec le
// messageId répond 204. La fiche doit donc conserver l'identifiant RENVOYÉ par Brevo,
// sinon un restaurateur qui déplace son créneau reçoit quand même l'ancien rappel.

const lead: LeadForBrevo = {
  id: "7b1f0e5c-9a1e-4c5d-8f2a-1c3d5e7f9a11",
  lead_no: 42,
  company: "Le Bistrot des Docks",
  contact_name: "Sonia Amrani",
  email: "sonia@bistrotdesdocks.fr",
  phone: "+33612345678",
  city: "Saint-Ouen",
  postal_code: "93400",
  positions: "Serveur",
  positions_count: 2,
  segment: "traditionnel",
  status: "rdv_pris",
  rdv_at: null,
  rdv_mode: "sur_site",
};

const settings = { ...DEFAULT_LEAD_SETTINGS, automations: "on" };
const supabase = { from: () => ({ insert: async () => ({ error: null }) }) } as never;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("programmation des rappels Brevo", () => {
  it("conserve l'identifiant renvoyé par Brevo, pas celui envoyé par l'ERP", async () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
    const envoyes: string[] = ["<rappel-j1@smtp-relay.mailin.fr>", "<rappel-h2@smtp-relay.mailin.fr>"];
    const corps: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      corps.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ messageId: envoyes[corps.length - 1] }) };
    }));

    const dans30h = new Date(Date.now() + 30 * 3_600_000).toISOString();
    const result = await scheduleBrevoAppointmentReminders(supabase, {
      orgId: "a0000000-0000-4000-8000-000000000001",
      lead,
      settings,
      kind: "rdv",
      appointmentAt: dans30h,
    });

    expect(result.scheduled).toBe(2);
    expect(result.patch).toEqual({
      rdv_reminder_j1_batch_id: "<rappel-j1@smtp-relay.mailin.fr>",
      rdv_reminder_h2_batch_id: "<rappel-h2@smtp-relay.mailin.fr>",
    });
    expect(corps.every((c) => typeof c.scheduledAt === "string")).toBe(true);
  });

  it("annule en encodant l'identifiant, et considère un 404 comme déjà réglé", async () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
    const appels: { url: string; method: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { method: string }) => {
      appels.push({ url, method: init.method });
      return { ok: appels.length === 1, status: appels.length === 1 ? 204 : 404 };
    }));

    expect(await cancelBrevoScheduledEmail("<rappel-j1@smtp-relay.mailin.fr>")).toBe(true);
    expect(appels[0].method).toBe("DELETE");
    expect(appels[0].url).toBe(
      "https://api.brevo.com/v3/smtp/email/%3Crappel-j1%40smtp-relay.mailin.fr%3E",
    );

    expect(await cancelBrevoScheduledEmail("<deja-parti@smtp-relay.mailin.fr>")).toBe(true);
  });

  it("ne tente rien sans identifiant", async () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
    const appel = vi.fn();
    vi.stubGlobal("fetch", appel);
    expect(await cancelBrevoScheduledEmail(null)).toBe(false);
    expect(appel).not.toHaveBeenCalled();
  });
});
