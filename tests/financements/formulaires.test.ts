import { describe, expect, it } from "vitest";
import { applicationRowFromForm, deadlineRowFromForm, funderRowFromForm, opportunityRowFromForm, triagePatch } from "@/lib/financements/formulaires";

const ID = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";

describe("Formulaires — opportunité (saisie en moins d'une minute)", () => {
  it("formulaire court : titre seul suffit", () => {
    const row = opportunityRowFromForm({ title: " Fondation ADP ", family: "mecenat" });
    expect(row).toMatchObject({ title: "Fondation ADP", family: "mecenat", deadline_at: null, summary: "", funder_id: null });
    expect(row).not.toHaveProperty("watch_status");
  });
  it("date + montants en saisie française", () => {
    const row = opportunityRowFromForm({ title: "x", family: "aap", deadline_day: "2026-12-01", amount_min: "3 000", amount_max: "10000,50" });
    expect(row).toMatchObject({ deadline_at: "2026-12-01T22:59:00.000Z", amount_min: 3000, amount_max: 10000.5 });
  });
  it("financeur choisi dans la liste → le nom libre est ignoré", () => {
    expect(opportunityRowFromForm({ title: "x", family: "aap", funder_id: ID, funder_name: "ignoré" })).toMatchObject({ funder_id: ID, funder_name: null });
  });
  it("refus lisibles", () => {
    expect(() => opportunityRowFromForm({ title: "", family: "aap" })).toThrow("titre");
    expect(() => opportunityRowFromForm({ title: "x", family: "aap", amount_min: "5000", amount_max: "100" })).toThrow("minimum");
    expect(() => opportunityRowFromForm({ title: "x", family: "aap", url: "pas un lien" })).toThrow("http");
    expect(() => opportunityRowFromForm({ title: "x", family: "aap", watch_status: "ecarte" })).toThrow("raison");
  });
});

describe("Formulaires — tri rapide", () => {
  it("écarter exige une raison", () => {
    expect(() => triagePatch({ id: ID, status: "ecarte" })).toThrow("pourquoi");
    expect(triagePatch({ id: ID, status: "ecarte", reason: "Hors champ" }).patch).toEqual({ watch_status: "ecarte", discard_reason: "Hors champ" });
    expect(triagePatch({ id: ID, status: "a_surveiller", reason: "ignorée" }).patch).toEqual({ watch_status: "a_surveiller", discard_reason: null });
  });
});

describe("Formulaires — dossier, échéance, financeur", () => {
  it("dossier : financeur obligatoire, lien Drive vérifié", () => {
    expect(() => applicationRowFromForm({ title: "x", funder_id: "" })).toThrow("financeur");
    expect(() => applicationRowFromForm({ title: "x", funder_id: ID, drive_url: "docs" })).toThrow("Word");
    expect(applicationRowFromForm({ title: "x", funder_id: ID, amount_requested: "6000", portal: "dauphin", portal_ref: " 00123456 " }))
      .toMatchObject({ amount_requested: 6000, portal: "dauphin", portal_ref: "00123456", owner_id: null });
  });
  it("échéance : rattachée à quelque chose, rappels triés sans doublon", () => {
    expect(() => deadlineRowFromForm({ kind: "autre", title: "x", due_day: "2026-12-15" })).toThrow("Rattachez");
    expect(deadlineRowFromForm({ kind: "compte_rendu", title: "Bilan", due_day: "2027-06-30", funder_id: ID, reminder_days: [3, 30, 15, 30] }))
      .toEqual({ kind: "compte_rendu", title: "Bilan", due_at: "2027-06-30T21:59:00.000Z", application_id: null, opportunity_id: null, funder_id: ID, reminder_days: [30, 15, 3] });
  });
  it("financeur : contacts nettoyés, site vérifié", () => {
    const row = funderRowFromForm({ name: "Ville", kind: "commune", contacts: [{ fonction: "Vie associative", autre: "x" }] });
    expect(row).toMatchObject({ name: "Ville", kind: "commune", contacts: [{ fonction: "Vie associative" }] });
    expect(() => funderRowFromForm({ name: "Ville", website: "saint-ouen" })).toThrow("http");
  });
});
