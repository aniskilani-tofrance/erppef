import { describe, expect, it } from "vitest";
import {
  calendarName,
  calendarUrl,
  eventBody,
  eventNeedsUpdate,
  isRetryable,
  missingShares,
  wantedShares,
  withRetry,
  type SessionForCalendar,
} from "@/lib/gcal";

const session: SessionForCalendar = {
  id: "5b1f0c2e-1111-4222-8333-444455556666",
  starts_at: "2026-11-09T08:00:00+00:00",
  ends_at: "2026-11-09T11:00:00+00:00",
  group_name: "PEF A2 — automne",
  room_name: "Cordon",
  room_address: "12 rue du Docteur Bauer, 93400 Saint-Ouen",
  room_access_notes: "Entrée par le parking, 1er étage.",
};

describe("agenda Google des formateurs — corps d'événement", () => {
  it("compose titre, lieu (salle + adresse) et consignes d'accès", () => {
    const body = eventBody(session);
    expect(body.summary).toBe("PEF A2 — automne · Cordon");
    expect(body.location).toBe("Cordon, 12 rue du Docteur Bauer, 93400 Saint-Ouen");
    expect(body.description).toContain("Comment trouver la salle : Entrée par le parking");
    expect(body.status).toBe("confirmed");
    expect(body.extendedProperties?.private).toEqual({ erp: "pef", sessionId: session.id });
  });

  it("reste lisible sans salle ni adresse", () => {
    const body = eventBody({ ...session, room_name: null, room_address: null, room_access_notes: null, group_name: null });
    expect(body.summary).toBe("Cours");
    expect(body.location).toBeUndefined();
    expect(body.description).toBe("Séance planifiée par l'ERP ParlerEmploi Formation.");
  });

  it("nomme l'agenda d'après le formateur", () => {
    expect(calendarName({ id: "t", name: "Marie TREGARO", email: null })).toBe("Cours PEF — Marie TREGARO");
  });
});

describe("agenda Google des formateurs — ne réécrire que ce qui change", () => {
  const desired = eventBody(session);

  it("ignore un événement identique, même avec un autre décalage horaire", () => {
    const existing = {
      ...desired,
      start: { dateTime: "2026-11-09T09:00:00+01:00", timeZone: "Europe/Paris" },
      end: { dateTime: "2026-11-09T12:00:00+01:00", timeZone: "Europe/Paris" },
    };
    expect(eventNeedsUpdate(existing, desired)).toBe(false);
  });

  it("détecte un changement de salle, d'horaire ou un événement annulé à la main", () => {
    expect(eventNeedsUpdate({ ...desired, location: "Landy" }, desired)).toBe(true);
    expect(
      eventNeedsUpdate({ ...desired, start: { dateTime: "2026-11-09T09:30:00+00:00", timeZone: "Europe/Paris" } }, desired),
    ).toBe(true);
    expect(eventNeedsUpdate({ ...desired, status: "cancelled" }, desired)).toBe(true);
  });
});

describe("agenda Google des formateurs — partages", () => {
  const acl = [
    { role: "owner", scope: { type: "user", value: "erppefadmin@erp-pef.iam.gserviceaccount.com" } },
    { role: "reader", scope: { type: "user", value: "ancienne@hotmail.fr" } },
    { role: "writer", scope: { type: "user", value: "anis@parleremploi.fr" } },
  ];

  it("veut la direction en écriture (dédoublonnée) et le formateur en lecture", () => {
    expect(wantedShares("Marie@parleremploi.fr", ["anis@parleremploi.fr", "ANIS@parleremploi.fr", null, "pas-un-email"])).toEqual([
      { email: "anis@parleremploi.fr", role: "writer" },
      { email: "marie@parleremploi.fr", role: "reader" },
    ]);
    // Un admin qui est aussi formateur garde l'écriture
    expect(wantedShares("anis@parleremploi.fr", ["anis@parleremploi.fr"])).toEqual([{ email: "anis@parleremploi.fr", role: "writer" }]);
    expect(wantedShares(null, [])).toEqual([]);
  });

  it("ajoute l'email actuel du formateur quand l'agenda a été partagé avec une ancienne adresse", () => {
    expect(missingShares(acl, wantedShares("Marie@parleremploi.fr", ["anis@parleremploi.fr"]))).toEqual([
      { email: "marie@parleremploi.fr", role: "reader" },
    ]);
  });

  it("ajoute un nouvel admin ERP en écriture, sans toucher aux partages existants", () => {
    expect(missingShares(acl, wantedShares("ancienne@hotmail.fr", ["anis@parleremploi.fr", "direction@parleremploi.fr"]))).toEqual([
      { email: "direction@parleremploi.fr", role: "writer" },
    ]);
  });

  it("ne repartage pas ce qui l'est déjà (casse indifférente, rôle supérieur accepté)", () => {
    expect(missingShares(acl, wantedShares("Ancienne@HOTMAIL.fr", ["ANIS@parleremploi.fr"]))).toEqual([]);
    // reader demandé alors que writer accordé : rien à faire
    expect(missingShares(acl, [{ email: "anis@parleremploi.fr", role: "reader" }])).toEqual([]);
  });

  it("titre de l'agenda consolidé : groupe · salle · formatrice, ou « à affecter »", () => {
    expect(eventBody({ ...session, trainer_name: "Marie TREGARO" }, { withTrainer: true }).summary).toBe("PEF A2 — automne · Cordon · Marie TREGARO");
    expect(eventBody({ ...session, trainer_name: null }, { withTrainer: true }).summary).toBe("PEF A2 — automne · Cordon · formateur à affecter");
    expect(calendarUrl("abc@group.calendar.google.com")).toBe("https://calendar.google.com/calendar/u/0/r?cid=abc%40group.calendar.google.com");
  });
});

describe("agenda Google des formateurs — réessais", () => {
  it("rejoue les limites Google et les erreurs serveur, pas les autres", () => {
    expect(isRetryable({ code: 403, message: "Rate Limit Exceeded" })).toBe(true);
    expect(isRetryable({ status: 429, message: "Too many requests" })).toBe(true);
    expect(isRetryable({ code: "503", message: "Backend Error" })).toBe(true);
    expect(isRetryable({ code: 403, message: "Forbidden" })).toBe(false);
    expect(isRetryable({ code: 409, message: "The requested identifier already exists." })).toBe(false);
    expect(isRetryable({ code: 404, message: "Not Found" })).toBe(false);
  });

  it("réussit après une limite passagère et abandonne tout de suite sur une erreur définitive", async () => {
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      if (calls < 3) throw { code: 403, message: "Rate Limit Exceeded" };
      return "ok";
    };
    await expect(withRetry(flaky, 5, 1)).resolves.toBe("ok");
    expect(calls).toBe(3);

    let hard = 0;
    const broken = async () => {
      hard += 1;
      throw { code: 404, message: "Not Found" };
    };
    await expect(withRetry(broken, 5, 1)).rejects.toMatchObject({ code: 404 });
    expect(hard).toBe(1);
  });
});
