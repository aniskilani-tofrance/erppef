// Import en masse des kits de séance (PDF) : chaque fichier est rangé sur sa séance d'après son nom.
//   kit_G3_2026-10-05_14h00_A2_S1-1.pdf  →  groupe G-3, séance du 05/10/2026 à 14h00 (heure de Paris)
// Usage : npx tsx scripts/importer-kits.mts [dossier]          (simulation, rien n'est écrit)
//         DRY=0 npx tsx scripts/importer-kits.mts [dossier]    (dépôt réel, après lecture de la simulation)
// Dossier par défaut : « Kits ERP » sur le Bureau. Organisation ParlerEmploi Formation uniquement.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { KIT_BUCKET, KIT_MAX_BYTES, kitStoragePath, parisDateTime, parseKitFileName } from "../src/lib/kits";

const PEF = "a0000000-0000-4000-8000-000000000001";
const DRY = process.env.DRY !== "0";
const dir = process.argv[2] ?? join(homedir(), "Desktop", "Kits ERP");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: org } = await sb.from("organizations").select("name").eq("id", PEF).single();
if (org?.name !== "ParlerEmploi Formation") throw new Error("Mauvaise organisation");

const files = readdirSync(dir).filter((f) => /\.pdf$/i.test(f)).sort();
if (!files.length) {
  console.log(`Aucun PDF dans ${dir}`);
  process.exit(0);
}

const { data: groups } = await sb.from("groups").select("id, group_no, name").eq("org_id", PEF);
const groupByNo = new Map((groups ?? []).map((g) => [g.group_no, g]));

type Line = { file: string; status: "ok" | "remplace" | "erreur"; detail: string; sessionId?: string; parsed?: ReturnType<typeof parseKitFileName>; size?: number };
const lines: Line[] = [];
const seen = new Map<string, string>();

for (const file of files) {
  const parsed = parseKitFileName(file);
  const size = statSync(join(dir, file)).size;
  if (!parsed) {
    lines.push({ file, status: "erreur", detail: "nom non reconnu (attendu : kit_G3_2026-10-05_14h00_A2_S1-1.pdf)" });
    continue;
  }
  if (size > KIT_MAX_BYTES) {
    lines.push({ file, status: "erreur", detail: `trop lourd (${Math.round(size / 1e6)} Mo, 30 Mo maximum)` });
    continue;
  }
  if (readFileSync(join(dir, file)).subarray(0, 5).toString() !== "%PDF-") {
    lines.push({ file, status: "erreur", detail: "ce n'est pas un vrai PDF" });
    continue;
  }
  const group = groupByNo.get(parsed.groupNo);
  if (!group) {
    lines.push({ file, status: "erreur", detail: `groupe G-${parsed.groupNo} inconnu` });
    continue;
  }
  // Fenêtre large autour du jour, puis comparaison exacte en heure de Paris.
  const from = new Date(`${parsed.date}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(`${parsed.date}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 2);
  const { data: sessions } = await sb
    .from("sessions")
    .select("id, starts_at, status")
    .eq("org_id", PEF)
    .eq("group_id", group.id)
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString());
  const match = (sessions ?? []).filter((s) => {
    const p = parisDateTime(s.starts_at);
    return p.date === parsed.date && p.time === parsed.time;
  });
  const active = match.filter((s) => s.status !== "annulee");
  if (!active.length) {
    lines.push({ file, status: "erreur", detail: match.length ? "séance annulée" : `aucune séance de G-${parsed.groupNo} le ${parsed.date} à ${parsed.time}` });
    continue;
  }
  const session = active[0];
  if (seen.has(session.id)) {
    lines.push({ file, status: "erreur", detail: `même séance que ${seen.get(session.id)}` });
    continue;
  }
  seen.set(session.id, file);
  const { data: existing } = await sb.from("session_kits").select("file_name").eq("session_id", session.id).maybeSingle();
  lines.push({
    file, parsed, size, sessionId: session.id,
    status: existing ? "remplace" : "ok",
    detail: `${group.name} · ${parsed.date} ${parsed.time}${existing ? ` (remplace ${existing.file_name})` : ""}`,
  });
}

console.log(`${DRY ? "SIMULATION" : "DÉPÔT"} · ${files.length} PDF dans ${dir}\n`);
for (const l of lines) console.log(`${l.status === "erreur" ? "✗" : l.status === "remplace" ? "↻" : "✓"} ${l.file}\n    ${l.detail}`);
const okLines = lines.filter((l) => l.status !== "erreur");
console.log(`\n${okLines.length} à déposer · ${lines.length - okLines.length} en erreur`);

if (DRY || !okLines.length) process.exit(0);

let done = 0;
for (const l of okLines) {
  const path = kitStoragePath(PEF, l.sessionId!);
  const up = await sb.storage.from(KIT_BUCKET).upload(path, readFileSync(join(dir, l.file)), { contentType: "application/pdf", upsert: true });
  if (up.error) {
    console.log(`✗ envoi refusé : ${l.file} (${up.error.message})`);
    continue;
  }
  const { error } = await sb.from("session_kits").upsert(
    {
      org_id: PEF, session_id: l.sessionId, file_path: path, file_name: l.file, size_bytes: l.size,
      level: l.parsed!.level, sequence_no: l.parsed!.sequenceNo, seance_no: l.parsed!.seanceNo, updated_at: new Date().toISOString(),
    },
    { onConflict: "session_id" },
  );
  if (error) {
    console.log(`✗ enregistrement refusé : ${l.file} (${error.message})`);
    continue;
  }
  done++;
}
console.log(`${done} kit(s) déposé(s).`);
