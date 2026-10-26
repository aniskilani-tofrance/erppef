import { describe, expect, it } from "vitest";
import { pickBulkTestTargets, type BulkLearnerRow } from "@/lib/placement/bulk";

const now = new Date("2026-10-26T10:00:00Z");
const L = (id: string, over: Partial<BulkLearnerRow> = {}): BulkLearnerRow => ({
  id, first_name: `P${id}`, last_name: "Test", phone: "06 12 34 56 78", admission_status: "nouveau",
  level_assessed: null, created_at: `2026-10-${10 + Number(id)}T09:00:00Z`, ...over,
});

describe("envoi groupé du test — sélection", () => {
  it("ne garde que « À contacter » et « Contacté », dans l'ordre d'arrivée", () => {
    const r = pickBulkTestTargets(
      [L("3"), L("1", { admission_status: "contacte" }), L("2", { admission_status: "convoque" }), L("4", { admission_status: "inscrit" })],
      [], [], now,
    );
    expect(r.targets.map((t) => t.learnerId)).toEqual(["1", "3"]);
    expect(r.targets[0].status).toBe("contacte");
  });

  it("exclut test déjà fait ou niveau connu, et les compte", () => {
    const r = pickBulkTestTargets(
      [L("1"), L("2", { level_assessed: "A1" }), L("3")],
      [{ learner_id: "1", status: "fait", token: "t1", created_at: "2026-10-12T00:00:00Z" }],
      [], now,
    );
    expect(r.targets.map((t) => t.learnerId)).toEqual(["3"]);
    expect(r.skippedDone).toBe(2);
  });

  it("réutilise le dernier lien en attente, sinon lien à créer", () => {
    const r = pickBulkTestTargets(
      [L("1"), L("2")],
      [
        { learner_id: "1", status: "en_attente", token: "ancien", created_at: "2026-10-11T00:00:00Z" },
        { learner_id: "1", status: "en_attente", token: "recent", created_at: "2026-10-20T00:00:00Z" },
      ],
      [], now,
    );
    expect(r.targets.find((t) => t.learnerId === "1")?.token).toBe("recent");
    expect(r.targets.find((t) => t.learnerId === "2")?.token).toBeNull();
  });

  it("signale une invitation récente (moins de 14 jours), pas une ancienne ni une autre note", () => {
    const r = pickBulkTestTargets(
      [L("1"), L("2"), L("3")],
      [],
      [
        { learner_id: "1", contacted_at: "2026-10-20T08:00:00Z", note: "Invitation au test de positionnement (WhatsApp)" },
        { learner_id: "2", contacted_at: "2026-10-01T08:00:00Z", note: "Invitation au test de positionnement (WhatsApp)" },
        { learner_id: "3", contacted_at: "2026-10-25T08:00:00Z", note: "WhatsApp — Premier contact" },
      ],
      now,
    );
    expect(r.targets.map((t) => [t.learnerId, t.alreadySentAt])).toEqual([["1", "2026-10-20T08:00:00Z"], ["2", null], ["3", null]]);
  });

  it("repère un numéro inutilisable pour WhatsApp", () => {
    const r = pickBulkTestTargets([L("1", { phone: null }), L("2", { phone: "12" }), L("3")], [], [], now);
    expect(r.targets.map((t) => t.phoneOk)).toEqual([false, false, true]);
  });
});
