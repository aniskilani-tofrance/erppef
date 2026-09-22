import { describe, expect, it } from "vitest";
import { bearerOf, tokenMatches } from "@/lib/veille/auth";

describe("API de veille — jeton de service", () => {
  const token = "pefv_" + "a".repeat(40);

  it("lit le jeton Bearer, quelle que soit la casse du schéma", () => {
    expect(bearerOf(new Request("https://x", { headers: { authorization: `Bearer ${token}` } }))).toBe(token);
    expect(bearerOf(new Request("https://x", { headers: { Authorization: `bearer  ${token} ` } }))).toBe(token);
    expect(bearerOf(new Request("https://x", { headers: { authorization: `Basic abc` } }))).toBeNull();
    expect(bearerOf(new Request("https://x"))).toBeNull();
  });

  it("compare sans fuite de longueur : seul le jeton exact passe", () => {
    expect(tokenMatches(token, token)).toBe(true);
    expect(tokenMatches(token + "x", token)).toBe(false);
    expect(tokenMatches(token.slice(0, -1), token)).toBe(false);
    expect(tokenMatches("", token)).toBe(false);
    expect(tokenMatches(null, token)).toBe(false);
    expect(tokenMatches(token, undefined)).toBe(false);
  });

  it("refuse un jeton attendu trop court (configuration faible)", () => {
    expect(tokenMatches("court", "court")).toBe(false);
  });
});
