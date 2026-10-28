import { describe, expect, it } from "vitest";
import {
  buildMeetingSms,
  LINK_QUEUE_NOTE,
  LINK_QUEUE_SMS_NOTE,
  pickLinkQueue,
  shortDatesText,
  smsUrl,
  type LinkQueueInvitation,
} from "@/lib/inscription/link-queue";

const NOW = new Date("2026-10-27T10:00:00Z");
const inv = (learner: string, status: string, created = "2026-10-26T09:00:00Z", phone: string | null = "06 12 34 56 78"): LinkQueueInvitation => ({
  learner_id: learner,
  status,
  created_at: created,
  learners: { first_name: learner, last_name: "Test", phone },
});

describe("file d'envoi du lien d'une réunion", () => {
  it("les convoqués sans réponse, par ordre de convocation, une ligne par personne", () => {
    const { targets } = pickLinkQueue(
      [
        inv("B", "a_envoyer", "2026-10-26T10:00:00Z"),
        inv("A", "envoyee", "2026-10-26T09:00:00Z"),
        inv("A", "a_envoyer", "2026-10-26T11:00:00Z"), // convoquée aussi à l'autre session
      ],
      [],
      NOW,
    );
    expect(targets.map((t) => t.learnerId)).toEqual(["A", "B"]);
  });

  it("exclut les inscrits (à n'importe quelle session du lien), les excusés et les absents", () => {
    const { targets, skippedRegistered } = pickLinkQueue(
      [
        inv("inscrit", "a_envoyer"),
        inv("inscrit", "confirmee"), // confirmé à l'autre session
        inv("present", "presente"),
        inv("excuse", "excusee"),
        inv("absent", "absente"),
        inv("ok", "a_envoyer"),
      ],
      [],
      NOW,
    );
    expect(targets.map((t) => t.learnerId)).toEqual(["ok"]);
    expect(skippedRegistered).toBe(2);
  });

  it("signale un lien déjà envoyé depuis moins de 14 jours, ignore les plus anciens et les autres notes", () => {
    const { targets } = pickLinkQueue(
      [inv("A", "envoyee"), inv("B", "envoyee"), inv("C", "envoyee")],
      [
        { learner_id: "A", contacted_at: "2026-10-26T18:00:00Z", note: LINK_QUEUE_NOTE },
        { learner_id: "B", contacted_at: "2026-10-01T18:00:00Z", note: LINK_QUEUE_NOTE },
        { learner_id: "C", contacted_at: "2026-10-26T18:00:00Z", note: "Convocation à la réunion d'information" },
      ],
      NOW,
    );
    expect(targets.find((t) => t.learnerId === "A")?.alreadySentAt).toBe("2026-10-26T18:00:00Z");
    expect(targets.find((t) => t.learnerId === "B")?.alreadySentAt).toBeNull();
    expect(targets.find((t) => t.learnerId === "C")?.alreadySentAt).toBeNull();
  });

  it("un lien déjà envoyé par SMS compte aussi", () => {
    const { targets } = pickLinkQueue([inv("A", "envoyee")], [{ learner_id: "A", contacted_at: "2026-10-26T18:00:00Z", note: LINK_QUEUE_SMS_NOTE }], NOW);
    expect(targets[0].alreadySentAt).toBe("2026-10-26T18:00:00Z");
  });

  it("repère les numéros inutilisables", () => {
    const { targets } = pickLinkQueue([inv("A", "a_envoyer", undefined, null), inv("B", "a_envoyer", undefined, "+216 20 123 456")], [], NOW);
    expect(targets.find((t) => t.learnerId === "A")?.phoneOk).toBe(false);
    expect(targets.find((t) => t.learnerId === "B")?.phoneOk).toBe(true);
    expect(targets.find((t) => t.learnerId === "B")?.name).toBe("B Test");
  });
});

describe("SMS court du lien d'une réunion", () => {
  const LINK = "https://pef-erp.vercel.app/inscription/reunion/abc";
  // 28/10 17h00 et 29/10 10h00, heure de Paris (UTC+1 après le passage à l'heure d'hiver)
  const SLOTS = ["2026-10-29T09:00:00Z", "2026-10-28T16:00:00Z"];

  it("liste les sessions dans l'ordre, en heure de Paris", () => {
    expect(shortDatesText(SLOTS)).toBe("le 28/10 à 17h00 ou le 29/10 à 10h00");
    expect(shortDatesText(["2026-10-28T16:00:00Z"])).toBe("le 28/10 à 17h00");
    expect(shortDatesText([])).toBe("");
  });

  it("message court : dates au choix, test oral, lien, sans emoji", () => {
    const sms = buildMeetingSms({ startsAts: SLOTS, link: LINK, oralTest: true });
    expect(sms).toBe(
      `ParlerEmploi : réunion d'information sur les cours de français le 28/10 à 17h00 ou le 29/10 à 10h00, au choix. Test oral sur place. Places limitées. Inscription (2 min) : ${LINK}`,
    );
    expect(sms).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("une seule session, sans test oral : ni « au choix » ni test", () => {
    const sms = buildMeetingSms({ startsAts: ["2026-10-28T16:00:00Z"], link: LINK, oralTest: false });
    expect(sms).toBe(`ParlerEmploi : réunion d'information sur les cours de français le 28/10 à 17h00. Places limitées. Inscription (2 min) : ${LINK}`);
  });

  it("lien sms: avec le numéro international et le texte encodé", () => {
    expect(smsUrl("06 12 34 56 78", "Bonjour & à demain")).toBe("sms:+33612345678?&body=Bonjour%20%26%20%C3%A0%20demain");
    expect(smsUrl(null, "x")).toBeNull();
    expect(smsUrl("12", "x")).toBeNull();
  });
});
