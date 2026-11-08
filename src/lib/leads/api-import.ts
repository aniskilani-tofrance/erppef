import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseLeadsImport, segmentFromText, splitCity, statusFromText } from "@/lib/leads/csv";
import { leadRef } from "@/lib/leads/status";
import { resolveLeadSettings } from "@/lib/leads/templates";
import { phoneFromCell, emailFromCell } from "@/lib/prospection/import";

// Import en lot par l'API (POST /api/leads/import) : des restaurants ou des entreprises
// qu'on démarche, vers les Leads (cible « leads ») ou vers une liste d'appels de Prospection
// (cible « prospection »).
//
// Règles :
//   - source TOUJOURS « prospection » : aucun e-mail ni SMS automatique ne part vers ces
//     fiches (MANUAL_ONLY_SOURCES), quel que soit l'interrupteur des automatismes ;
//   - idempotent : une fiche déjà connue (même SIREN, ou même téléphone) n'est jamais
//     recréée ; relancer le même import ne crée rien ;
//   - numéro L-0001 attribué par la base (trigger set_employer_lead_no, comme l'import
//     par collage) ;
//   - l'organisation est fixée par l'appelant serveur (production), jamais par le corps.

export const IMPORT_MAX_ROWS = 500;
export const IMPORT_SOURCE = "prospection" as const;

// ── Corps de la requête ─────────────────────────────────────────────────────

const text = z.string().trim().max(2000).nullish();

export const apiLeadLineSchema = z
  .object({
    entreprise: z.string().trim().max(200).nullish(),
    restaurant: z.string().trim().max(200).nullish(),
    raison_sociale: text,
    contact: text,
    fonction: text,
    telephone: text,
    email: text,
    adresse: text,
    ville: text,
    code_postal: text,
    siren: text,
    siret: text,
    secteur: text,
    statut: text,
    campagne: text,
    notes: z.string().trim().max(4000).nullish(),
  })
  .strict();

export const apiImportSchema = z
  .object({
    cible: z.enum(["leads", "prospection"]).default("leads"),
    liste: z.string().trim().min(1).max(200).optional(),
    campagne: z.string().trim().min(1).max(120).optional(),
    simulation: z.boolean().default(false),
    lignes: z.array(apiLeadLineSchema).max(IMPORT_MAX_ROWS).optional(),
    texte: z.string().max(2_000_000).optional(),
  })
  .strict()
  .refine((b) => Boolean(b.lignes?.length) !== Boolean(b.texte?.trim()), { message: "Donner soit « lignes », soit « texte » (pas les deux)" })
  .refine((b) => b.cible !== "prospection" || Boolean(b.liste), { message: "« liste » est obligatoire pour la cible prospection" });

export type ApiImportBody = z.infer<typeof apiImportSchema>;

// ── Ligne normalisée ────────────────────────────────────────────────────────

export type ImportLine = {
  company: string;
  legalName: string | null;
  contactName: string | null;
  contactRole: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  siren: string | null;
  siret: string | null;
  segment: string;
  status: string;
  campaign: string | null;
  notes: string | null;
};

const SIREN_IN_TEXT = /\bSIREN\s*:?\s*(\d{3})\s?(\d{3})\s?(\d{3})\b/i;

/** SIREN (9 chiffres) tiré d'un SIREN, d'un SIRET ou d'une mention « SIREN 123456789 » dans un texte. */
export function sirenOf(v: { siren?: string | null; siret?: string | null; notes?: string | null }): string | null {
  const s = (v.siren ?? "").replace(/\D/g, "");
  if (s.length === 9) return s;
  const t = (v.siret ?? "").replace(/\D/g, "");
  if (t.length === 14) return t.slice(0, 9);
  const m = (v.notes ?? "").match(SIREN_IN_TEXT);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

/** Clé de dédoublonnage d'un téléphone : chiffres du format international (+33…). */
export function phoneKey(phone: string | null | undefined): string | null {
  const p = phoneFromCell(phone);
  if (!p) return null;
  const d = p.replace(/\D/g, "");
  return d.length >= 9 ? d : null;
}

function clean(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

function withSiren(notes: string | null, siren: string | null): string | null {
  if (!siren || sirenOf({ notes }) === siren) return notes;
  return notes ? `${notes} · SIREN ${siren}` : `SIREN ${siren}`;
}

/** Lignes JSON ou texte collé (format de l'import par collage, TSV/CSV) → lignes normalisées. */
export function normalizeImport(body: ApiImportBody): ImportLine[] {
  if (body.texte?.trim()) {
    return parseLeadsImport(body.texte).map((r) => {
      const siren = sirenOf({ notes: r.notes });
      return {
        company: r.company.trim(),
        legalName: null,
        contactName: r.contactName,
        contactRole: r.contactRole,
        phone: phoneFromCell(r.phone),
        email: emailFromCell(r.email),
        address: null,
        city: r.city,
        postalCode: r.postalCode,
        siren,
        siret: null,
        segment: r.segment ?? "inconnu",
        status: r.status ?? "nouveau",
        campaign: clean(r.campaign) ?? body.campagne ?? null,
        notes: withSiren(r.notes, siren),
      };
    });
  }
  return (body.lignes ?? []).map((l) => {
    const loc = l.code_postal ? { city: clean(l.ville), postalCode: clean(l.code_postal) } : splitCity(l.ville);
    const siret = (l.siret ?? "").replace(/\D/g, "");
    const siren = sirenOf({ siren: l.siren, siret: l.siret, notes: l.notes });
    return {
      company: clean(l.entreprise) ?? clean(l.restaurant) ?? "",
      legalName: clean(l.raison_sociale),
      contactName: clean(l.contact),
      contactRole: clean(l.fonction),
      phone: phoneFromCell(l.telephone),
      email: emailFromCell(l.email),
      address: clean(l.adresse),
      city: loc.city,
      postalCode: loc.postalCode,
      siren,
      siret: siret.length === 14 ? siret : null,
      segment: segmentFromText(l.secteur) ?? "inconnu",
      status: statusFromText(l.statut) ?? "nouveau",
      campaign: clean(l.campagne) ?? body.campagne ?? null,
      notes: withSiren(clean(l.notes), siren),
    };
  });
}

// ── Plan d'import (pur, testé) ──────────────────────────────────────────────

export type KnownRecord = { id: string; ref: string; siren: string | null; phoneKey: string | null };

export type ImportPlan = {
  create: { ligne: number; line: ImportLine }[];
  doublons: { ligne: number; entreprise: string; raison: "siren" | "telephone"; existant: string }[];
  erreurs: { ligne: number; erreur: string }[];
};

/**
 * Sépare les lignes à créer, les doublons (avec une fiche existante ou une ligne plus haut
 * dans le même lot) et les lignes inexploitables. `ligne` est numérotée à partir de 1.
 */
export function planImport(lines: ImportLine[], known: KnownRecord[]): ImportPlan {
  const bySiren = new Map<string, string>();
  const byPhone = new Map<string, string>();
  for (const k of known) {
    if (k.siren && !bySiren.has(k.siren)) bySiren.set(k.siren, k.ref);
    if (k.phoneKey && !byPhone.has(k.phoneKey)) byPhone.set(k.phoneKey, k.ref);
  }
  const plan: ImportPlan = { create: [], doublons: [], erreurs: [] };
  lines.forEach((line, i) => {
    const ligne = i + 1;
    if (!line.company) {
      plan.erreurs.push({ ligne, erreur: "Nom de l'entreprise manquant" });
      return;
    }
    const pk = phoneKey(line.phone);
    if (!pk && !line.email && !line.siren) {
      plan.erreurs.push({ ligne, erreur: "Ni téléphone, ni e-mail, ni SIREN : impossible à joindre ou à dédoublonner" });
      return;
    }
    const sirenHit = line.siren ? bySiren.get(line.siren) : undefined;
    const phoneHit = pk ? byPhone.get(pk) : undefined;
    if (sirenHit || phoneHit) {
      plan.doublons.push({ ligne, entreprise: line.company, raison: sirenHit ? "siren" : "telephone", existant: (sirenHit ?? phoneHit) as string });
      return;
    }
    const ref = `ligne ${ligne}`;
    if (line.siren) bySiren.set(line.siren, ref);
    if (pk) byPhone.set(pk, ref);
    plan.create.push({ ligne, line });
  });
  return plan;
}

// ── Lignes de base de données ───────────────────────────────────────────────

export function leadInsertRow(orgId: string, line: ImportLine, ownerUserId: string | null): Record<string, unknown> {
  const campaign = line.campaign;
  return {
    org_id: orgId,
    source: IMPORT_SOURCE, // OBLIGATOIRE : aucun e-mail ni SMS automatique
    campaign,
    offer: campaign && /^poei/i.test(campaign) ? "poei" : null,
    company: line.company.slice(0, 200),
    contact_name: line.contactName,
    contact_role: line.contactRole,
    phone: line.phone,
    email: line.email,
    city: line.city,
    postal_code: line.postalCode,
    segment: line.segment,
    status: line.status,
    owner_user_id: ownerUserId,
    notes: line.notes,
  };
}

export function prospectInsertRow(orgId: string, listId: string, line: ImportLine): Record<string, unknown> {
  const who = [line.contactName, line.contactRole && `(${line.contactRole})`].filter(Boolean).join(" ");
  const notes = [who && `Contact : ${who}`, line.notes].filter(Boolean).join(" · ") || null;
  return {
    org_id: orgId,
    list_id: listId,
    company: line.company.slice(0, 200),
    legal_name: line.legalName,
    segment: line.segment,
    siret: line.siret,
    address: line.address,
    postal_code: line.postalCode,
    city: line.city,
    department: line.postalCode?.slice(0, 2) ?? null,
    phone: line.phone,
    email: line.email,
    contact_source: "api",
    status: "a_appeler",
    notes: withSiren(notes, line.siren),
  };
}

// ── Exécution (client service_role ; org_id filtré partout) ─────────────────

export type ImportResult = {
  cible: "leads" | "prospection";
  simulation: boolean;
  lignes: number;
  crees: number;
  doublons: ImportPlan["doublons"];
  erreurs: ImportPlan["erreurs"];
  fiches: { ligne: number; id: string; ref: string }[];
  liste?: { id: string | null; nom: string };
};

async function pageAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export async function knownLeads(admin: SupabaseClient, orgId: string): Promise<KnownRecord[]> {
  const rows = await pageAll<{ id: string; lead_no: number | null; phone: string | null; notes: string | null }>((a, b) =>
    admin.from("employer_leads").select("id, lead_no, phone, notes").eq("org_id", orgId).order("id").range(a, b),
  );
  return rows.map((r) => ({ id: r.id, ref: leadRef(r.lead_no), siren: sirenOf({ notes: r.notes }), phoneKey: phoneKey(r.phone) }));
}

export async function knownProspects(admin: SupabaseClient, orgId: string): Promise<KnownRecord[]> {
  const rows = await pageAll<{ id: string; company: string; siret: string | null; phone: string | null; notes: string | null }>((a, b) =>
    admin.from("prospects").select("id, company, siret, phone, notes").eq("org_id", orgId).order("id").range(a, b),
  );
  return rows.map((r) => ({ id: r.id, ref: `prospect « ${r.company} »`, siren: sirenOf({ siret: r.siret, notes: r.notes }), phoneKey: phoneKey(r.phone) }));
}

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what} : ${r.error.message}`);
  return r.data as T;
}

const CHUNK = 100;

export async function runImport(admin: SupabaseClient, orgId: string, body: ApiImportBody): Promise<ImportResult> {
  const lines = normalizeImport(body);
  const cible = body.cible;
  const known = cible === "leads" ? await knownLeads(admin, orgId) : await knownProspects(admin, orgId);
  const plan = planImport(lines, known);
  const result: ImportResult = { cible, simulation: body.simulation, lignes: lines.length, crees: 0, doublons: plan.doublons, erreurs: plan.erreurs, fiches: [] };

  if (cible === "leads") {
    if (body.simulation || !plan.create.length) return { ...result, crees: body.simulation ? plan.create.length : 0 };
    const { data: org } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
    const owner = resolveLeadSettings(org?.settings).defaultOwnerUserId || null;
    for (let i = 0; i < plan.create.length; i += CHUNK) {
      const part = plan.create.slice(i, i + CHUNK);
      const inserted = must(
        await admin.from("employer_leads").insert(part.map((p) => leadInsertRow(orgId, p.line, owner))).select("id, lead_no"),
        "Création des leads",
      ) as { id: string; lead_no: number | null }[];
      must(
        await admin.from("employer_lead_events").insert(
          inserted.map((d) => ({ org_id: orgId, lead_id: d.id, kind: "import", outcome: null, note: `Importé par l'API Leads${body.campagne ? ` (campagne ${body.campagne})` : ""}` })),
        ),
        "Journal des leads",
      );
      inserted.forEach((d, j) => result.fiches.push({ ligne: part[j].ligne, id: d.id, ref: leadRef(d.lead_no) }));
    }
    result.crees = result.fiches.length;
    return result;
  }

  // ── Prospection : une liste d'appels (créée si elle n'existe pas) ──
  const nom = body.liste as string;
  const existing = must(await admin.from("prospect_lists").select("id").eq("org_id", orgId).eq("name", nom).limit(1), "Liste d'appels") as { id: string }[];
  let listId: string | null = existing[0]?.id ?? null;
  result.liste = { id: listId, nom };
  if (body.simulation || !plan.create.length) return { ...result, crees: body.simulation ? plan.create.length : 0 };
  if (!listId) {
    listId = (must(
      await admin.from("prospect_lists").insert({ org_id: orgId, name: nom, description: `Créée par l'API Leads${body.campagne ? ` — campagne ${body.campagne}` : ""}` }).select("id").single(),
      "Création de la liste",
    ) as { id: string }).id;
    result.liste = { id: listId, nom };
  }
  for (let i = 0; i < plan.create.length; i += CHUNK) {
    const part = plan.create.slice(i, i + CHUNK);
    const inserted = must(
      await admin.from("prospects").insert(part.map((p) => prospectInsertRow(orgId, listId as string, p.line))).select("id, company"),
      "Création des prospects",
    ) as { id: string; company: string }[];
    inserted.forEach((d, j) => result.fiches.push({ ligne: part[j].ligne, id: d.id, ref: `prospect « ${d.company} »` }));
  }
  result.crees = result.fiches.length;
  return result;
}
