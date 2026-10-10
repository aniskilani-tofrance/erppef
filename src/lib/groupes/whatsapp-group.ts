// Groupe WhatsApp de la classe. PUR : la page charge, ce module décide.
//   - lien d'invitation : seul un lien chat.whatsapp.com est accepté ;
//   - qui ajouter / retirer : d'après l'inscription ET le consentement de chaque personne ;
//   - texte pour le groupe : le français puis chaque traduction, à coller dans le groupe d'annonces.

const INVITE_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{8,}$/;

export function normalizeWhatsAppGroupLink(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  const url = withScheme.replace(/^http:\/\//i, "https://").replace(/^https:\/\/(www\.)?/i, "https://").replace(/\/+$/, "").split(/[?#]/)[0];
  return INVITE_RE.test(url) ? url : null;
}

export function isWhatsAppGroupLink(url: string | null | undefined): boolean {
  return Boolean(url && INVITE_RE.test(url));
}

export type RosterMember = {
  learnerId: string;
  name: string;
  phone: string | null;
  status: "inscrit" | "abandon" | "termine";
  consent: boolean | null; // null = pas encore demandé
};

export type WhatsAppRoster = {
  toAdd: RosterMember[]; // inscrits qui ont accepté → à ajouter au groupe
  toRemove: RosterMember[]; // partis (abandon, terminé) qui avaient accepté → à retirer du groupe
  refused: RosterMember[]; // inscrits qui ont refusé → jamais ajoutés
  notAsked: RosterMember[]; // inscrits à qui on n'a pas encore demandé
};

export function whatsappGroupRoster(members: RosterMember[]): WhatsAppRoster {
  const byName = (a: RosterMember, b: RosterMember) => a.name.localeCompare(b.name, "fr");
  return {
    toAdd: members.filter((m) => m.status === "inscrit" && m.consent === true).sort(byName),
    toRemove: members.filter((m) => m.status !== "inscrit" && m.consent === true).sort(byName),
    refused: members.filter((m) => m.status === "inscrit" && m.consent === false).sort(byName),
    notAsked: members.filter((m) => m.status === "inscrit" && m.consent === null).sort(byName),
  };
}

// Message collectif : français d'abord, puis chaque traduction (une seule fois par langue).
export function groupBroadcastText(fr: string, translations: { language: string; text: string }[]): string {
  const seen = new Set<string>();
  const parts = [fr.trim()];
  for (const t of translations) {
    const key = t.language.trim().toLowerCase();
    const text = t.text.trim();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    parts.push(text);
  }
  return parts.join("\n\n");
}
