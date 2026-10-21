import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { allowedOrigins, checkOrigin, corsHeaders, DEFAULT_ALLOWED_ORIGINS } from "@/lib/inscription/cors";
import { provenanceFromSiteSource } from "@/lib/admission/sources";
import { issueStamp, MIN_FILL_MS, stampSecret } from "@/lib/inscription/signup";

// La base n'est jamais touchée : registerSignup et l'organisation sont simulés.
const registerSignup = vi.fn();
vi.mock("@/lib/inscription/register", () => ({ registerSignup: (...a: unknown[]) => registerSignup(...a) }));
vi.mock("@/lib/inscription/org", () => ({ resolveSignupOrg: async () => ({ id: "org-pef", name: "PEF" }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { GET, POST, OPTIONS } = await import("@/app/api/inscription/route");

const SITE = "https://parleremploiformation.pro";
const URL_API = "https://pef-erp.vercel.app/api/inscription";

function oldStamp() {
  return issueStamp(Date.now() - MIN_FILL_MS - 1000, stampSecret());
}

const valid = {
  firstName: "Fatima",
  lastName: "Benali",
  phone: "06 12 34 56 78",
  languages: ["arabe"],
  french: "un_peu",
  availability: ["matin"],
  city: "Saint-Ouen",
  consent: true,
  website: "",
};

function post(body: unknown, origin: string | null = SITE, contentType = "application/json") {
  const headers: Record<string, string> = { "content-type": contentType };
  if (origin) headers.origin = origin;
  return new NextRequest(URL_API, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
}

beforeEach(() => {
  registerSignup.mockReset();
  registerSignup.mockResolvedValue({ ok: true, learnerId: "l1", reinscription: false });
});

describe("API inscription — CORS", () => {
  it("n'autorise par défaut que le site ParlerEmploi", () => {
    expect(allowedOrigins("")).toEqual(DEFAULT_ALLOWED_ORIGINS);
    expect(checkOrigin(SITE, DEFAULT_ALLOWED_ORIGINS)).toBe("ok");
    expect(checkOrigin("https://evil.example", DEFAULT_ALLOWED_ORIGINS)).toBe("denied");
    expect(checkOrigin(null, DEFAULT_ALLOWED_ORIGINS)).toBe("none");
  });

  it("lit la liste d'environnement et ignore les valeurs invalides", () => {
    expect(allowedOrigins("https://a.fr/, *, http://localhost:5173")).toEqual(["https://a.fr", "http://localhost:5173"]);
  });

  it("ne renvoie jamais « * » ni d'en-tête pour une origine refusée", () => {
    expect(corsHeaders(SITE, DEFAULT_ALLOWED_ORIGINS)["Access-Control-Allow-Origin"]).toBe(SITE);
    expect(corsHeaders("https://evil.example", DEFAULT_ALLOWED_ORIGINS)["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("répond au pré-vol du site et refuse les autres origines", async () => {
    const ok = await OPTIONS(new NextRequest(URL_API, { method: "OPTIONS", headers: { origin: SITE } }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe(SITE);
    const ko = await OPTIONS(new NextRequest(URL_API, { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
    expect(ko.status).toBe(403);
  });
});

describe("API inscription — provenance", () => {
  it("classe une inscription du site en « Site internet »", () => {
    expect(provenanceFromSiteSource(null)).toEqual({ contact_source: "site_web", contact_source_detail: "Formulaire du site" });
    expect(provenanceFromSiteSource("page association")).toEqual({ contact_source: "site_web", contact_source_detail: "page association" });
  });

  it("garde une famille reconnue (maison de quartier, prescripteur)", () => {
    expect(provenanceFromSiteSource("MDQ Landy").contact_source).toBe("maison_de_quartier");
    expect(provenanceFromSiteSource("France Travail").contact_source).toBe("france_travail");
  });
});

describe("API inscription — GET", () => {
  it("donne un horodatage signé et les choix en trois langues", async () => {
    const res = await GET(new NextRequest(URL_API, { headers: { origin: SITE } }));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.t).toMatch(/^\d+\.[A-Za-z0-9_-]{22}$/);
    expect(body.choices.french.map((c: { code: string }) => c.code)).toEqual(["pas_du_tout", "un_peu", "bien"]);
    expect(body.choices.languages[0]).toEqual({ code: "arabe", fr: "Arabe", en: "Arabic", ar: "العربية" });
  });
});

describe("API inscription — POST", () => {
  it("crée la fiche dans l'organisation choisie par le serveur, provenance « site »", async () => {
    const res = await POST(post({ ...valid, t: oldStamp(), src: "page association", o: "bac-a-sable" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(registerSignup).toHaveBeenCalledOnce();
    const [, orgId, data, opts] = registerSignup.mock.calls[0];
    expect(orgId).toBe("org-pef");
    expect(data).toMatchObject({ firstName: "Fatima", phone: "06 12 34 56 78", languages: ["arabe"] });
    expect(opts).toEqual({ src: "site — page association", provenance: { contact_source: "site_web", contact_source_detail: "page association" } });
  });

  it("accepte aussi un formulaire classique (choix multiples répétés)", async () => {
    const p = new URLSearchParams({ firstName: "Ali", lastName: "K", phone: "0612345678", french: "bien", consent: "on", t: oldStamp() });
    p.append("languages", "arabe");
    p.append("languages", "anglais");
    p.append("availability", "soir");
    const res = await POST(post(p.toString(), SITE, "application/x-www-form-urlencoded"));
    expect(res.status).toBe(200);
    expect(registerSignup.mock.calls[0][2]).toMatchObject({ languages: ["arabe", "anglais"], availability: ["soir"] });
  });

  it("renvoie le code d'erreur de validation", async () => {
    const res = await POST(post({ ...valid, phone: "+33", t: oldStamp() }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "phone" });
    expect(registerSignup).not.toHaveBeenCalled();
  });

  it("exige le consentement", async () => {
    const res = await POST(post({ ...valid, consent: false, t: oldStamp() }));
    expect(await res.json()).toEqual({ ok: false, error: "consent" });
  });

  it("ignore en silence un robot (piège rempli, horodatage absent, faux ou trop rapide)", async () => {
    for (const body of [
      { ...valid, website: "http://spam", t: oldStamp() },
      { ...valid },
      { ...valid, t: "1790000000000.AAAAAAAAAAAAAAAAAAAAAA" },
      { ...valid, t: issueStamp(Date.now(), stampSecret()) },
    ]) {
      const res = await POST(post(body));
      expect(await res.json()).toEqual({ ok: true });
    }
    expect(registerSignup).not.toHaveBeenCalled();
  });

  it("refuse une origine non autorisée", async () => {
    const res = await POST(post({ ...valid, t: oldStamp() }, "https://evil.example"));
    expect(res.status).toBe(403);
    expect(registerSignup).not.toHaveBeenCalled();
  });

  it("signale l'afflux (429) sans détail", async () => {
    registerSignup.mockResolvedValue({ ok: false, error: "flood" });
    const res = await POST(post({ ...valid, t: oldStamp() }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, error: "server" });
  });

  it("ne dit jamais si le numéro était déjà connu", async () => {
    registerSignup.mockResolvedValue({ ok: true, learnerId: "l9", reinscription: true });
    const res = await POST(post({ ...valid, t: oldStamp() }));
    expect(await res.json()).toEqual({ ok: true });
  });

  it("refuse un corps trop gros ou illisible", async () => {
    expect((await POST(post("x".repeat(9000)))).status).toBe(400);
    expect((await POST(post("[1,2]"))).status).toBe(400);
  });
});
