import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BLOCK_CATEGORIES } from "@/lib/financements/atelier";
import { buildApplicationDocx, exportFileName } from "@/lib/financements/export-word";
import { opportunityRowFromForm } from "@/lib/financements/formulaires";

// Pas de base locale (règle de la NucBox) : la migration est vérifiée à la lecture.
const sql = readFileSync("supabase/migrations/20261118000061_financements_atelier.sql", "utf8");
const TABLES = ["funding_application_sections", "funding_section_versions", "funding_text_blocks"];

describe("Migration 0061 — atelier d'écriture", () => {
  it("est additive : rien n'est supprimé ni modifié dans l'existant", () => {
    expect(sql).not.toMatch(/drop\s+table/i);
    expect(sql).not.toMatch(/drop\s+column/i);
    expect(sql).not.toMatch(/alter\s+column/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).toContain("alter table public.funding_applications\n  add column if not exists template_key text;");
    expect(sql).toContain("add column if not exists criteria text,");
    expect(sql).toContain("add column if not exists required_documents text;");
  });

  it("RLS active sur chaque table, réservée à admin et coordinator de l'organisation", () => {
    for (const t of TABLES) {
      expect(sql, t).toContain(`alter table public.${t} enable row level security;`);
      const policies = sql.split(`on public.${t} for`).slice(1).map((p) => p.slice(0, 400));
      expect(policies.length, t).toBeGreaterThan(0);
      for (const p of policies) {
        expect(p, t).toContain("org_id = private.jwt_org_id()");
        expect(p, t).toContain("private.jwt_role() in ('admin', 'coordinator')");
        expect(p, t).not.toContain("trainer");
      }
      const body = sql.split(`create table if not exists public.${t} (`)[1]?.split(");")[0] ?? "";
      expect(body, t).toContain("org_id uuid not null references public.organizations(id) on delete cascade");
    }
  });

  it("l'historique des versions ne se modifie pas et ne se supprime pas à la main", () => {
    expect(sql).toContain("create policy funding_section_versions_select on public.funding_section_versions for select");
    expect(sql).toContain("create policy funding_section_versions_insert on public.funding_section_versions for insert");
    expect(sql).not.toMatch(/on public\.funding_section_versions for (all|update|delete)/);
  });

  it("les rangements de la bibliothèque sont ceux de l'écran", () => {
    const list = /check \(category in \(([^)]+)\)\)/.exec(sql)?.[1] ?? "";
    expect(list.split(",").map((s) => s.trim().replace(/'/g, "")).sort()).toEqual([...BLOCK_CATEGORIES].sort());
  });

  it("la rubrique et ses versions disparaissent avec le dossier", () => {
    expect(sql).toContain("application_id uuid not null references public.funding_applications(id) on delete cascade");
    expect(sql).toContain("section_id uuid not null references public.funding_application_sections(id) on delete cascade");
  });
});

describe("Opportunité — critères et pièces de l'appel", () => {
  it("les deux champs sont enregistrés, vides = null", () => {
    const row = opportunityRowFromForm({ title: "Appel", family: "aap", criteria: " Priorité aux QPV ", required_documents: "" });
    expect(row.criteria).toBe("Priorité aux QPV");
    expect(row.required_documents).toBeNull();
  });
});

describe("Export Word du dossier", () => {
  it("produit un fichier .docx (archive zip) avec un nom lisible", async () => {
    const buf = await buildApplicationDocx({
      orgName: "Association Exemple", title: "Agir par les mots 2027", funderName: "Préfecture", deadline: "1 décembre 2026 à 23:59", amountRequested: "6 000 €",
      sections: [
        { title: "Objectifs", content: "Premier paragraphe.\n\n- une puce\n- une autre", max_chars: 1500 },
        { title: "Public", content: "", max_chars: null },
      ],
      generatedOn: "18 novembre 2026",
    });
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(exportFileName("Agir pour l'emploi par les mots 2027 (reconduction)")).toBe("dossier-agir-pour-l-emploi-par-les-mots-2027-reconduction.docx");
    expect(exportFileName("???")).toBe("dossier-financement.docx");
  });
});
