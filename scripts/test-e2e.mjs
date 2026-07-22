// Test bout en bout : connexion admin → RPC create_group_with_sessions → lecture RLS → nettoyage.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { error: loginErr } = await supabase.auth.signInWithPassword({
  email: process.argv[2], password: process.argv[3],
});
if (loginErr) throw loginErr;

const { data: groupId, error } = await supabase.rpc("create_group_with_sessions", {
  payload: {
    group: {
      org_id: "a0000000-0000-4000-8000-000000000001",
      program_id: "e0000000-0000-4000-8000-000000000001",
      funder_id: "b0000000-0000-4000-8000-000000000001",
      name: "TEST-E2E", starts_on: "2026-09-07", ends_on: "2026-09-09",
      total_hours: 9, trainer_id: "d0000000-0000-4000-8000-000000000001",
      room_id: "c0000000-0000-4000-8000-000000000012", status: "ouvert",
      weekly_pattern: [{ weekday: 1, start: "09:00", end: "12:00" }],
    },
    sessions: [
      { trainer_id: "d0000000-0000-4000-8000-000000000001", room_id: "c0000000-0000-4000-8000-000000000012", starts_at: "2026-09-07T07:00:00Z", ends_at: "2026-09-07T10:00:00Z" },
      { trainer_id: "d0000000-0000-4000-8000-000000000001", room_id: "c0000000-0000-4000-8000-000000000012", starts_at: "2026-09-08T07:00:00Z", ends_at: "2026-09-08T10:00:00Z" },
      { trainer_id: "d0000000-0000-4000-8000-000000000001", room_id: "c0000000-0000-4000-8000-000000000012", starts_at: "2026-09-09T07:00:00Z", ends_at: "2026-09-09T10:00:00Z" },
    ],
  },
});
if (error) throw new Error(`RPC: ${error.message}`);
console.log("✓ RPC create_group_with_sessions OK, groupe:", groupId);

const { data: sessions } = await supabase.from("sessions").select("id").eq("group_id", groupId);
console.log("✓ Lecture RLS:", sessions.length, "séances visibles");

const { data: hours } = await supabase.from("v_group_hours").select("hours_scheduled").eq("group_id", groupId).single();
console.log("✓ Vue v_group_hours:", Number(hours.hours_scheduled), "h planifiées");

const { error: delErr } = await supabase.from("groups").delete().eq("id", groupId);
if (delErr) throw delErr;
console.log("✓ Nettoyage OK (cascade séances)");
