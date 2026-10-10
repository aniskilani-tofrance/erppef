import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

// Appels au modèle Claude, côté serveur uniquement (après requireRole). Inerte sans
// ANTHROPIC_API_KEY : les boutons de l'assistant n'apparaissent pas et rien n'est envoyé.
// Règle de données : jamais de téléphone, d'email, d'adresse ni de champ sensible (santé,
// RQTH, titre de séjour) dans ce qui part au modèle — prénom et référence A-0001 suffisent.

export const AI_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export class AiError extends Error {}

export type AiUsage = { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number };

export async function askStructured<T>(opts: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  onUsage?: (u: AiUsage) => Promise<void> | void;
}): Promise<T> {
  if (!aiConfigured()) throw new AiError("Assistant IA non configuré : la variable ANTHROPIC_API_KEY n'est pas posée.");
  // Une clé « utilisateur » (sk-ant-usr-…) n'est pas rattachée à un espace de travail : l'API
  // exige alors l'en-tête anthropic-workspace-id. Une clé d'espace de travail s'en passe.
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  const client = new Anthropic({ defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined });
  let response;
  try {
    response = await client.messages.parse({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 4000,
      // Le cadre (système) est stable → mis en cache ; la demande varie.
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.user }],
      output_config: { effort: opts.effort ?? "low", format: zodOutputFormat(opts.schema) },
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("Clé API Claude refusée : vérifiez ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Assistant momentanément saturé : réessayez dans une minute.");
    if (e instanceof Anthropic.APIError && /workspace/i.test(e.message)) throw new AiError("Clé API Claude sans espace de travail : posez ANTHROPIC_WORKSPACE_ID (ou utilisez une clé d'espace de travail).");
    if (e instanceof Anthropic.APIError && e.status === 404) throw new AiError(`Modèle ${AI_MODEL} inconnu pour cette clé : vérifiez ANTHROPIC_MODEL.`);
    if (e instanceof Anthropic.APIError) throw new AiError(`Assistant indisponible (${e.status ?? "erreur"}).`);
    throw new AiError("Assistant injoignable (réseau).");
  }
  await opts.onUsage?.({
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
  });
  if (response.stop_reason === "refusal") throw new AiError("L'assistant a refusé cette demande.");
  if (response.stop_reason === "max_tokens") throw new AiError("Réponse trop longue, réessayez avec moins d'éléments.");
  const parsed = response.parsed_output;
  if (parsed == null) throw new AiError("Réponse de l'assistant illisible, réessayez.");
  return parsed;
}

// Estimation en euros (tarifs publics Claude Opus 5.5 : 4 $ / 20 $ le million de jetons, lecture
// de cache 0,20 $) — ordre de grandeur pour la carte Paramètres, pas une facture.
export function estimateCostUsd(u: { inputTokens: number; outputTokens: number; cacheReadTokens: number }): number {
  return (u.inputTokens * 4 + u.outputTokens * 20 + u.cacheReadTokens * 0.2) / 1_000_000;
}
