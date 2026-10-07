import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canDownloadKit, canManageKits, kitDownloadName, kitStoragePath, kitWeekFolder, parisDateTime, parseKitFileName, planKitShift } from "@/lib/kits";

describe("kits de séance : nom de fichier", () => {
  it("lit groupe, date, heure, niveau, séquence et séance", () => {
    expect(parseKitFileName("kit_G3_2026-10-05_14h00_A2_S1-1.pdf")).toEqual({
      groupNo: 3, date: "2026-10-05", time: "14:00", level: "A2", sequenceNo: 1, seanceNo: 1,
    });
  });

  it("tolère G-4, l'heure sur un chiffre, la casse et le « (1) » ajouté par macOS", () => {
    expect(parseKitFileName("Kit_G-4_2026-10-06_9h00 (1).PDF")).toEqual({
      groupNo: 4, date: "2026-10-06", time: "09:00", level: null, sequenceNo: null, seanceNo: null,
    });
    expect(parseKitFileName("kit_G6_2026-10-08_13h00_a2_S2-3_15apprenants.pdf")).toMatchObject({ groupNo: 6, level: "A2", sequenceNo: 2, seanceNo: 3 });
  });

  it("refuse l'ancien nommage sans groupe et les dates impossibles", () => {
    expect(parseKitFileName("kit_A1_S1_S1_06oct2026_15apprenants.pdf")).toBeNull();
    expect(parseKitFileName("kit_G3_2026-13-05_14h00.pdf")).toBeNull();
    expect(parseKitFileName("kit_G3_2026-10-05_25h00.pdf")).toBeNull();
    expect(parseKitFileName("kit_G3_2026-10-05_14h00.docx")).toBeNull();
  });

  it("retrouve l'heure de Paris d'une séance (heure d'été comme d'hiver)", () => {
    expect(parisDateTime("2026-10-05T12:00:00+00:00")).toEqual({ date: "2026-10-05", time: "14:00" });
    expect(parisDateTime("2026-12-08T08:00:00Z")).toEqual({ date: "2026-12-08", time: "09:00" });
  });

  it("range les kits importés par semaine, au lundi", () => {
    expect(kitWeekFolder("2026-10-05")).toBe("semaine du 5 octobre 2026");
    expect(kitWeekFolder("2026-10-08")).toBe("semaine du 5 octobre 2026");
    expect(kitWeekFolder("2026-10-11")).toBe("semaine du 5 octobre 2026");
    expect(kitWeekFolder("2026-10-12")).toBe("semaine du 12 octobre 2026");
  });

  it("range un seul kit par séance et propose un nom propre au téléchargement", () => {
    expect(kitStoragePath("org", "sess")).toBe("org/sess.pdf");
    expect(kitDownloadName("a/b\\kit")).toBe("a-b-kit.pdf");
  });
});

describe("kits de séance : qui peut les ouvrir", () => {
  const session = { trainerId: "t1", coTrainerId: "t2" };
  it("coordination : toujours", () => {
    expect(canDownloadKit({ role: "admin", myTrainerId: null, session })).toBe(true);
    expect(canDownloadKit({ role: "coordinator", myTrainerId: null, session })).toBe(true);
  });
  it("formateur : seulement le titulaire, le remplaçant ou le co-animateur de la séance", () => {
    expect(canDownloadKit({ role: "trainer", myTrainerId: "t1", session })).toBe(true);
    expect(canDownloadKit({ role: "trainer", myTrainerId: "t2", session })).toBe(true);
    expect(canDownloadKit({ role: "trainer", myTrainerId: "t3", session })).toBe(false);
    expect(canDownloadKit({ role: "trainer", myTrainerId: null, session })).toBe(false);
  });
  it("viewer et setter : jamais, et seule la coordination dépose", () => {
    expect(canDownloadKit({ role: "viewer", myTrainerId: "t1", session })).toBe(false);
    expect(canDownloadKit({ role: "setter", myTrainerId: "t1", session })).toBe(false);
    expect(canManageKits("trainer")).toBe(false);
    expect(canManageKits("coordinator")).toBe(true);
  });
});

// Les apprenants n'ont pas de compte : ils ne voient que l'émargement, l'enquête, le test
// et les plannings qu'on leur envoie. Aucun de ces chemins ne doit lire les kits.
describe("kits de séance : jamais exposés aux apprenants", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : [p];
    });
  const publicCode = [
    ...files("src/app/emargement"),
    ...files("src/app/enquete"),
    ...files("src/app/test"),
    ...files("src/lib/reports"),
    ...files("src/app/(app)/groupes/[id]/planning"),
    ...files("src/app/(app)/apprenants/[id]/planning"),
    "src/app/(app)/planning/telecharger/route.ts",
  ];
  it.each(publicCode)("%s ne mentionne pas les kits", (path) => {
    const src = readFileSync(path, "utf8");
    expect(src).not.toMatch(/session_kits|from\(["']kits["']\)|KIT_BUCKET|@\/lib\/kits/);
  });

  it("la migration ne pose aucune policy client sur le bucket « kits »", () => {
    const sql = readFileSync("supabase/migrations/20261005000039_kits_seance.sql", "utf8");
    expect(sql).not.toMatch(/on storage\.objects/);
    expect(sql).toMatch(/values \('kits', 'kits', false/);
  });
});

describe("kits de séance : décalage après une annulation", () => {
  const kits = (pairs: [string, string][]) => new Map(pairs);

  it("rien à faire si la séance annulée n'a pas de kit", () => {
    expect(planKitShift("s0", ["s1", "s2"], kits([["s1", "k1"]]))).toEqual({ kind: "none" });
  });

  it("le kit passe à la séance suivante encore sans kit", () => {
    expect(planKitShift("s0", ["s1", "s2"], kits([["s0", "k0"]]))).toEqual({
      kind: "shift",
      moves: [{ kitId: "k0", fromSessionId: "s0", toSessionId: "s1" }],
    });
  });

  it("décale en cascade, du dernier kit au premier, et s'arrête au premier trou", () => {
    const plan = planKitShift("s0", ["s1", "s2", "s3", "s4"], kits([["s0", "k0"], ["s1", "k1"], ["s2", "k2"], ["s4", "k4"]]));
    expect(plan).toEqual({
      kind: "shift",
      moves: [
        { kitId: "k2", fromSessionId: "s2", toSessionId: "s3" },
        { kitId: "k1", fromSessionId: "s1", toSessionId: "s2" },
        { kitId: "k0", fromSessionId: "s0", toSessionId: "s1" },
      ],
    });
  });

  it("refuse de décaler si le dernier kit n'a plus de séance", () => {
    expect(planKitShift("s0", ["s1"], kits([["s0", "k0"], ["s1", "k1"]]))).toEqual({ kind: "no-next-session", kits: 2 });
    expect(planKitShift("s0", [], kits([["s0", "k0"]]))).toEqual({ kind: "no-next-session", kits: 1 });
  });
});
