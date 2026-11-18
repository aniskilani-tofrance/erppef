import { createHash } from "node:crypto";
import { z } from "zod";
import { FAMILIES } from "./constants";

// Veille automatique des financements : chaque jour, l'ERP cherche sur le web des appels
// à projets, appels d'offres, fondations et mécénats qui correspondent au profil de
// l'association, et dépose ses trouvailles dans « À trier ». Logique PURE (testée sans
// réseau) : axe du jour, consignes, clés de dédoublonnage, réglages et journal.

// ── Axe du jour : une famille de sources par jour, pour couvrir large sans tout refaire ──
export type WatchFocus = { key: string; label: string; brief: string };
const FOCUS_BY_WEEKDAY: Record<number, WatchFocus> = {
  1: { key: "etat", label: "État et ses services", brief: "Appels à projets de l'État et de ses services : préfecture, DRIEETS, ANCT, ministères, politique de la ville, FDVA, intégration des étrangers." },
  2: { key: "fondations", label: "Fondations", brief: "Fondations et fonds de dotation : Fondation de France et fondations abritées, fondations d'entreprise, fondations familiales." },
  3: { key: "collectivites", label: "Collectivités", brief: "Appels à projets et subventions des collectivités : Région, Département, intercommunalité, commune." },
  4: { key: "marches", label: "Marchés publics", brief: "Appels d'offres et marchés publics de formation linguistique, d'insertion et d'accompagnement vers l'emploi : BOAMP, PLACE, plateformes régionales, profils d'acheteurs." },
  5: { key: "mecenat", label: "Mécénat d'entreprise", brief: "Mécénat d'entreprise, prix, concours et appels à candidatures ouverts aux associations." },
  6: { key: "europe", label: "Europe et pluriannuel", brief: "Fonds européens (FSE+, FAMI, Erasmus+) et appels nationaux pluriannuels accessibles à une association." },
  7: { key: "rattrapage", label: "Rattrapage de la semaine", brief: "Appels publiés ou mis à jour ces sept derniers jours, toutes familles confondues, qui auraient échappé aux recherches de la semaine." },
};

// weekday : 1 = lundi … 7 = dimanche.
export function focusForWeekday(weekday: number): WatchFocus {
  return FOCUS_BY_WEEKDAY[weekday] ?? FOCUS_BY_WEEKDAY[7];
}

// ── Réglages et journal (organizations.settings.financements.veille) ─────────
export const DEFAULT_WATCH_PROFILE =
  "Association de formation linguistique pour adultes (français langue étrangère, alphabétisation) et d'accompagnement vers l'emploi. " +
  "Public : adultes allophones, primo-arrivants, habitants des quartiers prioritaires, femmes éloignées de l'emploi. " +
  "Précisez ici votre territoire (commune, département, région), vos actions et ce que vous ne cherchez pas.";

export type WatchRun = {
  at: string; // horodatage ISO
  focus: string; // libellé de l'axe du jour
  searches: number; // recherches web faites
  found: number; // trouvailles rendues par l'IA
  added: number; // fiches créées dans « À trier »
  known: number; // déjà connues, ignorées
  dropped: number; // écartées : lien mort ou fiche inutilisable
  titles: string[]; // titres ajoutés (8 au plus)
  error: string | null;
  manual: boolean; // lancée à la main depuis l'écran
};
export type WatchSettings = { enabled: boolean; profile: string; runs: WatchRun[] };
export const MAX_WATCH_RUNS = 30;
export const MAX_PROFILE_CHARS = 3000;

export function resolveWatchSettings(settings: unknown): WatchSettings {
  const raw = ((settings as { financements?: { veille?: Record<string, unknown> } } | null)?.financements?.veille ?? {}) as Record<string, unknown>;
  const profile = typeof raw.profile === "string" && raw.profile.trim() ? raw.profile.trim().slice(0, MAX_PROFILE_CHARS) : DEFAULT_WATCH_PROFILE;
  const runs = Array.isArray(raw.runs) ? (raw.runs as WatchRun[]).filter((r) => r && typeof r.at === "string").slice(0, MAX_WATCH_RUNS) : [];
  return { enabled: raw.enabled !== false, profile, runs };
}

// Fusionne un changement dans les réglages de l'organisation sans toucher au reste.
export function mergeWatchSettings(settings: unknown, patch: Partial<WatchSettings>): Record<string, unknown> {
  const base = (settings && typeof settings === "object" ? settings : {}) as Record<string, unknown>;
  const fin = (base.financements && typeof base.financements === "object" ? base.financements : {}) as Record<string, unknown>;
  const veille = (fin.veille && typeof fin.veille === "object" ? fin.veille : {}) as Record<string, unknown>;
  return { ...base, financements: { ...fin, veille: { ...veille, ...patch } } };
}

export function withRun(current: WatchRun[], run: WatchRun): WatchRun[] {
  return [run, ...current].slice(0, MAX_WATCH_RUNS);
}

// ── Dédoublonnage ────────────────────────────────────────────────────────────
// Adresse ramenée à l'essentiel : sans protocole, sans « www. », sans paramètres de suivi, sans « / » final.
export function normalizeUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_)/i.test(k)) u.searchParams.delete(k);
    const query = u.searchParams.toString();
    return `${u.hostname.replace(/^www\./i, "").toLowerCase()}${u.pathname.replace(/\/+$/, "")}${query ? `?${query}` : ""}`;
  } catch {
    return null;
  }
}

export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function watchDedupeKey(url: string): string | null {
  const n = normalizeUrl(url);
  return n ? `auto:${createHash("sha1").update(n).digest("hex").slice(0, 20)}` : null;
}

// Hôte public seulement : l'ERP ne va jamais chercher une adresse interne proposée par l'IA.
export function isPublicHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":")) return false; // adresse IP
    return true;
  } catch {
    return false;
  }
}

// Une page « morte » fait écarter la trouvaille ; un site qui refuse les robots (401, 403,
// 405, 429) ou qui tarde existe bel et bien : on garde.
export function linkIsDead(status: number | null): boolean {
  return status === 404 || status === 410;
}

// ── Consignes ────────────────────────────────────────────────────────────────
export const WATCH_RESEARCH_SYSTEM = `Tu fais la veille des financements pour une association. Chaque jour, tu cherches sur le web des appels à projets, des appels d'offres, des fondations et des mécénats auxquels elle pourrait répondre, pour qu'elle trouve de nouvelles sources de financement. Une personne de l'association trie ensuite tes trouvailles : écarter, surveiller ou évaluer.

Ce qui rend une trouvaille utile :
- Elle est réelle et vérifiable : tu as ouvert la page officielle du financeur ou de la plateforme de dépôt, et tu donnes son adresse exacte. Si tu ne trouves qu'un site qui recense des appels, cherche la page officielle ; à défaut, dis-le.
- Elle est ouverte ou annoncée : la date limite est à venir, ou c'est un dispositif récurrent dont la prochaine fenêtre est connue ou probable (dis alors ce que tu sais). Un appel clos sans suite n'aide personne.
- Elle correspond au profil : public, territoire, thèmes. Si l'éligibilité est incertaine, garde la trouvaille et dis le doute, plutôt que de trancher à la place de l'association.
- Elle est nouvelle : elle ne figure pas dans la liste des appels déjà connus.

L'exactitude passe avant le nombre. N'écris une date, un montant ou un taux que si tu l'as lu sur la page ; sinon, laisse-le de côté et dis ce qui reste à vérifier. Trois trouvailles solides valent mieux que dix approximatives, et ne rien trouver de nouveau est une réponse acceptable.

Méthode : fais plusieurs recherches variées, en croisant les mots du profil, le territoire et l'année en cours ou la suivante, puis ouvre les pages prometteuses pour vérifier les dates et les conditions.

Termine par un compte rendu en français. Pour chaque trouvaille : le titre exact de l'appel, le financeur, la famille (appel à projets, appel d'offres ou mécénat), l'adresse de la page officielle, la date d'ouverture et la date limite si tu les as lues, les montants ou le taux si tu les as lus, un résumé en deux ou trois phrases, les conditions d'éligibilité et les critères de sélection, les pièces demandées si elles sont indiquées, pourquoi cela correspond au profil, et ce qui reste à vérifier. Ajoute une ligne sur les pistes que tu as écartées et pourquoi.`;

export type KnownOpportunity = { title: string; funder: string | null; url: string | null };

export function watchResearchUser(input: { orgName: string; profile: string; focus: WatchFocus; today: string; known: KnownOpportunity[] }): string {
  const known = input.known.length
    ? input.known.map((k) => `- ${k.title}${k.funder ? ` (${k.funder})` : ""}${k.url ? ` — ${k.url}` : ""}`).join("\n")
    : "(aucun pour l'instant)";
  return [
    `<association>\n${input.orgName}\n</association>`,
    `<profil>\n${input.profile}\n</profil>`,
    `<date_du_jour>\n${input.today}\n</date_du_jour>`,
    `<axe_du_jour>\n${input.focus.label} — ${input.focus.brief}\n</axe_du_jour>`,
    `<appels_deja_connus>\n${known}\n</appels_deja_connus>`,
    "Cherche les financements de l'axe du jour qui correspondent au profil et qui ne sont pas déjà connus, puis rends ton compte rendu.",
  ].join("\n\n");
}

export const WATCH_EXTRACT_SYSTEM = `Tu transformes un compte rendu de veille des financements en fiches. Garde uniquement les trouvailles qui ont une adresse web. Ne complète rien : une information absente du compte rendu reste vide (null). Les dates sont au format AAAA-MM-JJ ; une date incertaine ou approximative reste vide et va dans « to_check ». Les montants sont des nombres en euros, sans symbole.`;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
export const WatchResultSchema = z.object({
  items: z.array(
    z.object({
      title: z.string().describe("Titre exact de l'appel"),
      family: z.enum(FAMILIES).describe("aap = appel à projets ou subvention ; appel_offres = marché public ; mecenat = fondation, mécénat, prix"),
      funder_name: z.string().describe("Nom du financeur"),
      url: z.string().describe("Adresse de la page officielle"),
      opens_on: day.describe("Date d'ouverture lue sur la page, sinon null"),
      deadline: day.describe("Date limite de dépôt lue sur la page, sinon null"),
      amount_min: z.number().nullable(),
      amount_max: z.number().nullable(),
      max_rate: z.number().nullable().describe("Taux maximum de financement en pourcentage, sinon null"),
      summary: z.string().describe("Résumé en deux ou trois phrases"),
      eligibility_notes: z.string().nullable().describe("Conditions d'éligibilité"),
      criteria: z.string().nullable().describe("Critères de sélection"),
      required_documents: z.string().nullable().describe("Pièces demandées"),
      fit: z.string().describe("Pourquoi cela correspond au profil de l'association"),
      to_check: z.string().nullable().describe("Ce qui reste à vérifier"),
    }),
  ),
});
export type WatchItem = z.infer<typeof WatchResultSchema>["items"][number];

const clip = (s: string | null | undefined, max: number) => {
  const t = (s ?? "").trim();
  return t ? t.slice(0, max) : null;
};
const amount = (n: number | null) => (n !== null && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null);

// Fiche prête pour la base, ou null si la trouvaille est inutilisable (pas de titre, pas d'adresse publique).
export function watchItemToRow(item: WatchItem, deadlineAt: string | null): Record<string, unknown> | null {
  const title = clip(item.title, 300);
  const dedupe = watchDedupeKey(item.url);
  if (!title || !dedupe || !isPublicHttpUrl(item.url)) return null;
  let min = amount(item.amount_min);
  let max = amount(item.amount_max);
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  const rate = item.max_rate !== null && item.max_rate >= 0 && item.max_rate <= 100 ? item.max_rate : null;
  const summary = [clip(item.summary, 2500), item.fit?.trim() ? `Pourquoi cela nous concerne : ${item.fit.trim()}` : null].filter(Boolean).join("\n\n");
  const notes = [clip(item.eligibility_notes, 3000), item.to_check?.trim() ? `À vérifier : ${item.to_check.trim()}` : null].filter(Boolean).join("\n\n");
  return {
    dedupe_key: dedupe,
    family: item.family,
    title,
    funder_name: clip(item.funder_name, 200),
    url: item.url.trim(),
    opens_on: item.opens_on,
    deadline_at: deadlineAt,
    amount_min: min,
    amount_max: max,
    max_rate: rate,
    summary: summary.slice(0, 4000),
    eligibility_notes: notes ? notes.slice(0, 4000) : null,
    criteria: clip(item.criteria, 8000),
    required_documents: clip(item.required_documents, 4000),
    watch_status: "nouveau",
    source: "collecteur",
  };
}

// Tri des trouvailles : déjà connue (même adresse ou même titre), inutilisable, ou nouvelle.
export function splitWatchItems(items: WatchItem[], known: KnownOpportunity[]): { fresh: WatchItem[]; knownCount: number; unusable: number } {
  const urls = new Set(known.map((k) => (k.url ? normalizeUrl(k.url) : null)).filter((x): x is string => !!x));
  const titles = new Set(known.map((k) => normalizeTitle(k.title)).filter(Boolean));
  const fresh: WatchItem[] = [];
  let knownCount = 0;
  let unusable = 0;
  for (const item of items) {
    const n = normalizeUrl(item.url ?? "");
    const t = normalizeTitle(item.title ?? "");
    if (!n || !t || !isPublicHttpUrl(item.url)) {
      unusable++;
    } else if (urls.has(n) || titles.has(t)) {
      knownCount++;
    } else {
      urls.add(n);
      titles.add(t);
      fresh.push(item);
    }
  }
  return { fresh, knownCount, unusable };
}

// ── Budget de la veille (séparé de celui de l'écriture) ──────────────────────
export const WATCH_FEATURE_PREFIX = "finveille_";
export const DEFAULT_WATCH_MONTHLY_CAP_USD = 25;
export const WEB_SEARCH_USD = 0.01; // tarif public : 10 $ les 1 000 recherches

export function resolveWatchCap(settings: unknown): number {
  const raw = (settings as { financements?: { watch_monthly_cap_usd?: unknown } } | null)?.financements?.watch_monthly_cap_usd;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_WATCH_MONTHLY_CAP_USD;
}
