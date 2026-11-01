import { beforeEach, describe, expect, it, vi } from "vitest";
import { GROUP_MUNI, LEARNER, ORG, OTHER_ORG, STRANGER, addLink, fakeClient, pdfText, world, type FakeDb } from "./fake-supabase";

// Page publique /signer/<jeton> : base simulée en mémoire, aucun accès à la vraie base.
let db: FakeDb = world();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeClient(db) }));
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "203.0.113.7, 10.0.0.1"], ["user-agent", "Mozilla/5.0 (iPhone; test)"]]),
}));

const { fetchSigningPage, signDocuments } = await import("@/app/signer/[token]/actions");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const ALL = ["adhesion", "contrat_formation", "reglement_interieur"] as const;

beforeEach(() => {
  db = world();
});

describe("jeton invalide ou refusé", () => {
  it("jeton mal formé ou inconnu : « lien pas reconnu », aucune donnée", async () => {
    for (const t of ["abc", "00000000-0000-4000-8000-000000000000"]) {
      const page = await fetchSigningPage(t);
      expect(page).toEqual({ ok: false, error: "Ce lien n'est pas reconnu." });
    }
  });

  it("lien d'un organisme vers une personne d'un AUTRE organisme : refusé", async () => {
    const token = addLink(db, { learner_id: STRANGER });
    expect(await fetchSigningPage(token)).toEqual({ ok: false, error: "Ce lien n'est pas reconnu." });
    const other = addLink(db, { org_id: OTHER_ORG }); // lien du bac à sable vers une personne de la prod
    expect((await fetchSigningPage(other)).ok).toBe(false);
  });

  it("lien expiré, groupe municipal, personne plus inscrite : refusés avec un message simple", async () => {
    expect(await fetchSigningPage(addLink(db, { expires_at: "2020-01-01T00:00:00Z" }))).toEqual({ ok: false, error: "Ce lien a expiré. Demandez un nouveau lien à l'équipe." });
    expect(await fetchSigningPage(addLink(db, { group_id: GROUP_MUNI }))).toEqual({ ok: false, error: "Aucun document à signer pour ce groupe." });
    const token = addLink(db);
    db.tables.enrollments.find((e) => e.id === "e1")!.status = "abandon";
    expect((await fetchSigningPage(token)).ok).toBe(false);
  });

  it("migration 0059 absente : « signature pas encore ouverte »", async () => {
    db.errors.learner_signature_links = { code: "PGRST205", message: "Could not find the table 'public.learner_signature_links' in the schema cache" };
    expect(await fetchSigningPage("33333333-3333-4333-8333-333333333333")).toEqual({ ok: false, error: "La signature en ligne n'est pas encore ouverte. Parlez-en à l'équipe." });
  });
});

describe("lien valable", () => {
  it("ne montre que la personne du lien : prénom, nom, groupe, les 3 textes", async () => {
    const page = await fetchSigningPage(addLink(db));
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    expect(page.firstName).toBe("Prénom");
    expect(page.groupName).toBe("PEF A1 — 2026-27");
    expect(page.texts.map((t) => t.kind)).toEqual([...ALL]);
    expect(page.retractationUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const json = JSON.stringify(page);
    for (const secret of ["Voisine", "Secrète", "06 99 99 99 99", "Bacasable", "06 00 00 00 01", "1990-03-14"]) expect(json).not.toContain(secret);
  });

  it("refuse de signer sans avoir coché chaque document", async () => {
    const token = addLink(db);
    expect(await signDocuments({ token, accepted: ["adhesion", "reglement_interieur"], signature: PNG })).toEqual({
      ok: false,
      error: "Cochez « J'ai lu » pour chaque document avant de signer.",
    });
    expect(db.tables.learner_signed_documents).toHaveLength(0);
    expect(await signDocuments({ token, accepted: [...ALL], signature: "data:image/jpeg;base64,xx" })).toMatchObject({ ok: false });
  });

  it("signe : 3 PDF horodatés dans le dossier privé, 3 lignes, journal, IP et appareil", async () => {
    const token = addLink(db);
    const res = await signDocuments({ token, accepted: [...ALL], signature: PNG });
    expect(res).toEqual({ ok: true, signed: [...ALL] });
    const rows = db.tables.learner_signed_documents;
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.org_id).toBe(ORG);
      expect(r.learner_id).toBe(LEARNER);
      expect(r.channel).toBe("lien");
      expect(r.ip).toBe("203.0.113.7");
      expect(r.user_agent).toContain("iPhone");
      expect(r.signer_name).toBe("Prénom Exemple");
      expect(r.text_version).toBe("2026-11-01");
      expect(String(r.file_path)).toMatch(new RegExp(`^${ORG}/apprenants/${LEARNER}/signe-`));
      expect(db.files.has(`dossiers/${r.file_path}`)).toBe(true);
      expect(String(r.file_sha256)).toMatch(/^[0-9a-f]{64}$/);
    }
    const contrat = rows.find((r) => r.kind === "contrat_formation")!;
    const text = await pdfText(db.files.get(`dossiers/${contrat.file_path}`)!);
    expect(text).toContain("CONTRAT DE FORMATION PROFESSIONNELLE");
    expect(text).toContain("Prénom Exemple");
    expect(text).toContain(String(contrat.id));
    expect(db.tables.learner_contacts).toHaveLength(1);
    expect(String(db.tables.learner_contacts[0].note)).toContain("Documents signés");
    expect(db.tables.learner_signature_links[0].completed_at).toBeTruthy();

    // Deuxième passage : tout est signé, rien de nouveau
    const again = await fetchSigningPage(token);
    expect(again.ok && again.texts.length).toBe(0);
    expect(again.ok && again.signedKinds).toEqual([...ALL]);
    expect(await signDocuments({ token, accepted: [...ALL], signature: PNG })).toEqual({ ok: true, signed: [] });
    expect(db.tables.learner_signed_documents).toHaveLength(3);
  });

  it("tablette : le lien se referme dès la signature (personne suivante)", async () => {
    const token = addLink(db, { channel: "sur_place" });
    expect((await signDocuments({ token, accepted: [...ALL], signature: PNG })).ok).toBe(true);
    expect(db.tables.learner_signed_documents.every((r) => r.channel === "sur_place")).toBe(true);
    expect(await fetchSigningPage(token)).toMatchObject({ ok: false });
  });

  it("adhésion et règlement déjà signés cette année (autre groupe) : seul le contrat reste", async () => {
    db.tables.learner_signed_documents.push(
      { id: "x1", org_id: ORG, learner_id: LEARNER, group_id: "autre", kind: "adhesion", membership_year: 2026, text_version: "2026-11-01", signed_at: "2026-10-20T10:00:00Z", channel: "sur_place" },
      { id: "x2", org_id: ORG, learner_id: LEARNER, group_id: "autre", kind: "reglement_interieur", membership_year: 2026, text_version: "2026-11-01", signed_at: "2026-10-20T10:00:00Z", channel: "sur_place" },
    );
    const page = await fetchSigningPage(addLink(db));
    expect(page.ok && page.texts.map((t) => t.kind)).toEqual(["contrat_formation"]);
  });
});
