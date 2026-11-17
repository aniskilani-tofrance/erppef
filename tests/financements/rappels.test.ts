import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deadlinesToRemind,
  financementsAlertLines,
  financementsMailHtml,
  financementsMailSubject,
  formatDeadlineReminder,
  isMondayParis,
  teamRecipients,
  type ReminderDeadline,
} from "@/lib/financements/rappels";
import { financementsAlerts } from "@/lib/financements/cron";

const NOW = new Date("2026-11-16T05:30:00Z"); // lundi 16 novembre 2026, 6h30 à Paris (heure du cron)

function dl(id: string, dueAt: string, extra: Partial<ReminderDeadline> = {}): ReminderDeadline {
  return {
    id, kind: "depot", title: `Échéance ${id}`, due_at: dueAt, done_at: null, reminder_days: null,
    application_id: null, opportunity_id: null, funder_id: null, ...extra,
  };
}

describe("Financements — rappels du matin (J-30, J-15, J-3)", () => {
  it("retient exactement J-30, J-15 et J-3 (jours de Paris), jamais une échéance faite", () => {
    const rows = [
      dl("j30", "2026-12-16T22:59:00Z"),
      dl("j29", "2026-12-15T22:59:00Z"),
      dl("j15", "2026-12-01T22:59:00Z"),
      dl("j3", "2026-11-19T22:59:00Z"),
      dl("j3-fait", "2026-11-19T22:59:00Z", { done_at: "2026-11-15T10:00:00Z" }),
      dl("j0", "2026-11-16T22:59:00Z"),
    ];
    expect(deadlinesToRemind(rows, NOW).map((d) => [d.id, d.days])).toEqual([["j3", 3], ["j15", 15], ["j30", 30]]);
  });

  it("une échéance à J-15 apparaît dans l'alerte du matin (critère d'acceptation n° 4)", () => {
    const r = deadlinesToRemind([dl("pdv", "2026-12-01T22:59:00Z", { application_id: "a1", funder_name: "Préfecture 93", title: "Dépôt politique de la ville 2027" })], NOW);
    const lines = financementsAlertLines({ reminders: r, newOpportunities: [], monday: false });
    expect(lines[0]).toContain("Financements");
    expect(lines[1]).toContain("J-15");
    expect(lines[1]).toContain("Dépôt politique de la ville 2027");
    expect(lines[1]).toContain("Préfecture 93");
    expect(lines[1]).toContain("/financements/dossiers/a1");
  });

  it("rappels propres à une échéance", () => {
    const rows = [dl("perso", "2026-11-23T22:59:00Z", { reminder_days: [7, 1] })];
    expect(deadlinesToRemind(rows, NOW).map((d) => d.days)).toEqual([7]);
  });

  it("lien vers le dossier, sinon l'opportunité, sinon le financeur", () => {
    const base = { ...dl("x", "2026-12-01T22:59:00Z"), days: 15 };
    expect(formatDeadlineReminder({ ...base, opportunity_id: "o1" })).toContain("/financements/veille/o1");
    expect(formatDeadlineReminder({ ...base, funder_id: "f1" })).toContain("/financements/financeurs/f1");
  });

  it("le lundi seulement, les nouveautés de la semaine s'ajoutent", () => {
    expect(isMondayParis(NOW)).toBe(true);
    expect(isMondayParis(new Date("2026-11-17T05:30:00Z"))).toBe(false);
    // dimanche 23h30 UTC = lundi 0h30 à Paris
    expect(isMondayParis(new Date("2026-11-22T23:30:00Z"))).toBe(true);
    const fresh = [{ id: "o1", title: "FDVA 2 2027", family: "aap" as const, deadline_at: null, funder_label: "SDJES 93" }];
    expect(financementsAlertLines({ reminders: [], newOpportunities: fresh, monday: false })).toEqual([]);
    const lines = financementsAlertLines({ reminders: [], newOpportunities: fresh, monday: true });
    expect(lines[0]).toContain("1 nouvelle opportunité");
    expect(lines.join("\n")).toContain("FDVA 2 2027");
    expect(lines.join("\n")).toContain("/financements/veille/o1");
  });

  it("rien à signaler → aucune ligne", () => {
    expect(financementsAlertLines({ reminders: [], newOpportunities: [], monday: true })).toEqual([]);
  });
});

// Faux client Supabase : enregistre les filtres de chaque requête.
function fakeSupabase(rows: Record<string, unknown[]>) {
  const calls: { table: string; filters: [string, string, unknown][] }[] = [];
  const client = {
    from(table: string) {
      const call = { table, filters: [] as [string, string, unknown][] };
      calls.push(call);
      const q = {
        select: () => q,
        in: (c: string, v: unknown) => (call.filters.push(["in", c, v]), q),
        is: (c: string, v: unknown) => (call.filters.push(["is", c, v]), q),
        eq: (c: string, v: unknown) => (call.filters.push(["eq", c, v]), q),
        gte: (c: string, v: unknown) => (call.filters.push(["gte", c, v]), q),
        lte: (c: string, v: unknown) => (call.filters.push(["lte", c, v]), q),
        order: () => q,
        then: (resolve: (v: unknown) => void) => resolve({ data: rows[table] ?? [], error: null }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("Financements — cron : jamais le bac à sable", () => {
  it("chaque lecture est filtrée par les organisations de production", async () => {
    const { client, calls } = fakeSupabase({
      funding_deadlines: [{ ...dl("j15", "2026-12-01T22:59:00Z"), funders: { name: "CD93" } }],
      funding_opportunities: [{ id: "o1", title: "Multitude", family: "aap", deadline_at: null, funder_name: null, funders: null }],
    });
    const lines = await financementsAlerts(client, ["prod-1"], NOW);
    expect(calls.map((c) => c.table)).toEqual(["funding_deadlines", "funding_opportunities"]);
    for (const c of calls) expect(c.filters).toContainEqual(["in", "org_id", ["prod-1"]]);
    expect(lines.join("\n")).toContain("J-15");
    expect(lines.join("\n")).toContain("Multitude");
  });

  it("sans organisation de production : aucune requête", async () => {
    const { client, calls } = fakeSupabase({});
    expect(await financementsAlerts(client, [], NOW)).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe("Financements — e-mail des rappels à l'équipe", () => {
  it("destinataires : sans l'adresse du résumé du matin, sans adresse fictive, sans doublon", () => {
    expect(
      teamRecipients(
        ["Marie@exemple.org", "direction@exemple.org", null, undefined, "", "demo@exemple.invalid", "marie@exemple.org "],
        "Direction@exemple.org",
      ),
    ).toEqual(["marie@exemple.org"]);
    expect(teamRecipients(["a@exemple.org"], null)).toEqual(["a@exemple.org"]);
    expect(teamRecipients([], "a@exemple.org")).toEqual([]);
  });

  it("objet : compte les lignes à puce ; corps : liens cliquables et texte échappé", () => {
    const lines = ["💶 Financements — échéances :", "  • J-3 · Dépôt : A <b> & C — https://pef-erp.vercel.app/financements/dossiers/1", ""];
    expect(financementsMailSubject(lines)).toBe("ERP PEF — Financements : 1 point à regarder");
    expect(financementsMailSubject([...lines, "  • autre"])).toContain("2 points");
    const html = financementsMailHtml(lines);
    expect(html).toContain('<a href="https://pef-erp.vercel.app/financements/dossiers/1">');
    expect(html).toContain("A &lt;b&gt; &amp; C");
    expect(html).not.toContain("<b>");
  });
});
