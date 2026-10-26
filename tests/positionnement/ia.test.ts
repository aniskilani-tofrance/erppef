// Correction des réponses libres : le module reçoit l'appel Mistral de l'ERP (grading.ts, même
// clé, même modèle). Quota dépassé (429), panne ou clé absente → repli sans IA du module.
import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluerLibre, item } from "@/lib/positionnement/module/index.ts";
import { appelIAPositionnement } from "@/lib/positionnement/ia";

const TEXTE = "Bonjour Monsieur, je serai absent demain parce que je suis malade. Je vous envoie le certificat dès que possible. Cordialement, Amina";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("appel à l'IA du test de positionnement", () => {
  it("sans clé MISTRAL_API_KEY : pas d'IA, repli du module", async () => {
    vi.stubEnv("MISTRAL_API_KEY", "");
    expect(appelIAPositionnement()).toBeNull();
    expect((await evaluerLibre(item(53)!, TEXTE, appelIAPositionnement())).mode).toBe("repli");
  });

  it("Mistral répond 429 (quota) : repli sans IA, à confirmer", async () => {
    vi.stubEnv("MISTRAL_API_KEY", "cle-de-test");
    const fetch = vi.fn(async () => new Response("Too Many Requests", { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    const e = await evaluerLibre(item(53)!, TEXTE, appelIAPositionnement());
    expect(fetch).toHaveBeenCalledOnce();
    expect(e.mode).toBe("repli");
    expect(e.a_confirmer).toBe(true);
  });

  it("Mistral répond : même modèle que l'ancien test, grille du module, note « ia »", async () => {
    vi.stubEnv("MISTRAL_API_KEY", "cle-de-test");
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      void init;
      return Response.json({ choices: [{ message: { content: JSON.stringify({ criteres: { realisation: 3, lexique: 2, morphosyntaxe: 2, coherence: 1 }, commentaire: "Message clair." }) } }] });
    });
    vi.stubGlobal("fetch", fetch);
    const e = await evaluerLibre(item(53)!, TEXTE, appelIAPositionnement());
    expect(e.mode).toBe("ia");
    expect(e.reussi).toBe(true);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.mistral.ai/v1/chat/completions");
    const corps = JSON.parse(String(init.body));
    expect(corps.model).toBe("mistral-small-latest");
    expect(corps.messages[0].role).toBe("system");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer cle-de-test");
  });
});
