import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { provenanceFromSiteSource } from "@/lib/admission/sources";
import { AVAILABILITIES, FRENCH_LEVELS, SIGNUP_LANGUAGES } from "@/lib/inscription/i18n";
import { checkOrigin, corsHeaders } from "@/lib/inscription/cors";
import { sanitizeSrc } from "@/lib/inscription/link";
import { resolveSignupOrg } from "@/lib/inscription/org";
import { registerSignup } from "@/lib/inscription/register";
import { checkStamp, freshStamp, MIN_FILL_MS, parseSignup, stampSecret, type SignupInput } from "@/lib/inscription/signup";

// API publique d'inscription aux cours de FLE, pour le formulaire du site
// (parleremploiformation.pro/association). Même traitement que /inscription : la
// personne arrive dans Admission → « À contacter » (statut « nouveau »).
//
//   GET  /api/inscription  → { ok, t, minFillMs, choices } : horodatage signé à renvoyer
//                            avec le formulaire + choix proposés (codes et libellés fr/en/ar)
//   POST /api/inscription  → JSON (ou formulaire) : firstName, lastName, phone, languages[],
//                            french, availability[], city?, consent, t, website (piège), src?
//
// Sécurité : pas de jeton côté navigateur (il serait public). L'organisation est choisie
// par le serveur (SIGNUP_ORG_SLUG, jamais le bac à sable) ; CORS limité aux origines de
// INSCRIPTION_ALLOWED_ORIGINS ; champ piège + horodatage signé + délai minimal ; plafond
// d'afflux commun avec /inscription. La réponse ne dit jamais si le numéro était connu.

export const dynamic = "force-dynamic";

function json(req: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { ...corsHeaders(req.headers.get("origin")), "Cache-Control": "no-store" } });
}

function denied(req: NextRequest) {
  return checkOrigin(req.headers.get("origin")) === "denied";
}

export async function OPTIONS(req: NextRequest) {
  if (denied(req)) return new NextResponse(null, { status: 403, headers: { Vary: "Origin" } });
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function GET(req: NextRequest) {
  if (denied(req)) return json(req, { ok: false, error: "origin" }, 403);
  const pick = <T extends { code: string; fr: string; en: string; ar: string }>(list: readonly T[]) =>
    list.map(({ code, fr, en, ar }) => ({ code, fr, en, ar }));
  return json(req, {
    ok: true,
    t: freshStamp(),
    minFillMs: MIN_FILL_MS,
    choices: { languages: pick(SIGNUP_LANGUAGES), french: pick(FRENCH_LEVELS), availability: pick(AVAILABILITIES) },
  });
}

const MAX_BODY = 8_000;

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  const ct = req.headers.get("content-type") ?? "";
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return null;
    if (ct.includes("application/json")) {
      const v = JSON.parse(text);
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    }
    // Formulaire classique (x-www-form-urlencoded) : les choix multiples sont répétés.
    const params = new URLSearchParams(text);
    const out: Record<string, unknown> = {};
    for (const key of new Set(params.keys())) {
      const all = params.getAll(key);
      out[key] = key === "languages" || key === "availability" ? all : all[0];
    }
    return out;
  } catch {
    return null;
  }
}

const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

function toSignupInput(b: Record<string, unknown>): SignupInput {
  return {
    firstName: b.firstName,
    lastName: b.lastName,
    phone: b.phone,
    languages: asList(b.languages),
    french: b.french,
    availability: asList(b.availability),
    city: b.city,
    consent: b.consent,
  };
}

export async function POST(req: NextRequest) {
  if (denied(req)) return json(req, { ok: false, error: "origin" }, 403);
  const body = await readBody(req);
  if (!body) return json(req, { ok: false, error: "server" }, 400);

  // Champ piège rempli, horodatage absent, falsifié ou trop récent : un robot. On répond
  // « merci » sans rien enregistrer (il ne doit pas apprendre ce qui l'a trahi).
  if (typeof body.website === "string" && body.website.trim()) return json(req, { ok: true });
  const stamp = checkStamp(body.t, Date.now(), stampSecret());
  if (stamp !== "ok") {
    console.warn(`[inscription:api] envoi ignoré (${stamp})`);
    return json(req, { ok: true });
  }

  const parsed = parseSignup(toSignupInput(body));
  if (!parsed.ok) return json(req, { ok: false, error: parsed.error }, 400);

  const org = await resolveSignupOrg(null);
  if (!org) {
    console.error("[inscription:api] organisation introuvable (SIGNUP_ORG_SLUG)");
    return json(req, { ok: false, error: "server" }, 500);
  }

  const src = sanitizeSrc(typeof body.src === "string" ? body.src : null);
  const result = await registerSignup(createAdminClient(), org.id, parsed.data, {
    src: src ? `site — ${src}` : "site",
    provenance: provenanceFromSiteSource(src),
  });
  if (!result.ok) return json(req, { ok: false, error: "server" }, result.error === "flood" ? 429 : 500);

  revalidatePath("/apprenants", "layout");
  return json(req, { ok: true });
}
