import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchBrevoLeadEvent, BREVO_LEAD_EVENTS, type LeadForBrevo } from "@/lib/leads/brevo";
import { dispatchTwilioLeadSms } from "@/lib/leads/twilio";
import { automationsEnabled, DEFAULT_LEAD_SETTINGS, resolveLeadSettings } from "@/lib/leads/templates";

// L'interrupteur « Envois automatiques » des réglages Leads est le dernier verrou
// avant qu'un restaurateur reçoive un message sans qu'un conseiller l'ait décidé.
// Il doit rester fermé par défaut, y compris quand Brevo et Twilio sont configurés.

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
  rdv_at: null,
  rdv_mode: null,
};

const supabase = {
  from: () => {
    throw new Error("La base ne doit pas être touchée quand les envois automatiques sont à l'arrêt.");
  },
} as never;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("interrupteur des envois automatiques", () => {
  it("est fermé par défaut et ne s'ouvre que sur la valeur « on »", () => {
    expect(automationsEnabled(DEFAULT_LEAD_SETTINGS)).toBe(false);
    expect(automationsEnabled(resolveLeadSettings({ leads: {} }))).toBe(false);
    expect(automationsEnabled(resolveLeadSettings({ leads: { automations: "oui" } }))).toBe(false);
    expect(automationsEnabled(resolveLeadSettings({ leads: { automations: "on" } }))).toBe(true);
  });

  it("bloque l'email Brevo automatique même avec une clé API valide", async () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
    const result = await dispatchBrevoLeadEvent(supabase, {
      orgId: "5f5a6f2e-2f3f-4cf7-b1f4-9bd4f7a2c001",
      lead,
      settings: DEFAULT_LEAD_SETTINGS,
      eventName: BREVO_LEAD_EVENTS.nouveau,
    });
    expect(result).toEqual({ sent: false, reason: "automations_off" });
  });

  it("bloque le SMS automatique mais laisse passer l'envoi fait à la main", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token_test");
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MG_test");
    const automatique = await dispatchTwilioLeadSms(supabase, {
      orgId: "5f5a6f2e-2f3f-4cf7-b1f4-9bd4f7a2c001",
      lead,
      settings: DEFAULT_LEAD_SETTINGS,
      code: "demande_recue",
      automatic: true,
    });
    expect(automatique).toEqual({ sent: false, reason: "automations_off" });

    const manuel = await dispatchTwilioLeadSms(supabase, {
      orgId: "5f5a6f2e-2f3f-4cf7-b1f4-9bd4f7a2c001",
      lead: { ...lead, phone: null },
      settings: DEFAULT_LEAD_SETTINGS,
      code: "creneau_promis",
      automatic: false,
    });
    expect(manuel).toEqual({ sent: false, reason: "no_phone" });
  });
});
