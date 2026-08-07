// Dépannage : pose un mot de passe et confirme l'email d'un compte (contourne l'email d'invitation).
// Usage : node scripts/set-password.mjs email 'MotDePasse'
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const [email, password] = process.argv.slice(2);
const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
const user = data.users.find((u) => u.email === email);
if (!user) throw new Error(`Aucun compte pour ${email}`);

const { error } = await supabase.auth.admin.updateUserById(user.id, { password, email_confirm: true });
if (error) throw error;
console.log(`✓ Mot de passe posé et email confirmé pour ${email}`);
