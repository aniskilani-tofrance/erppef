import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelBrevoScheduledEmail, scheduleBrevoAppointmentReminders, type LeadForBrevo } from "@/lib/leads/brevo";
import { DEFAULT_LEAD_SETTINGS } from "@/lib/leads/templates";
import { FakeSupabase, asSupabase } from "../helpers/fake-supabase";

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
const ORG = "a0000000-0000-4000-8000-000000000001";

// La fiche vit dans le faux client : la réservation atomique des colonnes *_batch_id
// (update … is null) doit pouvoir s'y exercer.
function base() {
  const fake = new FakeSupabase();
  fake.seed("employer_leads", [{ ...lead, org_id: ORG, rdv_reminder_j1_batch_id: null, rdv_reminder_h2_batch_id: null }]);
  return { fake, supabase: asSupabase(fake) };
}

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
    const { fake, supabase } = base();
    const result = await scheduleBrevoAppointmentReminders(supabase, {
      orgId: ORG,
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
    // La fiche porte déjà les identifiants Brevo, sans attendre que l'appelant applique le patch.
    expect(fake.lead(lead.id).rdv_reminder_j1_batch_id).toBe("<rappel-j1@smtp-relay.mailin.fr>");
    expect(fake.lead(lead.id).rdv_reminder_h2_batch_id).toBe("<rappel-h2@smtp-relay.mailin.fr>");
  });

  it("deux passages simultanés ne programment chaque rappel qu'une seule fois", async () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      n += 1;
      return { ok: true, json: async () => ({ messageId: `<rappel-${n}@smtp-relay.mailin.fr>` }) };
    }));
    const dans30h = new Date(Date.now() + 30 * 3_600_000).toISOString();
    const { fake, supabase } = base();
    const params = { orgId: ORG, lead, settings, kind: "rdv" as const, appointmentAt: dans30h };

    // Le cron Vercel et l'action GitHub lisent la même fiche au même instant.
    const [a, b] = await Promise.all([scheduleBrevoAppointmentReminders(supabase, params), scheduleBrevoAppointmentReminders(supabase, params)]);

    expect(n).toBe(2); // J-1 et H-2, une fois chacun
    expect(a.scheduled + b.scheduled).toBe(2);
    expect(a.skipped + b.skipped).toBe(2);
    const row = fake.lead(lead.id);
    expect(row.rdv_reminder_j1_batch_id).toMatch(/^<rappel-\d@smtp-relay\.mailin\.fr>$/);
    expect(row.rdv_reminder_h2_batch_id).toMatch(/^<rappel-\d@smtp-relay\.mailin\.fr>$/);
    expect(row.rdv_reminder_j1_batch_id).not.toBe(row.rdv_reminder_h2_batch_id);
  });

  it("libère la réservation quand Brevo échoue, pour réessayer au passage suivant", async () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
    let ok = false;
    vi.stubGlobal("fetch", vi.fn(async () => (ok ? { ok: true, json: async () => ({ messageId: "<retry@smtp-relay.mailin.fr>" }) } : { ok: false, json: async () => ({ code: "server_error" }) })));
    const dans30h = new Date(Date.now() + 30 * 3_600_000).toISOString();
    const { fake, supabase } = base();
    const params = { orgId: ORG, lead, settings, kind: "rdv" as const, appointmentAt: dans30h };

    const first = await scheduleBrevoAppointmentReminders(supabase, params);
    expect(first.scheduled).toBe(0);
    expect(fake.lead(lead.id).rdv_reminder_j1_batch_id).toBeNull(); // réservation rendue, pas de « claim: » qui traîne
    expect(fake.lead(lead.id).rdv_reminder_h2_batch_id).toBeNull();

    ok = true;
    const second = await scheduleBrevoAppointmentReminders(supabase, params);
    expect(second.scheduled).toBe(2);
    expect(fake.lead(lead.id).rdv_reminder_j1_batch_id).toBe("<retry@smtp-relay.mailin.fr>");
  });

  it("une réservation en cours n'est jamais envoyée à l'API d'annulation", async () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
    const appel = vi.fn();
    vi.stubGlobal("fetch", appel);
    expect(await cancelBrevoScheduledEmail("claim:3f1c0e5c-9a1e-4c5d-8f2a-1c3d5e7f9a11")).toBe(false);
    expect(appel).not.toHaveBeenCalled();
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
