import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isFrenchSmsSendingWindow } from "@/lib/leads/twilio";

// Les SMS automatiques ne partent qu'entre 08h00 et 21h30 à Paris. Un cron qui tourne
// hors de cette plage ne rattrape donc jamais rien : c'était le cas du cron des alertes,
// à 05h30 UTC. Ce test verrouille le fait que chaque horaire planifié pour les SMS tombe
// dans la plage, en heure d'été comme en heure d'hiver.

function heuresUtcDuCron(chemin: string): number[] {
  const conf = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
  const cron = conf.crons.find((c) => c.path === chemin);
  if (!cron) throw new Error(`cron ${chemin} absent de vercel.json`);
  const [minute, heures] = cron.schedule.split(" ");
  return heures.split(",").map((h) => Number(h) * 60 + Number(minute));
}

describe("plage d'envoi des SMS et horaires du cron", () => {
  it("chaque passage du cron SMS tombe dans la plage, été comme hiver", () => {
    for (const minutesUtc of heuresUtcDuCron("/api/cron/leads-sms")) {
      // Un jour d'été (Paris = UTC+2) et un jour d'hiver (Paris = UTC+1).
      for (const jour of ["2026-07-15", "2026-01-15"]) {
        const instant = new Date(`${jour}T${String(Math.floor(minutesUtc / 60)).padStart(2, "0")}:${String(minutesUtc % 60).padStart(2, "0")}:00.000Z`);
        expect(isFrenchSmsSendingWindow(instant), `${jour} à ${instant.toISOString()}`).toBe(true);
      }
    }
  });

  it("l'ancien horaire du cron des alertes était bien hors plage", () => {
    expect(isFrenchSmsSendingWindow(new Date("2026-07-15T05:30:00.000Z"))).toBe(false); // 07h30 Paris
    expect(isFrenchSmsSendingWindow(new Date("2026-01-15T05:30:00.000Z"))).toBe(false); // 06h30 Paris
  });
});
