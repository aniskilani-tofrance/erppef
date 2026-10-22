// Correction CÔTÉ SERVEUR des items fermés (QCM, appariements, formulaires…) et du bloc littératie.
// Les bonnes réponses ne partent jamais au navigateur (voir publics.ts).
// Les productions libres (écrit, oral) sont évaluées avec la grille de grille.ts.

import type { Item, Reponses } from "./types.ts";
import { TYPES_LIBRES } from "./types.ts";

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Un champ de formulaire est juste si la réponse contient l'essentiel de l'attendu : au moins la
 * moitié des mots significatifs (3 lettres ou plus, ou nombres) de la réponse attendue.
 * Correctif du 15/10 : l'outil d'origine comptait les cases remplies, pas leur contenu.
 */
export function champJuste(attendu: string, donne: string): boolean {
  const a = norm(attendu).split(" ").filter((m) => m.length >= 3 || /^\d+$/.test(m));
  const d = new Set(norm(donne).split(" "));
  if (!a.length) return norm(donne) === norm(attendu);
  const trouves = a.filter((m) => d.has(m)).length;
  return trouves / a.length >= 0.5;
}

/** Corrige un item FERMÉ. Renvoie false pour un type libre (à évaluer par grille). Jamais d'exception. */
export function corrigerItemFerme(q: Item, reponse: string): boolean {
  try {
    if (TYPES_LIBRES.includes(q.type as Any)) return false;
    const r = reponse ?? "";
    switch (q.type) {
      case "match_pairs": {
        const m = r ? JSON.parse(r) : {};
        return (q.pairs as Any[]).every((p) => m[p.left] === p.right);
      }
      case "categorize": {
        const m = r ? JSON.parse(r) : {};
        return (q.items as Any[]).every((it) => m[it.text] === it.category);
      }
      case "order_sentences": {
        const o = r ? JSON.parse(r) : [];
        const attendu = q.correctOrder as number[];
        return o.length === attendu.length && o.every((x: Any, i: number) => x.origIdx === attendu[i]);
      }
      case "sentence_builder": {
        const b = r.split("|").join(" ").trim().toLowerCase().replace(/\.$/, "");
        return b === String(q.correctSentence).toLowerCase().replace(/\.$/, "");
      }
      case "fill_keyboard": {
        const x = r.trim().toLowerCase();
        return (q.acceptedAnswers ?? []).some((a) => a.toLowerCase() === x);
      }
      case "word_choice_text": {
        const c = r ? JSON.parse(r) : [];
        return (q.correctBlanks as string[]).every((a, i) => c[i] === a);
      }
      case "complete_form": {
        const champs = r ? JSON.parse(r) : {};
        const liste = q.formFields as { key: string; answer: string }[];
        const justes = liste.filter((f) => champJuste(f.answer, String(champs[f.key] ?? ""))).length;
        return justes >= Math.ceil(liste.length * 0.6);
      }
      case "true_false_justify": {
        const { tf, justif } = r ? JSON.parse(r) : { tf: null, justif: "" };
        return tf === q.correct && Boolean(justif) && String(justif).trim().length > 3;
      }
      default: {
        // QCM : le client renvoie le TEXTE de l'option ; la bonne réponse peut être un index.
        const bonne = q.options && typeof q.correct === "number" ? q.options[q.correct] : q.correct;
        return r !== "" && r === bonne;
      }
    }
  } catch {
    return false;
  }
}

// ══════════════════════ BLOC LITTÉRATIE (repris de l'outil d'origine) ══════════════════════

/** Item de littératie : true / false, ou null pour un item déclaratif (ne se note pas). */
export function corrigerLitteratie(q: Item, reponse: string | undefined, prenom?: string): boolean | null {
  if (q.skill === "declaratif") return null;
  if (!reponse) return false;
  if (q.dynamicName) {
    const n = (s: string) => s.toUpperCase().replace(/[^A-ZÀ-Ü-]/g, "");
    return Boolean(prenom) && n(reponse) === n(prenom!);
  }
  if (q.type === "fill_keyboard") return (q.acceptedAnswers ?? []).some((a) => a.trim() === reponse.trim());
  return reponse === q.correct;
}

export interface CompetencesLitteratie {
  oral: number; l0: number; chiffres: number; l1: number; l2: number;
  scolJamais: boolean; scolFaible: boolean; scolLongtemps: boolean; langueScolFr: boolean;
}

export function competencesLitteratie(items: Item[], rep: Reponses, prenom?: string): CompetencesLitteratie {
  const ok = (id: number) => {
    const q = items.find((x) => x.id === id);
    return q && corrigerLitteratie(q, rep[id], prenom) === true ? 1 : 0;
  };
  const scol = rep[101] ?? "";
  return {
    oral: ok(103) + ok(104) + ok(105),
    l0: ok(106) + ok(107) + ok(108),
    chiffres: ok(109),
    l1: ok(110) + ok(111),
    l2: ok(112) + ok(113),
    scolJamais: scol.startsWith("🏫❌"),
    scolFaible: scol.startsWith("🏫❌") || scol.startsWith("🏫 Oui, un peu"),
    scolLongtemps: scol.startsWith("🏫🎓"),
    langueScolFr: (rep[102] ?? "").startsWith("🇫🇷"),
  };
}

/**
 * Routage (outil d'origine). null = lecture-compréhension A1.1 acquise : la suite du test s'ouvre.
 * Croise l'oral et l'écrit, jamais un score unique.
 */
export function routerLitteratie(items: Item[], rep: Reponses, prenom?: string):
  "Pré-alpha" | "Alpha" | "Alpha avancé" | "Post-alpha (A1.1 en cours)" | "Illettrisme probable" | null {
  const s = competencesLitteratie(items, rep, prenom);
  // Sortie haute rapide (raccourci du 15/10) : lecture A1.1 réussie d'emblée.
  if (s.l2 === 2 && rep[106] == null) return null;
  const oralOk = s.oral >= 2;
  if (s.l0 < 2) {
    if (!oralOk) return "Pré-alpha";
    if (s.langueScolFr && !s.scolFaible) return "Illettrisme probable";
    return "Alpha";
  }
  if (s.l1 === 0) return "Alpha";
  if (s.l1 === 1 && s.l2 <= 1) return "Alpha avancé";
  if (s.l1 === 2 && s.l2 <= 1) return "Post-alpha (A1.1 en cours)";
  return null;
}

/** Paliers d'arrêt anticipé (L0 après 109, L1 après 111, L2 après 113). */
export function porteLitteratie(items: Item[], rep: Reponses, palier: "L0" | "L1" | "L2", prenom?: string): boolean {
  const s = competencesLitteratie(items, rep, prenom);
  if (palier === "L0") return s.l0 >= 2;
  if (palier === "L1") return s.l1 > 0;
  return s.l2 === 2;
}
