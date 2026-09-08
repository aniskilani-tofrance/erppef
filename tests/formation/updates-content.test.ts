import { describe, expect, it } from "vitest";
import { APP_UPDATES, updatesForRole } from "@/lib/updates-content";
import { TRAINING_MODULES } from "@/lib/training-content";

// Chaque mise à jour annoncée doit pointer vers une leçon qui existe : c'est la règle
// « l'email et la formation vont ensemble ».
describe("journal des mises à jour", () => {
  it("identifiants uniques, dates ISO, au moins un point par entrée", () => {
    const ids = APP_UPDATES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const u of APP_UPDATES) {
      expect(u.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(u.id.startsWith(u.date)).toBe(true);
      expect(u.items.length).toBeGreaterThan(0);
      expect(u.summary.trim().length).toBeGreaterThan(20);
      for (const i of u.items) expect(i.roles.length).toBeGreaterThan(0);
    }
  });

  it("chaque lien de formation vise un module et une leçon existants", () => {
    for (const u of APP_UPDATES) {
      for (const t of u.training) {
        const mod = TRAINING_MODULES.find((m) => m.id === t.moduleId);
        expect(mod, `${u.id} → module ${t.moduleId}`).toBeDefined();
        expect(mod!.lessons.some((l) => l.id === t.lessonId), `${u.id} → leçon ${t.lessonId}`).toBe(true);
      }
    }
  });

  it("filtre par rôle, du plus récent au plus ancien", () => {
    const trainer = updatesForRole("trainer");
    expect(trainer.length).toBeGreaterThan(0);
    for (const u of trainer) for (const i of u.items) expect(i.roles).toContain("trainer");
    const dates = trainer.map((u) => u.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(updatesForRole("viewer")).toEqual([]);
  });
});
