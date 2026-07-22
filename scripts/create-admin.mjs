// Crée le compte admin initial + son membership. Usage : node scripts/create-admin.mjs email motdepasse
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const [email, password] = process.argv.slice(2);
const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Anis Kilani" },
});
if (error) throw error;

const { error: mErr } = await supabase.from("memberships").insert({
  org_id: "a0000000-0000-4000-8000-000000000001",
  user_id: data.user.id,
  role: "admin",
});
if (mErr) throw mErr;
console.log("Admin créé :", data.user.email, data.user.id);
