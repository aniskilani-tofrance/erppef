// Simulation de passations (reprise des tests ToFrance, src/lib/__tests__/positionnement.simulation.ts) :
// une personne « au niveau X » réussit les items de niveau ≤ X et échoue au-dessus, compétence par compétence.
import {
  BANQUE, item, avancer, terminer, type AppelIA, type Evaluations, type Item, type Reponses,
} from "@/lib/positionnement/module/index.ts";

export const RANGS: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4 };

/** Réponse JUSTE au format attendu par la correction, pour chaque type d'item fermé. */
export function bonneReponse(q: Item): string {
  switch (q.type) {
    case "match_pairs": return JSON.stringify(Object.fromEntries((q.pairs as { left: string; right: string }[]).map((p) => [p.left, p.right])));
    case "categorize": return JSON.stringify(Object.fromEntries((q.items as { text: string; category: string }[]).map((i) => [i.text, i.category])));
    case "order_sentences": return JSON.stringify((q.correctOrder as number[]).map((origIdx) => ({ origIdx })));
    case "sentence_builder": return String(q.correctSentence).replace(/\.$/, "").split(" ").join("|");
    case "fill_keyboard": return (q.acceptedAnswers ?? [])[0];
    case "word_choice_text": return JSON.stringify(q.correctBlanks);
    case "complete_form": return JSON.stringify(Object.fromEntries((q.formFields as { key: string; answer: string }[]).map((f) => [f.key, f.answer])));
    case "true_false_justify": return JSON.stringify({ tf: q.correct, justif: q.justification });
    case "written": case "oral": case "reformulate": return "BON " + "mot ".repeat(130);
    default: return q.options && typeof q.correct === "number" ? q.options[q.correct] : String(q.correct);
  }
}
export function mauvaiseReponse(q: Item): string {
  if (["written", "oral", "reformulate"].includes(q.type)) return "FAIBLE réponse";
  if (q.options) return q.options.find((o) => o !== bonneReponse(q)) ?? "x";
  return "{}";
}

/** IA factice : note pleine si le texte commence par BON, zéro sinon. */
export const iaFactice: AppelIA = async (messages) => {
  const bon = messages[1].content.includes("« BON");
  const v = bon ? 3 : 0;
  return JSON.stringify({ criteres: { realisation: v, lexique: bon ? 2 : 0, morphosyntaxe: bon ? 2 : 0, coherence: bon ? 2 : 0, aisance: bon ? 2 : 0 }, commentaire: "ok" });
};

export interface Personne {
  /** Niveau par compétence (rang 0 = A1 non atteint). */
  niveaux: Partial<Record<"CO" | "CE" | "PO" | "PE" | "LANGUE", number>>;
  scolarisation?: "longtemps" | "un_peu" | "jamais";
  /** Lit (bloc littératie réussi). */
  lit?: boolean;
  /** Comprend l'oral de base (images). */
  oral?: boolean;
}

export function repondre(p: Personne, q: Item): string {
  if (q.competence === "LITTERATIE") {
    if (q.id === 101) return { longtemps: "🏫🎓 Oui, longtemps", un_peu: "🏫 Oui, un peu", jamais: "🏫❌ Non, jamais" }[p.scolarisation ?? "longtemps"];
    if (q.id === 102) return "🌍 Non";
    const oral = [103, 104, 105].includes(q.id);
    const ok = oral ? p.oral !== false : p.lit !== false;
    if (q.dynamicName) return ok ? "AMINA" : "AMIAN";
    return ok ? bonneReponse(q) : mauvaiseReponse(q);
  }
  const n = p.niveaux[q.competence as "CO"] ?? 0;
  return RANGS[q.level] <= n ? bonneReponse(q) : mauvaiseReponse(q);
}

/** Passation complète : répond à chaque étape proposée par le serveur, puis termine. */
export async function passer(p: Personne, appelIA: AppelIA | null = iaFactice) {
  const rep: Reponses = {};
  let ev: Evaluations = {};
  for (let i = 0; i < 60; i++) {
    const r = await avancer(rep, ev, appelIA, "Amina");
    ev = r.evaluations;
    if (!r.etape.items.length) break;
    for (const id of r.etape.items) rep[id] = repondre(p, item(id)!);
  }
  const bilan = await terminer(rep, ev, appelIA, { prenom: "Amina", dureeSecondes: 900, date: "2026-10-15T10:00:00Z" });
  return { rep, bilan, administres: Object.keys(rep).map(Number) };
}

export { BANQUE };
