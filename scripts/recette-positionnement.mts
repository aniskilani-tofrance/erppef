// Recette de bout en bout du test de positionnement (base de PROD, apprenant jetable).
// Vérifie : lien généré → questions publiques SANS les réponses → bloc littératie en tête
// → porte d'arrêt L0 → soumission → niveau routé → fiche mise à jour → re-passation.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const { publicQuestions, literacyGateDecision, gradeTest } = await import("../src/lib/placement/grading");

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const fails: string[] = [];
const check = (label: string, ok: boolean) => {
  console.log(ok ? "✓" : "✗", label);
  if (!ok) fails.push(label);
};

// 1. Apprenant jetable + tentative
const { data: org } = await s.from("organizations").select("id").limit(1).single();
const { data: learner } = await s.from("learners").insert({ org_id: org!.id, first_name: "Recette", last_name: "Test" }).select("id").single();
const { data: test1 } = await s.from("placement_tests").insert({ org_id: org!.id, learner_id: learner!.id }).select("id, token, status").single();
check("tentative créée avec un token", Boolean(test1?.token) && test1!.status === "en_attente");

// 2. Questions publiques : littératie présente, réponses ABSENTES
const pub = publicQuestions();
const literacy = pub.filter((q: { block?: string }) => q.block === "litteratie");
check("bloc littératie présent (14 items)", literacy.length === 14);
check("aucune bonne réponse ne fuite au client", pub.every((q: Record<string, unknown>) => !("correct" in q) && !("acceptedAnswers" in q)));
check("l'item lettre A est en très grand corps (bigText)", literacy.some((q: { id: number; bigText?: boolean }) => q.id === 107 && q.bigText === true));

// 3. Profil Alpha simulé : oral OK, entrée dans l'écrit KO
const answers: Record<number, string> = {
  101: "🏫❌ Non, jamais",
  103: "📞", 104: "☕", 105: "🐱",
  106: "🌺", 107: "7", 108: "MAUVAIS",
  109: "35",
};
check("porte L0 : arrêt anticipé demandé", literacyGateDecision(answers, "L0", "Recette").continue === false);

const graded = await gradeTest(answers, { firstName: "Recette" });
check("routage → Alpha (oral OK, écrit KO)", graded.level === "Alpha");
check("le détail ne contient pas le prénom", !JSON.stringify(graded.answers).includes("MAUVAIS"));

// 4. Soumission comme le ferait la page (mise à jour de la tentative + de la fiche)
await s.from("placement_tests").update({
  status: "fait", score: graded.score, level: graded.level, answers: graded.answers, completed_at: new Date().toISOString(),
}).eq("id", test1!.id);
await s.from("learners").update({ level_assessed: graded.level }).eq("id", learner!.id);
const { data: after } = await s.from("learners").select("level_assessed").eq("id", learner!.id).single();
check("fiche apprenant mise à jour → Alpha", after?.level_assessed === "Alpha");

// 5. Re-passation : nouvelle tentative, l'ancienne reste
const { data: test2 } = await s.from("placement_tests").insert({ org_id: org!.id, learner_id: learner!.id }).select("token, status").single();
const { count } = await s.from("placement_tests").select("id", { count: "exact", head: true }).eq("learner_id", learner!.id);
check("re-passation : nouveau lien en attente, historique conservé", test2?.status === "en_attente" && count === 2);

// 6. Nettoyage (cascade sur placement_tests)
await s.from("learners").delete().eq("id", learner!.id);
const { count: left } = await s.from("placement_tests").select("id", { count: "exact", head: true }).eq("learner_id", learner!.id);
check("nettoyage complet", left === 0);

console.log(fails.length ? `\n❌ ${fails.length} échec(s)` : "\n✅ Recette complète : tout est vert");
process.exit(fails.length ? 1 : 0);
