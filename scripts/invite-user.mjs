// Invite un utilisateur dans l'ERP avec un rôle, sans passer par l'interface
// (même mécanique que Paramètres → Utilisateurs → Inviter : email d'invitation Supabase
// avec lien « définir mon mot de passe » → /auth/bienvenue, puis membership).
//
//   node scripts/invite-user.mjs <email> "<Prénom Nom>" <admin|coordinator|trainer|viewer|setter> [slug-org] [--dry-run]
//
// Lit NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY dans .env.local (comme
// set-password.mjs / list-users.mjs ; la clé est vide dans le .env tiré de Vercel car
// marquée sensible). Sans slug : l'organisation où anis.kilani@parleremploi.fr est admin
// (jamais le bac à sable).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const [email, fullName, role, ...rest] = process.argv.slice(2);
const dryRun = rest.includes("--dry-run");
const slug = rest.find((a) => !a.startsWith("--")) ?? null;
const ROLES = ["admin", "coordinator", "trainer", "viewer", "setter"];
if (!email || !fullName || !ROLES.includes(role)) {
  console.error('Usage : node scripts/invite-user.mjs <email> "<Prénom Nom>" <rôle> [slug-org] [--dry-run]');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Organisation cible
let org;
if (slug) {
  ({ data: org } = await admin.from("organizations").select("id, name, slug").eq("slug", slug).single());
} else {
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const anis = users?.users.find((u) => u.email === "anis.kilani@parleremploi.fr");
  const { data: m } = await admin.from("memberships").select("org_id, organizations(id, name, slug)").eq("user_id", anis?.id).eq("role", "admin");
  org = (m ?? []).map((x) => x.organizations).find((o) => o && o.slug !== "bac-a-sable");
}
if (!org) {
  console.error("Organisation introuvable.");
  process.exit(1);
}
console.log(`Organisation : ${org.name} (${org.slug}) — ${org.id}`);
console.log(`Invitation : ${email} · ${fullName} · rôle ${role}`);
if (dryRun) {
  console.log("Dry-run : rien envoyé.");
  process.exit(0);
}

const normalized = email.trim().toLowerCase();
let userId = null;
let already = false;
const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(normalized, {
  redirectTo: "https://pef-erp.vercel.app/auth/bienvenue",
  data: { full_name: fullName },
});
if (invited?.user) userId = invited.user.id;
else if (error) {
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  userId = users?.users.find((u) => u.email?.toLowerCase() === normalized)?.id ?? null;
  if (!userId) {
    console.error(`Invitation impossible : ${error.message}`);
    process.exit(1);
  }
  already = true;
}

const { error: mErr } = await admin
  .from("memberships")
  .upsert({ org_id: org.id, user_id: userId, role, trainer_id: null }, { onConflict: "org_id,user_id" });
if (mErr) {
  console.error(`Membership : ${mErr.message}`);
  process.exit(1);
}
await admin.from("profiles").upsert({ id: userId, full_name: fullName }, { onConflict: "id" });
console.log(already ? "Compte existant : accès ajouté (aucun email envoyé, utiliser « mot de passe oublié » si besoin)." : "Invitation envoyée : lien « définir mon mot de passe » valable 24 h.");
console.log(`user_id ${userId}`);
