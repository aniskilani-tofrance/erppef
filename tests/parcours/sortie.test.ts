import { describe, expect, it } from "vitest";
import { describeLeaveReason, describeTrace, exitTrace, formatLeaveReason, suggestDropout } from "@/lib/parcours/sortie";
import { buildRuptures, rupturesCsv, schoolYearStart, type RuptureEnrollment } from "@/lib/parcours/registre";

// Séances à 9 h (Paris) les 2, 3, 9, 10 et 16 novembre 2026.
const S = (d: string) => `2026-11-${d}T08:00:00Z`;

describe("motif de sortie", () => {
  it("enregistre le code, ou « autre : précision » (précision obligatoire pour autre)", () => {
    expect(formatLeaveReason("emploi", "")).toBe("emploi");
    expect(formatLeaveReason("sante", "  opération  ")).toBe("sante : opération");
    expect(formatLeaveReason("autre", "  ")).toBeNull();
    expect(formatLeaveReason("autre", "parti au pays")).toBe("autre : parti au pays");
  });

  it("libellé lisible ; anciennes sorties sans motif ou en texte libre", () => {
    expect(describeLeaveReason("injoignable")).toBe("Injoignable après relances");
    expect(describeLeaveReason("sante : opération")).toBe("Raison de santé (opération)");
    expect(describeLeaveReason("autre : parti au pays")).toBe("Autre (parti au pays)");
    expect(describeLeaveReason(null)).toBe("motif non renseigné");
    expect(describeLeaveReason("trouvé du travail")).toBe("trouvé du travail");
  });
});

describe("trace avant la sortie", () => {
  const att = [
    { startsAt: S("02"), status: "present" },
    { startsAt: S("03"), status: "absent" },
    { startsAt: S("09"), status: "excuse" }, // excusée : ignorée, ne casse pas la série
    { startsAt: S("10"), status: "absent" },
    { startsAt: S("16"), status: "absent" },
  ];
  const contacts = [
    { contactedAt: "2026-10-20T09:00:00Z" }, // avant la série : pas une relance de cette série
    { contactedAt: "2026-11-04T09:00:00Z" },
    { contactedAt: "2026-11-11T09:00:00Z" },
    { contactedAt: "2026-11-25T09:00:00Z" }, // après la sortie : ignoré
  ];

  it("dernière présence, absences de suite, relances depuis la première absence et jusqu'à la sortie", () => {
    const t = exitTrace(att, contacts, "2026-11-20");
    expect(t).toEqual({ lastPresenceOn: "2026-11-02", absencesInRow: 3, relances: ["2026-11-04T09:00:00Z", "2026-11-11T09:00:00Z"] });
    expect(describeTrace(t)).toBe("3 absences de suite · 2 relances (04/11, 11/11) · dernière présence le 02/11/2026");
  });

  it("suggestion « passer en abandon » : 3 absences ET 2 relances ; pas avant", () => {
    expect(suggestDropout(exitTrace(att, contacts))).toBe(true);
    expect(suggestDropout(exitTrace(att, contacts.slice(0, 2)))).toBe(false); // une seule relance
    expect(suggestDropout(exitTrace(att.slice(0, 4), contacts))).toBe(false); // 2 absences
  });

  it("revenu en cours : la série repart de zéro", () => {
    const t = exitTrace([...att, { startsAt: S("17"), status: "retard" }], contacts);
    expect(t.absencesInRow).toBe(0);
    expect(t.relances).toEqual([]);
    expect(describeTrace(t)).toBe("aucune relance notée · dernière présence le 17/11/2026");
  });
});

describe("registre des ruptures de parcours", () => {
  const e = (over: Partial<RuptureEnrollment>): RuptureEnrollment => ({
    learnerId: "a", learnerName: "Awa Diallo", learnerNo: 7, groupId: "g1", groupName: "PEF A1", status: "inscrit", leftOn: null, leaveReason: null, ...over,
  });

  it("abandons de la période seulement, plus récents d'abord ; taux par groupe", () => {
    const { rows, groups } = buildRuptures(
      [
        e({ learnerId: "a", status: "abandon", leftOn: "2026-11-20", leaveReason: "injoignable" }),
        e({ learnerId: "b", learnerName: "Bao", learnerNo: 8, status: "abandon", leftOn: "2026-06-10", leaveReason: "emploi" }), // année précédente
        e({ learnerId: "c", learnerName: "Cem", learnerNo: 9, status: "abandon", leftOn: "2026-10-05", leaveReason: null }),
        e({ learnerId: "d", learnerName: "Dina", learnerNo: 10 }),
        e({ learnerId: "f", learnerName: "Fay", learnerNo: 11, groupId: "g2", groupName: "Cordon" }),
      ],
      [{ learnerId: "a", groupId: "g1", startsAt: S("03"), status: "absent" }, { learnerId: "a", groupId: "g2", startsAt: S("02"), status: "present" }],
      [{ learnerId: "a", contactedAt: "2026-11-04T09:00:00Z" }],
      "2026-09-01",
    );
    expect(rows.map((r) => [r.leftOn, r.learnerRef, r.reason])).toEqual([
      ["2026-11-20", "A-0007", "Injoignable après relances"],
      ["2026-10-05", "A-0009", "motif non renseigné"],
    ]);
    expect(rows[0].trace).toEqual({ lastPresenceOn: null, absencesInRow: 1, relances: ["2026-11-04T09:00:00Z"] }); // présence d'un AUTRE groupe ignorée
    expect(groups).toEqual([{ groupName: "PEF A1", total: 4, abandons: 2, rate: 50 }]);
  });

  it("export tableur : BOM, en-tête, dates lisibles, relances datées", () => {
    const { rows } = buildRuptures([e({ status: "abandon", leftOn: "2026-11-20", leaveReason: "injoignable" })], [], [], "2026-09-01");
    const lines = rupturesCsv(rows).replace(/^﻿/, "").split("\r\n");
    expect(rupturesCsv(rows).startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe("Date de sortie;N°;Apprenant;Groupe;Motif;Absences de suite;Relances (dates);Dernière présence");
    expect(lines[1]).toBe("20/11/2026;A-0007;Awa Diallo;PEF A1;Injoignable après relances;0;aucune;aucune");
  });

  it("début de l'année de formation : 1er septembre (heure de Paris)", () => {
    expect(schoolYearStart(new Date("2026-11-18T10:00:00Z"))).toBe("2026-09-01");
    expect(schoolYearStart(new Date("2027-03-01T10:00:00Z"))).toBe("2026-09-01");
    expect(schoolYearStart(new Date("2027-08-31T21:59:00Z"))).toBe("2026-09-01");
  });
});
