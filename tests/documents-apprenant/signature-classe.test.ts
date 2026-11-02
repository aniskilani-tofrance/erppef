import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GROUP_MUNI, GROUP_PEF, LEARNER, ORG, OTHER_LEARNER, STRANGER, fakeClient, world, type FakeDb } from "./fake-supabase";

// Signature en classe : la feuille d'émargement ouverte circule, puis la page « Documents à
// signer » du même jeton. Base simulée en mémoire, aucun accès à la vraie base.
let db: FakeDb = world();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeClient(db) }));
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "203.0.113.9"], ["user-agent", "Mozilla/5.0 (Android; téléphone de la formatrice)"]]),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
// Les polices Google sont chargées par Next à la compilation : simples variables CSS ici.
vi.mock("next/font/google", () => ({ Outfit: () => ({ variable: "font-titre" }), DM_Sans: () => ({ variable: "font-texte" }) }));

const { fetchClassSheet, openLearnerSigning } = await import("@/app/signer/classe/[token]/actions");
const { signDocuments } = await import("@/app/signer/[token]/actions");
const { ClassSigning } = await import("@/components/documents-apprenant/class-signing");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const ALL = ["adhesion", "contrat_formation", "reglement_interieur"] as const;

/** Séance avec feuille d'émargement ouverte (ou non) : renvoie le jeton d'émargement. */
function addSession(over: Record<string, unknown> = {}): string {
  const token = randomUUID();
  const start = new Date(Date.now() - 3600_000);
  db.tables.sessions.push({
    id: randomUUID(),
    org_id: ORG,
    group_id: GROUP_PEF,
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 3 * 3600_000).toISOString(),
    attendance_token: token,
    attendance_closed_at: null,
    groups: { name: "PEF A1 — 2026-27" },
    ...over,
  });
  return token;
}

beforeEach(() => {
  db = world();
});

describe("page de la classe : qui doit encore signer", () => {
  it("feuille ouverte d'un cours PEF : les inscrits de l'organisme, avec ce qu'il leur reste", async () => {
    const sheet = await fetchClassSheet(addSession());
    expect(sheet.ok).toBe(true);
    if (!sheet.ok) return;
    expect(sheet.groupName).toBe("PEF A1 — 2026-27");
    expect(sheet.learners.map((l) => [l.name, l.pending])).toEqual([
      ["Prénom Exemple", 3],
      ["Voisine Secrète", 3],
    ]);
    expect(sheet.learners.some((l) => l.id === STRANGER)).toBe(false); // autre organisme : jamais
  });

  it("feuille clôturée, lien expiré (plus de 24 h après la séance) ou jeton inconnu : refusé", async () => {
    const closed = addSession({ attendance_closed_at: new Date().toISOString() });
    const old = addSession({ starts_at: "2026-10-01T07:00:00Z", ends_at: "2026-10-01T10:00:00Z" });
    for (const t of [closed, old, randomUUID(), "abc"]) {
      const r = await fetchClassSheet(t);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("invalide, expiré");
    }
  });

  it("cours municipal : aucun document à signer", async () => {
    const r = await fetchClassSheet(addSession({ group_id: GROUP_MUNI }));
    expect(r).toEqual({ ok: false, error: "Aucun document à signer pour ce groupe." });
  });
});

describe("un nom touché, puis la signature", () => {
  it("ouvre une session sur place de la personne, signe les 3 documents, la liste se met à jour", async () => {
    const token = addSession();
    const opened = await openLearnerSigning({ token, learnerId: LEARNER });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.page.fullName).toBe("Prénom Exemple");
    expect(opened.page.channel).toBe("sur_place");
    expect(opened.page.texts.map((t) => t.kind)).toEqual([...ALL]);
    const link = db.tables.learner_signature_links.find((l) => l.token === opened.signingToken)!;
    expect(link).toMatchObject({ learner_id: LEARNER, group_id: GROUP_PEF, channel: "sur_place", created_by: null });

    expect(await signDocuments({ token: opened.signingToken, accepted: [...ALL], signature: PNG })).toEqual({ ok: true, signed: [...ALL] });
    const rows = db.tables.learner_signed_documents;
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.channel === "sur_place" && r.learner_id === LEARNER && r.ip === "203.0.113.9")).toBe(true);

    const sheet = await fetchClassSheet(token);
    expect(sheet.ok && sheet.learners.map((l) => [l.name, l.pending])).toEqual([
      ["Prénom Exemple", 0],
      ["Voisine Secrète", 3],
    ]);
    // Tout signé : on ne rouvre pas
    expect(await openLearnerSigning({ token, learnerId: LEARNER })).toEqual({ ok: false, error: "Tout est déjà signé pour cette personne." });
  });

  it("personne d'un autre organisme ou non inscrite, feuille clôturée : refusé, aucun lien créé", async () => {
    const token = addSession();
    expect(await openLearnerSigning({ token, learnerId: STRANGER })).toEqual({ ok: false, error: "Cette personne n'est pas inscrite dans ce groupe." });
    const closed = addSession({ attendance_closed_at: new Date().toISOString() });
    const r = await openLearnerSigning({ token: closed, learnerId: OTHER_LEARNER });
    expect(r.ok).toBe(false);
    expect(db.tables.learner_signature_links).toHaveLength(0);
  });
});

describe("rendu de la page qui circule", () => {
  it("liste des noms, compteur, signés grisés, retour à l'émargement", async () => {
    const token = addSession();
    const sheet = await fetchClassSheet(token);
    if (!sheet.ok) throw new Error(sheet.error);
    const done = { ...sheet, learners: sheet.learners.map((l) => (l.id === LEARNER ? { ...l, pending: 0 } : l)) };
    const html = renderToStaticMarkup(createElement(ClassSigning, { token, sheet: done })).replace(/&#x27;/g, "'").replace(/<!-- -->/g, "");
    expect(html).toContain("Documents à signer");
    expect(html).toContain("1 / 2 ont tout signé");
    expect(html).toContain("✓ Signé");
    expect(html).toMatch(/<button[^>]*>.*Voisine Secrète/);
    expect(html).toContain(`href="/emargement/${token}"`);
  });
});
