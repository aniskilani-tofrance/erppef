import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_TEMPLATES, renderTemplate } from "@/lib/admission/templates";
import { SIGNUP_LOCALES, SIGNUP_TEXTS } from "@/lib/inscription/i18n";
import {
  buildMeetingSignupUrl,
  choiceDatesText,
  chooseMeetingOffer,
  staggerSentence,
  isMeetingToken,
  meetingCalendarEnd,
  meetingJournalNote,
  meetingState,
  meetingWhenText,
  oralTestSentence,
  placesLeft,
  placesSummary,
  SEATED_STATUSES,
  signupToggleTargets,
  slotOfferState,
  type PublicMeeting,
} from "@/lib/inscription/meeting";

// Les polices Google sont chargées par Next à la compilation : simples variables CSS ici.
vi.mock("next/font/google", () => ({
  Outfit: () => ({ variable: "font-titre" }),
  DM_Sans: () => ({ variable: "font-texte" }),
}));

// Les actions serveur ne sont pas appelées au rendu : on évite d'importer la base.
vi.mock("@/app/inscription/actions", () => ({
  submitSignup: vi.fn(),
  bookSignupSlot: vi.fn(),
  requestSignupCallback: vi.fn(),
}));

const { MeetingCard, SignupMeetingDone } = await import("@/components/inscription/signup-meeting");
const { SignupForm } = await import("@/components/inscription/signup-form");

const TOKEN = "3f2a9c1d4b6e8f0a1c2d3e4f5a6b7c8d";
// Samedi 7 novembre 2026, 14h00 à Paris (UTC+1 en hiver)
const STARTS = "2026-11-07T13:00:00.000Z";
const BEFORE = new Date("2026-10-26T10:00:00Z");

const meeting = (over: Partial<PublicMeeting> = {}): PublicMeeting => ({
  token: TOKEN,
  title: "Réunion d'information",
  startsAt: STARTS,
  endsAt: "2026-11-07T15:00:00.000Z",
  place: "Salle 12 — 14 rue Alexandre Bachelet, Saint-Ouen",
  access: null,
  oralTest: true,
  placesLeft: 8,
  state: "open",
  ...over,
});

const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

describe("jeton du lien de réunion", () => {
  it("accepte 32 caractères hexadécimaux, refuse le reste", () => {
    expect(isMeetingToken(TOKEN)).toBe(true);
    for (const bad of ["", "abc", TOKEN.toUpperCase(), `${TOKEN}0`, TOKEN.slice(1), "../etc/passwd", null, undefined, 42]) {
      expect(isMeetingToken(bad), String(bad)).toBe(false);
    }
  });
});

describe("places et état de l'inscription", () => {
  it("places restantes : jamais négatives, null sans maximum", () => {
    expect(placesLeft(20, 12)).toBe(8);
    expect(placesLeft(20, 20)).toBe(0);
    expect(placesLeft(20, 25)).toBe(0);
    expect(placesLeft(null, 99)).toBeNull();
  });

  it("ouverte tant qu'il reste une place et que la réunion n'a pas commencé", () => {
    const base = { signupOpen: true, startsAt: STARTS, capacity: 20, taken: 19 };
    expect(meetingState(base, BEFORE)).toBe("open");
    expect(meetingState({ ...base, taken: 20 }, BEFORE)).toBe("full");
    expect(meetingState({ ...base, taken: 31 }, BEFORE)).toBe("full");
    expect(meetingState({ ...base, capacity: null, taken: 500 }, BEFORE)).toBe("open");
  });

  it("fermée si l'équipe a fermé le lien ou si la réunion a commencé (même avec des places)", () => {
    const base = { startsAt: STARTS, capacity: 20, taken: 0 };
    expect(meetingState({ ...base, signupOpen: false }, BEFORE)).toBe("closed");
    expect(meetingState({ ...base, signupOpen: true }, new Date(STARTS))).toBe("closed");
    expect(meetingState({ ...base, signupOpen: true }, new Date("2026-11-08T09:00:00Z"))).toBe("closed");
  });

  it("résumé pour l'équipe", () => {
    expect(placesSummary(20, 12)).toBe("12 / 20 · 8 restantes");
    expect(placesSummary(20, 19)).toBe("19 / 20 · 1 restante");
    expect(placesSummary(20, 20)).toBe("20 / 20 · complet");
    expect(placesSummary(null, 1)).toBe("1 inscrit");
    expect(placesSummary(null, 3)).toBe("3 inscrits");
  });
});

describe("lien et libellés", () => {
  it("construit le lien public, avec la provenance nettoyée", () => {
    expect(buildMeetingSignupUrl("https://pef-erp.vercel.app/", TOKEN)).toBe(`https://pef-erp.vercel.app/inscription/reunion/${TOKEN}`);
    expect(buildMeetingSignupUrl("https://pef-erp.vercel.app", TOKEN, "MDQ Landy")).toBe(
      `https://pef-erp.vercel.app/inscription/reunion/${TOKEN}?src=MDQ%20Landy`,
    );
    expect(buildMeetingSignupUrl("https://x.fr", TOKEN, "  <b>  ")).not.toContain("<");
  });

  it("jour et heure traduits, à l'heure de Paris, chiffres latins", () => {
    const m = { startsAt: STARTS, endsAt: "2026-11-07T15:00:00.000Z" };
    expect(meetingWhenText(m, "fr")).toEqual({ day: "Samedi 7 novembre", time: "14h00", until: "16h00" });
    expect(meetingWhenText(m, "en")).toEqual({ day: "Saturday 7 November", time: "14:00", until: "16:00" });
    expect(meetingWhenText({ startsAt: STARTS, endsAt: null }, "ar")).toEqual({ day: "السبت 7 نوفمبر", time: "14:00", until: null });
  });

  it("agenda : fin connue, sinon deux heures après le début", () => {
    expect(meetingCalendarEnd({ startsAt: STARTS, endsAt: "2026-11-07T15:30:00.000Z" })).toBe("2026-11-07T15:30:00.000Z");
    expect(meetingCalendarEnd({ startsAt: STARTS, endsAt: null })).toBe("2026-11-07T15:00:00.000Z");
  });

  it("phrase du test oral absente si la réunion n'en comprend pas", () => {
    expect(oralTestSentence(true)).toContain("test oral");
    expect(oralTestSentence(false)).toBeNull();
  });

  it("note du journal : une phrase par résultat, avec la date", () => {
    const m = { startsAt: STARTS, oralTest: true };
    expect(meetingJournalNote("registered", m)).toBe(
      "Inscrit(e) par le lien à la réunion d'information du samedi 7 novembre 2026 à 14h00 (test oral individuel inclus)",
    );
    expect(meetingJournalNote("registered", { ...m, oralTest: false })).not.toContain("test oral");
    expect(meetingJournalNote("already", m)).toContain("Déjà inscrit(e)");
    expect(meetingJournalNote("full", m)).toContain("complète");
    expect(meetingJournalNote("closed", m)).toContain("fermée");
  });
});

describe("textes dans les trois langues", () => {
  it("chaque langue a tous les textes, avec leurs variables", () => {
    for (const l of SIGNUP_LOCALES) {
      const t = SIGNUP_TEXTS[l].meeting;
      for (const [k, v] of Object.entries(t)) {
        if (k === "introPoints") continue;
        expect((v as string).trim(), `${l}.${k}`).not.toBe("");
      }
      expect(t.introPoints, `${l}.introPoints`).toHaveLength(3);
      expect(t.introPoints.every((p) => p.trim() !== "")).toBe(true);
      expect(t.placesLeft, `${l}.placesLeft`).toContain("{n}");
      expect(t.until, `${l}.until`).toContain("{time}");
    }
  });
});

describe("carte et écrans de fin", () => {
  it("la carte montre quand, où, le test oral et les places restantes", () => {
    const out = decode(renderToStaticMarkup(createElement(MeetingCard, { meeting: meeting(), locale: "fr" })));
    expect(out).toContain("Samedi 7 novembre");
    expect(out).toContain("14h00");
    expect(out).toContain("jusqu'à 16h00");
    expect(out).toContain("Salle 12");
    expect(out).toContain(SIGNUP_TEXTS.fr.meeting.oralTest);
    expect(out).toContain("8 places restantes");
  });

  it("une seule place : formulation au singulier ; complète : pastille « Complet »", () => {
    expect(decode(renderToStaticMarkup(createElement(MeetingCard, { meeting: meeting({ placesLeft: 1 }), locale: "fr" })))).toContain("1 place restante");
    const full = decode(renderToStaticMarkup(createElement(MeetingCard, { meeting: meeting({ placesLeft: 0, state: "full" }), locale: "fr" })));
    expect(full).toContain("Complet");
    expect(full).not.toContain("places restantes");
  });

  it("sans test oral dans la réunion, la phrase n'apparaît pas", () => {
    const out = decode(renderToStaticMarkup(createElement(MeetingCard, { meeting: meeting({ oralTest: false }), locale: "fr" })));
    expect(out).not.toContain(SIGNUP_TEXTS.fr.meeting.oralTest);
  });

  it("inscrit(e) : confirmation, carte, agenda ; déjà inscrit(e) : titre dédié", () => {
    const done = decode(renderToStaticMarkup(createElement(SignupMeetingDone, { locale: "fr", confirmation: { outcome: "registered", meeting: meeting() } })));
    expect(done).toContain(SIGNUP_TEXTS.fr.meeting.doneTitle);
    expect(done).toContain("Samedi 7 novembre");
    expect(done).toContain("calendar.google.com/calendar/render");
    expect(done).toContain(SIGNUP_TEXTS.fr.meeting.cannotCome);
    // plus de « places restantes » une fois inscrit
    expect(done).not.toContain("places restantes");
    const already = decode(renderToStaticMarkup(createElement(SignupMeetingDone, { locale: "fr", confirmation: { outcome: "already", meeting: meeting() } })));
    expect(already).toContain(SIGNUP_TEXTS.fr.meeting.alreadyTitle);
  });

  it("complète ou fermée entre-temps : on garde le numéro, ni agenda ni carte de la réunion", () => {
    for (const outcome of ["full", "closed"] as const) {
      const out = decode(renderToStaticMarkup(createElement(SignupMeetingDone, { locale: "fr", confirmation: { outcome, meeting: meeting() } })));
      expect(out).toContain(SIGNUP_TEXTS.fr.meeting.waitText);
      expect(out).not.toContain("calendar.google.com");
      expect(out).not.toContain("Samedi 7 novembre");
    }
  });

  it("l'écran d'arabe est en arabe", () => {
    const out = decode(renderToStaticMarkup(createElement(SignupMeetingDone, { locale: "ar", confirmation: { outcome: "registered", meeting: meeting() } })));
    expect(out).toContain(SIGNUP_TEXTS.ar.meeting.doneTitle);
    expect(out).toContain('dir="rtl"');
  });
});

describe("formulaire ouvert par le lien d'une réunion", () => {
  const form = (m: PublicMeeting | null) =>
    decode(renderToStaticMarkup(createElement(SignupForm, { locale: "fr", orgSlug: null, src: null, stamp: "x", meeting: m })));

  it("envoie le jeton de la réunion, annonce la réunion et la carte", () => {
    const out = form(meeting());
    expect(out).toContain(`name="m" value="${TOKEN}"`);
    expect(out).toContain(SIGNUP_TEXTS.fr.meeting.title);
    expect(out).not.toContain(`>${SIGNUP_TEXTS.fr.title}<`);
    expect(out).toContain("Samedi 7 novembre");
    expect(out).toContain(SIGNUP_TEXTS.fr.meeting.oralTest);
    expect(out).toContain(SIGNUP_TEXTS.fr.meeting.introPoints[2]);
  });

  it("réunion complète : le formulaire reste ouvert, avec l'avertissement et sans « place réservée »", () => {
    const out = form(meeting({ state: "full", placesLeft: 0 }));
    expect(out).toContain(`name="m" value="${TOKEN}"`);
    expect(out).toContain(SIGNUP_TEXTS.fr.meeting.fullText);
    expect(out).not.toContain(SIGNUP_TEXTS.fr.meeting.introPoints[2]);
  });

  it("le formulaire général ne change pas : ni champ « m », ni carte", () => {
    const out = form(null);
    expect(out).not.toContain('name="m"');
    expect(out).toContain(SIGNUP_TEXTS.fr.title);
    expect(out).toContain(SIGNUP_TEXTS.fr.introPoints[2]);
    expect(out).not.toContain(SIGNUP_TEXTS.fr.meeting.oralTest);
  });
});

describe("plusieurs créneaux sur le même lien", () => {
  const slot = (n: number, over: Partial<PublicMeeting> = {}): PublicMeeting =>
    meeting({ token: `${n}`.repeat(32), startsAt: `2026-11-${String(7 + n).padStart(2, "0")}T13:00:00.000Z`, ...over });

  it("un seul créneau ouvrable : formulaire simple ; aucun : lien fermé", () => {
    expect(chooseMeetingOffer([slot(1)])).toEqual({ kind: "single", meeting: slot(1) });
    expect(chooseMeetingOffer([slot(1, { state: "closed" })])).toEqual({ kind: "closed" });
    expect(chooseMeetingOffer([])).toEqual({ kind: "closed" });
  });

  it("plusieurs créneaux ouverts : la personne choisit, du plus proche au plus lointain", () => {
    const offer = chooseMeetingOffer([slot(3), slot(1), slot(2)]);
    expect(offer.kind).toBe("choice");
    expect(offer.kind === "choice" && offer.meetings.map((m) => m.startsAt.slice(8, 10))).toEqual(["08", "09", "10"]);
  });

  it("un créneau fermé ou complet n'est pas proposé ; un seul ouvert → pas de choix", () => {
    const offer = chooseMeetingOffer([slot(1, { state: "full", placesLeft: 0 }), slot(2), slot(3, { state: "closed" })]);
    expect(offer).toEqual({ kind: "single", meeting: slot(2) });
  });

  it("tout est complet : on garde le numéro pour la prochaine réunion (le créneau le plus proche)", () => {
    const offer = chooseMeetingOffer([slot(2, { state: "full", placesLeft: 0 }), slot(1, { state: "full", placesLeft: 0 })]);
    expect(offer.kind).toBe("single");
    expect(offer.kind === "single" && offer.meeting.startsAt).toBe(slot(1).startsAt);
  });

  const form = (choices: PublicMeeting[]) =>
    decode(renderToStaticMarkup(createElement(SignupForm, { locale: "fr", orgSlug: null, src: null, stamp: "x", meeting: null, choices })));

  it("le formulaire demande « Quel jour ? » avec un choix par créneau, chacun envoyant son propre jeton", () => {
    const out = form([slot(1), slot(2, { placesLeft: 1 })]);
    expect(out).toContain(SIGNUP_TEXTS.fr.meeting.chooseQ);
    expect(out).toContain(`name="m" value="${slot(1).token}"`);
    expect(out).toContain(`name="m" value="${slot(2).token}"`);
    expect(out).toContain("Dimanche 8 novembre");
    expect(out).toContain("Lundi 9 novembre");
    expect(out).toContain("1 place restante");
    // la carte commune ne montre ni jour ni heure : ils se choisissent à l'étape suivante
    expect(out).toContain(SIGNUP_TEXTS.fr.meeting.oralTest);
    // sans JavaScript, le choix est obligatoire (radios « required »)
    expect(out).toMatch(/type="radio"[^>]*required[^>]*name="m"/);
  });

  it("sans choix, aucune question de jour : un seul champ « m » caché, comme avant", () => {
    const out = decode(renderToStaticMarkup(createElement(SignupForm, { locale: "fr", orgSlug: null, src: null, stamp: "x", meeting: meeting() })));
    expect(out).not.toContain(SIGNUP_TEXTS.fr.meeting.chooseQ);
    expect(out).not.toMatch(/type="radio"[^>]*name="m"/);
    expect(out.match(/name="m"/g)).toHaveLength(1);
  });

  it("chaque langue a la question du créneau et son message d'erreur", () => {
    for (const l of SIGNUP_LOCALES) {
      expect(SIGNUP_TEXTS[l].meeting.chooseQ.trim(), l).not.toBe("");
      expect(SIGNUP_TEXTS[l].meeting.chooseHint.trim(), l).not.toBe("");
      expect(SIGNUP_TEXTS[l].errors.slot.trim(), l).not.toBe("");
      expect(SIGNUP_TEXTS[l].meeting.testBefore.trim(), l).not.toBe("");
    }
  });
});

describe("test de niveau sur l'écran de confirmation", () => {
  const done = (testUrl: string | null) =>
    decode(renderToStaticMarkup(createElement(SignupMeetingDone, { locale: "fr", confirmation: { outcome: "registered", meeting: meeting() }, testUrl })));

  it("propose le lien personnel EN PREMIER, juste sous « Vous êtes inscrit(e) ! », avant la réunion et l'agenda", () => {
    const url = `https://pef-erp.vercel.app/test/${TOKEN}`;
    const out = done(url);
    expect(out).toContain(`href="${url}"`);
    expect(out).toContain(SIGNUP_TEXTS.fr.meeting.testBefore);
    expect(out).toContain(SIGNUP_TEXTS.fr.testCta);
    const title = out.indexOf(SIGNUP_TEXTS.fr.meeting.doneTitle);
    const test = out.indexOf(SIGNUP_TEXTS.fr.meeting.testBefore);
    expect(title).toBeLessThan(test);
    expect(test).toBeLessThan(out.indexOf("Samedi 7 novembre"));
    expect(out.indexOf(SIGNUP_TEXTS.fr.testCta)).toBeLessThan(out.indexOf("calendar.google.com"));
  });

  it("rien si la personne a déjà fait son test", () => {
    const out = done(null);
    expect(out).not.toContain(SIGNUP_TEXTS.fr.testCta);
    expect(out).not.toContain(SIGNUP_TEXTS.fr.meeting.testBefore);
  });
});

describe("créneaux d'un même lien : état, ouverture, premier inscrit premier servi", () => {
  const NOW = new Date("2026-10-26T18:00:00Z");
  const FUTURE = "2026-10-28T16:00:00Z";
  const PAST = "2026-10-20T16:00:00Z";

  it("seules les personnes confirmées ou présentes occupent une place", () => {
    expect([...SEATED_STATUSES].sort()).toEqual(["confirmee", "presente"]);
  });

  it("état de chaque créneau : proposé, complet, fermé, passé", () => {
    const base = { startsAt: FUTURE, signupOpen: true, capacity: 30, taken: 0 };
    expect(slotOfferState(base, NOW)).toBe("propose");
    expect(slotOfferState({ ...base, taken: 30 }, NOW)).toBe("complet");
    expect(slotOfferState({ ...base, signupOpen: false }, NOW)).toBe("ferme");
    expect(slotOfferState({ ...base, startsAt: PAST }, NOW)).toBe("passe");
    expect(slotOfferState({ ...base, startsAt: PAST, signupOpen: false }, NOW)).toBe("passe");
  });

  it("ouvrir le lien ouvre TOUS les créneaux à venir ; fermer ferme tout", () => {
    const slots = [
      { id: "a", startsAt: FUTURE, capacity: 30 },
      { id: "b", startsAt: "2026-10-29T09:00:00Z", capacity: 30 },
      { id: "passe", startsAt: PAST, capacity: 10 },
    ];
    expect(signupToggleTargets(slots, true, NOW)).toEqual({ ok: true, ids: ["a", "b"] });
    expect(signupToggleTargets(slots, false, NOW)).toEqual({ ok: true, ids: ["a", "b", "passe"] });
  });

  it("ouvrir refuse un créneau à venir sans maximum de places, ou une série toute passée", () => {
    expect(signupToggleTargets([{ id: "a", startsAt: FUTURE, capacity: 30 }, { id: "b", startsAt: FUTURE, capacity: null }], true, NOW)).toEqual({
      ok: false,
      reason: "capacity",
      missing: 1,
    });
    expect(signupToggleTargets([{ id: "a", startsAt: PAST, capacity: 30 }], true, NOW)).toEqual({ ok: false, reason: "started", missing: 0 });
  });

  // Faux client Supabase : juste ce que loadMeetingOffer appelle (select().or() et select().eq()).
  type Row = Record<string, unknown>;
  const row = (over: Row): Row => ({
    id: "x",
    org_id: "org",
    signup_token: "0".repeat(32),
    series_token: null,
    title: "Réunion d'information",
    starts_at: FUTURE,
    ends_at: null,
    location: "Salle 12",
    capacity: 30,
    signup_open: true,
    oral_test_included: true,
    rooms: null,
    org: { slug: "pef" },
    info_meeting_invitations: [],
    ...over,
  });
  const fakeAdmin = (rows: Row[]) =>
    ({
      from: () => ({
        select: () => ({
          or: (expr: string) => {
            const value = expr.split(",")[0].split(".eq.")[1];
            return { data: rows.filter((r) => r.signup_token === value || r.series_token === value), error: null };
          },
          eq: (col: string, value: unknown) => ({ data: rows.filter((r) => r[col] === value), error: null }),
        }),
      }),
    }) as never;

  const SERIES = "5".repeat(32);
  const A = "a".repeat(32);
  const B = "b".repeat(32);
  const C = "c".repeat(32);
  const rows = [
    // Créneau d'origine : 95 convoqués à la main, aucun n'a confirmé → 30 places libres
    row({ id: "A", signup_token: A, series_token: SERIES, info_meeting_invitations: Array.from({ length: 95 }, () => ({ status: "a_envoyer" })) }),
    row({ id: "B", signup_token: B, series_token: SERIES, starts_at: "2026-10-29T09:00:00Z", info_meeting_invitations: [{ status: "confirmee" }, { status: "envoyee" }] }),
    row({ id: "C", signup_token: C }), // réunion seule
  ];

  it("le lien commun donne tous les créneaux, du plus proche au plus lointain", async () => {
    const { loadMeetingOffer } = await import("@/lib/inscription/meeting-server");
    const offer = await loadMeetingOffer(fakeAdmin(rows), SERIES, NOW);
    expect(offer?.meetings.map((m) => m.token)).toEqual([A, B]);
  });

  it("le lien PROPRE d'un créneau (copié avant l'ajout des autres) donne aussi toute la série", async () => {
    const { loadMeetingOffer } = await import("@/lib/inscription/meeting-server");
    expect((await loadMeetingOffer(fakeAdmin(rows), A, NOW))?.meetings.map((m) => m.token)).toEqual([A, B]);
    expect((await loadMeetingOffer(fakeAdmin(rows), B, NOW))?.meetings.map((m) => m.token)).toEqual([A, B]);
  });

  it("une réunion seule reste seule ; un lien inconnu ne donne rien", async () => {
    const { loadMeetingOffer } = await import("@/lib/inscription/meeting-server");
    expect((await loadMeetingOffer(fakeAdmin(rows), C, NOW))?.meetings.map((m) => m.token)).toEqual([C]);
    expect(await loadMeetingOffer(fakeAdmin(rows), "d".repeat(32), NOW)).toBeNull();
  });

  it("95 convoqués sans réponse n'occupent aucune des 30 places : les deux sessions sont proposées au choix", async () => {
    const { loadMeetingOffer } = await import("@/lib/inscription/meeting-server");
    const offer = await loadMeetingOffer(fakeAdmin(rows), SERIES, NOW);
    const [a, b] = offer!.meetings;
    expect(a.placesLeft).toBe(30);
    expect(a.state).toBe("open");
    expect(b.placesLeft).toBe(29); // une confirmée, une envoyée sans réponse
    expect(chooseMeetingOffer(offer!.meetings).kind).toBe("choice");
  });

  it("le bac à sable n'est jamais servi", async () => {
    const { loadMeetingOffer } = await import("@/lib/inscription/meeting-server");
    expect(await loadMeetingOffer(fakeAdmin([row({ signup_token: C, org: { slug: "bac-a-sable" } })]), C, NOW)).toBeNull();
  });
});

describe("accueil échelonné : chaque inscrit reçoit son heure", () => {
  it("l'écran de fin donne SON heure, en grand, et la carte la reprend", () => {
    const out = decode(
      renderToStaticMarkup(
        createElement(SignupMeetingDone, {
          locale: "fr",
          confirmation: { outcome: "registered", meeting: meeting({ staggered: true }), convocationAt: "2026-11-07T13:20:00.000Z" },
        }),
      ),
    );
    expect(out).toContain("Votre heure : 14h20");
    expect(out).toContain("Samedi 7 novembre");
    expect(out).not.toContain("14h00");
    // l'agenda commence à son heure
    expect(out).toContain("dates=20261107T132000Z");
  });

  it("sans heure attribuée, l'écran reste celui de la réunion", () => {
    const out = decode(renderToStaticMarkup(createElement(SignupMeetingDone, { locale: "fr", confirmation: { outcome: "registered", meeting: meeting() } })));
    expect(out).not.toContain("Votre heure");
    expect(out).toContain("14h00");
  });

  it("avant l'inscription, la carte annonce que chacun aura son heure", () => {
    const out = decode(renderToStaticMarkup(createElement(MeetingCard, { meeting: meeting({ staggered: true }), locale: "fr" })));
    expect(out).toContain(SIGNUP_TEXTS.fr.meeting.staggered);
    expect(decode(renderToStaticMarkup(createElement(MeetingCard, { meeting: meeting(), locale: "fr" })))).not.toContain(SIGNUP_TEXTS.fr.meeting.staggered);
  });

  it("chaque langue a les textes de l'heure de passage", () => {
    for (const l of SIGNUP_LOCALES) {
      expect(SIGNUP_TEXTS[l].meeting.yourTime, l).toContain("{time}");
      expect(SIGNUP_TEXTS[l].meeting.staggered.trim(), l).not.toBe("");
    }
  });

  it("registerForMeeting rend l'heure attribuée par la base", async () => {
    const { registerForMeeting } = await import("@/lib/inscription/meeting-server");
    const rpc = (data: unknown) => ({ rpc: async () => ({ data, error: null }) }) as never;
    expect(await registerForMeeting(rpc({ result: "registered", token: TOKEN, convocation_at: "2026-11-07T13:20:00+00:00" }), TOKEN, "l")).toEqual({
      outcome: "registered",
      token: TOKEN,
      convocationAt: "2026-11-07T13:20:00+00:00",
    });
    expect(await registerForMeeting(rpc({ result: "full" }), TOKEN, "l")).toEqual({ outcome: "full", token: null, convocationAt: null });
    expect(await registerForMeeting(rpc({ result: "not_found" }), TOKEN, "l")).toBeNull();
  });
});

describe("migration 0058 : accueil échelonné", () => {
  const sql = readFileSync("supabase/migrations/20261026000058_reunion_accueil_echelonne.sql", "utf8");

  it("ajoute les deux réglages, bornés", () => {
    expect(sql).toMatch(/add column if not exists stagger_minutes smallint/);
    expect(sql).toMatch(/add column if not exists stagger_parallel smallint/);
    expect(sql).toMatch(/stagger_minutes between 5 and 120/);
    expect(sql).toMatch(/stagger_parallel between 1 and 20/);
  });

  it("donne la première heure qui a moins de K personnes confirmées, sous verrou, et la renvoie", () => {
    expect(sql).toMatch(/for update/);
    expect(sql).toMatch(/< coalesce\(m\.stagger_parallel, 1\)/);
    expect(sql).toMatch(/'convocation_at', coalesce\(seat_at, existing\.convocation_at\)/);
  });

  it("garde les règles de 0057 et reste appelable par le seul serveur", () => {
    expect(sql).toMatch(/where meeting_id = m\.id and status in \('confirmee', 'presente'\)/);
    expect(sql).toMatch(/revoke all on function public\.signup_for_info_meeting\(text, uuid\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.signup_for_info_meeting\(text, uuid\) to service_role/);
  });
});

describe("migration 0057 : premier inscrit, premier servi", () => {
  const sql = readFileSync("supabase/migrations/20261026000057_reunion_premier_inscrit.sql", "utf8");

  it("ne compte que les personnes confirmées ou présentes, sous verrou du créneau", () => {
    expect(sql).toMatch(/where signup_token = p_token for update/);
    expect(sql).toMatch(/where meeting_id = m\.id and status in \('confirmee', 'presente'\)/);
  });

  it("une place par personne sur un même lien, et les convocations en attente des autres créneaux disparaissent", () => {
    expect(sql).toMatch(/o\.series_token = m\.series_token[\s\S]*i\.status in \('confirmee', 'presente'\)/);
    expect(sql).toMatch(/delete from public\.info_meeting_invitations i[\s\S]*i\.status in \('a_envoyer', 'envoyee'\)/);
  });

  it("reste appelable par le seul serveur", () => {
    expect(sql).toMatch(/revoke all on function public\.signup_for_info_meeting\(text, uuid\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.signup_for_info_meeting\(text, uuid\) to service_role/);
  });
});

describe("message du lien commun à plusieurs sessions", () => {
  const dates = ["mercredi 28 octobre 2026 à 17h00 (jusqu'à 18h30)", "jeudi 29 octobre 2026 à 10h00 (jusqu'à 12h00)"];

  it("une session : sa date ; plusieurs : « Au choix » puis une ligne par session", () => {
    expect(choiceDatesText([dates[0]])).toBe(dates[0]);
    expect(choiceDatesText(dates)).toBe(`Au choix :\n• ${dates[0]}\n• ${dates[1]}`);
    expect(choiceDatesText([])).toBe("");
  });

  it("le message liste les deux sessions, l'heure de passage et le lieu sans doublon", async () => {
    const { formatMeetingPlace } = await import("@/lib/admission/messages");
    const out = renderTemplate(DEFAULT_TEMPLATES.lien_reunion, {
      organisme: "Parler Emploi Formation",
      date: choiceDatesText(dates),
      heure_passage: staggerSentence(10),
      lieu: formatMeetingPlace("Salle 13", "Salle 13 - 14 rue Alexandre Bachelet 93400 Saint-Ouen"),
      test_oral: oralTestSentence(true),
      lien_inscription: `https://pef-erp.vercel.app/inscription/reunion/${TOKEN}`,
    });
    expect(out).toContain(`📅 Au choix :\n• ${dates[0]}\n• ${dates[1]}\n🕒 Chacun reçoit son heure de passage en s'inscrivant (une arrivée toutes les 10 minutes).`);
    expect(out).toContain("📍 Salle 13 - 14 rue Alexandre Bachelet 93400 Saint-Ouen");
    expect(out).not.toContain("Salle 13 — Salle 13");
  });

  it("sans accueil échelonné, pas de ligne d'heure de passage", () => {
    expect(staggerSentence(null)).toBeNull();
    const out = renderTemplate(DEFAULT_TEMPLATES.lien_reunion, { date: dates[0], heure_passage: staggerSentence(null), lieu: "Salle 12" });
    expect(out).not.toContain("heure de passage");
    expect(out).toContain(`📅 ${dates[0]}\n📍 Salle 12`);
  });

  it("lieu : la salle et l'adresse, sans répéter la salle", async () => {
    const { formatMeetingPlace } = await import("@/lib/admission/messages");
    expect(formatMeetingPlace("Salle 12", "14 rue Alexandre Bachelet, Saint-Ouen")).toBe("Salle 12 — 14 rue Alexandre Bachelet, Saint-Ouen");
    expect(formatMeetingPlace("Salle 12", null, "14 rue Bachelet")).toBe("Salle 12 — 14 rue Bachelet");
    expect(formatMeetingPlace("Salle 12", null, null)).toBe("Salle 12");
    expect(formatMeetingPlace(null, "Maison de quartier Landy")).toBe("Maison de quartier Landy");
    expect(formatMeetingPlace("salle 13", "Salle 13 - 14 rue Bachelet")).toBe("Salle 13 - 14 rue Bachelet");
  });
});

describe("message WhatsApp du lien de réunion", () => {
  const vars = {
    organisme: "Parler Emploi Formation",
    date: "samedi 7 novembre 2026 à 14h00",
    lieu: "Salle 12 — 14 rue Alexandre Bachelet, Saint-Ouen",
    lien_inscription: `https://pef-erp.vercel.app/inscription/reunion/${TOKEN}`,
  };

  it("remplit la date, le lieu, le test oral et le lien", () => {
    const out = renderTemplate(DEFAULT_TEMPLATES.lien_reunion, { ...vars, test_oral: oralTestSentence(true) });
    expect(out).toContain("📅 samedi 7 novembre 2026 à 14h00");
    expect(out).toContain("📍 Salle 12");
    expect(out).toContain("test oral");
    expect(out).toContain(vars.lien_inscription);
    expect(out).toContain("English:");
    expect(out).toContain("العربية:");
    expect(out).not.toMatch(/\{[a-z_]+\}/);
  });

  it("sans test oral, la ligne disparaît sans laisser de trou", () => {
    const out = renderTemplate(DEFAULT_TEMPLATES.lien_reunion, { ...vars, test_oral: oralTestSentence(false) });
    expect(out).not.toContain("test oral");
    expect(out).not.toMatch(/\n\n\n/);
    expect(out).toContain("📍 Salle 12");
  });
});

describe("migration 0056 : garde-fous", () => {
  const sql = readFileSync("supabase/migrations/20261026000056_reunion_inscription_publique.sql", "utf8");

  it("verrouille la réunion le temps du comptage (le dernier siège ne se vend qu'une fois)", () => {
    expect(sql).toMatch(/from public\.info_meetings where signup_token = p_token for update/);
    expect(sql).toMatch(/count\(\*\) into taken/);
    expect(sql).toMatch(/taken >= m\.capacity/);
  });

  it("n'est appelable que par le serveur (service_role)", () => {
    expect(sql).toMatch(/revoke all on function public\.signup_for_info_meeting\(text, uuid\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.signup_for_info_meeting\(text, uuid\) to service_role/);
    expect(sql).toMatch(/security definer\s+set search_path = ''/);
  });

  it("impose un maximum de places pour ouvrir le lien, et un jeton unique", () => {
    expect(sql).toMatch(/check \(not signup_open or capacity is not null\)/);
    expect(sql).toMatch(/create unique index if not exists info_meetings_signup_token_key/);
  });

  it("ajoute l'heure de convocation par personne et le jeton commun des créneaux", () => {
    expect(sql).toMatch(/add column if not exists convocation_at timestamptz/);
    expect(sql).toMatch(/add column if not exists series_token text/);
  });

  it("une personne excusée ou absente ne prend pas de place", () => {
    expect(sql).toMatch(/status not in \('excusee', 'absente'\)/);
  });
});
