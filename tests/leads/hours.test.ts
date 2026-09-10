import { describe, expect, it } from "vitest";
import { callWindow } from "@/lib/leads/hours";

// Heure de Paris en septembre = UTC+2
const paris = (day: string, hm: string) => new Date(`${day}T${hm}:00+02:00`);

describe("heures d'appel restauration", () => {
  it("créneau du matin et de la coupure", () => {
    expect(callWindow(paris("2026-09-15", "10:00")).state).toBe("ok");
    expect(callWindow(paris("2026-09-15", "15:00")).state).toBe("ok");
  });
  it("jamais pendant le service du midi", () => {
    const w = callWindow(paris("2026-09-15", "12:30"));
    expect(w.state).toBe("service");
    expect(w.nextOpen).toBe("14h30");
  });
  it("trop tôt / trop tard", () => {
    expect(callWindow(paris("2026-09-15", "08:00")).nextOpen).toBe("9h30");
    expect(callWindow(paris("2026-09-15", "19:00")).state).toBe("closed");
  });
  it("week-end = rush", () => {
    expect(callWindow(paris("2026-09-12", "10:00")).state).toBe("weekend");
  });
  it("collective : 9h-11h et 14h-16h", () => {
    expect(callWindow(paris("2026-09-15", "09:15"), "collective").state).toBe("ok");
    expect(callWindow(paris("2026-09-15", "16:30"), "collective").state).toBe("closed");
  });
});
