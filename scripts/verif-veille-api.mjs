// Vérification bout en bout de l'API de veille (collecteur Manus → ERP), sur la prod
// ou un déploiement de test. Toutes les données créées portent le préfixe « test- »
// (run_id) ou « test: » (dedupe_key) et un mois fictif (2000-01) pour la note.
//
// Usage : node scripts/verif-veille-api.mjs [https://pef-erp.vercel.app]
//   Jeton : variable PEF_VEILLE_API_TOKEN, sinon lue dans .env.local. Jamais affiché.
import { readFileSync } from "node:fs";

const base = (process.argv[2] ?? process.env.PEF_VEILLE_API_URL ?? "https://pef-erp.vercel.app").replace(/\/$/, "");
let token = process.env.PEF_VEILLE_API_TOKEN;
if (!token) {
  try {
    const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => l.split(/=(.*)/s).slice(0, 2).map((s) => s.trim())));
    token = env.PEF_VEILLE_API_TOKEN;
  } catch {
    // pas de .env.local
  }
}
if (!token) {
  console.error("Jeton absent : PEF_VEILLE_API_TOKEN (variable ou .env.local)");
  process.exit(1);
}

const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const runId = `test-${ts}`;
const lot = JSON.parse(readFileSync("docs/integrations/veille-lot-test-8.json", "utf8"));
const fiches = lot.fiches.map((f, i) => ({ ...f, dedupe_key: `test:${ts}:${String(i + 1).padStart(2, "0")}` }));

let failures = 0;
function check(label, cond, detail) {
  console.log(`${cond ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
}
async function call(method, path, body, withToken = true) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(withToken ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { json = { erreur: `réponse non JSON (${res.status})`, extrait: text.slice(0, 80) }; }
  return { status: res.status, json };
}

// 1. Santé
const h0 = await call("GET", "/api/veille/health", null, false);
check("health sans jeton → 200, auth absent, aucune donnée", h0.status === 200 && h0.json?.auth === "absent" && !("entries" in (h0.json ?? {})) && !("organisation" in (h0.json ?? {})), JSON.stringify(h0.json));
const h1 = await call("GET", "/api/veille/health");
check("health avec jeton → auth ok, base ok", h1.status === 200 && h1.json?.auth === "ok" && h1.json?.base_de_donnees === "ok");
const h2 = await fetch(`${base}/api/veille/health`, { headers: { Authorization: "Bearer faux-jeton-0000000000" } }).then((r) => r.json()).catch(() => ({}));
check("health avec mauvais jeton → auth invalide", h2.auth === "invalide", JSON.stringify(h2));

// 2. Jeton invalide sur une route protégée
const bad = await fetch(`${base}/api/veille/entries`, { headers: { Authorization: "Bearer faux-jeton-0000000000" } });
check("entries avec mauvais jeton → 401", bad.status === 401);
const none = await fetch(`${base}/api/veille/entries`);
check("entries sans jeton → 401", none.status === 401);

// 3. Lot de huit fiches
const b1 = await call("POST", "/api/veille/entries/batch", { run_id: runId, fiches });
check("lot de 8 fiches accepté (8 créées, 0 ignorée)", b1.status === 200 && b1.json?.creees?.length === 8 && b1.json?.ignorees?.length === 0 && b1.json?.rejeu === false, `${b1.status} ${b1.json?.erreur ?? ""}`);

// 4. Rejeu du même run_id
const b2 = await call("POST", "/api/veille/entries/batch", { run_id: runId, fiches });
check("rejeu du même run_id → 0 créée, 8 ignorées, rejeu: true", b2.status === 200 && b2.json?.creees?.length === 0 && b2.json?.ignorees?.length === 8 && b2.json?.rejeu === true);

// 5. Fiche déjà connue dans un autre run
const b3 = await call("POST", "/api/veille/entries/batch", { run_id: `${runId}-b`, fiches: [fiches[0], { ...fiches[1], dedupe_key: `test:${ts}:09` }] });
check("fiche déjà connue → ignorée (doublon), la nouvelle créée", b3.status === 200 && b3.json?.ignorees?.[0]?.dedupe_key === fiches[0].dedupe_key && b3.json?.creees?.length === 1);

// 6. Lot avec une fiche invalide : rien n'est écrit
const keyNeverWritten = `test:${ts}:10`;
const b4 = await call("POST", "/api/veille/entries/batch", { run_id: `${runId}-c`, fiches: [{ ...fiches[2], dedupe_key: keyNeverWritten }, { ...fiches[3], dedupe_key: `test:${ts}:11`, indicateur: 27 }] });
check("lot avec une fiche invalide → 422, 1 rejetée, 0 créée", b4.status === 422 && b4.json?.rejetees?.length === 1 && b4.json?.creees?.length === 0 && b4.json?.rejetees?.[0]?.erreurs?.[0]?.champ === "indicateur");
const list = await call("GET", `/api/veille/entries?from=2026-09-01&fields=dedupe_key,titre,url&limit=1000`);
const keys = new Set((list.json?.entries ?? []).map((e) => e.dedupe_key));
check("aucune écriture partielle : la fiche valide du lot refusé est absente", list.status === 200 && !keys.has(keyNeverWritten) && keys.has(fiches[0].dedupe_key));
check("GET entries ne renvoie que les champs demandés", list.status === 200 && list.json?.champs?.join(",") === "dedupe_key,titre,url" && Object.keys(list.json?.entries?.[0] ?? {}).join(",") === "dedupe_key,titre,url");
const badFields = await call("GET", `/api/veille/entries?fields=dedupe_key,secret`);
check("GET entries avec un champ inconnu → 400", badFields.status === 400);

// 7. Note mensuelle
const n1 = await call("POST", "/api/veille/monthly-notes", { mois: "2000-01", titre: `TEST note ${ts}`, contenu: "Note de test — à supprimer.", run_id: runId, nb_fiches: 8 });
const n2 = await call("POST", "/api/veille/monthly-notes", { mois: "2000-01", titre: `TEST note ${ts} (v2)`, contenu: "Note de test mise à jour.", run_id: runId, nb_fiches: 8 });
const n3 = await call("GET", "/api/veille/monthly-notes?mois=2000-01");
check("note mensuelle créée puis mise à jour (idempotente), consultable", n1.status === 201 && n1.json?.action === "creee" && n2.status === 200 && n2.json?.action === "mise_a_jour" && n3.json?.notes?.[0]?.titre === `TEST note ${ts} (v2)`);

// 8. Journal d'exécution
const r1 = await call("POST", "/api/veille/runs", { run_id: runId, statut: "succes", debut: new Date(Date.now() - 600000).toISOString(), fin: new Date().toISOString(), message: "Exécution de test.", stats: { sources_consultees: 3 }, csv_secours: { url: "https://exemple.invalid/veille-test.csv", nom: "veille-test.csv" }, notifier: false });
const r2 = await call("GET", `/api/veille/runs?run_id=${runId}`);
const run = r2.json?.runs?.[0];
check("exécution clôturée (compteurs du lot conservés, CSV de secours, sans notification)", r1.status === 200 && run?.statut === "succes" && run?.creees === 8 && run?.rejeux === 1 && run?.csv_secours?.url?.endsWith("veille-test.csv") && r1.json?.notification === "desactivee", JSON.stringify(run));
const r3 = await call("POST", "/api/veille/runs", { run_id: runId, statut: "partiel", message: "x".repeat(2001) });
check("exécution avec message trop long → 422", r3.status === 422);

console.log(failures ? `\n${failures} vérification(s) en échec` : "\nToutes les vérifications passent.");
console.log(`Données de test à purger : run_id ${runId}*, dedupe_key test:${ts}:*, note 2000-01.`);
process.exit(failures ? 1 : 0);
