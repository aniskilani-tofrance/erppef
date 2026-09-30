import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchBrevoLeadEvent, scheduleBrevoLeadEvent, BREVO_LEAD_EVENTS, type LeadForBrevo } from "@/lib/leads/brevo";
import { dispatchTwilioLeadSms } from "@/lib/leads/twilio";
import { DEFAULT_LEAD_SETTINGS, manualOnlyLead } from "@/lib/leads/templates";

// Décision d'Anis du 30/09/2026 : pour la prospection terrain, aucun flux e-mail ni SMS
// automatique, tout reste manuel.

const lead: LeadForBrevo = {
  id: "8b1f0e5c-9a1e-4c5d-8f2a-1c3d5e7f9a11", lead_no: 8, company: "Chicken Street", contact_name: "Amel",
  email: "rh@exemple.fr", phone: "+33612345678", city: "Pontault-Combault", postal_code: "77340",
  positions: null, positions_count: 1, segment: "rapide_franchise", status: "rdv_pris", source: "terrain",
  rdv_at: null, rdv_mode: "sur_site",
};
const settings = { ...DEFAULT_LEAD_SETTINGS, automations: "on" };
const supabase = {
  from: () => ({
    select: () => ({ eq: () => ({ eq: () => ({ ilike: () => ({ limit: async () => ({ data: [] }) }) }) }) }),
    insert: async () => ({ error: null }),
  }),
} as never;

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("prospection terrain : tout reste manuel", () => {
  it("reconnaît la source terrain, et seulement elle", () => {
    expect(manualOnlyLead({ source: "terrain" })).toBe(true);
    for (const source of ["formulaire_meta", "site", "appel_entrant", "recommandation", "autre", null, undefined]) {
      expect(manualOnlyLead({ source })).toBe(false);
    }
  });

  it("aucun e-mail Brevo, ni immédiat ni programmé, interrupteur activé", async () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
    const appel = vi.fn();
    vi.stubGlobal("fetch", appel);
    const dans30h = new Date(Date.now() + 30 * 3_600_000).toISOString();
    expect(await dispatchBrevoLeadEvent(supabase, { orgId: "o", lead, settings, eventName: BREVO_LEAD_EVENTS.rdvPris })).toEqual({ sent: false, reason: "manual_source" });
    expect(await scheduleBrevoLeadEvent(supabase, { orgId: "o", lead, settings, eventName: BREVO_LEAD_EVENTS.rappelRdv, scheduledAt: dans30h })).toEqual({ sent: false, reason: "manual_source" });
    expect(appel).not.toHaveBeenCalled();
  });

  it("aucun SMS automatique ; un SMS envoyé à la main passe la garde", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token_test");
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MG_test");
    const appel = vi.fn(async () => ({ ok: true, json: async () => ({ sid: "SM_test" }) }));
    vi.stubGlobal("fetch", appel);
    expect(await dispatchTwilioLeadSms(supabase, { orgId: "o", lead, settings, code: "confirmation_rdv", automatic: true })).toEqual({ sent: false, reason: "manual_source" });
    expect(appel).not.toHaveBeenCalled();
    const manuel = await dispatchTwilioLeadSms(supabase, { orgId: "o", lead, settings, code: "creneau_promis", automatic: false });
    expect(manuel).not.toEqual({ sent: false, reason: "manual_source" });
  });
});
