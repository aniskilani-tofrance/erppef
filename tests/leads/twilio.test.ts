import { describe, expect, it } from "vitest";
import { isFrenchSmsSendingWindow, twilioConfigured } from "@/lib/leads/twilio";

describe("envoi SMS Twilio des leads", () => {
  it("n'autorise les envois automatiques qu'en journée, heure de Paris", () => {
    expect(isFrenchSmsSendingWindow(new Date("2026-09-16T05:59:00.000Z"))).toBe(false); // 07:59 Paris
    expect(isFrenchSmsSendingWindow(new Date("2026-09-16T06:00:00.000Z"))).toBe(true); // 08:00 Paris
    expect(isFrenchSmsSendingWindow(new Date("2026-09-16T19:29:00.000Z"))).toBe(true); // 21:29 Paris
    expect(isFrenchSmsSendingWindow(new Date("2026-09-16T19:30:00.000Z"))).toBe(false); // 21:30 Paris
  });

  it("reste inactif sans identifiants Twilio complets", () => {
    const original = {
      account: process.env.TWILIO_ACCOUNT_SID,
      token: process.env.TWILIO_AUTH_TOKEN,
      service: process.env.TWILIO_MESSAGING_SERVICE_SID,
    };
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_MESSAGING_SERVICE_SID;
    expect(twilioConfigured()).toBe(false);
    process.env.TWILIO_ACCOUNT_SID = original.account;
    process.env.TWILIO_AUTH_TOKEN = original.token;
    process.env.TWILIO_MESSAGING_SERVICE_SID = original.service;
  });
});
