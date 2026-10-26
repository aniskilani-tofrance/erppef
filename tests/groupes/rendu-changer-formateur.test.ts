import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Rendu serveur du bouton et du résumé, sans base : les Server Actions et le routeur sont simulés.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("@/app/(app)/groupes/formateur-actions", () => ({
  previewTrainerChange: async () => ({ ok: false, error: "non appelé" }),
  applyTrainerChange: async () => ({ ok: false, error: "non appelé" }),
}));

const { TrainerChangeDialog, TrainerChangeSummary } = await import("@/components/groupes/trainer-change-dialog");
type Preview = Parameters<typeof TrainerChangeSummary>[0]["preview"];

const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const text = (s: string) => decode(s.replace(/<!-- -->/g, ""));

const dialog = (currentTrainerName: string | null) =>
  text(renderToStaticMarkup(createElement(TrainerChangeDialog, {
    groupId: "g1",
    groupName: "Atelier alphabétisation — bénévoles",
    currentTrainerName,
    trainers: [{ id: "anne", label: "Anne Philippon (bénévole)" }],
    today: "2026-10-26",
  })));

const PREVIEW: Preview = {
  trainerFirstName: "Anne",
  assign: 12,
  already: 0,
  coTrainerRemoved: 3,
  firstOn: "lundi 26 octobre, 14h30–17h45",
  lastOn: "lundi 25 janvier, 14h30–17h45",
  conflicts: [
    { sessionId: "c1", when: "lundi 23 novembre, 14h30–17h45", reason: "en congé ce jour-là", keeps: "Marie Dupont" },
    { sessionId: "c2", when: "lundi 30 novembre, 14h30–17h45", reason: "déjà en cours avec « A2 du soir » de 16h à 18h", keeps: null },
  ],
  warnings: ["Plafond d'heures dépassé la semaine du lundi 2 novembre : 36 h pour 35 h prévues sur sa fiche (simple avertissement)."],
  emailTo: ["Anne", "Marie"],
  noEmail: [],
};
const summary = (preview: Preview) => text(renderToStaticMarkup(createElement(TrainerChangeSummary, { preview })));

describe("bouton de la carte Formateur", () => {
  it("« Choisir un formateur » pour un groupe non affecté, « Changer de formateur » sinon", () => {
    expect(dialog(null)).toContain("Choisir un formateur");
    expect(dialog(null)).not.toContain("Changer de formateur");
    expect(dialog("Marie Dupont")).toContain("Changer de formateur");
  });
});

describe("résumé avant validation", () => {
  it("dit combien de séances sont confiées et lesquelles restent à régler, avec qui les garde", () => {
    const out = summary(PREVIEW);
    expect(out).toContain("12 séances confiées à Anne, 2 restent à régler :");
    expect(out).toContain("lundi 23 novembre, 14h30–17h45 : en congé ce jour-là — reste à Marie Dupont");
    expect(out).toContain("lundi 30 novembre, 14h30–17h45 : déjà en cours avec « A2 du soir » de 16h à 18h — reste sans formateur");
    expect(out).toContain('href="/planning"');
  });

  it("première et dernière séance, co-animation retirée, avertissement, emails et agenda", () => {
    const out = summary(PREVIEW);
    expect(out).toContain("Première séance : lundi 26 octobre, 14h30–17h45 · dernière : lundi 25 janvier, 14h30–17h45.");
    expect(out).toContain("Co-animation retirée sur 3 séances : Anne les anime désormais.");
    expect(out).toContain("⚠️ Plafond d'heures dépassé");
    expect(out).toContain("Un email part à Anne et Marie (jours, horaires, lieu).");
    expect(out).toContain("Les agendas Google suivent après la synchronisation de la nuit.");
    expect(out).toContain("Les séances passées, annulées ou à feuille clôturée ne changent pas.");
  });

  it("sans conflit : une phrase simple, pas de liste ni de lien vers le Planning", () => {
    const out = summary({ ...PREVIEW, conflicts: [], warnings: [], coTrainerRemoved: 0, noEmail: ["Anne"], emailTo: [] });
    expect(out).toContain("12 séances à venir seront confiées à Anne.");
    expect(out).not.toContain("<ul");
    expect(out).not.toContain('href="/planning"');
    expect(out).toContain("Pas d'email pour Anne : aucune adresse sur la fiche.");
    expect(out).not.toContain("Co-animation retirée");
  });
});
