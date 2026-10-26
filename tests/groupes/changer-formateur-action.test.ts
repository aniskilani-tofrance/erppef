import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Server Actions « Changer de formateur », base simulée en mémoire (aucun accès à la vraie base).

type Row = Record<string, unknown>;
type Ctx = { userId: string; orgId: string; role: string };
type Mail = { to: string; subject: string; html: string };
const state: {
  ctx: Ctx;
  tables: Record<string, Row[]>;
  writes: { table: string; values: Row; id: unknown }[];
  failUpdate: Record<string, { code: string; message: string }>;
  mailer: boolean;
  mails: Mail[];
} = { ctx: { userId: "u-anis", orgId: "org-1", role: "coordinator" }, tables: {}, writes: [], failUpdate: {}, mailer: true, mails: [] };

const isTimestamp = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v);
const gte = (a: unknown, b: unknown) => (isTimestamp(a) && isTimestamp(b) ? Date.parse(a as string) >= Date.parse(b as string) : (a as string) >= (b as string));

function fakeClient() {
  return {
    from(table: string) {
      let op: "select" | "update" = "select";
      let values: Row = {};
      let returning = false;
      const filters: ((r: Row) => boolean)[] = [];
      const run = () => {
        const rows = (state.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (op === "select") return { data: rows.map((r) => ({ ...r })), error: null };
        const failure = rows.map((r) => state.failUpdate[r.id as string]).find(Boolean);
        if (failure) return { data: null, error: failure };
        for (const r of rows) {
          state.writes.push({ table, values: { ...values }, id: r.id });
          Object.assign(r, values);
        }
        return { data: returning ? rows.map((r) => ({ id: r.id })) : null, error: null };
      };
      const query = {
        select() {
          if (op !== "select") returning = true;
          return query;
        },
        update(v: Row) {
          op = "update";
          values = v;
          return query;
        },
        eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return query; },
        neq(c: string, v: unknown) { filters.push((r) => r[c] !== v); return query; },
        is(c: string, v: unknown) { filters.push((r) => (r[c] ?? null) === v); return query; },
        in(c: string, v: unknown[]) { filters.push((r) => v.includes(r[c])); return query; },
        gte(c: string, v: unknown) { filters.push((r) => gte(r[c], v)); return query; },
        order() { return query; },
        async maybeSingle() {
          const res = run();
          return { data: res.data?.[0] ?? null, error: res.error };
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          return Promise.resolve(run()).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

vi.mock("@/lib/auth", () => ({
  requireRole: async (allowed: string[]) => {
    if (!allowed.includes(state.ctx.role)) throw new Error("Accès refusé : votre rôle ne permet pas cette action.");
    return state.ctx;
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeClient() }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/mailer", () => ({
  mailerConfigured: () => state.mailer,
  sendMail: async (m: Mail) => {
    state.mails.push(m);
    return true;
  },
}));

const { applyTrainerChange, previewTrainerChange } = await import("@/app/(app)/groupes/formateur-actions");

// Lundi 26 octobre 2026, 10h à Paris.
const NOW = new Date("2026-10-26T09:00:00Z");
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(NOW);
afterAll(() => vi.useRealTimers());

const GROUP = "11111111-1111-4111-8111-111111111111";
const ANNE = "22222222-2222-4222-8222-222222222222";
const MARIE = "33333333-3333-4333-8333-333333333333";
const OTHER_GROUP = "44444444-4444-4444-8444-444444444444";

const anne = { id: ANNE, first_name: "Anne", last_name: "Philippon", email: "anne@example.org" };
const marie = { id: MARIE, first_name: "Marie", last_name: "Dupont", email: "marie@example.org" };

function s(id: string, startsAt: string, over: Row = {}): Row {
  const endsAt = new Date(Date.parse(startsAt) + 3.25 * 3_600_000).toISOString().replace(".000Z", "+00:00");
  return {
    id, org_id: "org-1", group_id: GROUP, starts_at: startsAt, ends_at: endsAt, status: "planifiee",
    attendance_closed_at: null, trainer_id: null, co_trainer_id: null, trainers: null, groups: { name: "Atelier alphabétisation — bénévoles" },
    ...over,
  };
}

function world(previous: typeof marie | null = null): Record<string, Row[]> {
  const t = previous ? { trainer_id: previous.id, trainers: { first_name: previous.first_name, last_name: previous.last_name } } : {};
  return {
    groups: [{
      id: GROUP, org_id: "org-1", name: "Atelier alphabétisation — bénévoles", status: "ouvert",
      trainer_id: previous?.id ?? null, co_trainer_id: ANNE, notes: "Atelier du lundi.",
      weekly_pattern: [{ weekday: 1, start: "14:30", end: "17:45" }],
      trainers: previous, rooms: { name: "Salle Debain", address: "12 rue Debain, Saint-Ouen", access_notes: null },
    }],
    trainers: [
      { ...anne, org_id: "org-1", is_active: true, weekly_hours_max: 35 },
      { ...marie, org_id: "org-1", is_active: true, weekly_hours_max: 35 },
    ],
    sessions: [
      s("passee", "2026-10-19T12:30:00+00:00", t),
      s("annulee", "2026-11-09T13:30:00+00:00", { ...t, status: "annulee" }),
      s("cloturee", "2026-11-16T13:30:00+00:00", { ...t, attendance_closed_at: "2026-11-16T17:00:00+00:00" }),
      s("s1", "2026-10-26T13:30:00+00:00", t),
      s("s2", "2026-11-02T13:30:00+00:00", { ...t, co_trainer_id: ANNE }),
      s("conge", "2026-11-23T13:30:00+00:00", t),
      s("clash", "2026-11-30T13:30:00+00:00", t),
      // Séance d'Anne dans un autre groupe, qui chevauche « clash »
      { id: "ailleurs", org_id: "org-1", group_id: OTHER_GROUP, starts_at: "2026-11-30T15:00:00+00:00", ends_at: "2026-11-30T17:00:00+00:00", status: "planifiee", attendance_closed_at: null, trainer_id: ANNE, co_trainer_id: null, groups: { name: "A2 du soir" } },
    ],
    trainer_absences: [{ org_id: "org-1", trainer_id: ANNE, starts_on: "2026-11-23", ends_on: "2026-11-23", status: "approuvee" }],
    trainer_availabilities: [],
    profiles: [{ id: "u-anis", full_name: "Anis Kilani" }],
  };
}

const input = (over: Partial<{ groupId: string; trainerId: string; effectiveFrom: string }> = {}) => ({ groupId: GROUP, trainerId: ANNE, effectiveFrom: "2026-10-26", ...over });
const session = (id: string) => state.tables.sessions.find((r) => r.id === id)!;

beforeEach(() => {
  state.ctx = { userId: "u-anis", orgId: "org-1", role: "coordinator" };
  state.tables = world();
  state.writes = [];
  state.failUpdate = {};
  state.mailer = true;
  state.mails = [];
});

describe("droits", () => {
  it("formatrice, stagiaire, lecteur et setter refusés : rien n'est lu ni écrit", async () => {
    for (const role of ["trainer", "stagiaire", "viewer", "setter"]) {
      state.ctx.role = role;
      await expect(applyTrainerChange(input())).rejects.toThrow("Accès refusé");
      await expect(previewTrainerChange(input())).rejects.toThrow("Accès refusé");
    }
    expect(state.writes).toEqual([]);
    expect(state.mails).toEqual([]);
  });
});

describe("aperçu", () => {
  it("n'écrit rien et annonce les séances confiées et à régler", async () => {
    const res = await previewTrainerChange(input());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.preview).toMatchObject({ trainerFirstName: "Anne", assign: 2, coTrainerRemoved: 1, emailTo: ["Anne"] });
    expect(res.preview.conflicts.map((c) => c.reason)).toEqual([
      "en congé ce jour-là",
      "déjà en cours avec « A2 du soir » de 16h à 18h",
    ]);
    expect(state.writes).toEqual([]);
  });

  it("date d'effet passée, même personne, groupe terminé, personne inactive : refusés avec un message simple", async () => {
    expect(await previewTrainerChange(input({ effectiveFrom: "2026-10-25" }))).toMatchObject({ ok: false, error: expect.stringContaining("ne peut pas être passée") });
    state.tables = world(marie);
    expect(await previewTrainerChange(input({ trainerId: MARIE }))).toMatchObject({ ok: false, error: expect.stringContaining("déjà la personne qui anime") });
    state.tables.groups[0].status = "termine";
    expect(await previewTrainerChange(input())).toMatchObject({ ok: false, error: expect.stringContaining("terminé ou annulé") });
    state.tables = world();
    state.tables.trainers[0].is_active = false;
    expect(await applyTrainerChange(input())).toMatchObject({ ok: false, error: expect.stringContaining("plus) active") });
    expect(state.writes).toEqual([]);
  });
});

describe("application", () => {
  it("groupe « Non affecté » → Anne : séances à venir confiées, conflits et passé intacts, trace, email", async () => {
    const before = structuredClone(state.tables.sessions);
    const res = await applyTrainerChange(input());
    expect(res).toMatchObject({ ok: true, assigned: 2 });
    if (!res.ok) return;
    expect(res.message).toBe("2 séances confiées à Anne · 2 restent à régler dans le Planning · email envoyé à Anne · agendas Google mis à jour cette nuit.");
    expect(res.leftover.map((c) => c.sessionId)).toEqual(["conge", "clash"]);

    expect(session("s1")).toMatchObject({ trainer_id: ANNE, co_trainer_id: null });
    // Co-animée par Anne : elle devient formatrice, la co-animation est retirée
    expect(session("s2")).toMatchObject({ trainer_id: ANNE, co_trainer_id: null });
    // Jamais touchées : passée, annulée, feuille clôturée, conflits, autre groupe
    for (const id of ["passee", "annulee", "cloturee", "conge", "clash", "ailleurs"]) {
      expect(session(id)).toEqual(before.find((r) => r.id === id));
    }

    const group = state.tables.groups[0];
    expect(group.trainer_id).toBe(ANNE);
    expect(group.co_trainer_id).toBeNull(); // Anne co-animait le groupe : plus de doublon
    expect(group.notes).toBe("Atelier du lundi.\nFormateur changé le 26/10 par Anis : Non affecté → Anne Philippon, à partir du 26/10");

    // Un seul email (pas d'ancienne personne), à Anne
    expect(state.mails.map((m) => m.to)).toEqual(["anne@example.org"]);
    expect(state.mails[0].subject).toContain("Nouveau groupe confié : Atelier alphabétisation — bénévoles");
    expect(state.mails[0].html).toContain("Jours et horaires : lundi 14h30-17h45");
    expect(state.mails[0].html).toContain("Lieu : Salle Debain — 12 rue Debain, Saint-Ouen");
    expect(state.mails[0].html).toContain("lundi 23 novembre, 14h30–17h45");
  });

  it("Marie → Anne : les deux personnes prévenues, Marie garde les séances en conflit", async () => {
    state.tables = world(marie);
    const res = await applyTrainerChange(input());
    expect(res.ok).toBe(true);
    expect(session("conge").trainer_id).toBe(MARIE);
    expect(session("passee").trainer_id).toBe(MARIE);
    expect(state.tables.groups[0].notes).toContain("Marie Dupont → Anne Philippon, à partir du 26/10");
    expect(state.mails.map((m) => m.to)).toEqual(["anne@example.org", "marie@example.org"]);
    const toMarie = state.mails[1];
    expect(toMarie.subject).toBe("Changement de formateur : Atelier alphabétisation — bénévoles, à partir du lundi 26 octobre");
    expect(toMarie.html).toContain("est confié à Anne Philippon");
    expect(toMarie.html).toContain("Vous gardez pour l'instant ces séances");
    expect(toMarie.html).toContain("lundi 30 novembre, 14h30–17h45");
  });

  it("une séance prise entre-temps (verrou Postgres) reste à régler, les autres sont confiées", async () => {
    state.failUpdate.s2 = { code: "23P01", message: 'conflicting key value violates exclusion constraint "no_trainer_overlap"' };
    const res = await applyTrainerChange(input());
    expect(res).toMatchObject({ ok: true, assigned: 1 });
    if (!res.ok) return;
    expect(res.leftover.find((c) => c.sessionId === "s2")!.reason).toBe("le formateur a déjà une séance sur ce créneau.");
    expect(session("s1").trainer_id).toBe(ANNE);
    expect(session("s2").trainer_id).toBeNull();
  });

  it("à partir d'une date plus tardive : seules les séances suivantes changent", async () => {
    const res = await applyTrainerChange(input({ effectiveFrom: "2026-11-02" }));
    expect(res).toMatchObject({ ok: true, assigned: 1 });
    expect(session("s1").trainer_id).toBeNull();
    expect(session("s2").trainer_id).toBe(ANNE);
    expect(state.tables.groups[0].notes).toContain("à partir du 02/11");
  });

  it("email non configuré : le changement se fait, sans envoi", async () => {
    state.mailer = false;
    const res = await applyTrainerChange(input());
    expect(res).toMatchObject({ ok: true, assigned: 2 });
    expect(state.mails).toEqual([]);
  });
});
