// Exécute un fichier SQL sur la base de prod via l'API Management Supabase
// (alternative à run-sql.mjs quand aucune PGURL n'est disponible — il suffit d'un
// jeton d'accès personnel, jamais stocké dans le repo).
// Usage : SUPABASE_ACCESS_TOKEN=sbp_... node scripts/run-sql-mgmt.mjs fichier.sql
//         (SUPABASE_PROJECT_REF facultatif, défaut = projet ERP prod)
import { readFileSync } from "node:fs";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF ?? "zkpmbbuuvbkcoelnrcyo";
const file = process.argv[2];
if (!token || !file) {
  console.error("Usage : SUPABASE_ACCESS_TOKEN=sbp_... node scripts/run-sql-mgmt.mjs fichier.sql");
  process.exit(1);
}

const query = readFileSync(file, "utf8");
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
const body = await res.text();
if (!res.ok) {
  console.error(`Erreur ${res.status} : ${body}`);
  process.exit(1);
}
console.log("OK", body.length > 2 ? body.slice(0, 2000) : "");
