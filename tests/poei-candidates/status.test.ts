import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CANDIDATE_STATUSES, QUALIFICATION_QUESTIONS, candidateDisplayName, candidateRef, canMoveTo, firstContactMessage, splitContactName,
} from "@/lib/poei-candidates/status";
import { qualificationProgress, type CandidateRow } from "@/lib/poei-candidates/queries";

describe("candidats POEI — garde-fou du consentement", () => {
  it("bloque Qualifié, Positionné et POEI signée sans consentement", () => {
    for (const s of ["qualifie", "positionne", "poei_signee"]) {
      expect(canMoveTo(s, null).ok).toBe(false);
      expect(canMoveTo(s, "2026-10-07T10:00:00Z").ok).toBe(true);
    }
  });

  it("laisse appeler, rappeler et classer sans suite sans consentement", () => {
    for (const s of ["a_qualifier", "a_rappeler", "sans_suite"]) expect(canMoveTo(s, null).ok).toBe(true);
  });

  it("applique la même règle que la contrainte en base", () => {
    const sql = readFileSync("supabase/migrations/20261007000042_candidats_poei.sql", "utf8");
    const allowed = sql.match(/status in \(([^)]*)\) or consent_at is not null/)?.[1] ?? "";
    const withoutConsent = CANDIDATE_STATUSES.filter((s) => !s.needsConsent).map((s) => `'${s.code}'`);
    expect(allowed.split(",").map((x) => x.trim()).sort()).toEqual(withoutConsent.sort());
  });
});

describe("candidats POEI — affichage", () => {
  it("numérote C-0001", () => {
    expect(candidateRef(7)).toBe("C-0007");
    expect(candidateRef(null)).toBe("—");
  });

  it("découpe le contact d'un lead requalifié", () => {
    expect(splitContactName("Fatima Zahra BEN ALI")).toEqual({ firstName: "Fatima Zahra BEN", lastName: "ALI" });
    expect(splitContactName("Moussa Diallo")).toEqual({ firstName: "Moussa", lastName: "Diallo" });
    expect(splitContactName("Karim")).toEqual({ firstName: null, lastName: "Karim" });
    expect(splitContactName("  ")).toEqual({ firstName: null, lastName: "À compléter" });
  });

  it("n'affiche pas le « ? » des fiches importées sans prénom", () => {
    expect(candidateDisplayName({ first_name: "?", last_name: "BEDOUHEN" })).toBe("BEDOUHEN");
    expect(candidateDisplayName({ first_name: "Awa", last_name: "KONE" })).toBe("Awa KONE");
  });

  it("adapte le premier message à la provenance, sans promesse interdite", () => {
    const asso = firstContactMessage({ first_name: null, last_name: "X", source: "asso_pef" }, "Anis");
    expect(asso).toMatch(/^Bonjour, c'est Anis, de ParlerEmploi\./);
    expect(asso).toContain("cours de français");
    const lead = firstContactMessage({ first_name: "Awa", last_name: "KONE", source: "lead_resto" }, null);
    expect(lead).toMatch(/^Bonjour Awa, c'est ParlerEmploi\./);
    for (const m of [asso, lead]) expect(m).not.toMatch(/gratuit|rémunér|garanti|aucun engagement/i);
  });
});

describe("candidats POEI — qualification", () => {
  it("compte 10 questions, consentement compris", () => {
    expect(QUALIFICATION_QUESTIONS).toHaveLength(10);
    const empty = { ft_status: "inconnu", work_permit: "inconnu", consent_at: null } as unknown as CandidateRow;
    expect(qualificationProgress(empty)).toBe(0);
    const full = {
      ft_status: "inscrit", income: "ARE", goal: "Travailler", target_job: "Commis", experience: "Non", availability: "Oui",
      mobility: "93", work_permit: "oui", constraints: "Aucune", consent_at: "2026-10-07T10:00:00Z",
    } as unknown as CandidateRow;
    expect(qualificationProgress(full)).toBe(10);
  });
});
