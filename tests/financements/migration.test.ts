import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEADLINE_KINDS, FAMILIES, FUNDER_KINDS, PORTALS, STAGES, WATCH_STATUSES } from "@/lib/financements/constants";

// Pas de base locale (règle de la NucBox) : la migration est vérifiée à la lecture.
const sql = readFileSync("supabase/migrations/20261117000060_financements.sql", "utf8");
const TABLES = ["funding_opportunities", "funding_applications", "funding_application_events", "funding_deadlines"];

describe("Migration 0060 — module Financements", () => {
  it("est additive : funders garde code et color, rien n'est supprimé", () => {
    expect(sql).not.toMatch(/drop\s+table/i);
    expect(sql).not.toMatch(/drop\s+column/i);
    expect(sql).not.toMatch(/alter\s+column\s+(code|color)/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.funders/i);
    expect(sql).not.toMatch(/update\s+public\.funders/i);
  });

  it("RLS active sur chaque table nouvelle, réservée à admin et coordinator de l'organisation", () => {
    for (const t of TABLES) {
      expect(sql, t).toContain(`alter table public.${t} enable row level security;`);
      const policies = sql.split(`on public.${t} for`).slice(1).map((p) => p.slice(0, 400));
      expect(policies.length, t).toBeGreaterThan(0);
      for (const p of policies) {
        expect(p, t).toContain("org_id = private.jwt_org_id()");
        expect(p, t).toContain("private.jwt_role() in ('admin', 'coordinator')");
        expect(p, t).not.toContain("trainer");
      }
    }
  });

  it("la coordination peut créer et compléter un financeur, jamais le supprimer", () => {
    expect(sql).toContain("create policy funders_coord_insert on public.funders for insert");
    expect(sql).toContain("create policy funders_coord_update on public.funders for update");
    expect(sql).not.toMatch(/on public\.funders for (delete|all)/);
  });

  it("chaque table porte org_id", () => {
    for (const t of TABLES) {
      const body = sql.split(`create table if not exists public.${t} (`)[1]?.split(");")[0] ?? "";
      expect(body, t).toContain("org_id uuid not null references public.organizations(id) on delete cascade");
    }
  });

  it("les valeurs autorisées en base sont celles de l'écran", () => {
    const listed = (values: readonly string[]) => values.map((v) => `'${v}'`).join(", ");
    expect(sql).toContain(`family in (${listed(FAMILIES)})`);
    expect(sql).toContain(`kind in (${listed(DEADLINE_KINDS)})`);
    expect(sql).toContain(`kind in (${listed(FUNDER_KINDS)})`);
    expect(sql).toContain(`portal in (${listed(PORTALS)})`);
    expect(sql).toContain(`stage in (${listed(STAGES)})`);
    for (const s of WATCH_STATUSES) expect(sql).toContain(`'${s}'`);
  });

  it("écarter exige une raison ; une échéance est rattachée à quelque chose ; rappels J-30, J-15, J-3 par défaut", () => {
    expect(sql).toContain("watch_status <> 'ecarte' or length(trim(coalesce(discard_reason, ''))) > 0");
    expect(sql).toContain("application_id is not null or opportunity_id is not null or funder_id is not null");
    expect(sql).toContain("reminder_days integer[] not null default '{30,15,3}'");
  });

  it("dédoublonnage du collecteur par organisation, utilisable par « on conflict »", () => {
    expect(sql).toContain("constraint funding_opportunities_dedupe_key_uniq unique (org_id, dedupe_key)");
  });

  it("historique des statuts et échéance de dépôt tenus par la base (triggers)", () => {
    expect(sql).toContain("after insert or update of stage on public.funding_applications");
    expect(sql).toContain("after insert or update of deadline_at, watch_status, funder_id on public.funding_opportunities");
    expect(sql).toContain("after insert or update of deadline_at, stage, funder_id, opportunity_id on public.funding_applications");
    // L'échéance d'un dossier n'est pas liée à l'opportunité (une suppression de
    // l'opportunité ne doit pas l'emporter par cascade).
    const appTrigger = sql.split("function private.funding_application_sync_deadline()")[1].split("$$;")[0];
    expect(appTrigger).toContain("insert into public.funding_deadlines (org_id, kind, due_at, title, application_id, funder_id, auto_origin)");
  });

  it("les fonctions des triggers ne sont pas appelables directement", () => {
    for (const f of ["funding_application_log_stage", "funding_opportunity_sync_deadline", "funding_application_sync_deadline"]) {
      expect(sql).toContain(`revoke execute on function private.${f}() from public;`);
      expect(sql).toContain(`create or replace function private.${f}()`);
    }
  });
});

describe("Accès au module", () => {
  it("menu : Financements réservé à admin et coordinator", () => {
    const side = readFileSync("src/components/shell/app-sidebar.tsx", "utf8");
    expect(side).toContain('{ href: "/financements", label: "Financements", icon: HandCoins, roles: ["admin", "coordinator"] }');
  });
  it("chaque page passe par le layout gardé ; chaque action commence par requireRole", () => {
    const layout = readFileSync("src/app/(app)/financements/layout.tsx", "utf8");
    expect(layout).toContain("await requireFinancements()");
    const acces = readFileSync("src/lib/financements/acces.ts", "utf8");
    expect(acces).toContain('redirect("/dashboard")');
    const actions = readFileSync("src/app/(app)/financements/actions.ts", "utf8");
    const bodies = actions.split("export async function ").slice(1);
    expect(bodies.length).toBeGreaterThan(10);
    for (const b of bodies) expect(b.slice(0, 600), b.slice(0, 40)).toContain("await requireRole(ROLES)");
    // Toute écriture est bornée à l'organisation de la session.
    for (const m of actions.matchAll(/\.(update|delete)\([^)]*\)[^;]*;/g)) expect(m[0], m[0].slice(0, 80)).toContain('.eq("org_id", orgId)');
  });
  it("l'API du collecteur passe le proxy et vérifie le jeton dans la route", () => {
    const proxy = readFileSync("src/proxy.ts", "utf8");
    expect(proxy).toContain('startsWith("/api/financements/opportunites")');
    const route = readFileSync("src/app/api/financements/opportunites/route.ts", "utf8");
    expect(route.split("authenticateVeille(req)").length - 1).toBe(2);
  });
});
