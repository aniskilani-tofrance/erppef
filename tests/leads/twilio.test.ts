import { describe, expect, it } from "vitest";
import { twilioConfigured } from "@/lib/leads/twilio";

describe("envoi SMS Twilio des leads", () => {
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
