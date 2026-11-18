import { describe, expect, it } from "vitest";
import {
  extractList, normalizeFamily, OPPORTUNITES_MAX_BATCH, parseFrom, parseOpportuniteFields, toOpportunityRow, validateOpportunites,
} from "@/lib/financements/api";

const ok = {
  dedupe_key: "fdva2-2027",
  family: "aap",
  title: "FDVA 2 2027 — fonctionnement et projets innovants",
  funder_code: "SDJES93",
  url: "https://www.ac-paris.fr/fdva",
  deadline_at: "2027-03-01",
  amount_max: "15 000",
  summary: "Fonctionnement global ou projet innovant.",
};

describe("API du collecteur — validation", () => {
  it("accepte une opportunité seule, un tableau, ou { opportunites: [...] }", () => {
    expect(extractList(ok)).toHaveLength(1);
    expect(extractList([ok, ok])).toHaveLength(2);
    expect(extractList({ opportunites: [ok] })).toHaveLength(1);
    expect(extractList({ autre: 1 })).toBeNull();
    expect(extractList("texte")).toBeNull();
  });

  it("normalise : date seule → 23h59 à Paris, montant en texte, famille en clair", () => {
    const v = validateOpportunites({ opportunites: [{ ...ok, family: "Appel d'offres" }] });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.items[0].deadline_at).toBe("2027-03-01T22:59:00.000Z");
    expect(v.items[0].amount_max).toBe(15000);
    expect(v.items[0].family).toBe("appel_offres");
  });

  it("accepte les alias français", () => {
    const v = validateOpportunites({ dedupe_key: "raja-2027", famille: "mécénat", titre: "Fondation RAJA", lien: "https://raja.example", date_limite: "2027-01-15T12:00:00+01:00", resume: "x" });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.items[0]).toMatchObject({ family: "mecenat", title: "Fondation RAJA", url: "https://raja.example", deadline_at: "2027-01-15T11:00:00.000Z" });
  });

  it("une seule invalide → lot refusé en entier (422), rejets champ par champ", () => {
    const v = validateOpportunites([ok, { ...ok, dedupe_key: "autre-cle", title: "", url: "ftp://x", deadline_at: "2027-02-30" }]);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.status).toBe(422);
    expect(v.erreur).toContain("aucune écriture");
    expect(v.rejetees).toHaveLength(1);
    expect(v.rejetees[0].index).toBe(1);
    const champs = v.rejetees[0].erreurs.map((e) => e.champ);
    expect(champs).toEqual(expect.arrayContaining(["title", "url", "deadline_at"]));
  });

  it("doublon de clé dans le même lot refusé", () => {
    const v = validateOpportunites([ok, ok]);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.rejetees[0].erreurs[0].message).toContain("en double");
  });

  it("montant minimum supérieur au maximum refusé ; famille inconnue refusée", () => {
    expect(validateOpportunites({ ...ok, amount_min: 20000, amount_max: 1000 }).ok).toBe(false);
    expect(validateOpportunites({ ...ok, family: "loterie" }).ok).toBe(false);
    expect(normalizeFamily("AAP")).toBe("aap");
  });

  it("corps vide ou trop grand", () => {
    const empty = validateOpportunites([]);
    expect(empty.ok || empty.status).toBe(400);
    const big = validateOpportunites(Array.from({ length: OPPORTUNITES_MAX_BATCH + 1 }, (_, i) => ({ ...ok, dedupe_key: `cle-${i}` })));
    expect(big.ok || big.status).toBe(413);
  });
});

describe("API du collecteur — ligne écrite", () => {
  it("le collecteur ne choisit ni le statut ni la source ; financeur relié par son code", () => {
    const v = validateOpportunites({ ...ok, watch_status: "retenu", source: "saisie" });
    if (!v.ok) throw new Error("devrait passer");
    const row = toOpportunityRow(v.items[0], "org", new Map([["SDJES93", "f-sdjes"]]));
    expect(row).toMatchObject({ org_id: "org", watch_status: "nouveau", source: "collecteur", funder_id: "f-sdjes", funder_name: null });
  });
  it("code financeur inconnu → nom libre", () => {
    const v = validateOpportunites({ ...ok, funder_code: "INCONNU", funder_name: "Fondation X" });
    if (!v.ok) throw new Error("devrait passer");
    expect(toOpportunityRow(v.items[0], "org", new Map())).toMatchObject({ funder_id: null, funder_name: "Fondation X" });
  });
});

describe("API du collecteur — GET", () => {
  it("champs par défaut et alias ; champs inconnus signalés", () => {
    expect(parseOpportuniteFields(null)).toEqual({ ok: true, fields: ["dedupe_key", "title", "url"] });
    expect(parseOpportuniteFields("dedupe_key,titre,url")).toEqual({ ok: true, fields: ["dedupe_key", "title", "url"] });
    expect(parseOpportuniteFields("dedupe_key,secret")).toEqual({ ok: false, inconnus: ["secret"] });
  });
  it("from : date de Paris, 90 jours par défaut", () => {
    const now = new Date("2026-11-17T08:00:00Z");
    expect(parseFrom("2026-11-01", now)).toEqual({ ok: true, from: "2026-11-01", fromIso: "2026-10-31T23:00:00.000Z" });
    expect(parseFrom(null, now)).toMatchObject({ ok: true, from: "2026-08-19" });
    expect(parseFrom("01/11/2026", now).ok).toBe(false);
  });
});
