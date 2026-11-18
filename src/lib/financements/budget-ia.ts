import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateCostUsd } from "@/lib/ai/client";
import { localToUtc } from "@/lib/dates";
import { AI_FEATURE_PREFIX, monthStartDay, resolveAiCap } from "./ia";

// Dépense d'IA du module Financements sur le mois en cours, comparée au plafond de
// l'organisation. Estimation d'après les jetons consommés (table ai_calls) : un ordre de
// grandeur, pas une facture. Passé le plafond, les boutons d'écriture répondent par un
// message clair au lieu d'appeler le modèle.
export type AiBudget = { spentUsd: number; capUsd: number; exceeded: boolean };

export async function loadAiBudget(supabase: SupabaseClient, orgId: string, now: Date = new Date()): Promise<AiBudget> {
  const since = localToUtc(monthStartDay(now), "00:00");
  const [{ data: org }, { data: rows }] = await Promise.all([
    supabase.from("organizations").select("settings").eq("id", orgId).maybeSingle(),
    supabase
      .from("ai_calls")
      .select("input_tokens, output_tokens, cache_read_tokens")
      .eq("org_id", orgId)
      .like("feature", `${AI_FEATURE_PREFIX}%`)
      .gte("created_at", since),
  ]);
  const spentUsd = (rows ?? []).reduce(
    (n, r) => n + estimateCostUsd({ inputTokens: r.input_tokens, outputTokens: r.output_tokens, cacheReadTokens: r.cache_read_tokens }),
    0,
  );
  const capUsd = resolveAiCap(org?.settings);
  return { spentUsd, capUsd, exceeded: spentUsd >= capUsd };
}

export function budgetLabel(b: AiBudget): string {
  const usd = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `IA ce mois-ci : ${usd(b.spentUsd)} $ sur ${usd(b.capUsd)} $`;
}
