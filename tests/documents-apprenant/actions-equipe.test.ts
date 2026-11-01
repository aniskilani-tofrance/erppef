import { beforeEach, describe, expect, it, vi } from "vitest";
import { GROUP_MUNI, GROUP_PEF, LEARNER, ORG, TRAINER, fakeClient, world, type FakeDb } from "./fake-supabase";

// Actions de l'équipe (fiche apprenant, fiche groupe) : droits, lien, cotisation.
let db: FakeDb = world();
const state = { ctx: { userId: "u-coord", orgId: ORG, role: "coordinator" } };
vi.mock("@/lib/auth", () => ({
  requireRole: async (allowed: string[]) => {
    if (!allowed.includes(state.ctx.role)) throw new Error("Accès refusé : votre rôle ne permet pas cette action.");
    return state.ctx;
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeClient(db) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeClient(db) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({ headers: async () => new Map([["host", "pef-erp.vercel.app"], ["x-forwarded-proto", "https"]]) }));

const { cancelMembershipPayment, loadLearnerSignatures, prepareSigningLink, recordMembershipPayment } = await import("@/app/(app)/apprenants/documents-actions");
const { loadGroupDocumentsCard } = await import("@/lib/documents-apprenant/serveur");

beforeEach(() => {
  db = world();
  db.tables.memberships.push({ org_id: ORG, user_id: "u-marie", role: "trainer", trainer_id: TRAINER });
  db.tables.profiles.push({ id: "u-coord", full_name: "Wafa Exemple" });
  state.ctx = { userId: "u-coord", orgId: ORG, role: "coordinator" };
});
const as = (role: string, userId = "u-coord") => (state.ctx = { userId, orgId: ORG, role });

describe("faire signer : tablette ou lien WhatsApp", () => {
  it("coordination, lien WhatsApp : 30 jours, message vouvoyé avec le lien, journal", async () => {
    const res = await prepareSigningLink({ learnerId: LEARNER, groupId: GROUP_PEF, channel: "lien" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const link = db.tables.learner_signature_links[0];
    expect(res.url).toBe(`https://pef-erp.vercel.app/signer/${link.token}`);
    expect(Date.parse(String(link.expires_at)) - Date.now()).toBeGreaterThan(29 * 86_400_000);
    expect(res.message).toContain("Bonjour Prénom,");
    expect(res.message).toContain("Je suis Wafa de Parler Emploi Formation.");
    expect(res.message).toContain(res.url);
    expect(res.message).toContain("le bulletin d'adhésion");
    expect(res.whatsappUrl).toMatch(/^https:\/\/wa\.me\/33600000001\?text=/);
    expect(db.tables.learner_contacts).toHaveLength(1);
  });

  it("formatrice du groupe : peut faire signer sur la tablette (2 heures)", async () => {
    as("trainer", "u-marie");
    const res = await prepareSigningLink({ learnerId: LEARNER, groupId: GROUP_PEF, channel: "sur_place" });
    expect(res.ok && res.message).toBe(null);
    const link = db.tables.learner_signature_links[0];
    expect(link.channel).toBe("sur_place");
    expect(Date.parse(String(link.expires_at)) - Date.now()).toBeLessThanOrEqual(2 * 3_600_000);
  });

  it("formatrice d'un autre groupe : refusé ; lecteur : refusé", async () => {
    db.tables.memberships[0].trainer_id = "99999999-9999-4999-8999-999999999999";
    as("trainer", "u-marie");
    expect(await prepareSigningLink({ learnerId: LEARNER, groupId: GROUP_PEF, channel: "sur_place" })).toMatchObject({ ok: false });
    as("viewer");
    await expect(prepareSigningLink({ learnerId: LEARNER, groupId: GROUP_PEF, channel: "lien" })).rejects.toThrow("Accès refusé");
    expect(db.tables.learner_signature_links).toHaveLength(0);
  });

  it("cours municipal : pas de lien", async () => {
    expect(await prepareSigningLink({ learnerId: LEARNER, groupId: GROUP_MUNI, channel: "lien" })).toEqual({
      ok: false,
      error: "Ce groupe ne demande pas ces documents (cours municipaux ou autre financeur).",
    });
  });

  it("migration absente : message clair", async () => {
    db.errors.learner_signature_links = { code: "42P01", message: 'relation "learner_signature_links" does not exist' };
    expect(await prepareSigningLink({ learnerId: LEARNER, groupId: GROUP_PEF, channel: "lien" })).toEqual({
      ok: false,
      error: "Fonction pas encore activée sur la base : la migration 0059 est à appliquer.",
    });
  });
});

describe("cotisation", () => {
  it("coordination : 40 €, date, mode, n° de reçu ; puis annulation", async () => {
    expect(await recordMembershipPayment({ learnerId: LEARNER, year: 2026, amountEuros: 40, paidOn: "2026-10-20", method: "cheque" })).toEqual({ ok: true });
    const m = db.tables.learner_memberships[0];
    expect(m).toMatchObject({ org_id: ORG, learner_id: LEARNER, membership_year: 2026, amount_cents: 4000, paid: true, paid_on: "2026-10-20", payment_method: "cheque", receipt_no: "ADH-2026-0042", recorded_by: "u-coord" });
    // Nouvelle saisie la même année : mise à jour, pas de doublon
    expect(await recordMembershipPayment({ learnerId: LEARNER, year: 2026, amountEuros: 20, paidOn: "2026-10-21", method: "especes", note: "tarif réduit (bureau)" })).toEqual({ ok: true });
    expect(db.tables.learner_memberships).toHaveLength(1);
    expect(db.tables.learner_memberships[0]).toMatchObject({ amount_cents: 2000, payment_method: "especes", note: "tarif réduit (bureau)" });
    expect(await cancelMembershipPayment({ learnerId: LEARNER, year: 2026 })).toEqual({ ok: true });
    expect(db.tables.learner_memberships[0]).toMatchObject({ paid: false, paid_on: null, payment_method: null });
  });

  it("date dans le futur, mode inconnu : refusés", async () => {
    expect(await recordMembershipPayment({ learnerId: LEARNER, year: 2026, amountEuros: 40, paidOn: "2999-01-01", method: "cheque" })).toMatchObject({ ok: false });
    expect(await recordMembershipPayment({ learnerId: LEARNER, year: 2026, amountEuros: 40, paidOn: "2026-10-20", method: "bitcoin" as never })).toMatchObject({ ok: false });
  });

  it("formatrice : pas de saisie de cotisation", async () => {
    as("trainer", "u-marie");
    await expect(recordMembershipPayment({ learnerId: LEARNER, year: 2026, amountEuros: 40, paidOn: "2026-10-20", method: "cheque" })).rejects.toThrow("Accès refusé");
  });

  it("migration absente : message clair", async () => {
    db.errors.learner_memberships = { code: "PGRST205", message: "Could not find the table 'public.learner_memberships' in the schema cache" };
    expect(await recordMembershipPayment({ learnerId: LEARNER, year: 2026, amountEuros: 40, paidOn: "2026-10-20", method: "cheque" })).toEqual({
      ok: false,
      error: "Fonction pas encore activée sur la base : la migration 0059 (documents de l'apprenant) est à appliquer.",
    });
  });
});

describe("fiche apprenant et fiche groupe", () => {
  it("fiche : seulement les groupes concernés (pas le cours municipal)", async () => {
    const res = await loadLearnerSignatures(LEARNER);
    expect(res.ok && res.groups.map((g) => g.groupId)).toEqual([GROUP_PEF]);
    expect(res.ok && res.available).toBe(true);
    expect(res.ok && res.perms.recordPayment).toBe(true);
  });

  it("fiche groupe : coordination voit les cotisations, la formatrice non ; cours municipal : pas de carte", async () => {
    db.tables.learner_memberships.push({ org_id: ORG, learner_id: LEARNER, membership_year: 2026, amount_cents: 4000, paid: true, paid_on: "2026-10-20", payment_method: "especes", receipt_no: "ADH-2026-0042", note: null });
    const admin = fakeClient(db) as never;
    const coord = await loadGroupDocumentsCard(admin, { orgId: ORG, userId: "u-coord", role: "coordinator" }, GROUP_PEF, "2026-11-01");
    expect(coord?.rows.map((r) => r.name)).toEqual(["Prénom Exemple", "Voisine Secrète"]);
    expect(coord?.rows[0].membership?.paid).toBe(true);
    const trainer = await loadGroupDocumentsCard(admin, { orgId: ORG, userId: "u-marie", role: "trainer" }, GROUP_PEF, "2026-11-01");
    expect(trainer?.perms).toMatchObject({ view: true, signHere: true, recordPayment: false, download: false });
    expect(trainer?.rows.every((r) => r.membership === null)).toBe(true);
    expect(await loadGroupDocumentsCard(admin, { orgId: ORG, userId: "u-coord", role: "coordinator" }, GROUP_MUNI, "2026-11-01")).toBeNull();
    expect(await loadGroupDocumentsCard(admin, { orgId: ORG, userId: "u-x", role: "viewer" }, GROUP_PEF, "2026-11-01")).toBeNull();
  });

  it("fiche groupe, migration absente : carte affichée avec le message (available=false)", async () => {
    db.errors.learner_signed_documents = { code: "42P01", message: "does not exist" };
    const card = await loadGroupDocumentsCard(fakeClient(db) as never, { orgId: ORG, userId: "u-coord", role: "coordinator" }, GROUP_PEF, "2026-11-01");
    expect(card?.available).toBe(false);
  });
});
