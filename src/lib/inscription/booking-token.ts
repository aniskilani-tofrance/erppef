import { createHmac, timingSafeEqual } from "node:crypto";

// Jeton de réservation du formulaire d'inscription (serveur uniquement).
// Renvoyé par l'action d'inscription à la personne qui vient d'être créée ou retrouvée :
// lui seul permet de réserver un créneau pour CETTE fiche, pendant 30 minutes.
// Format : base64url(« orgId:learnerId:expiration ») + « . » + HMAC-SHA256 tronqué.
// Le secret est celui de l'horodatage anti-robot (SIGNUP_FORM_SECRET, sinon la clé
// serveur) ; le préfixe « reservation: » empêche de réutiliser une signature d'horodatage.

export const BOOKING_TOKEN_TTL_MS = 30 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BookingClaims = { orgId: string; learnerId: string };

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`reservation:${payload}`).digest("base64url").slice(0, 32);
}

export function issueBookingToken(claims: BookingClaims, now: number, secret: string, ttlMs = BOOKING_TOKEN_TTL_MS): string {
  const payload = Buffer.from(`${claims.orgId}:${claims.learnerId}:${Math.floor(now + ttlMs)}`).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** Jeton valide et non expiré → la personne et l'organisme ; sinon null. */
export function verifyBookingToken(token: unknown, now: number, secret: string): BookingClaims | null {
  if (typeof token !== "string" || token.length > 300) return null;
  const m = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{32})$/.exec(token);
  if (!m) return null;
  const expected = Buffer.from(sign(m[1], secret));
  const given = Buffer.from(m[2]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const [orgId, learnerId, exp, ...rest] = Buffer.from(m[1], "base64url").toString("utf8").split(":");
  if (rest.length || !UUID.test(orgId ?? "") || !UUID.test(learnerId ?? "") || !/^\d{10,16}$/.test(exp ?? "")) return null;
  if (now > Number(exp)) return null;
  return { orgId, learnerId };
}
