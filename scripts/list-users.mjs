import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>l.split(/=(.*)/s).slice(0,2)));
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.auth.admin.listUsers({ perPage: 100 });
for (const u of data.users) {
  console.log(u.email, "| créé:", u.created_at?.slice(0,16), "| confirmé:", u.email_confirmed_at ? "oui" : "NON", "| invité:", u.invited_at?.slice(0,16) ?? "—", "| dernière connexion:", u.last_sign_in_at?.slice(0,16) ?? "jamais");
}
