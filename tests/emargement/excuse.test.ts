import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXCUSE_CLEARED,
  excuseTraceLabel,
  normalizeExcuseReason,
  openSheetStatusPatch,
  planClosedSheetExcuse,
} from "@/lib/emargement/excuse";
import {
  ATTENDANCE_STATUSES,
  EXCUSE_UNAVAILABLE,
  absencesSummary,
  excusedAbsencesLabel,
  isAttended,
  isExcuseSchemaMissing,
} from "@/lib/attendance-status";

const NOW = new Date("2026-10-26T09:00:00Z");
const USER = "11111111-1111-4111-8111-111111111111";

describe("statuts d'émargement", () => {
  it("quatre statuts ; seuls présent et retard sont des séances suivies", () => {
    expect(ATTENDANCE_STATUSES).toEqual(["present", "retard", "absent", "excuse"]);
    expect(ATTENDANCE_STATUSES.filter(isAttended)).toEqual(["present", "retard"]);
  });

  it("libellés « dont X absences justifiées »", () => {
    expect(excusedAbsencesLabel(0)).toBe("");
    expect(excusedAbsencesLabel(1)).toBe("dont 1 absence justifiée");
    expect(excusedAbsencesLabel(3)).toBe("dont 3 absences justifiées");
    expect(absencesSummary(4, 1)).toBe("4 absences, dont 1 absence justifiée");
    expect(absencesSummary(1, 0)).toBe("1 absence");
    expect(absencesSummary(0, 0)).toBe("aucune absence");
  });

  it("reconnaît une base sans la migration 0055 (valeur d'enum ou colonnes absentes)", () => {
    expect(isExcuseSchemaMissing({ code: "22P02", message: 'invalid input value for enum attendance_status: "excuse"' })).toBe(true);
    expect(isExcuseSchemaMissing({ code: "PGRST204", message: "Could not find the 'excuse_reason' column of 'attendances' in the schema cache" })).toBe(true);
    expect(isExcuseSchemaMissing({ code: "42703", message: "column attendances.excused_at does not exist" })).toBe(true);
    expect(isExcuseSchemaMissing({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(isExcuseSchemaMissing(null)).toBe(false);
  });
});

describe("motif et trace", () => {
  it("motif : une ligne, 200 caractères au plus, vide → null", () => {
    expect(normalizeExcuseReason("  Rendez-vous\n  préfecture  ")).toBe("Rendez-vous préfecture");
    expect(normalizeExcuseReason("   ")).toBeNull();
    expect(normalizeExcuseReason(undefined)).toBeNull();
    expect(normalizeExcuseReason("x".repeat(300))).toHaveLength(200);
  });

  it("trace « excusé le JJ/MM par Prénom » (heure de Paris)", () => {
    expect(excuseTraceLabel("2026-10-26T22:30:00Z", "Nadia Benali")).toBe("excusé le 26/10 par Nadia");
    expect(excuseTraceLabel("2026-10-26T23:30:00Z", "Nadia Benali")).toBe("excusé le 27/10 par Nadia");
    expect(excuseTraceLabel("2026-10-26T09:00:00Z", null)).toBe("excusé le 26/10");
    expect(excuseTraceLabel(null, "Nadia")).toBeNull();
  });
});

describe("feuille ouverte : statut posé à la main", () => {
  it("« Excusé » : motif, trace, signature effacée", () => {
    expect(openSheetStatusPatch({ status: "excuse", previousStatus: null, reason: " enfant malade ", userId: USER, now: NOW })).toEqual({
      status: "excuse",
      signature: null,
      signed_at: null,
      method: "manuel",
      excuse_reason: "enfant malade",
      excused_by: USER,
      excused_at: NOW.toISOString(),
    });
  });

  it("quitter « Excusé » efface motif et trace ; sinon les colonnes excuse_* ne sont pas écrites", () => {
    expect(openSheetStatusPatch({ status: "present", previousStatus: "excuse", userId: USER, now: NOW })).toEqual({ status: "present", ...EXCUSE_CLEARED });
    expect(openSheetStatusPatch({ status: "absent", previousStatus: "excuse", userId: USER, now: NOW })).toEqual({
      status: "absent", signature: null, signed_at: null, method: "manuel", ...EXCUSE_CLEARED,
    });
    // Sans « Excusé » avant : patch identique à l'ancien comportement (sûr sans la migration)
    expect(openSheetStatusPatch({ status: "retard", previousStatus: "present", userId: USER, now: NOW })).toEqual({ status: "retard" });
    expect(openSheetStatusPatch({ status: "absent", previousStatus: null, userId: USER, now: NOW })).toEqual({
      status: "absent", signature: null, signed_at: null, method: "manuel",
    });
  });
});

describe("feuille clôturée : planClosedSheetExcuse", () => {
  const base = { closed: true, userId: USER, now: NOW };

  it("admin et coordination : « Absent » → « Excusé » ; le patch ne touche que statut, motif et trace", () => {
    for (const role of ["admin", "coordinator"] as const) {
      const plan = planClosedSheetExcuse({ ...base, role, current: "absent", excused: true, reason: "préfecture" });
      expect(plan).toEqual({
        ok: true,
        patch: { status: "excuse", excuse_reason: "préfecture", excused_by: USER, excused_at: NOW.toISOString() },
      });
      if (plan.ok && plan.patch) expect(Object.keys(plan.patch).sort()).toEqual(["excuse_reason", "excused_at", "excused_by", "status"]);
    }
  });

  it("formatrice, stagiaire et lecteur refusés", () => {
    for (const role of ["trainer", "stagiaire", "viewer", "setter"] as const) {
      const plan = planClosedSheetExcuse({ ...base, role, current: "absent", excused: true });
      expect(plan.ok).toBe(false);
      if (!plan.ok) expect(plan.error).toContain("seule la coordination");
    }
  });

  it("ligne présente ou en retard refusée (les heures changeraient : rouvrir la feuille)", () => {
    for (const current of ["present", "retard"]) {
      for (const excused of [true, false]) {
        const plan = planClosedSheetExcuse({ ...base, role: "coordinator", current, excused });
        expect(plan.ok).toBe(false);
        if (!plan.ok) expect(plan.error).toContain("rouvrez la feuille");
      }
    }
  });

  it("feuille encore ouverte ou ligne manquante refusées", () => {
    expect(planClosedSheetExcuse({ ...base, closed: false, role: "admin", current: "absent", excused: true }).ok).toBe(false);
    expect(planClosedSheetExcuse({ ...base, role: "admin", current: null, excused: true }).ok).toBe(false);
  });

  it("aller-retour : « Excusé » → « Absent » efface motif et trace ; « Absent » → « Absent » ne fait rien", () => {
    expect(planClosedSheetExcuse({ ...base, role: "admin", current: "excuse", excused: false })).toEqual({
      ok: true,
      patch: { status: "absent", excuse_reason: null, excused_by: null, excused_at: null },
    });
    expect(planClosedSheetExcuse({ ...base, role: "admin", current: "absent", excused: false })).toEqual({ ok: true, patch: null });
    // Modifier le motif d'une ligne déjà excusée
    const again = planClosedSheetExcuse({ ...base, role: "coordinator", current: "excuse", excused: true, reason: "" });
    expect(again).toMatchObject({ ok: true, patch: { status: "excuse", excuse_reason: null } });
  });
});

// ── Server Actions, base simulée en mémoire (aucun accès à la vraie base) ──────────

type Row = Record<string, unknown>;
type Ctx = { userId: string; orgId: string; role: string };
const state: { ctx: Ctx; tables: Record<string, Row[]>; failWrite: { code: string; message: string } | null; writes: { table: string; op: string; values: Row }[] } = {
  ctx: { userId: USER, orgId: "org-1", role: "coordinator" },
  tables: {},
  failWrite: null,
  writes: [],
};

function fakeClient() {
  return {
    from(table: string) {
      let op: "select" | "update" | "insert" = "select";
      let values: Row = {};
      let returning = false;
      const filters: ((r: Row) => boolean)[] = [];
      const run = () => {
        const rows = (state.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (op === "select") return { data: rows.map((r) => ({ ...r })), error: null };
        if (state.failWrite) return { data: null, error: state.failWrite };
        state.writes.push({ table, op, values: { ...values } });
        if (op === "insert") {
          (state.tables[table] ??= []).push({ id: `new-${state.writes.length}`, ...values });
          return { data: null, error: null };
        }
        for (const r of rows) Object.assign(r, values);
        return { data: returning ? rows.map((r) => ({ id: r.id })) : null, error: null };
      };
      const query = {
        select() {
          if (op !== "select") returning = true;
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push((r) => r[column] === value);
          return query;
        },
        update(v: Row) {
          op = "update";
          values = v;
          return query;
        },
        insert(v: Row) {
          op = "insert";
          values = v;
          return query;
        },
        async maybeSingle() {
          const res = run();
          return { data: res.data?.[0] ?? null, error: res.error };
        },
        async single() {
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
vi.mock("@/lib/stagiaires", () => ({ assertSessionAccess: async () => true }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeClient() }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/emargement/gdrive", () => ({ driveConfigured: () => false, uploadSheetToDrive: async () => ({ link: null }) }));

const { excuseClosedAbsence, setAttendanceStatus } = await import("@/app/(app)/seances/actions");

const SESSION = "22222222-2222-4222-8222-222222222222";
const ABSENT = "33333333-3333-4333-8333-333333333333";
const PRESENT = "44444444-4444-4444-8444-444444444444";
const OTHER_ABSENT = "55555555-5555-4555-8555-555555555555";
const SIGNATURE = "data:image/png;base64,AAAA";

function closedSheet() {
  return {
    sessions: [{
      id: SESSION, org_id: "org-1", status: "realisee", attendance_token: null,
      attendance_closed_at: "2026-10-20T11:05:00Z", trainer_signature: "data:image/png;base64,FORMATRICE",
    }],
    attendances: [
      { id: "a-absent", org_id: "org-1", session_id: SESSION, learner_id: ABSENT, status: "absent", signature: null, signed_at: null, method: "manuel" },
      { id: "a-present", org_id: "org-1", session_id: SESSION, learner_id: PRESENT, status: "present", signature: SIGNATURE, signed_at: "2026-10-20T07:03:00Z", method: "tablette" },
      { id: "a-other", org_id: "org-1", session_id: SESSION, learner_id: OTHER_ABSENT, status: "absent", signature: null, signed_at: null, method: "manuel" },
    ],
  };
}

describe("excuseClosedAbsence (feuille clôturée)", () => {
  beforeEach(() => {
    state.ctx = { userId: USER, orgId: "org-1", role: "coordinator" };
    state.tables = closedSheet();
    state.failWrite = null;
    state.writes = [];
  });

  it("coordination : la ligne passe « Excusé » ; clôture, signatures et autres lignes inchangées", async () => {
    const before = structuredClone(state.tables);
    const res = await excuseClosedAbsence({ sessionId: SESSION, learnerId: ABSENT, excused: true, reason: "rendez-vous médical" });
    expect(res).toEqual({ ok: true });

    // Une seule écriture, sur la ligne d'émargement, jamais sur la séance
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].table).toBe("attendances");
    expect(Object.keys(state.writes[0].values).sort()).toEqual(["excuse_reason", "excused_at", "excused_by", "status"]);
    expect(state.tables.sessions).toEqual(before.sessions);

    const [absent, present, other] = state.tables.attendances;
    expect(absent).toMatchObject({ status: "excuse", excuse_reason: "rendez-vous médical", excused_by: USER, signature: null, method: "manuel" });
    expect(typeof absent.excused_at).toBe("string");
    expect(present).toEqual(before.attendances[1]);
    expect(other).toEqual(before.attendances[2]);
  });

  it("admin aussi ; aller-retour « Excusé » → « Absent »", async () => {
    state.ctx.role = "admin";
    expect(await excuseClosedAbsence({ sessionId: SESSION, learnerId: ABSENT, excused: true })).toEqual({ ok: true });
    expect(state.tables.attendances[0]).toMatchObject({ status: "excuse", excuse_reason: null, excused_by: USER });
    expect(await excuseClosedAbsence({ sessionId: SESSION, learnerId: ABSENT, excused: false })).toEqual({ ok: true });
    expect(state.tables.attendances[0]).toMatchObject({ status: "absent", excuse_reason: null, excused_by: null, excused_at: null });
    expect(state.tables.sessions[0].attendance_closed_at).toBe("2026-10-20T11:05:00Z");
  });

  it("formatrice refusée, rien n'est écrit", async () => {
    state.ctx.role = "trainer";
    const res = await excuseClosedAbsence({ sessionId: SESSION, learnerId: ABSENT, excused: true });
    expect(res.ok).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it("ligne présente refusée, rien n'est écrit", async () => {
    const res = await excuseClosedAbsence({ sessionId: SESSION, learnerId: PRESENT, excused: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("rouvrez la feuille");
    expect(state.writes).toEqual([]);
    expect(state.tables.attendances[1].status).toBe("present");
  });

  it("base pas encore à jour : message clair, pas d'erreur SQL brute", async () => {
    state.failWrite = { code: "22P02", message: 'invalid input value for enum attendance_status: "excuse"' };
    expect(await excuseClosedAbsence({ sessionId: SESSION, learnerId: ABSENT, excused: true })).toEqual({ ok: false, error: EXCUSE_UNAVAILABLE });
  });

  it("motif trop long refusé avec un message simple", async () => {
    const res = await excuseClosedAbsence({ sessionId: SESSION, learnerId: ABSENT, excused: true, reason: "x".repeat(201) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("200 caractères");
  });
});

describe("setAttendanceStatus (feuille ouverte) : validation du statut", () => {
  beforeEach(() => {
    state.ctx = { userId: USER, orgId: "org-1", role: "trainer" };
    state.tables = {
      sessions: [{ id: SESSION, org_id: "org-1", attendance_closed_at: null }],
      attendances: [],
    };
    state.failWrite = null;
    state.writes = [];
  });

  it("la formatrice pose « Excusé » avec un motif", async () => {
    expect(await setAttendanceStatus({ sessionId: SESSION, learnerId: ABSENT, status: "excuse", excuseReason: "préfecture" })).toEqual({ ok: true });
    expect(state.writes[0].values).toMatchObject({
      org_id: "org-1", session_id: SESSION, learner_id: ABSENT, status: "excuse", excuse_reason: "préfecture", excused_by: USER, method: "manuel",
    });
  });

  it("statut inconnu refusé", async () => {
    // @ts-expect-error statut hors liste
    expect(await setAttendanceStatus({ sessionId: SESSION, learnerId: ABSENT, status: "malade" })).toEqual({ ok: false, error: "Paramètres invalides" });
    expect(state.writes).toEqual([]);
  });

  it("feuille clôturée : la saisie normale reste refusée (chemin dédié à la coordination)", async () => {
    state.tables.sessions[0].attendance_closed_at = "2026-10-20T11:05:00Z";
    const res = await setAttendanceStatus({ sessionId: SESSION, learnerId: ABSENT, status: "excuse" });
    expect(res).toEqual({ ok: false, error: "Feuille clôturée : rouvrez-la pour corriger" });
  });

  it("base pas encore à jour : « Excusé » indisponible, message clair", async () => {
    state.failWrite = { code: "22P02", message: 'invalid input value for enum attendance_status: "excuse"' };
    expect(await setAttendanceStatus({ sessionId: SESSION, learnerId: ABSENT, status: "excuse" })).toEqual({ ok: false, error: EXCUSE_UNAVAILABLE });
  });
});
