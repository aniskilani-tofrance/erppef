"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadDeniedModules } from "@/lib/module-access";
import { FINANCEMENTS_ROLES } from "@/lib/financements/constants";
import { MAX_PROFILE_CHARS, mergeWatchSettings, type WatchRun } from "@/lib/financements/veille-auto";
import { runFundingWatch } from "@/lib/financements/veille-run";
import type { ActionResult } from "./actions";

// Réglages et lancement manuel de la veille automatique. Les réglages vivent dans
// organizations.settings (écriture réservée au compte de service) : on vérifie le rôle
// et le module, puis on écrit pour l'organisation de la session uniquement.

async function requireFinancementsWrite() {
  const ctx = await requireRole([...FINANCEMENTS_ROLES]);
  if ((await loadDeniedModules(ctx.userId, ctx.orgId)).includes("financements")) throw new Error("Accès refusé à ce module.");
  return ctx;
}

const settingsSchema = z.object({ enabled: z.boolean(), profile: z.string().trim().min(20, "Décrivez l'association en quelques phrases.").max(MAX_PROFILE_CHARS) });

export async function saveWatchSettings(raw: z.infer<typeof settingsSchema>): Promise<ActionResult> {
  try {
    const parsed = settingsSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Réglages invalides." };
    const { orgId } = await requireFinancementsWrite();
    const admin = createAdminClient();
    const { data: org } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
    const { error } = await admin
      .from("organizations")
      .update({ settings: mergeWatchSettings(org?.settings, { enabled: parsed.data.enabled, profile: parsed.data.profile }) })
      .eq("id", orgId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/financements/veille");
    return { ok: true, message: parsed.data.enabled ? "Réglages enregistrés. La recherche tourne chaque nuit." : "Réglages enregistrés. La recherche automatique est en pause." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." };
  }
}

// Lance une recherche tout de suite (une à trois minutes), sur l'axe du jour.
export async function runWatchNow(): Promise<{ ok: true; run: WatchRun } | { ok: false; error: string }> {
  try {
    const { orgId, userId } = await requireFinancementsWrite();
    const outcome = await runFundingWatch(createAdminClient(), orgId, { manual: true, userId });
    if (!outcome.ok) return { ok: false, error: `Recherche non lancée : ${outcome.skipped}.` };
    revalidatePath("/financements", "layout");
    return { ok: true, run: outcome.run };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." };
  }
}
