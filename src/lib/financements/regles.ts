import type { Family, Portal, Stage } from "./constants";

// Règles métier pures du module Financements (compteurs, création d'un dossier depuis
// une opportunité, code d'un nouveau financeur).

export type CounterApp = {
  stage: Stage;
  amount_granted: number | string | null;
  granted_on: string | null;
  created_at: string;
};

export type Counters = {
  enRedaction: number;
  deposes: number;
  accordesAnnee: number;
  montantAccordeAnnee: number;
};

// Année d'un accord : la date d'accord si elle est connue, sinon l'année de création de
// la fiche (cas des subventions reprises sans date d'acte).
export function grantYear(a: Pick<CounterApp, "granted_on" | "created_at">): number {
  return Number((a.granted_on ?? a.created_at).slice(0, 4));
}

export function computeCounters(apps: CounterApp[], year: number): Counters {
  const granted = apps.filter((a) => (a.stage === "accorde" || a.stage === "bilan_rendu") && grantYear(a) === year);
  return {
    enRedaction: apps.filter((a) => a.stage === "en_redaction").length,
    deposes: apps.filter((a) => a.stage === "depose").length,
    accordesAnnee: granted.length,
    montantAccordeAnnee: granted.reduce((sum, a) => sum + (a.amount_granted === null ? 0 : Number(a.amount_granted) || 0), 0),
  };
}

export type OpportunityForApplication = {
  id: string;
  org_id: string;
  title: string;
  family: Family;
  funder_id: string | null;
  url: string | null;
  deadline_at: string | null;
  amount_min: number | string | null;
  amount_max: number | string | null;
  summary: string;
  eligibility_notes: string | null;
};

// « Créer le dossier » : tout ce qui est connu de l'opportunité est repris, rien à ressaisir.
// Le montant demandé part du plafond annoncé (à ajuster dans la fiche) ; le portail est
// celui du financeur.
export function applicationFromOpportunity(
  o: OpportunityForApplication,
  ctx: { funderId: string; funderPortal: Portal | null; ownerId: string | null; createdBy: string | null },
): Record<string, unknown> {
  const notes = [
    o.summary?.trim() ? `Résumé de l'appel : ${o.summary.trim()}` : null,
    o.eligibility_notes?.trim() ? `Conditions : ${o.eligibility_notes.trim()}` : null,
    o.url ? `Appel : ${o.url}` : null,
  ].filter(Boolean);
  const max = o.amount_max === null || o.amount_max === "" ? null : Number(o.amount_max);
  return {
    org_id: o.org_id,
    opportunity_id: o.id,
    funder_id: ctx.funderId,
    title: o.title,
    stage: "on_y_va",
    owner_id: ctx.ownerId,
    deadline_at: o.deadline_at,
    amount_requested: Number.isFinite(max) ? max : null,
    portal: ctx.funderPortal,
    notes: notes.length ? notes.join("\n") : null,
    created_by: ctx.createdBy,
  };
}

// Code court d'un financeur créé à la volée (« Fondation RAJA-Danièle Marcovici » →
// « FONDATION-RAJA-DANIELE »), unique dans l'organisation.
export function funderCodeFromName(name: string, taken: Iterable<string> = []): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .split("-")
      .filter(Boolean)
      .slice(0, 3)
      .join("-")
      .slice(0, 24) || "FINANCEUR";
  const used = new Set([...taken].map((c) => c.toUpperCase()));
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) {
    const c = `${base}-${i}`;
    if (!used.has(c)) return c;
  }
}

// Couleur (planning) d'un financeur créé depuis le module : une teinte neutre et lisible.
export const NEW_FUNDER_COLOR = "#64748b";

// Contacts d'un financeur : professionnels seulement (nom, fonction, courriel, téléphone).
export type FunderContact = { nom?: string; fonction?: string; courriel?: string; telephone?: string };

export function cleanContacts(raw: unknown): FunderContact[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && !Array.isArray(c))
    .map((c) => {
      const out: FunderContact = {};
      for (const k of ["nom", "fonction", "courriel", "telephone"] as const) {
        const v = c[k];
        if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 200);
      }
      return out;
    })
    .filter((c) => Object.keys(c).length > 0)
    .slice(0, 20);
}
