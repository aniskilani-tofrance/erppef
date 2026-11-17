// Reprise des données du module Financements (lot 1) dans UNE organisation.
//
//   npx tsx scripts/import-financements.ts --org bac-a-sable --fichier chemin/reprise-lot-1.json
//   npx tsx scripts/import-financements.ts --org pef --fichier … --production   (accord d'Anis)
//
// Options :
//   --org <slug|uuid>       organisation cible (obligatoire) ; jamais plusieurs à la fois
//   --fichier <chemin>      fichier JSON préparé par le bureau Financements (obligatoire)
//   --responsable <email>   compte responsable des dossiers repris (sinon : recherche du
//                           prénom indiqué dans le fichier parmi les admins de l'organisation)
//   --essai                 contrôle le fichier et affiche le plan, sans rien écrire
//   --production            obligatoire pour toute organisation autre que le bac à sable
//
// Relançable sans doublon : financeurs par code, opportunités par dedupe_key, dossiers et
// échéances par import_key. Ce qui existe déjà n'est ni recréé ni écrasé ; d'un financeur
// existant, seuls les champs vides sont complétés (code, couleur et nom intacts).
// Lit .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY), comme seed-sandbox.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { missingEnrichment, planImport, sameDepositDay, type ImportPlan } from "../src/lib/financements/reprise";

const SANDBOX_SLUG = "bac-a-sable";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
function die(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const orgArg = arg("org");
const file = arg("fichier");
if (!orgArg || !file) die("Usage : npx tsx scripts/import-financements.ts --org <slug|uuid> --fichier <reprise.json> [--responsable email] [--essai] [--production]");
if (!existsSync(file)) die(`Fichier introuvable : ${file}`);

let plan: ImportPlan;
try {
  plan = planImport(JSON.parse(readFileSync(file, "utf8")));
} catch (e) {
  die(e instanceof Error ? e.message : String(e));
}
console.log(`Plan : ${plan.funders.length} financeurs, ${plan.opportunities.length} opportunités, ${plan.applications.length} dossiers, ${plan.deadlines.length} échéances.`);
for (const w of plan.warnings) console.warn(`  ! ${w}`);
if (flag("essai")) {
  console.log("Mode essai : rien n'a été écrit.");
  process.exit(0);
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const s: SupabaseClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const isUuid = /^[0-9a-f-]{36}$/i.test(orgArg);
const { data: org } = await s.from("organizations").select("id, name, slug").eq(isUuid ? "id" : "slug", orgArg).maybeSingle();
if (!org) die(`Organisation introuvable : ${orgArg}`);
if (org.slug !== SANDBOX_SLUG && !flag("production")) {
  die(`« ${org.name} » n'est pas le bac à sable : ajoutez --production, et seulement avec l'accord d'Anis.`);
}
const orgId = org.id as string;
console.log(`Organisation cible : ${org.name} (${org.slug})`);

const counts = { financeursCrees: 0, financeursCompletes: 0, opportunites: 0, dossiers: 0, echeancesCreees: 0, echeancesPrecisees: 0 };

// ── 1. Financeurs ────────────────────────────────────────────────────────────
const { data: existingFunders, error: fErr } = await s
  .from("funders")
  .select("id, code, kind, website, portal, portal_account_ref, contacts, usual_rules")
  .eq("org_id", orgId);
if (fErr) die(`financeurs : ${fErr.message}`);
const funderByCode = new Map((existingFunders ?? []).map((f) => [String(f.code), f]));
for (const f of plan.funders) {
  const cur = funderByCode.get(f.code);
  if (cur) {
    const patch = missingEnrichment(cur, f.enrich);
    if (Object.keys(patch).length) {
      const { error } = await s.from("funders").update(patch).eq("id", cur.id).eq("org_id", orgId);
      if (error) die(`financeur ${f.code} : ${error.message}`);
      counts.financeursCompletes += 1;
    }
  } else {
    const { error } = await s.from("funders").insert({ org_id: orgId, ...f.insert });
    if (error) die(`financeur ${f.code} : ${error.message}`);
    counts.financeursCrees += 1;
  }
}
const { data: allFunders } = await s.from("funders").select("id, code").eq("org_id", orgId);
const funderId = new Map((allFunders ?? []).map((f) => [String(f.code), f.id as string]));
const needFunder = (code: string, where: string) => funderId.get(code) ?? die(`${where} : financeur ${code} introuvable dans l'organisation.`);

// ── 2. Opportunités ──────────────────────────────────────────────────────────
const oppRows = plan.opportunities.map(({ funder_code, ...o }) => ({
  ...o,
  org_id: orgId,
  funder_id: funder_code ? needFunder(funder_code, `Opportunité ${o.dedupe_key}`) : null,
}));
{
  const { data, error } = await s
    .from("funding_opportunities")
    .upsert(oppRows, { onConflict: "org_id,dedupe_key", ignoreDuplicates: true })
    .select("id");
  if (error) die(`opportunités : ${error.message}`);
  counts.opportunites = data?.length ?? 0;
}
const { data: opps } = await s
  .from("funding_opportunities")
  .select("id, dedupe_key")
  .eq("org_id", orgId)
  .in("dedupe_key", plan.opportunities.map((o) => o.dedupe_key));
const oppId = new Map((opps ?? []).map((o) => [o.dedupe_key as string, o.id as string]));

// ── 3. Responsable des dossiers ──────────────────────────────────────────────
const ownerByHint = new Map<string, string | null>();
const ownerEmail = arg("responsable");
const { data: members } = await s.from("memberships").select("user_id, role, profiles(full_name)").eq("org_id", orgId).in("role", ["admin", "coordinator"]);
let forcedOwner: string | null = null;
if (ownerEmail) {
  const { data: users } = await s.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = users?.users.find((x) => x.email?.toLowerCase() === ownerEmail.toLowerCase());
  if (!u || !(members ?? []).some((m) => m.user_id === u.id)) die(`--responsable : ${ownerEmail} n'est pas admin ou coordinateur de l'organisation.`);
  forcedOwner = u.id;
}
function ownerFor(hint: string | null): string | null {
  if (forcedOwner) return forcedOwner;
  if (!hint) return null;
  if (!ownerByHint.has(hint)) {
    const h = hint.toLowerCase();
    const found = (members ?? []).filter((m) => ((m.profiles as unknown as { full_name: string | null } | null)?.full_name ?? "").toLowerCase().includes(h));
    ownerByHint.set(hint, found.length === 1 ? (found[0].user_id as string) : null);
    if (found.length !== 1) console.warn(`  ! Responsable « ${hint} » : ${found.length} compte(s) trouvé(s) ; dossiers sans responsable (à attribuer dans l'écran ou relancer avec --responsable).`);
  }
  return ownerByHint.get(hint) ?? null;
}

// ── 4. Dossiers ──────────────────────────────────────────────────────────────
const appRows = plan.applications.map(({ funder_code, opportunity_key, owner_hint, ...a }) => ({
  ...a,
  org_id: orgId,
  funder_id: needFunder(funder_code, `Dossier ${a.title}`),
  opportunity_id: opportunity_key ? oppId.get(opportunity_key) ?? null : null,
  owner_id: ownerFor(owner_hint),
}));
{
  const { data, error } = await s
    .from("funding_applications")
    .upsert(appRows, { onConflict: "org_id,import_key", ignoreDuplicates: true })
    .select("id");
  if (error) die(`dossiers : ${error.message}`);
  counts.dossiers = data?.length ?? 0;
}
const { data: apps } = await s
  .from("funding_applications")
  .select("id, import_key, opportunity_id")
  .eq("org_id", orgId)
  .in("import_key", plan.applications.map((a) => a.import_key));
const appId = new Map((apps ?? []).map((a) => [a.import_key as string, a.id as string]));
const appByOpp = new Map((apps ?? []).filter((a) => a.opportunity_id).map((a) => [a.opportunity_id as string, a.id as string]));

// ── 5. Échéances ─────────────────────────────────────────────────────────────
for (const { opportunity_key, dossier_import_key, funder_code, ...d } of plan.deadlines) {
  const opportunityId = opportunity_key ? oppId.get(opportunity_key) ?? null : null;
  // Une opportunité devenue dossier : l'échéance va au dossier.
  const applicationId = dossier_import_key ? appId.get(dossier_import_key) ?? null : opportunityId ? appByOpp.get(opportunityId) ?? null : null;
  const links = {
    application_id: applicationId,
    opportunity_id: applicationId ? null : opportunityId,
    funder_id: funder_code ? needFunder(funder_code, `Échéance ${d.title}`) : null,
  };

  const { data: already } = await s.from("funding_deadlines").select("id").eq("org_id", orgId).eq("import_key", d.import_key).maybeSingle();
  if (already) continue;

  if (d.kind === "depot" && (links.application_id || links.opportunity_id)) {
    const q = s.from("funding_deadlines").select("id, due_at, import_key").eq("org_id", orgId);
    const { data: auto } = links.application_id
      ? await q.eq("application_id", links.application_id).eq("auto_origin", "application").maybeSingle()
      : await q.eq("opportunity_id", links.opportunity_id as string).eq("auto_origin", "opportunity").maybeSingle();
    if (auto && !auto.import_key && sameDepositDay(d, auto)) {
      const { error } = await s.from("funding_deadlines").update({ title: d.title, import_key: d.import_key }).eq("id", auto.id).eq("org_id", orgId);
      if (error) die(`échéance ${d.title} : ${error.message}`);
      counts.echeancesPrecisees += 1;
      continue;
    }
  }
  const { error } = await s.from("funding_deadlines").insert({ ...d, ...links, org_id: orgId });
  if (error) die(`échéance ${d.title} : ${error.message}`);
  counts.echeancesCreees += 1;
}

console.log("✓ Reprise terminée :");
console.log(`  financeurs créés ${counts.financeursCrees}, complétés ${counts.financeursCompletes}`);
console.log(`  opportunités créées ${counts.opportunites} (les autres existaient déjà)`);
console.log(`  dossiers créés ${counts.dossiers}`);
console.log(`  échéances créées ${counts.echeancesCreees}, échéances de dépôt automatiques précisées ${counts.echeancesPrecisees}`);
