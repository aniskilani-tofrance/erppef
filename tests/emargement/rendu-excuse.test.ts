import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Rendu serveur des écrans, sans base : les Server Actions et le routeur sont simulés.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("@/app/(app)/seances/actions", () => ({
  closeAttendanceSheet: async () => ({ ok: true }),
  depositSheetToDrive: async () => ({ ok: true, link: null }),
  excuseClosedAbsence: async () => ({ ok: true }),
  openAttendanceSheet: async () => ({ ok: true }),
  reopenAttendanceSheet: async () => ({ ok: true }),
  setAttendanceStatus: async () => ({ ok: true }),
}));
vi.mock("@/app/(app)/dashboard/actions", () => ({ logAbsenceFollowup: async () => ({ ok: true }) }));
vi.mock("@/components/assistant/followup-draft-button", () => ({ FollowupDraftButton: () => null }));

const { AttendanceManager } = await import("@/components/emargement/attendance-manager");
const { AbsenceFollowupsCard } = await import("@/components/dashboard/absence-followups");

const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
type ManagerProps = Parameters<typeof AttendanceManager>[0];
const html = (props: Partial<ManagerProps>) =>
  decode(
    renderToStaticMarkup(
      createElement(AttendanceManager, {
        sessionId: "s1",
        learners: [],
        isOpen: true,
        closedAt: null,
        trainerSignature: null,
        canReopen: false,
        publicUrl: null,
        qrDataUrl: null,
        ...props,
      }),
    ),
  );

const learners: ManagerProps["learners"] = [
  { id: "l1", name: "Ahmed Karimi", status: "present", signedAt: "2026-10-26T07:04:00Z", hasSignature: true },
  { id: "l2", name: "Fatima Benali", status: "excuse", signedAt: null, hasSignature: false, excuseReason: "rendez-vous médical", excuseTrace: "excusé le 26/10 par Nadia" },
  { id: "l3", name: "Omar Diallo", status: "absent", signedAt: null, hasSignature: false },
];

// Une ligne de la liste, isolée par le nom de la personne
const rowOf = (out: string, name: string) => {
  const start = out.indexOf(name);
  const end = out.indexOf("</li>", start);
  return out.slice(start, end);
};

describe("feuille ouverte", () => {
  it("bouton « Excusé » sur les lignes non signées, badge, motif et trace", () => {
    const out = html({ learners });
    expect(rowOf(out, "Fatima Benali")).toContain(">Excusé<");
    expect(rowOf(out, "Fatima Benali")).toContain("Motif : rendez-vous médical");
    expect(rowOf(out, "Fatima Benali")).toContain("excusé le 26/10 par Nadia");
    expect(rowOf(out, "Omar Diallo")).toContain(">Excusé<");
    // Signé : ni « Présent » ni « Excusé » proposés
    expect(rowOf(out, "Ahmed Karimi")).not.toContain(">Excusé<");
    // Badge bleu, pas le rouge de l'absence
    expect(rowOf(out, "Fatima Benali")).toContain("bg-sky-50");
  });

  it("une ligne « Excusé » a un statut : elle ne sera pas marquée absente à la clôture", () => {
    const out = html({ learners: learners.slice(0, 2) });
    expect(out).toContain("Tous les apprenants ont une signature ou un statut.");
  });
});

describe("feuille clôturée", () => {
  it("coordination : « Excuser » sur une ligne « Absent », « Remettre « Absent » » sur une ligne excusée, rien sur une présence", () => {
    const out = html({ learners, isOpen: false, closedAt: "2026-10-26T11:00:00Z", canReopen: true, canExcuseClosed: true });
    expect(rowOf(out, "Omar Diallo")).toContain(">Excuser<");
    expect(rowOf(out, "Fatima Benali")).toContain("Remettre « Absent »");
    expect(rowOf(out, "Fatima Benali")).toContain("Modifier le motif");
    expect(rowOf(out, "Ahmed Karimi")).not.toContain("Excuser");
    expect(rowOf(out, "Ahmed Karimi")).not.toContain("Remettre");
    // Plus de boutons de saisie normale après la clôture
    expect(out).not.toContain(">Retard<");
  });

  it("formatrice : aucun bouton d'excuse, seulement l'indication de prévenir la coordination", () => {
    const out = html({ learners, isOpen: false, closedAt: "2026-10-26T11:00:00Z", canReopen: false, canExcuseClosed: false });
    expect(out).not.toContain(">Excuser<");
    expect(out).not.toContain("Remettre « Absent »");
    expect(out).toContain("La coordination peut l'excuser sans rouvrir la feuille.");
    // Le statut et le motif restent visibles
    expect(rowOf(out, "Fatima Benali")).toContain("Motif : rendez-vous médical");
  });
});

describe("« Absents à relancer »", () => {
  it("chaque ligne propose « Excuser » à côté de WhatsApp et Appelé(e)", () => {
    const out = decode(
      renderToStaticMarkup(
        createElement(AbsenceFollowupsCard, {
          senderFirstName: "Nadia",
          items: [{
            learnerId: "l3", firstName: "Omar", lastName: "Diallo", phone: "06 12 34 56 78", groupName: "Cours municipaux A1",
            sessionId: "s1", missedAt: "2026-10-23T07:00:00Z", streak: 1, nextSession: null,
          }],
        }),
      ),
    );
    expect(out).toContain("Absents à relancer (1)");
    expect(out).toContain(">Excuser<");
    expect(out).toContain("Elle avait prévenu ? « Excuser »");
  });
});
