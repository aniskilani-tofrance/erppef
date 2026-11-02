import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Rendu serveur de la carte « Groupe WhatsApp de la classe », sans base : les Server Actions et le
// routeur sont simulés.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("@/app/(app)/groupes/actions", () => ({
  prepareGroupWhatsAppInvites: async () => ({ ok: false, error: "non appelé" }),
  markGroupWhatsAppInviteSent: async () => ({ ok: false, error: "non appelé" }),
}));

const { WhatsAppGroupCard } = await import("@/components/groupes/whatsapp-group-card");

const roster = { toAdd: [], toRemove: [], refused: [], notAsked: [] };
const card = (url: string | null, canWrite: boolean) =>
  renderToStaticMarkup(createElement(WhatsAppGroupCard, { groupId: "g1", url, qrDataUrl: null, roster, canWrite })).replace(/<!-- -->/g, "");

describe("carte « Groupe WhatsApp de la classe » — inviter tout le groupe", () => {
  it("coordination, lien enregistré : le bouton « Inviter tout le groupe » est là", () => {
    expect(card("https://chat.whatsapp.com/AbCdEfGh123456", true)).toContain("Inviter tout le groupe");
  });

  it("formatrice (lecture seule) : pas de bouton d'envoi", () => {
    expect(card("https://chat.whatsapp.com/AbCdEfGh123456", false)).not.toContain("Inviter tout le groupe");
  });

  it("pas encore de lien : pas de bouton, la carte explique où coller le lien", () => {
    const out = card(null, true);
    expect(out).not.toContain("Inviter tout le groupe");
    expect(out).toContain("Inviter via un lien");
  });
});
