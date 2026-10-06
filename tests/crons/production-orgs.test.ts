import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SANDBOX_SLUG, productionOrgIds } from "@/lib/production-orgs";

describe("Crons — jamais le bac à sable", () => {
  it("productionOrgIds exclut l'organisation de démo", async () => {
    const calls: unknown[][] = [];
    const fake = {
      from: (table: string) => ({
        select: (cols: string) => ({
          neq: async (col: string, value: string) => {
            calls.push([table, cols, col, value]);
            return { data: [{ id: "prod" }], error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    expect(await productionOrgIds(fake)).toEqual(["prod"]);
    expect(calls).toEqual([["organizations", "id", "slug", SANDBOX_SLUG]]);
  });

  it("chaque cron qui lit toute la base filtre les organisations", () => {
    const files = [
      "src/app/api/cron/alertes/route.ts",
      "src/app/api/cron/leads-sms/route.ts",
      "src/app/api/cron/sync-gcal/route.ts",
      "src/lib/emargement/dispatch.ts",
    ];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src.includes("productionOrgIds") || src.includes("SANDBOX_SLUG"), f).toBe(true);
    }
    const alertes = readFileSync("src/app/api/cron/alertes/route.ts", "utf8");
    // Toutes les lectures de tables métier du cron du matin passent par le filtre.
    for (const table of ["attendances", "learners", "trainer_absences", "info_meetings", "employer_leads"]) {
      // Lectures seulement : une écriture par id porte sur une ligne déjà filtrée.
      const reads = alertes.split(`.from("${table}")`).slice(1).filter((r) => r.trimStart().startsWith(".select("));
      for (const r of reads) expect(r.slice(0, 260), table).toContain('.in("org_id", orgIds)');
    }
  });
});
