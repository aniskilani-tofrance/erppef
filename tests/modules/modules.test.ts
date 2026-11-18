import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAQ, HELP_SECTIONS } from "@/lib/help-content";
import { MODULE_LABELS, MODULE_ROOTS, RESTRICTABLE_MODULES, cleanDeniedModules, isDenied, isModuleKey, moduleOfPath } from "@/lib/modules";
import { APP_UPDATES, tickerItemsForRole, updatesForRole } from "@/lib/updates-content";

const ALL = [...RESTRICTABLE_MODULES];

describe("Modules retirés à une personne — règles", () => {
  it("chaque module a un libellé et une racine de pages", () => {
    for (const m of RESTRICTABLE_MODULES) {
      expect(MODULE_LABELS[m].length).toBeGreaterThan(3);
      expect(MODULE_ROOTS[m].startsWith("/")).toBe(true);
    }
  });

  it("un chemin appartient au module dont il porte la racine, et à lui seul", () => {
    expect(moduleOfPath("/financements")).toBe("financements");
    expect(moduleOfPath("/financements/dossiers/abc/atelier")).toBe("financements");
    expect(moduleOfPath("/financements/dossiers/abc/export")).toBe("financements");
    expect(moduleOfPath("/leads")).toBe("leads");
    expect(moduleOfPath("/leads/export")).toBe("leads");
    expect(moduleOfPath("/prospection/liste-1")).toBe("prospection");
    expect(moduleOfPath("/candidats-poei/42")).toBe("candidats_poei");
    // Voisins qui ne doivent pas être attrapés.
    expect(moduleOfPath("/finance")).toBeNull();
    expect(moduleOfPath("/leadsmanager")).toBeNull();
    expect(moduleOfPath("/dashboard")).toBeNull();
    expect(moduleOfPath("/apprenants/admission")).toBeNull();
    // Les routes à jeton de service ne sont pas des pages du module.
    expect(moduleOfPath("/api/leads")).toBeNull();
    expect(moduleOfPath("/api/financements/opportunites")).toBeNull();
  });

  it("la liste des modules retirés est nettoyée", () => {
    expect(cleanDeniedModules(["leads", "inconnu", "financements", "leads"])).toEqual(["financements", "leads"]);
    expect(cleanDeniedModules(null)).toEqual([]);
    expect(cleanDeniedModules("financements")).toEqual([]);
    expect(isModuleKey("prospection")).toBe(true);
    expect(isModuleKey("planning")).toBe(false);
    expect(isDenied(["leads"], "leads")).toBe(true);
    expect(isDenied(["leads"], "financements")).toBe(false);
    expect(isDenied(["leads"], undefined)).toBe(false);
    expect(isDenied(null, "leads")).toBe(false);
  });
});

describe("Modules retirés — nouveautés et aide", () => {
  it("une personne sans le module ne voit ni ne reçoit ses nouveautés", () => {
    const tout = updatesForRole("coordinator");
    const sans = updatesForRole("coordinator", ALL);
    expect(tout.some((u) => u.module === "financements")).toBe(true);
    expect(sans.some((u) => u.module)).toBe(false);
    expect(sans.length).toBeLessThan(tout.length);
    // Le reste lui parvient toujours.
    expect(sans.length).toBeGreaterThan(0);
    // Retirer un seul module ne masque que lui.
    const sansFin = updatesForRole("coordinator", ["financements"]);
    expect(sansFin.some((u) => u.module === "financements")).toBe(false);
    expect(sansFin.some((u) => u.module === "leads")).toBe(true);
    // Le bandeau du tableau de bord suit la même règle.
    const ids = new Set(APP_UPDATES.filter((u) => u.module === "financements").map((u) => u.id));
    expect(tickerItemsForRole("coordinator", 50, ["financements"]).some((t) => ids.has(t.id))).toBe(false);
  });

  it("les nouveautés des quatre modules sont rattachées à leur module", () => {
    for (const u of APP_UPDATES) {
      if (u.id.includes("financements")) expect(u.module, u.id).toBe("financements");
      if (u.module) expect(isModuleKey(u.module), u.id).toBe(true);
    }
    // Une nouveauté réservée aux comptes commerciaux (setter) appartient forcément à un module.
    for (const u of APP_UPDATES) {
      if (u.items.every((i) => i.roles.includes("setter") && !i.roles.includes("trainer"))) expect(u.module, u.id).toBeDefined();
    }
  });

  it("l'aide des modules est rattachée à son module", () => {
    expect(HELP_SECTIONS.find((s) => s.id === "financements")?.module).toBe("financements");
    expect(HELP_SECTIONS.find((s) => s.id === "leads")?.module).toBe("leads");
    for (const f of FAQ) if (/Financements|veille du lundi|atelier de rédaction/.test(f.q)) expect(f.module, f.q).toBe("financements");
  });
});

describe("Migration 0062 — modules retirés", () => {
  const sql = readFileSync("supabase/migrations/20261118000062_modules_retires.sql", "utf8");
  const TABLES: Record<string, string> = {
    funding_opportunities: "financements", funding_applications: "financements", funding_application_events: "financements",
    funding_deadlines: "financements", funding_application_sections: "financements", funding_section_versions: "financements",
    funding_text_blocks: "financements", employer_leads: "leads", employer_lead_events: "leads", prospect_lists: "prospection",
    prospects: "prospection", prospect_calls: "prospection", poei_candidates: "candidats_poei", poei_candidate_events: "candidats_poei",
  };

  it("est additive : une colonne, une fonction, des politiques restrictives", () => {
    expect(sql).not.toMatch(/drop\s+table/i);
    expect(sql).not.toMatch(/drop\s+column/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).toContain("add column if not exists denied_modules text[] not null default '{}'");
    // Chaque politique créée est restrictive : elle ne peut qu'enlever un accès.
    const created = sql.match(/create policy [a-z_]+ on public\.[a-z_]+ as restrictive for all/g) ?? [];
    expect(created).toHaveLength((sql.match(/create policy/g) ?? []).length);
  });

  it("les valeurs autorisées en base sont celles de l'écran", () => {
    const list = /denied_modules <@ array\[([^\]]+)\]/.exec(sql)?.[1] ?? "";
    expect(list.split(",").map((s) => s.trim().replace(/'/g, "")).sort()).toEqual([...RESTRICTABLE_MODULES].sort());
  });

  it("chaque table des quatre modules a sa politique, en lecture comme en écriture", () => {
    for (const [table, module] of Object.entries(TABLES)) {
      const block = sql.split(`create policy ${table}_module on public.${table} as restrictive for all`)[1]?.split(";")[0] ?? "";
      expect(block, table).toContain(`using ((select private.module_allowed('${module}')))`);
      expect(block, table).toContain(`with check ((select private.module_allowed('${module}')))`);
    }
    expect((sql.match(/create policy/g) ?? []).length).toBe(Object.keys(TABLES).length);
  });

  it("la fonction regarde la personne connectée, dans son organisation", () => {
    expect(sql).toContain("where m.user_id = auth.uid()");
    expect(sql).toContain("and m.org_id = private.jwt_org_id()");
    expect(sql).toContain("security definer");
  });
});
