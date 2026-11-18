import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_MODEL, AiError, aiConfigured, askStructured, estimateCostUsd, type AiUsage } from "@/lib/ai/client";
import { isoWeekday, localToUtc } from "@/lib/dates";
import { deadlineFromInput, parisDay } from "./echeances";
import { monthStartDay } from "./ia";
import {
  WATCH_EXTRACT_SYSTEM, WATCH_FEATURE_PREFIX, WATCH_RESEARCH_SYSTEM, WEB_SEARCH_USD, WatchResultSchema, focusForWeekday, isPublicHttpUrl,
  linkIsDead, mergeWatchSettings, resolveWatchCap, resolveWatchSettings, splitWatchItems, watchItemToRow, watchResearchUser, withRun,
  type KnownOpportunity, type WatchRun,
} from "./veille-auto";

// Exécution de la veille automatique d'UNE organisation (cron quotidien, ou bouton de
// l'écran Veille). `admin` est le client de service : la veille tourne sans personne
// connectée. Rien d'autre que funding_opportunities, ai_calls et le journal des réglages
// n'est écrit, toujours pour l'organisation passée.

const MAX_SEARCHES = 6;
const MAX_FETCHES = 4;
const MAX_ITEMS = 8; // fiches ajoutées par recherche, au plus

export type WatchBudget = { spentUsd: number; capUsd: number; exceeded: boolean };

// Dépense du mois : jetons des appels de veille + recherches web du journal.
export async function loadWatchBudget(admin: SupabaseClient, orgId: string, now: Date = new Date()): Promise<WatchBudget> {
  const month = monthStartDay(now);
  const [{ data: org }, { data: rows }] = await Promise.all([
    admin.from("organizations").select("settings").eq("id", orgId).maybeSingle(),
    admin
      .from("ai_calls")
      .select("input_tokens, output_tokens, cache_read_tokens")
      .eq("org_id", orgId)
      .like("feature", `${WATCH_FEATURE_PREFIX}%`)
      .gte("created_at", localToUtc(month, "00:00")),
  ]);
  const tokens = (rows ?? []).reduce(
    (n, r) => n + estimateCostUsd({ inputTokens: r.input_tokens, outputTokens: r.output_tokens, cacheReadTokens: r.cache_read_tokens }),
    0,
  );
  const searches = resolveWatchSettings(org?.settings).runs.filter((r) => parisDay(r.at) >= month).reduce((n, r) => n + (r.searches || 0), 0);
  const capUsd = resolveWatchCap(org?.settings);
  const spentUsd = tokens + searches * WEB_SEARCH_USD;
  return { spentUsd, capUsd, exceeded: spentUsd >= capUsd };
}

// Recherche sur le web par le modèle (outils côté serveur). Rend le compte rendu en texte.
async function researchOnWeb(user: string): Promise<{ notes: string; usage: AiUsage; searches: number }> {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  const client = new Anthropic({
    defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
    timeout: 200_000, // la fonction Vercel a 300 s : on garde de quoi mettre en fiches et vérifier les liens
    maxRetries: 0,
  });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
  const usage: AiUsage = { model: AI_MODEL, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  let searches = 0;
  let notes = "";
  // Une longue recherche peut rendre la main (pause_turn) : on la relance telle quelle.
  for (let turn = 0; turn < 4; turn++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: AI_MODEL,
        max_tokens: 16000,
        system: [{ type: "text", text: WATCH_RESEARCH_SYSTEM, cache_control: { type: "ephemeral" } }],
        output_config: { effort: "medium" },
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES, user_location: { type: "approximate", country: "FR", timezone: "Europe/Paris" } },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: MAX_FETCHES, max_content_tokens: 20000 },
        ],
        messages,
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new AiError("Clé API Claude refusée : vérifiez ANTHROPIC_API_KEY.");
      if (e instanceof Anthropic.RateLimitError) throw new AiError("Modèle momentanément saturé : la recherche sera refaite demain.");
      if (e instanceof Anthropic.APIConnectionTimeoutError) throw new AiError("Recherche trop longue : interrompue avant la limite de temps.");
      // Le détail sert au journal de la veille (ex. recherche web non activée sur le compte du modèle).
      if (e instanceof Anthropic.APIError) throw new AiError(`Recherche indisponible (${e.status ?? "erreur"}) : ${e.message.slice(0, 300)}`);
      throw new AiError("Modèle injoignable (réseau).");
    }
    usage.model = response.model;
    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;
    usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
    searches += response.usage.server_tool_use?.web_search_requests ?? 0;
    if (response.stop_reason === "refusal") throw new AiError("Le modèle a refusé cette recherche.");
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (text.trim()) notes = text; // le compte rendu est le texte du dernier tour
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }
  return { notes: notes.trim(), usage, searches };
}

// Vérifie qu'une adresse proposée existe (GET court). null = pas de réponse : on garde.
async function linkStatus(url: string): Promise<number | null> {
  if (!isPublicHttpUrl(url)) return 404;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; veille-financements)", accept: "text/html,application/pdf,*/*" },
    });
    return res.status;
  } catch {
    return null;
  }
}

export type WatchOutcome = { ok: true; run: WatchRun } | { ok: false; skipped: string };

export async function runFundingWatch(
  admin: SupabaseClient,
  orgId: string,
  opts: { now?: Date; manual?: boolean; userId?: string | null } = {},
): Promise<WatchOutcome> {
  const now = opts.now ?? new Date();
  if (!aiConfigured()) return { ok: false, skipped: "IA non configurée (clé du modèle absente)" };
  const { data: org } = await admin.from("organizations").select("name, settings").eq("id", orgId).maybeSingle();
  if (!org) return { ok: false, skipped: "organisation introuvable" };
  const settings = resolveWatchSettings(org.settings);
  if (!settings.enabled && !opts.manual) return { ok: false, skipped: "veille automatique désactivée" };
  const budget = await loadWatchBudget(admin, orgId, now);
  if (budget.exceeded) return { ok: false, skipped: `plafond mensuel de la veille atteint (${budget.capUsd} $)` };

  const today = parisDay(now);
  const focus = focusForWeekday(isoWeekday(today));
  const { data: existing } = await admin
    .from("funding_opportunities")
    .select("title, url, funder_name, funders(name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(400);
  const known: KnownOpportunity[] = (existing ?? []).map((o) => ({
    title: o.title as string,
    url: (o.url as string | null) ?? null,
    funder: (o.funders as unknown as { name: string } | null)?.name ?? (o.funder_name as string | null) ?? null,
  }));

  const run: WatchRun = { at: now.toISOString(), focus: focus.label, searches: 0, found: 0, added: 0, known: 0, dropped: 0, titles: [], error: null, manual: !!opts.manual };
  const logUsage = (feature: string) => async (u: AiUsage) => {
    await admin.from("ai_calls").insert({
      org_id: orgId, feature: `${WATCH_FEATURE_PREFIX}${feature}`, model: u.model, input_tokens: u.inputTokens, output_tokens: u.outputTokens,
      cache_read_tokens: u.cacheReadTokens, created_by: opts.userId ?? null,
    });
  };

  try {
    const research = await researchOnWeb(watchResearchUser({ orgName: org.name, profile: settings.profile, focus, today, known }));
    run.searches = research.searches;
    await logUsage("recherche")(research.usage);
    if (research.notes) {
      const extracted = await askStructured({
        system: WATCH_EXTRACT_SYSTEM,
        user: `<compte_rendu>\n${research.notes}\n</compte_rendu>`,
        schema: WatchResultSchema,
        effort: "low",
        maxTokens: 12000,
        onUsage: logUsage("fiches"),
      });
      run.found = extracted.items.length;
      const { fresh, knownCount, unusable } = splitWatchItems(extracted.items, known);
      run.known = knownCount;
      run.dropped = unusable;
      const rows: Record<string, unknown>[] = [];
      const candidates = fresh.slice(0, MAX_ITEMS);
      const statuses = await Promise.all(candidates.map((c) => linkStatus(c.url))); // en parallèle : 8 s au plus
      for (const [i, item] of candidates.entries()) {
        if (linkIsDead(statuses[i])) {
          run.dropped++;
          continue;
        }
        let deadlineAt: string | null = null;
        try {
          deadlineAt = deadlineFromInput(item.deadline);
        } catch {
          deadlineAt = null;
        }
        const row = watchItemToRow(item, deadlineAt);
        if (row) rows.push({ ...row, org_id: orgId });
        else run.dropped++;
      }
      run.dropped += Math.max(0, fresh.length - MAX_ITEMS);
      if (rows.length) {
        const { data, error } = await admin
          .from("funding_opportunities")
          .upsert(rows, { onConflict: "org_id,dedupe_key", ignoreDuplicates: true })
          .select("title");
        if (error) throw new Error(`enregistrement : ${error.message}`);
        run.added = data?.length ?? 0;
        run.known += rows.length - run.added;
        run.titles = (data ?? []).map((d) => d.title as string).slice(0, 8);
      }
    }
  } catch (e) {
    run.error = e instanceof AiError || e instanceof Error ? e.message : "erreur inattendue";
  }

  // Journal : relu juste avant l'écriture pour ne pas écraser un réglage changé entre-temps.
  const { data: fresh } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  const current = resolveWatchSettings(fresh?.settings);
  await admin.from("organizations").update({ settings: mergeWatchSettings(fresh?.settings, { runs: withRun(current.runs, run) }) }).eq("id", orgId);
  return { ok: true, run };
}
