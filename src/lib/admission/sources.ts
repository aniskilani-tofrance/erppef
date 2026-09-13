import { CONTACT_SOURCES } from "@/lib/referentiels";

// Provenance d'un apprenant, lue d'un coup d'œil : la PASTILLE code la FAMILLE de provenance
// (ce qui compte pour l'orientation), le texte donne le canal et sa précision.
//   • Maison de quartier  → orienté par une maison de quartier (chez PEF : cours municipaux BOP104)
//   • Contact direct      → a contacté l'association lui-même (chez PEF : cours PEF A1 / A2)
//   • Prescripteur        → France Travail, mission locale, CCAS, association partenaire…
//   • Non renseigné       → pastille creuse : à compléter sur la fiche
// La famille se déduit du canal « Nous a contactés par » (contact_source) et, à défaut, du
// champ Prescripteur en texte libre (« MDQ », « MDQ Landy », « France Travail », « asso »…),
// ce que l'équipe saisit déjà depuis le tableur : aucune reprise de données n'est nécessaire.

export type ContactSourceCode = (typeof CONTACT_SOURCES)[number]["code"];
export type SourceFamily = "quartier" | "direct" | "prescripteur" | "nc";

export type FamilyStyle = { family: SourceFamily; label: string; color: string; hollow: boolean; hint: string };

export const FAMILIES: Record<SourceFamily, FamilyStyle> = {
  quartier: { family: "quartier", label: "Maison de quartier", color: "#1e3a8a", hollow: false, hint: "orienté par une maison de quartier (cours municipaux)" },
  direct: { family: "direct", label: "Contact direct", color: "#16a34a", hollow: false, hint: "a contacté l'association directement (accueil, téléphone, WhatsApp, site, bouche-à-oreille…)" },
  prescripteur: { family: "prescripteur", label: "Prescripteur / partenaire", color: "#f97316", hollow: false, hint: "France Travail, mission locale, CCAS, association partenaire…" },
  nc: { family: "nc", label: "Non renseigné", color: "#d4d4d8", hollow: true, hint: "ni canal ni prescripteur : à compléter sur la fiche" },
};

export const FAMILY_ORDER: SourceFamily[] = ["quartier", "direct", "prescripteur", "nc"];

const FAMILY_OF_CHANNEL: Record<ContactSourceCode, SourceFamily> = {
  maison_de_quartier: "quartier",
  passage_accueil: "direct",
  telephone: "direct",
  whatsapp: "direct",
  email: "direct",
  site_web: "direct",
  bouche_a_oreille: "direct",
  reseaux_sociaux: "direct",
  affiche_flyer: "direct",
  france_travail: "prescripteur",
  partenaire: "prescripteur",
  autre: "nc",
};

export function familyOfChannel(code: string | null | undefined): SourceFamily {
  return (FAMILY_OF_CHANNEL as Record<string, SourceFamily>)[code ?? ""] ?? "nc";
}

export type SourceStyle = { code: string; label: string; color: string; hollow: boolean; family: SourceFamily };

/** Style d'un canal : sa couleur est celle de sa famille (code inconnu ou vide = non renseigné). */
export function sourceStyle(code: string | null | undefined): SourceStyle {
  const found = CONTACT_SOURCES.find((s) => s.code === code);
  if (!found) return { code: "nc", label: "Non renseigné", color: FAMILIES.nc.color, hollow: true, family: "nc" };
  const family = FAMILY_OF_CHANNEL[found.code];
  const f = FAMILIES[family];
  return { code: found.code, label: found.label, color: f.color, hollow: f.hollow, family };
}

/** Tous les canaux avec leur couleur, puis « Non renseigné » (ordre du référentiel). */
export function allSourceStyles(): SourceStyle[] {
  return [...CONTACT_SOURCES.map((s) => sourceStyle(s.code)), sourceStyle(null)];
}

export type ProvenanceInput = {
  contact_source?: string | null;
  contact_source_detail?: string | null;
  prescriber?: string | null;
};

export type Provenance = {
  family: SourceFamily;
  channel: ContactSourceCode | null;
  label: string; // canal (« Maison de quartier », « WhatsApp »…) ou « Contact direct » / « Non renseigné »
  detail: string | null; // précision : laquelle, qui, quelle agence…
  text: string; // label + détail, pour l'affichage sous le nom
  title: string; // infobulle complète
  color: string;
  hollow: boolean;
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const clean = (s: string | null | undefined) => {
  const v = s?.replace(/\s+/g, " ").trim();
  return v ? v : null;
};

const MDQ_RE = /\b(mdq|maisons? (?:de|du) quartier|centre social)\b/;

/** Ce que l'équipe a tapé dans « Prescripteur », traduit en famille + canal + précision. */
function fromPrescriber(raw: string): Pick<Provenance, "family" | "channel" | "label" | "detail"> {
  const p = norm(raw);
  if (MDQ_RE.test(p)) {
    // « MDQ Landy » → précision « Landy » (on retire le mot-clé du texte d'origine)
    const detail = clean(raw.replace(/\b(MDQ|mdq|[Mm]aisons? (?:de|du) [Qq]uartier|[Cc]entre social)\b/g, "").replace(/^[\s:—–-]+|[\s:—–-]+$/g, ""));
    return { family: "quartier", channel: "maison_de_quartier", label: "Maison de quartier", detail };
  }
  if (/france travail|pole emploi/.test(p)) return { family: "prescripteur", channel: "france_travail", label: "France Travail", detail: null };
  if (/mission locale|ccas|partenaire|assistante sociale|cip\b|mairie/.test(p)) {
    return { family: "prescripteur", channel: "partenaire", label: "Orienté par un partenaire", detail: clean(raw) };
  }
  if (/^asso(ciation)?$|spontan|direct|reinscription|ancien/.test(p)) {
    return { family: "direct", channel: null, label: "Contact direct", detail: clean(raw) };
  }
  return { family: "nc", channel: null, label: "Non renseigné", detail: clean(raw) };
}

/** Provenance affichable d'un apprenant (canal d'abord, prescripteur à défaut). */
export function resolveProvenance(input: ProvenanceInput): Provenance {
  const channel = CONTACT_SOURCES.find((s) => s.code === input.contact_source);
  let base: Pick<Provenance, "family" | "channel" | "label" | "detail">;
  if (channel && FAMILY_OF_CHANNEL[channel.code] !== "nc") {
    base = { family: FAMILY_OF_CHANNEL[channel.code], channel: channel.code, label: channel.label, detail: clean(input.contact_source_detail) };
  } else if (clean(input.prescriber)) {
    base = fromPrescriber(input.prescriber!);
    if (channel) base = { ...base, label: base.family === "nc" ? channel.label : base.label, detail: base.detail ?? clean(input.contact_source_detail) };
  } else if (channel) {
    base = { family: "nc", channel: channel.code, label: channel.label, detail: clean(input.contact_source_detail) };
  } else {
    base = { family: "nc", channel: null, label: "Non renseigné", detail: null };
  }
  const f = FAMILIES[base.family];
  const text = base.detail ? `${base.label} — ${base.detail}` : base.label;
  const title = base.family === "nc" && !base.detail && !base.channel
    ? "Provenance non renseignée : complétez « Nous a contactés par » ou « Prescripteur » sur la fiche"
    : `Provenance : ${f.label} · ${text}`;
  return { ...base, text, title, color: f.color, hollow: f.hollow };
}

/** Valeur de filtre : « f:quartier » (famille) ou un code de canal ; « nc » = non renseigné. */
export function matchesSourceFilter(p: Provenance, filter: string | null | undefined): boolean {
  if (!filter) return true;
  if (filter.startsWith("f:")) return p.family === filter.slice(2);
  if (filter === "nc") return p.family === "nc" && !p.channel;
  return p.channel === filter;
}
