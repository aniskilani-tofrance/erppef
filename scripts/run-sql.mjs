// Exécute un fichier SQL sur la base distante. Usage : PGURL=... node scripts/run-sql.mjs fichier.sql
import { readFileSync } from "node:fs";
import pg from "pg";

const sql = readFileSync(process.argv[2], "utf8");
const client = new pg.Client({
  connectionString: process.env.PGURL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query(sql);
  console.log("OK");
} finally {
  await client.end();
}
