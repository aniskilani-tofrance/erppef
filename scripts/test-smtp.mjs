import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>l.split(/=(.*)/s).slice(0,2)));
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data, error } = await s.auth.resetPasswordForEmail("anis.kilani@parleremploi.fr", {
  redirectTo: "https://pef-erp.vercel.app/login",
});
if (error) {
  console.log("status:", error.status, "| code:", error.code, "| message:", error.message);
} else {
  console.log("✓ Email envoyé via le SMTP configuré");
}
