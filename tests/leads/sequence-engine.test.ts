import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase, asSupabase } from "../helpers/fake-supabase";
import { runDueLeadSequences, startLeadSequence, stopLeadSequence } from "@/lib/leads/sequence-engine";
import { SEQUENCES } from "@/lib/leads/sequences";

// Le moteur, testé sur une base en mémoire et des fournisseurs simulés : aucun e-mail,
// aucun SMS, aucun appel réseau réel. L'horloge est pilotée à la main, jour par jour.

const ORG = "a0000000-0000-4000-8000-000000000001";
const LEAD = "b0000000-0000-4000-8000-000000000042";
const LUNDI = "2026-09-28T09:15:00.000Z"; // lundi 11h15 à Paris (heure d'été : 10 h Paris = 08:00 UTC)

type Call = { url: string; method: string; body: string | null };

function mockProviders(opts: { twilioError?: { code: number; message: string } } = {}): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string; body?: unknown }) => {
    const method = init?.method ?? "GET";
    const body = init?.body == null ? null : typeof init.body === "string" ? init.body : String(init.body);
    calls.push({ url, method, body });
    if (url.includes("api.brevo.com")) {
      if (method === "DELETE") return { ok: true, status: 204, json: async () => ({}) };
      return { ok: true, status: 201, json: async () => ({ messageId: `<msg-${calls.length}@smtp-relay.mailin.fr>` }) };
    }
    if (url.includes("api.twilio.com")) {
      if (opts.twilioError) return { ok: false, status: 400, json: async () => ({ code: opts.twilioError!.code, message: opts.twilioError!.message }) };
      return { ok: true, status: 201, json: async () => ({ sid: `SM${calls.length}` }) };
    }
    throw new Error(`appel réseau inattendu : ${url}`);
  }));
  return calls;
}

function baseLead(extra: Record<string, unknown> = {}) {
  return {
    id: LEAD,
    org_id: ORG,
    lead_no: 42,
    received_at: "2026-09-27T18:00:00.000Z",
    source: "formulaire_meta",
    campaign: "test",
    company: "Le Bistrot des Docks",
    segment: "traditionnel",
    contact_name: "Karim Benali",
    phone: "+33612345678",
    email: "karim@bistrotdesdocks.fr",
    positions: "commis de cuisine",
    positions_count: 1,
    status: "a_rappeler",
    attempts: 1,
    first_contact_at: LUNDI,
    last_contact_at: LUNDI,
    next_action: null,
    next_action_on: null,
    rdv_at: null,
    rdv_mode: null,
    rdv_outcome: null,
    qualification_at: null,
    qualification_reminder_j1_batch_id: null,
    qualification_reminder_h2_batch_id: null,
    rdv_reminder_j1_batch_id: null,
    rdv_reminder_h2_batch_id: null,
    sequence_kind: null,
    sequence_step: null,
    sequence_started_at: null,
    sequence_next_at: null,
    sequence_last_sent_at: null,
    sequence_stopped_at: null,
    sequence_stop_reason: null,
    email_status: null,
    email_status_at: null,
    phone_status: null,
    opt_out_at: null,
    ...extra,
  };
}

let now = new Date(LUNDI);
let db: FakeSupabase;

function setup(leadExtra: Record<string, unknown> = {}, automations = "on") {
  now = new Date(LUNDI);
  db = new FakeSupabase(() => now);
  db.seed("organizations", [{ id: ORG, name: "ParlerEmploi Formation", slug: "pef", settings: { leads: { automations, nextGroupLabel: "le 2 novembre" } } }]);
  db.seed("employer_leads", [baseLead(leadExtra)]);
  return asSupabase(db);
}

const at = (iso: string) => {
  now = new Date(iso);
  return now;
};
const brevoCalls = (calls: Call[]) => calls.filter((c) => c.url.includes("api.brevo.com") && c.method === "POST");
const twilioCalls = (calls: Call[]) => calls.filter((c) => c.url.includes("api.twilio.com"));

beforeEach(() => {
  vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "token_test");
  vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MG_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("séquence « Injoignable » de bout en bout", () => {
  it("démarre sur l'appel manqué, puis J+1 tâche, J+3 e-mail, J+6 SMS, J+10 e-mail, puis la tâche de fin", async () => {
    const supabase = setup();
    const calls = mockProviders();

    const started = await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "injoignable", now });
    expect(started).toEqual({ started: true });
    let lead = db.lead(LEAD);
    expect(lead.sequence_kind).toBe("injoignable");
    expect(lead.sequence_next_at).toBe("2026-09-29T08:00:00.000Z");
    expect(lead.next_action).toBe(SEQUENCES.injoignable.steps[0].label);
    expect(lead.next_action_on).toBe("2026-09-29");
    expect(db.notesOf(LEAD).some((n) => n.startsWith("[seq:debut:injoignable]"))).toBe(true);

    // Lundi soir : rien n'est dû.
    expect(await runDueLeadSequences(supabase, at("2026-09-28T20:00:00.000Z"))).toEqual({ executed: 0, stopped: 0, skipped: 0, failed: 0 });

    // J+1 (mardi 10h05) : une tâche d'appel, aucun message.
    expect(await runDueLeadSequences(supabase, at("2026-09-29T08:05:00.000Z"))).toMatchObject({ executed: 1, failed: 0 });
    lead = db.lead(LEAD);
    expect(lead.sequence_step).toBe("j1");
    expect(lead.sequence_next_at).toBe("2026-10-01T08:00:00.000Z");
    expect(lead.next_action).toBe(SEQUENCES.injoignable.steps[1].label);
    expect(calls).toHaveLength(0);
    expect(db.notesOf(LEAD).find((n) => n.startsWith("[seq:etape:injoignable:j1]"))).toContain("tâche posée");

    // J+3 (jeudi) : l'e-mail de relance n°3 part par Brevo.
    await runDueLeadSequences(supabase, at("2026-10-01T08:10:00.000Z"));
    lead = db.lead(LEAD);
    expect(lead.sequence_step).toBe("j3");
    expect(brevoCalls(calls)).toHaveLength(1);
    expect(JSON.parse(brevoCalls(calls)[0].body!).tags).toContain("poei_lead_relance_j3");
    expect(lead.sequence_last_sent_at).toBe("2026-10-01T08:10:00.000Z");
    expect(lead.sequence_next_at).toBe("2026-10-05T08:00:00.000Z"); // J+6 = dimanche → lundi

    // J+6 (lundi 05/10) : SMS « dernière tentative » + tâche d'appel.
    await runDueLeadSequences(supabase, at("2026-10-05T08:02:00.000Z"));
    lead = db.lead(LEAD);
    expect(lead.sequence_step).toBe("j6");
    expect(twilioCalls(calls)).toHaveLength(1);
    expect(new URLSearchParams(twilioCalls(calls)[0].body!).get("Body")).toContain("clôturer le suivi");
    expect(lead.attempts).toBe(2); // le SMS compte comme une tentative (trigger reproduit)

    // J+10 (jeudi 08/10) : e-mail de rupture, puis la séquence se termine.
    await runDueLeadSequences(supabase, at("2026-10-08T08:00:30.000Z"));
    lead = db.lead(LEAD);
    expect(lead.sequence_step).toBe("j10");
    expect(brevoCalls(calls)).toHaveLength(2);
    expect(JSON.parse(brevoCalls(calls)[1].body!).tags).toContain("poei_lead_dernier_message");
    expect(lead.sequence_next_at).toBeNull();
    expect(lead.sequence_stop_reason).toBe("terminee");
    expect(lead.next_action).toBe(SEQUENCES.injoignable.end.task);
    expect(lead.next_action_on).toBe("2026-10-12"); // J+12 = samedi → lundi
    expect(lead.status).toBe("a_rappeler"); // jamais clos automatiquement
    expect(db.notesOf(LEAD).some((n) => n.startsWith("[seq:fin:terminee]"))).toBe(true);

    // Plus rien ne bouge ensuite.
    expect(await runDueLeadSequences(supabase, at("2026-10-20T08:05:00.000Z"))).toEqual({ executed: 0, stopped: 0, skipped: 0, failed: 0 });
    expect(brevoCalls(calls)).toHaveLength(2);
    expect(twilioCalls(calls)).toHaveLength(1);
  });

  it("est idempotent : rejouer le même passage n'envoie rien de plus", async () => {
    const supabase = setup();
    const calls = mockProviders();
    await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "injoignable", now });
    await runDueLeadSequences(supabase, at("2026-09-29T08:05:00.000Z"));
    await runDueLeadSequences(supabase, at("2026-10-01T08:05:00.000Z"));
    expect(brevoCalls(calls)).toHaveLength(1);
    const again = await runDueLeadSequences(supabase, now);
    expect(again).toEqual({ executed: 0, stopped: 0, skipped: 0, failed: 0 });
    expect(brevoCalls(calls)).toHaveLength(1);
    // Même en forçant une seconde fois l'échéance, la marque de journal bloque le renvoi.
    db.lead(LEAD).sequence_step = "j1";
    db.lead(LEAD).sequence_next_at = "2026-10-01T08:00:00.000Z";
    await runDueLeadSequences(supabase, now);
    expect(brevoCalls(calls)).toHaveLength(1);
    expect(db.notesOf(LEAD).filter((n) => n.startsWith("[seq:etape:injoignable:j3]")).at(-1)).toContain("déjà envoyé");
  });

  it("deux crons en même temps : un seul exécute l'étape", async () => {
    const supabase = setup();
    const calls = mockProviders();
    await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "injoignable", now });
    await runDueLeadSequences(supabase, at("2026-09-29T08:05:00.000Z"));
    at("2026-10-01T08:05:00.000Z");
    const [a, b] = await Promise.all([runDueLeadSequences(supabase, now), runDueLeadSequences(supabase, now)]);
    expect(a.executed + b.executed).toBe(1);
    expect(a.skipped + b.skipped).toBe(1);
    expect(brevoCalls(calls)).toHaveLength(1);
  });

  it("n'envoie rien tant que les envois automatiques sont à l'arrêt, sans perdre l'échéance", async () => {
    const supabase = setup({}, "off");
    const calls = mockProviders();
    await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "injoignable", now });
    await runDueLeadSequences(supabase, at("2026-09-29T08:05:00.000Z"));
    expect(await runDueLeadSequences(supabase, at("2026-10-01T08:05:00.000Z"))).toEqual({ executed: 0, stopped: 0, skipped: 1, failed: 0 });
    expect(db.lead(LEAD).sequence_next_at).toBe("2026-09-29T08:00:00.000Z");
    expect(calls).toHaveLength(0);
  });

  it("des étapes en retard partent une par jour, jamais deux le même passage", async () => {
    const supabase = setup();
    const calls = mockProviders();
    await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "injoignable", now });
    // Le cron a dormi deux semaines.
    const reprise = at("2026-10-13T14:00:00.000Z"); // mardi
    expect(await runDueLeadSequences(supabase, reprise)).toMatchObject({ executed: 1 });
    const lead = db.lead(LEAD);
    expect(lead.sequence_step).toBe("j1");
    expect(lead.sequence_next_at).toBe("2026-10-14T08:00:00.000Z"); // demain 10 h, pas J+3 dans le passé
    expect(calls).toHaveLength(0);
    await runDueLeadSequences(supabase, at("2026-10-14T08:05:00.000Z"));
    expect(db.lead(LEAD).sequence_step).toBe("j3");
    expect(brevoCalls(calls)).toHaveLength(1);
    expect(db.lead(LEAD).sequence_next_at).toBe("2026-10-15T08:00:00.000Z");
  });
});

describe("règles d'arrêt appliquées par le cron", () => {
  it("un créneau réservé entre deux étapes arrête tout, sans envoi", async () => {
    const supabase = setup();
    const calls = mockProviders();
    await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "injoignable", now });
    await runDueLeadSequences(supabase, at("2026-09-29T08:05:00.000Z"));
    Object.assign(db.lead(LEAD), { status: "rdv_pris", rdv_at: "2026-10-06T13:00:00.000Z", rdv_outcome: "a_venir" });
    expect(await runDueLeadSequences(supabase, at("2026-10-01T08:05:00.000Z"))).toEqual({ executed: 0, stopped: 1, skipped: 0, failed: 0 });
    const lead = db.lead(LEAD);
    expect(lead.sequence_next_at).toBeNull();
    expect(lead.sequence_stop_reason).toBe("reservation");
    expect(lead.next_action).toBeNull(); // la tâche de séquence est effacée, pas une note du conseiller
    expect(calls).toHaveLength(0);
    expect(db.notesOf(LEAD).at(-1)).toContain("Un créneau a été réservé");
  });

  it("un statut clos, une opposition ou un bounce dur arrêtent la séquence", async () => {
    for (const [extra, reason] of [
      [{ status: "perdu" }, "besoin_clos"],
      [{ opt_out_at: "2026-09-30T10:00:00.000Z" }, "opposition"],
      [{ email_status: "hard_bounce" }, "bounce_dur"],
      [{ email_status: "unsubscribed" }, "desinscription"],
      [{ status: "qualifie" }, "reponse"],
    ] as const) {
      const supabase = setup();
      const calls = mockProviders();
      await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "injoignable", now });
      Object.assign(db.lead(LEAD), extra);
      const r = await runDueLeadSequences(supabase, at("2026-10-01T08:05:00.000Z"));
      expect(r.stopped, JSON.stringify(extra)).toBe(1);
      expect(db.lead(LEAD).sequence_stop_reason).toBe(reason);
      expect(brevoCalls(calls)).toHaveLength(0);
    }
  });

  it("un numéro refusé par Twilio bloque les SMS et arrête la séquence", async () => {
    const supabase = setup({ sequence_kind: "injoignable", sequence_step: "j3", sequence_started_at: LUNDI, sequence_next_at: "2026-10-05T08:00:00.000Z" });
    mockProviders({ twilioError: { code: 21211, message: "Invalid 'To' Phone Number" } });
    const r = await runDueLeadSequences(supabase, at("2026-10-05T08:05:00.000Z"));
    expect(r).toMatchObject({ executed: 1, stopped: 1 });
    const lead = db.lead(LEAD);
    expect(lead.phone_status).toBe("invalide");
    expect(lead.sequence_next_at).toBeNull();
    expect(lead.sequence_stop_reason).toBe("numero_invalide");
    expect(db.notesOf(LEAD).some((n) => n.startsWith("[twilio-retour:invalide]"))).toBe(true);
  });

  it("un STOP renvoyé à Twilio vaut opposition", async () => {
    const supabase = setup({ sequence_kind: "injoignable", sequence_step: "j3", sequence_started_at: LUNDI, sequence_next_at: "2026-10-05T08:00:00.000Z" });
    mockProviders({ twilioError: { code: 21610, message: "Attempt to send to unsubscribed recipient" } });
    await runDueLeadSequences(supabase, at("2026-10-05T08:05:00.000Z"));
    const lead = db.lead(LEAD);
    expect(lead.opt_out_at).toBeTruthy();
    expect(lead.sequence_stop_reason).toBe("opposition");
  });

  it("une panne Brevo consomme l'étape mais demande l'envoi à la main, sans casser la suite", async () => {
    const supabase = setup({ sequence_kind: "injoignable", sequence_step: "j1", sequence_started_at: LUNDI, sequence_next_at: "2026-10-01T08:00:00.000Z" });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ code: "server_error" }) })));
    const r = await runDueLeadSequences(supabase, at("2026-10-01T08:05:00.000Z"));
    expect(r).toMatchObject({ executed: 1, failed: 1 });
    const lead = db.lead(LEAD);
    expect(lead.sequence_step).toBe("j3");
    expect(lead.next_action).toContain("À faire à la main");
    expect(lead.next_action).toContain("J+3");
    expect(lead.sequence_next_at).toBe("2026-10-05T08:00:00.000Z");
    expect(lead.sequence_last_sent_at).toBeNull();
    expect(db.notesOf(LEAD).at(-1)).toContain("à envoyer à la main");
  });
});

describe("démarrage, remplacement, arrêt à la main", () => {
  it("ne redémarre pas une séquence déjà en cours, et ne démarre rien si une autre tourne (startIfNone)", async () => {
    const supabase = setup();
    mockProviders();
    await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "injoignable", now });
    expect(await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "injoignable", now })).toEqual({ started: false, reason: "deja_active" });
    expect(await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "no_show", now, onlyIfNone: true })).toEqual({ started: false, reason: "autre_active" });
  });

  it("un rendez-vous manqué remplace l'injoignable et part J+1 à 10 h, ou le lundi", async () => {
    const supabase = setup();
    mockProviders();
    await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "injoignable", now });
    Object.assign(db.lead(LEAD), { rdv_outcome: "no_show" });
    const vendredi = at("2026-10-02T15:00:00.000Z");
    expect(await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "no_show", now: vendredi })).toEqual({ started: true });
    const lead = db.lead(LEAD);
    expect(lead.sequence_kind).toBe("no_show");
    expect(lead.sequence_step).toBeNull();
    expect(lead.sequence_next_at).toBe("2026-10-05T08:00:00.000Z"); // samedi → lundi
    expect(db.notesOf(LEAD).some((n) => n.startsWith("[seq:fin:remplacee]"))).toBe(true);
  });

  it("refuse de démarrer sur une fiche opposée, close ou bloquée", async () => {
    const supabase = setup({ opt_out_at: "2026-09-29T10:00:00.000Z" });
    mockProviders();
    expect(await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "injoignable", now })).toEqual({ started: false, reason: "opposition" });
    Object.assign(db.lead(LEAD), { opt_out_at: null, status: "perdu" });
    expect(await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "injoignable", now })).toEqual({ started: false, reason: "besoin_clos" });
    Object.assign(db.lead(LEAD), { status: "nurturing", email_status: "hard_bounce" });
    expect(await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "nurturing", now })).toEqual({ started: false, reason: "bounce_dur" });
    expect(db.lead(LEAD).sequence_next_at).toBeNull();
  });

  it("l'opposition arrête la séquence, marque la fiche et annule les rappels Brevo programmés", async () => {
    const supabase = setup({
      qualification_at: "2026-10-01T09:00:00.000Z",
      qualification_reminder_j1_batch_id: "<j1@smtp-relay.mailin.fr>",
      qualification_reminder_h2_batch_id: "<h2@smtp-relay.mailin.fr>",
    });
    const calls = mockProviders();
    await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "injoignable", now });
    expect(await stopLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, reason: "opposition", now: at("2026-09-29T09:00:00.000Z") })).toBe(true);
    const lead = db.lead(LEAD);
    expect(lead.opt_out_at).toBe("2026-09-29T09:00:00.000Z");
    expect(lead.sequence_next_at).toBeNull();
    expect(lead.sequence_stop_reason).toBe("opposition");
    expect(lead.qualification_reminder_j1_batch_id).toBeNull();
    expect(lead.qualification_reminder_h2_batch_id).toBeNull();
    const annulations = calls.filter((c) => c.method === "DELETE");
    expect(annulations).toHaveLength(2);
    expect(annulations[0].url).toContain(encodeURIComponent("<j1@smtp-relay.mailin.fr>"));
    expect(db.notesOf(LEAD).at(-1)).toMatch(/Opposition du prospect.*2 rappels/);
    // Plus rien ne redémarre ensuite.
    expect(await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "nurturing", now })).toEqual({ started: false, reason: "opposition" });
  });

  it("un arrêt manuel garde la trace et laisse redémarrer plus tard", async () => {
    const supabase = setup();
    mockProviders();
    await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "injoignable", now });
    expect(await stopLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, reason: "manuel", now })).toBe(true);
    expect(db.lead(LEAD).sequence_stop_reason).toBe("manuel");
    expect(db.lead(LEAD).opt_out_at).toBeNull();
    expect(await stopLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, reason: "manuel", now })).toBe(false); // rien à arrêter
    Object.assign(db.lead(LEAD), { status: "proposition" });
    expect(await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "proposition", now: at("2026-10-01T16:00:00.000Z") })).toEqual({ started: true });
    expect(db.lead(LEAD).sequence_next_at).toBe("2026-10-05T08:00:00.000Z"); // J+2 ouvré depuis jeudi = lundi
  });
});

describe("séquences no-show, proposition, veille", () => {
  it("rendez-vous manqué : J+1 et J+3 par e-mail, puis la décision revient à l'équipe", async () => {
    const supabase = setup({ status: "a_rappeler", rdv_outcome: "no_show" });
    const calls = mockProviders();
    await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "no_show", now });
    await runDueLeadSequences(supabase, at("2026-09-29T08:05:00.000Z"));
    await runDueLeadSequences(supabase, at("2026-10-01T08:05:00.000Z"));
    const tags = brevoCalls(calls).map((c) => JSON.parse(c.body!).tags[1]);
    expect(tags).toEqual(["poei_lead_no_show_j1", "poei_lead_no_show_j3"]);
    const lead = db.lead(LEAD);
    expect(lead.sequence_stop_reason).toBe("terminee");
    expect(lead.next_action).toBe(SEQUENCES.no_show.end.task);
  });

  it("proposition : J+2 ouvré puis J+7", async () => {
    const supabase = setup({ status: "proposition" });
    const calls = mockProviders();
    const jeudi = at("2026-10-01T16:00:00.000Z");
    await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "proposition", now: jeudi });
    expect(db.lead(LEAD).sequence_next_at).toBe("2026-10-05T08:00:00.000Z");
    await runDueLeadSequences(supabase, at("2026-10-05T08:05:00.000Z"));
    expect(db.lead(LEAD).sequence_next_at).toBe("2026-10-08T08:00:00.000Z"); // J+7 calendaire
    await runDueLeadSequences(supabase, at("2026-10-08T08:05:00.000Z"));
    expect(brevoCalls(calls).map((c) => JSON.parse(c.body!).tags[1])).toEqual(["poei_lead_proposition_j2", "poei_lead_proposition_j7"]);
    expect(db.lead(LEAD).sequence_stop_reason).toBe("terminee");
  });

  it("veille : J+30, J+60, J+90, à 10 h même après le changement d'heure", async () => {
    const supabase = setup({ status: "nurturing" });
    const calls = mockProviders();
    await startLeadSequence(supabase, { orgId: ORG, lead: db.lead(LEAD) as never, kind: "nurturing", now });
    expect(db.lead(LEAD).sequence_next_at).toBe("2026-10-28T09:00:00.000Z"); // heure d'hiver
    await runDueLeadSequences(supabase, at("2026-10-28T09:05:00.000Z"));
    await runDueLeadSequences(supabase, at("2026-11-27T09:05:00.000Z"));
    await runDueLeadSequences(supabase, at("2026-12-28T09:05:00.000Z"));
    expect(brevoCalls(calls).map((c) => JSON.parse(c.body!).tags[1])).toEqual(["poei_lead_nurturing_j30", "poei_lead_nurturing_j60", "poei_lead_nurturing_j90"]);
    const lead = db.lead(LEAD);
    expect(lead.sequence_stop_reason).toBe("terminee");
    expect(lead.status).toBe("nurturing");
    expect(JSON.parse(brevoCalls(calls)[2].body!).textContent).toContain("stop");
  });
});
