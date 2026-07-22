import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data, error } = await supabase.auth.signInWithPassword({
  email: process.argv[2],
  password: process.argv[3],
});
if (error) throw error;
const claims = JSON.parse(Buffer.from(data.session.access_token.split(".")[1], "base64url").toString());
console.log("org_id dans le JWT :", claims.org_id ?? "❌ ABSENT — hook non activé");
console.log("app_role dans le JWT :", claims.app_role ?? "❌ ABSENT — hook non activé");
