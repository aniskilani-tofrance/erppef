import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { formatPhone, toWhatsAppNumber } from "@/lib/admission/phone";
import {
  CITY_CHOICES,
  FRENCH_LEVELS,
  SAINT_OUEN,
  type CityChoice,
  type FrenchLevel,
  type SignupErrorCode,
} from "@/lib/inscription/i18n";

// Inscription rapide (/inscription) : fonctions pures côté serveur — lecture du
// formulaire, téléphone, note du journal d'admission, horodatage anti-robot.

// ── Téléphone ────────────────────────────────────────────────────────────────
// Le champ est pré-rempli « +33 ». Validation souple : « +33 06… » (le 0 en trop),
// « 06 12 34 56 78 », « 0033… », « +216 … » (numéro étranger) sont acceptés.
// Renvoie le numéro tel qu'on l'enregistre (français : « 06 12 34 56 78 », étranger :
// « +216 12345678 » sans espaces internes) et sa forme WhatsApp (chiffres seuls).
export function normalizeSignupPhone(raw: string | null | undefined): { stored: string; digits: string } | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  // « +33 » seul (champ non modifié) : vide
  if (/^\+?\s*33\s*$/.test(v)) return null;
  // « +33 06 12… » : le 0 national après l'indicatif est une erreur fréquente
  const fixed = v.replace(/^(\+|00)\s*33[\s.()-]*0/, "+33");
  const digits = toWhatsAppNumber(fixed);
  if (!digits) return null;
  const stored = digits.startsWith("33") && digits.length === 11 ? formatPhone(digits.replace(/^33/, "0")) : `+${digits}`;
  return { stored, digits };
}

// ── Lecture et validation du formulaire ──────────────────────────────────────
const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

const codes = <T extends readonly { code: string }[]>(list: T) => list.map((x) => x.code) as [T[number]["code"], ...T[number]["code"][]];

const signupSchema = z.object({
  french: z.enum(codes(FRENCH_LEVELS)),
  cityChoice: z.enum(codes(CITY_CHOICES)),
  city: z.string().max(80).nullable(),
  consent: z.literal(true),
});

export type SignupData = {
  firstName: string;
  lastName: string;
  phone: string; // tel qu'enregistré
  phoneDigits: string; // forme WhatsApp, pour repérer les doublons
  french: FrenchLevel;
  cityChoice: CityChoice;
  city: string | null; // « Saint-Ouen », la ville tapée, ou null (autre ville non précisée)
  postalCode: string | null; // « 93400 » pour Saint-Ouen
};

export type SignupInput = {
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
  french?: unknown;
  cityChoice?: unknown;
  city?: unknown;
  consent?: unknown;
};

/** Champs du formulaire (FormData) → objet simple, sans rien valider. */
export function readSignupForm(fd: FormData): SignupInput {
  return {
    firstName: fd.get("firstName"),
    lastName: fd.get("lastName"),
    phone: fd.get("phone"),
    french: fd.get("french"),
    cityChoice: fd.get("cityChoice"),
    city: fd.get("city"),
    consent: fd.get("consent"),
  };
}

// Ordre des contrôles = ordre des écrans : la première erreur renvoie au bon écran.
export function parseSignup(input: SignupInput): { ok: true; data: SignupData } | { ok: false; error: SignupErrorCode } {
  const firstName = clean(input.firstName);
  const lastName = clean(input.lastName);
  if (!firstName || !lastName || firstName.length > 60 || lastName.length > 60) return { ok: false, error: "name" };
  const phone = normalizeSignupPhone(clean(input.phone));
  if (!phone) return { ok: false, error: "phone" };
  const parsed = signupSchema.safeParse({
    french: clean(input.french),
    cityChoice: clean(input.cityChoice),
    city: clean(input.city) || null,
    consent: input.consent === true || input.consent === "on" || input.consent === "1",
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.path[0];
    const error: SignupErrorCode =
      first === "french" ? "french"
      : first === "cityChoice" || first === "city" ? "city"
      : "consent";
    return { ok: false, error };
  }
  const d = parsed.data;
  const saintOuen = d.cityChoice === "saint_ouen";
  return {
    ok: true,
    data: {
      firstName,
      lastName,
      phone: phone.stored,
      phoneDigits: phone.digits,
      french: d.french,
      cityChoice: d.cityChoice,
      city: saintOuen ? SAINT_OUEN.city : d.city,
      postalCode: saintOuen ? SAINT_OUEN.postalCode : null,
    },
  };
}

// ── Libellés français (fiche, journal) ───────────────────────────────────────
const fr = <T extends readonly { code: string; fr: string }[]>(list: T, code: string) =>
  list.find((x) => x.code === code)?.fr ?? code;

/**
 * Note du journal d'admission (learner_contacts.note), lisible d'un coup d'œil :
 * « Inscription formulaire — français : un peu ; ville : Saint-Ouen (93400) ; lien : MDQ Landy »
 */
export function buildSignupNote(d: Pick<SignupData, "french" | "cityChoice" | "city">, opts: { reinscription?: boolean; src?: string | null } = {}): string {
  const ville =
    d.cityChoice === "saint_ouen" ? `${SAINT_OUEN.city} (${SAINT_OUEN.postalCode})`
    : d.city ? `autre — ${d.city}`
    : "autre (non précisée)";
  const parts = [`français : ${fr(FRENCH_LEVELS, d.french).toLowerCase()}`, `ville : ${ville}`];
  if (opts.src) parts.push(`lien : ${opts.src}`);
  return `${opts.reinscription ? "Réinscription via formulaire" : "Inscription formulaire"} — ${parts.join(" ; ")}`;
}

// ── Anti-robot : horodatage signé + délai minimal ────────────────────────────
// La page glisse dans le formulaire l'heure d'affichage signée (HMAC) : un robot qui
// envoie le formulaire sans l'afficher, ou en moins de MIN_FILL_MS, est ignoré.
export const MIN_FILL_MS = 4000;

function sign(ts: string, secret: string): string {
  return createHmac("sha256", secret).update(`inscription:${ts}`).digest("base64url").slice(0, 22);
}

export function issueStamp(now: number, secret: string): string {
  const ts = String(Math.floor(now));
  return `${ts}.${sign(ts, secret)}`;
}

export function checkStamp(stamp: unknown, now: number, secret: string, minMs = MIN_FILL_MS): "ok" | "too_fast" | "invalid" {
  if (typeof stamp !== "string") return "invalid";
  const m = /^(\d{10,16})\.([A-Za-z0-9_-]{22})$/.exec(stamp);
  if (!m) return "invalid";
  const expected = Buffer.from(sign(m[1], secret));
  const given = Buffer.from(m[2]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "invalid";
  const elapsed = now - Number(m[1]);
  if (elapsed < minMs) return "too_fast";
  return "ok";
}

/** Horodatage signé de l'affichage du formulaire (appelé par la page, à chaque requête). */
export function freshStamp(): string {
  return issueStamp(Date.now(), stampSecret());
}

/** Secret de signature : dédié s'il existe, sinon dérivé de la clé serveur (jamais exposée). */
export function stampSecret(): string {
  return process.env.SIGNUP_FORM_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "inscription-dev";
}
