// Garde-fous du test de positionnement dans l'ERP (repris de ToFrance,
// src/lib/__tests__/positionnement.garde-fous.test.ts) : copie du module IDENTIQUE (empreinte),
// aucune bonne réponse côté navigateur, audios présents, module sans dépendance extérieure.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BANQUE, textesParles, ttsHash, VERSION_BANQUE } from "@/lib/positionnement/module/index.ts";
import * as client from "@/lib/positionnement/client";
import { itemsPourNavigateur } from "@/lib/positionnement/items-publics";

const RACINE = path.resolve(__dirname, "../..");
const MODULE = path.join(RACINE, "src/lib/positionnement/module");
const COMPOSANTS = path.join(RACINE, "src/components/positionnement");

// Même calcul que ToFrance (src/lib/positionnement/empreinte.ts).
function empreinte(dossier: string) {
  const fichiers: Record<string, string> = {};
  for (const f of readdirSync(dossier).filter((x) => x.endsWith(".ts")).sort()) {
    fichiers[f] = createHash("sha256").update(readFileSync(path.join(dossier, f))).digest("hex");
  }
  const global = createHash("sha256").update(Object.entries(fichiers).map(([f, h]) => `${f}:${h}`).join("\n")).digest("hex");
  return { global, fichiers };
}

describe("module partagé avec ToFrance", () => {
  it("la copie est identique à l'empreinte livrée (sinon : recopier avec bun scripts/positionnement-empreinte.ts --copier, côté ToFrance)", () => {
    const attendu = JSON.parse(readFileSync(path.join(MODULE, "empreinte.json"), "utf8"));
    const calcule = empreinte(MODULE);
    expect(calcule.fichiers).toEqual(attendu.fichiers);
    expect(calcule.global).toBe(attendu.global);
  });

  it("banque complète : 95 items (14 littératie + 56 CECRL + 25 nouveaux), version gardée", () => {
    expect(BANQUE).toHaveLength(95);
    expect(BANQUE.filter((q) => q.competence === "LITTERATIE")).toHaveLength(14);
    expect(BANQUE.filter((q) => q.id >= 201)).toHaveLength(25);
    expect(VERSION_BANQUE).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it("aucune dépendance extérieure : seulement des imports relatifs en .ts", () => {
    for (const f of readdirSync(MODULE).filter((x) => x.endsWith(".ts"))) {
      const src = readFileSync(path.join(MODULE, f), "utf8");
      for (const m of src.matchAll(/^import .* from "([^"]+)";/gm)) expect(m[1], f).toMatch(/^\.\/[\w-]+\.ts$/);
      expect(src, f).not.toMatch(/\bDeno\.|process\.env|from "react|next\//);
    }
  });

  it("neutralité : le module ne nomme aucun organisme", () => {
    for (const f of readdirSync(MODULE)) {
      expect(readFileSync(path.join(MODULE, f), "utf8"), f).not.toMatch(/parler\s*-?\s*emploi|\bPEF\b|base44/i);
    }
  });
});

describe("rien de secret côté navigateur", () => {
  it("le point d'entrée client n'exporte ni la banque ni la correction", () => {
    const noms = Object.keys(client);
    for (const n of ["BANQUE", "ITEMS_CECRL", "ITEMS_NOUVEAUX", "corrigerItemFerme", "terminer", "avancer", "item"]) expect(noms).not.toContain(n);
  });

  it("aucun fichier importé par client.ts n'importe la banque", () => {
    const vus = new Set<string>();
    const parcourir = (f: string) => {
      if (vus.has(f)) return;
      vus.add(f);
      for (const m of readFileSync(f, "utf8").matchAll(/from "(\.\/[^"]+)"/g)) parcourir(path.join(path.dirname(f), m[1]));
    };
    parcourir(path.join(MODULE, "client.ts"));
    const noms = [...vus].map((f) => path.basename(f));
    expect(noms.some((n) => n.startsWith("banque") || n === "correction.ts" || n === "moteur.ts")).toBe(false);
  });

  it("les composants du lecteur n'importent jamais le côté serveur (banque, correction, service, base)", () => {
    const fichiers = readdirSync(COMPOSANTS).map((f) => path.join(COMPOSANTS, f));
    fichiers.push(path.join(RACINE, "src/lib/positionnement/audio.ts"), path.join(RACINE, "src/lib/positionnement/consigne.ts"));
    for (const f of fichiers) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/positionnement\/module(\/index)?["/]|module\/(banque|correction|moteur|parcours)|positionnement\/(service|depot-supabase|ia|niveaux|etat|items-publics)"/);
      expect(src, f).not.toMatch(/placement\/(questions|literacy-questions|grading)/);
    }
  });

  it("aucune bonne réponse dans les items envoyés, à aucun niveau d'imbrication", () => {
    const pub = JSON.stringify(itemsPourNavigateur(BANQUE));
    for (const cle of ['"correct"', '"acceptedAnswers"', '"correctBlanks"', '"correctSentence"', '"correctOrder"', '"justification"', '"explanation"', '"criteria"', '"answer"', '"blank_answer"', '"correctAnswer"']) {
      expect(pub.includes(cle), cle).toBe(false);
    }
    // À classer : le texte de chaque élément, jamais sa catégorie (la thématique de l'item reste).
    for (const q of itemsPourNavigateur(BANQUE).filter((x) => x.type === "categorize")) {
      for (const it of q.items as object[]) expect(Object.keys(it)).toEqual(["text"]);
    }
  });

  it("à relier : colonne A seule, colonne B à part et triée (règle ERP du 16/10, le module garde les paires)", () => {
    for (const q of itemsPourNavigateur(BANQUE).filter((x) => x.type === "match_pairs")) {
      const source = BANQUE.find((x) => x.id === q.id)!;
      for (const p of q.pairs as object[]) expect(Object.keys(p)).toEqual(["left"]);
      const droites = q.rights as string[];
      expect([...droites].sort()).toEqual((source.pairs as { right: string }[]).map((p) => p.right).sort());
      expect(droites).toEqual([...droites].sort((a, b) => a.localeCompare(b, "fr")));
    }
  });
});

describe("audios (voix fr-FR-DeniseNeural)", () => {
  it("chaque texte parlé a son audio dans public/audio/tts et le manifeste est exact", () => {
    const hashes = new Set(textesParles(BANQUE).map(ttsHash));
    for (const h of hashes) expect(existsSync(path.join(RACINE, "public/audio/tts", `${h}.mp3`)), h).toBe(true);
    expect([...client.AUDIOS_DISPONIBLES].sort()).toEqual([...hashes].sort());
    expect(client.DOSSIER_AUDIOS).toBe("/audio/tts");
  });

  it("aucune option de compréhension écrite n'est lue à voix haute", () => {
    const textes = new Set(textesParles(BANQUE));
    for (const q of BANQUE.filter((x) => x.competence === "CE" && x.options)) {
      for (const o of q.options!) if (o !== q.question) expect(textes.has(o), `item ${q.id} : ${o}`).toBe(false);
    }
  });
});
