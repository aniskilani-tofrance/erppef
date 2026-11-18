import { describe, expect, it } from "vitest";
import {
  DEFAULT_WATCH_MONTHLY_CAP_USD, DEFAULT_WATCH_PROFILE, MAX_WATCH_RUNS, WATCH_RESEARCH_SYSTEM, WatchResultSchema, focusForWeekday, isPublicHttpUrl,
  linkIsDead, mergeWatchSettings, normalizeTitle, normalizeUrl, resolveWatchCap, resolveWatchSettings, splitWatchItems, watchDedupeKey,
  watchItemToRow, watchResearchUser, withRun, type WatchItem, type WatchRun,
} from "@/lib/financements/veille-auto";

const item = (over: Partial<WatchItem> = {}): WatchItem => ({
  title: "Appel à projets Exemple 2027", family: "aap", funder_name: "Fondation Exemple", url: "https://www.exemple.org/appel-2027/",
  opens_on: null, deadline: "2027-01-15", amount_min: 3000, amount_max: 10000, max_rate: 80, summary: "Soutien aux actions linguistiques.",
  eligibility_notes: "Associations de plus d'un an.", criteria: "Impact local.", required_documents: null, fit: "Public allophone.", to_check: "Date à confirmer.", ...over,
});
const run = (at: string): WatchRun => ({ at, focus: "Fondations", searches: 5, found: 2, added: 1, known: 1, dropped: 0, titles: ["X"], error: null, manual: false });

describe("Veille automatique — axe du jour", () => {
  it("un axe différent chaque jour de la semaine, les quatre familles couvertes", () => {
    const keys = [1, 2, 3, 4, 5, 6, 7].map((d) => focusForWeekday(d).key);
    expect(new Set(keys).size).toBe(7);
    expect(keys).toEqual(expect.arrayContaining(["etat", "fondations", "collectivites", "marches", "mecenat"]));
    expect(focusForWeekday(42).key).toBe("rattrapage");
  });
});

describe("Veille automatique — dédoublonnage et liens", () => {
  it("deux écritures de la même adresse donnent la même clé", () => {
    expect(normalizeUrl("https://www.Exemple.org/appel-2027/?utm_source=x")).toBe("exemple.org/appel-2027");
    expect(normalizeUrl("http://exemple.org/appel-2027")).toBe("exemple.org/appel-2027");
    expect(normalizeUrl("https://exemple.org/appel?id=7")).toBe("exemple.org/appel?id=7");
    expect(normalizeUrl("pas une adresse")).toBeNull();
    expect(normalizeUrl("ftp://exemple.org/x")).toBeNull();
    expect(watchDedupeKey("https://www.exemple.org/appel-2027/")).toBe(watchDedupeKey("http://exemple.org/appel-2027?utm_campaign=a"));
    expect(watchDedupeKey("https://exemple.org/a")).not.toBe(watchDedupeKey("https://exemple.org/b"));
    expect(watchDedupeKey("https://exemple.org/a")).toMatch(/^auto:[0-9a-f]{20}$/);
    expect(normalizeTitle("  Appel à Projets — ÉTÉ 2027 ! ")).toBe("appel a projets ete 2027");
  });

  it("l'ERP ne va chercher que des adresses publiques", () => {
    expect(isPublicHttpUrl("https://www.exemple.org/x")).toBe(true);
    for (const u of ["http://localhost/x", "http://127.0.0.1/x", "http://10.0.0.5/x", "https://intranet/x", "https://serveur.local/x", "file:///etc/passwd", "javascript:alert(1)", "https://[::1]/x"]) {
      expect(isPublicHttpUrl(u), u).toBe(false);
    }
  });

  it("une page introuvable écarte la trouvaille ; un site qui refuse les robots non", () => {
    expect(linkIsDead(404)).toBe(true);
    expect(linkIsDead(410)).toBe(true);
    for (const s of [200, 301, 401, 403, 429, 500, null]) expect(linkIsDead(s), String(s)).toBe(false);
  });

  it("trie les trouvailles : nouvelles, déjà connues, inutilisables", () => {
    const known = [{ title: "Politique de la ville 2027", funder: "Préfecture", url: "https://exemple.gouv.fr/pdv-2027" }];
    const r = splitWatchItems(
      [
        item(),
        item({ title: "Autre titre", url: "https://www.exemple.gouv.fr/pdv-2027/" }), // même adresse qu'un appel connu
        item({ title: "POLITIQUE de la ville 2027", url: "https://ailleurs.fr/x" }), // même titre
        item({ title: "Sans adresse", url: "à venir" }),
        item({ title: "Doublon du jour", url: "https://exemple.org/appel-2027" }), // même adresse que la première trouvaille
      ],
      known,
    );
    expect(r.fresh.map((i) => i.title)).toEqual(["Appel à projets Exemple 2027"]);
    expect(r.knownCount).toBe(3);
    expect(r.unusable).toBe(1);
  });
});

describe("Veille automatique — fiche déposée dans « À trier »", () => {
  it("arrive en « nouveau », source collecteur, avec le pourquoi et ce qui reste à vérifier", () => {
    const row = watchItemToRow(item(), "2027-01-15T22:59:00.000Z")!;
    expect(row).toMatchObject({
      family: "aap", title: "Appel à projets Exemple 2027", funder_name: "Fondation Exemple", watch_status: "nouveau", source: "collecteur",
      deadline_at: "2027-01-15T22:59:00.000Z", amount_min: 3000, amount_max: 10000, max_rate: 80, criteria: "Impact local.", required_documents: null,
    });
    expect(row.summary).toContain("Pourquoi cela nous concerne : Public allophone.");
    expect(row.eligibility_notes).toContain("À vérifier : Date à confirmer.");
    expect(row.dedupe_key).toBe(watchDedupeKey("https://exemple.org/appel-2027"));
  });

  it("montants incohérents corrigés, taux absurde retiré, fiche sans adresse publique refusée", () => {
    const row = watchItemToRow(item({ amount_min: 10000, amount_max: 3000, max_rate: 250 }), null)!;
    expect(row).toMatchObject({ amount_min: 3000, amount_max: 10000, max_rate: null, deadline_at: null });
    expect(watchItemToRow(item({ amount_min: -5 }), null)!.amount_min).toBeNull();
    expect(watchItemToRow(item({ url: "http://localhost/x" }), null)).toBeNull();
    expect(watchItemToRow(item({ title: "  " }), null)).toBeNull();
  });

  it("le schéma refuse une date mal formée", () => {
    expect(WatchResultSchema.safeParse({ items: [item()] }).success).toBe(true);
    expect(WatchResultSchema.safeParse({ items: [item({ deadline: "15/01/2027" as unknown as string })] }).success).toBe(false);
    expect(WatchResultSchema.safeParse({ items: [] }).success).toBe(true);
  });
});

describe("Veille automatique — consignes", () => {
  it("le cadre exige une page officielle, interdit d'inventer et accepte de ne rien trouver", () => {
    expect(WATCH_RESEARCH_SYSTEM).toContain("page officielle");
    expect(WATCH_RESEARCH_SYSTEM).toContain("N'écris une date, un montant ou un taux que si tu l'as lu sur la page");
    expect(WATCH_RESEARCH_SYSTEM).toContain("ne rien trouver de nouveau est une réponse acceptable");
  });

  it("la demande porte le profil, l'axe du jour et les appels déjà connus", () => {
    const user = watchResearchUser({
      orgName: "Association Exemple", profile: "FLE à Saint-Ouen.", focus: focusForWeekday(2), today: "2026-11-18",
      known: [{ title: "FDVA 2027", funder: "SDJES", url: "https://exemple.gouv.fr/fdva" }, { title: "Sans lien", funder: null, url: null }],
    });
    for (const piece of ["<association>\nAssociation Exemple", "<profil>\nFLE à Saint-Ouen.", "<date_du_jour>\n2026-11-18", "Fondations —", "- FDVA 2027 (SDJES) — https://exemple.gouv.fr/fdva", "- Sans lien"]) {
      expect(user, piece).toContain(piece);
    }
    expect(watchResearchUser({ orgName: "A", profile: "P", focus: focusForWeekday(1), today: "2026-11-18", known: [] })).toContain("(aucun pour l'instant)");
  });
});

describe("Veille automatique — réglages et journal", () => {
  it("par défaut : activée, profil générique, journal vide", () => {
    expect(resolveWatchSettings(null)).toEqual({ enabled: true, profile: DEFAULT_WATCH_PROFILE, runs: [] });
    expect(resolveWatchSettings({ financements: { veille: { enabled: false, profile: "  Notre profil.  ", runs: [run("2026-11-18T03:00:00Z"), null, { sans: "date" }] } } })).toEqual({
      enabled: false, profile: "Notre profil.", runs: [run("2026-11-18T03:00:00Z")],
    });
  });

  it("un réglage se fusionne sans toucher au reste de l'organisation", () => {
    const before = { leads: { notifyEmail: "x" }, financements: { ai_monthly_cap_usd: 12, veille: { profile: "Ancien", runs: [run("2026-11-17T03:00:00Z")] } } };
    const after = mergeWatchSettings(before, { profile: "Nouveau", enabled: false });
    expect(after).toEqual({ leads: { notifyEmail: "x" }, financements: { ai_monthly_cap_usd: 12, veille: { profile: "Nouveau", enabled: false, runs: [run("2026-11-17T03:00:00Z")] } } });
    expect(mergeWatchSettings(null, { enabled: true })).toEqual({ financements: { veille: { enabled: true } } });
  });

  it("le journal garde les recherches les plus récentes d'abord, bornées", () => {
    let runs: WatchRun[] = [];
    for (let i = 0; i < MAX_WATCH_RUNS + 5; i++) runs = withRun(runs, run(`2026-11-${String((i % 28) + 1).padStart(2, "0")}T03:00:0${i % 10}Z`));
    expect(runs).toHaveLength(MAX_WATCH_RUNS);
    expect(withRun([run("a")], run("b")).map((r) => r.at)).toEqual(["b", "a"]);
  });

  it("plafond mensuel propre à la veille", () => {
    expect(resolveWatchCap(null)).toBe(DEFAULT_WATCH_MONTHLY_CAP_USD);
    expect(resolveWatchCap({ financements: { watch_monthly_cap_usd: 40 } })).toBe(40);
    expect(resolveWatchCap({ financements: { watch_monthly_cap_usd: -1 } })).toBe(DEFAULT_WATCH_MONTHLY_CAP_USD);
  });
});
