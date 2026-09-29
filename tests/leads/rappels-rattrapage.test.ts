import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase, asSupabase } from "../helpers/fake-supabase";
import { appointmentReminderPlans } from "@/lib/leads/brevo";
import { scheduleUpcomingAppointmentReminders } from "@/lib/leads/sequence-engine";

// Brevo ne programme un e-mail transactionnel qu'à 72 heures au plus. Un créneau réservé
// plus tôt n'avait donc aucun rappel J-1 / H-2 : le cron doit les programmer dès qu'ils
// entrent dans la fenêtre, une seule fois, et respecter les annulations Calendly.

const ORG = "a0000000-0000-4000-8000-000000000001";
const H = 3_600_000;

function lead(id: string, extra: Record<string, unknown>) {
  return {
    id,
    org_id: ORG,
    lead_no: Number(id.slice(-2)),
    company: "Le Bistrot des Docks",
    contact_name: "Karim Benali",
    email: "karim@bistrotdesdocks.fr",
    phone: "+33612345678",
    positions: "commis",
    positions_count: 1,
    segment: "traditionnel",
    status: "a_rappeler",
    rdv_at: null,
    rdv_mode: null,
    rdv_outcome: null,
    qualification_at: null,
    qualification_reminder_j1_batch_id: null,
    qualification_reminder_h2_batch_id: null,
    rdv_reminder_j1_batch_id: null,
    rdv_reminder_h2_batch_id: null,
    email_status: null,
    opt_out_at: null,
    sequence_next_at: null,
    ...extra,
  };
}

let brevoPosts: Record<string, unknown>[] = [];
beforeEach(() => {
  vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
  brevoPosts = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { method?: string; body?: string }) => {
    if (init.method === "DELETE") return { ok: true, status: 204, json: async () => ({}) };
    brevoPosts.push(JSON.parse(init.body!));
    return { ok: true, status: 201, json: async () => ({ messageId: `<rappel-${brevoPosts.length}@smtp-relay.mailin.fr>` }) };
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("fenêtre de 72 h de Brevo", () => {
  it("à la réservation d'un créneau lointain, aucun rappel n'est programmable ; ils le deviennent l'un après l'autre", () => {
    const now = new Date("2026-09-28T10:00:00.000Z");
    const dans5j = new Date(now.getTime() + 120 * H).toISOString();
    expect(appointmentReminderPlans("qualification", dans5j, now)).toEqual([]);
    // J-1 (H-24) devient programmable quand il est à moins de 72 h : dès H-96.
    const aHmoins90 = new Date(Date.parse(dans5j) - 90 * H);
    expect(appointmentReminderPlans("qualification", dans5j, aHmoins90).map((p) => p.batchColumn)).toEqual(["qualification_reminder_j1_batch_id"]);
    // H-2 devient programmable dès H-74.
    const aHmoins70 = new Date(Date.parse(dans5j) - 70 * H);
    expect(appointmentReminderPlans("rdv", dans5j, aHmoins70).map((p) => p.batchColumn)).toEqual(["rdv_reminder_j1_batch_id", "rdv_reminder_h2_batch_id"]);
    // Un rappel dont l'heure est déjà passée n'est pas recréé après coup.
    const aHmoins1 = new Date(Date.parse(dans5j) - 1 * H);
    expect(appointmentReminderPlans("rdv", dans5j, aHmoins1)).toEqual([]);
  });
});

describe("rattrapage par le cron", () => {
  it("programme J-1 puis H-2 quand le créneau entre dans la fenêtre, sans jamais doubler", async () => {
    // scheduleBrevoLeadEvent mesure la fenêtre sur l'horloge réelle : on travaille en temps réel.
    const now = new Date();
    const qualif = new Date(now.getTime() + 90 * H).toISOString(); // dans 3 j 18 h
    const db = new FakeSupabase(() => now)
      .seed("organizations", [{ id: ORG, name: "PEF", slug: "pef", settings: { leads: { automations: "on" } } }])
      .seed("employer_leads", [lead("c0000000-0000-4000-8000-000000000011", { qualification_at: qualif })]);
    const supabase = asSupabase(db);

    // À H-90 : le créneau n'est pas encore à moins de 72 h → hors requête, rien.
    expect(await scheduleUpcomingAppointmentReminders(supabase, now)).toEqual({ scheduled: 0, leads: 0 });

    // À H-70 : J-1 et H-2 entrent tous deux dans la fenêtre.
    const plusTard = new Date(Date.parse(qualif) - 70 * H);
    vi.useFakeTimers({ now: plusTard, toFake: ["Date"] });
    try {
      expect(await scheduleUpcomingAppointmentReminders(supabase, plusTard)).toEqual({ scheduled: 2, leads: 1 });
      const l = db.rows("employer_leads")[0];
      expect(l.qualification_reminder_j1_batch_id).toBe("<rappel-1@smtp-relay.mailin.fr>");
      expect(l.qualification_reminder_h2_batch_id).toBe("<rappel-2@smtp-relay.mailin.fr>");
      expect(brevoPosts.map((p) => (p.tags as string[])[1])).toEqual(["poei_lead_rappel_qualification_j1", "poei_lead_rappel_qualification_h2"]);
      expect(brevoPosts.every((p) => typeof p.scheduledAt === "string")).toBe(true);
      // Rejouer ne programme rien de plus : les colonnes sont remplies.
      expect(await scheduleUpcomingAppointmentReminders(supabase, plusTard)).toEqual({ scheduled: 0, leads: 0 });
      expect(brevoPosts).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("couvre aussi les rendez-vous de direction à venir, et ignore les fiches closes, opposées ou en bounce", async () => {
    const now = new Date();
    const rdv = new Date(now.getTime() + 60 * H).toISOString();
    const db = new FakeSupabase(() => now)
      .seed("organizations", [{ id: ORG, name: "PEF", slug: "pef", settings: { leads: { automations: "on" } } }])
      .seed("employer_leads", [
        lead("c0000000-0000-4000-8000-000000000021", { status: "rdv_pris", rdv_at: rdv, rdv_mode: "sur_site", rdv_outcome: "a_venir" }),
        lead("c0000000-0000-4000-8000-000000000022", { status: "rdv_pris", rdv_at: rdv, rdv_mode: "sur_site", rdv_outcome: "reporte" }), // reporté : non
        lead("c0000000-0000-4000-8000-000000000023", { status: "perdu", qualification_at: rdv }), // clos : non
        lead("c0000000-0000-4000-8000-000000000024", { qualification_at: rdv, email_status: "hard_bounce" }), // adresse invalide : non
        lead("c0000000-0000-4000-8000-000000000025", { qualification_at: rdv, opt_out_at: now.toISOString() }), // opposition : non
        lead("c0000000-0000-4000-8000-000000000026", { qualification_at: rdv, qualification_reminder_j1_batch_id: "<deja@x>", qualification_reminder_h2_batch_id: "<deja2@x>" }), // déjà fait : non
      ]);
    expect(await scheduleUpcomingAppointmentReminders(asSupabase(db), now)).toEqual({ scheduled: 2, leads: 1 });
    expect(brevoPosts.map((p) => (p.tags as string[])[1])).toEqual(["poei_lead_rappel_rdv", "poei_lead_rappel_rdv_h2"]);
    expect(db.rows("employer_leads")[0].rdv_reminder_j1_batch_id).toBeTruthy();
  });

  it("après une annulation Calendly, le créneau reprogrammé reçoit de nouveaux rappels", async () => {
    const now = new Date();
    const premier = new Date(now.getTime() + 60 * H).toISOString();
    const db = new FakeSupabase(() => now)
      .seed("organizations", [{ id: ORG, name: "PEF", slug: "pef", settings: { leads: { automations: "on" } } }])
      .seed("employer_leads", [lead("c0000000-0000-4000-8000-000000000031", { qualification_at: premier })]);
    const supabase = asSupabase(db);
    expect(await scheduleUpcomingAppointmentReminders(supabase, now)).toEqual({ scheduled: 2, leads: 1 });

    // Annulation Calendly (ce que fait /api/leads/inbound) : identifiants effacés, créneau retiré.
    Object.assign(db.rows("employer_leads")[0], { qualification_at: null, qualification_reminder_j1_batch_id: null, qualification_reminder_h2_batch_id: null });
    expect(await scheduleUpcomingAppointmentReminders(supabase, now)).toEqual({ scheduled: 0, leads: 0 });

    // Nouveau créneau à 50 h : deux nouveaux rappels, sur le nouvel horaire.
    const second = new Date(now.getTime() + 50 * H).toISOString();
    Object.assign(db.rows("employer_leads")[0], { qualification_at: second });
    expect(await scheduleUpcomingAppointmentReminders(supabase, now)).toEqual({ scheduled: 2, leads: 1 });
    expect(brevoPosts).toHaveLength(4);
    expect(Date.parse(brevoPosts[2].scheduledAt as string)).toBe(Date.parse(second) - 24 * H);
    expect(Date.parse(brevoPosts[3].scheduledAt as string)).toBe(Date.parse(second) - 2 * H);
  });
});
