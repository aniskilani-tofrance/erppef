// Import (collage depuis le Google Sheet de suivi ou une liste simple) et export CSV des leads.
// Colonnes du Sheet « Suivi des leads » (24) reconnues par leur en-tête ; sans en-tête,
// ordre simple : Entreprise ; Contact ; Téléphone ; Email ; Ville ; Postes ; Nb postes ; Notes.

import {
  CONTRACT_TYPES, LEAD_SCORES, LEAD_SEGMENTS, LEAD_STATUSES, contractLabel, horizonLabel,
  leadRef, leadStatusLabel, offerLabel, potentialAmount, scoreBadgeClass, segmentLabel, sourceLabel,
} from "@/lib/leads/status";

export type LeadImportRow = {
  company: string;
  contactName: string | null;
  contactRole: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  postalCode: string | null;
  positions: string | null;
  positionsCount: number | null;
  contractType: string | null;
  hiringDeadline: string | null;
  segment: string | null;
  score: string | null;
  status: string | null;
  source: string | null;
  campaign: string | null;
  receivedAt: string | null; // ISO date 'YYYY-MM-DD'
  notes: string | null;
};

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

// En-tête du Sheet → clé de champ
const HEADERS: { key: keyof LeadImportRow; match: RegExp }[] = [
  { key: "receivedAt", match: /^date rec/ },
  { key: "source", match: /^source/ },
  { key: "campaign", match: /^campagne/ },
  { key: "company", match: /^(entreprise|restaurant|societe)/ },
  { key: "segment", match: /^(secteur|segment)/ },
  { key: "contactName", match: /^contact/ },
  { key: "contactRole", match: /^fonction/ },
  { key: "phone", match: /^tel/ },
  { key: "email", match: /^e-?mail/ },
  { key: "city", match: /^ville/ },
  { key: "positions", match: /^poste/ },
  { key: "positionsCount", match: /^nb poste/ },
  { key: "contractType", match: /^type de contrat/ },
  { key: "hiringDeadline", match: /^echeance/ },
  { key: "score", match: /^score/ },
  { key: "status", match: /^statut/ },
  { key: "notes", match: /^notes?$/ },
];

export function segmentFromText(v: string | null | undefined): string | null {
  const t = norm(v ?? "");
  if (!t) return null;
  const exact = LEAD_SEGMENTS.find((s) => s.code === t || norm(s.label) === t);
  if (exact) return exact.code;
  if (/(rapide|franchis|mcdo|mcdonald|kfc|burger|tacos|kebab|subway|fast)/.test(t)) return "rapide_franchise";
  if (/(collectiv|sodexo|elior|compass|cantine|ehpad|hopital|cuisine centrale)/.test(t)) return "collective";
  if (/(hotel|traiteur|evenement|banquet)/.test(t)) return "hotel_traiteur";
  if (/(boulang|snack|sandwich|dark|livraison)/.test(t)) return "snacking";
  if (/(resto|restaur|brasserie|bistro|pizz|cafe|bar)/.test(t)) return "traditionnel";
  if (/(btp|commerce|aide a domicile|logisti|proprete|securite|industrie)/.test(t)) return "hors_restauration";
  return null;
}

export function contractFromText(v: string | null | undefined): string | null {
  const t = norm(v ?? "");
  if (!t) return null;
  const exact = CONTRACT_TYPES.find((c) => c.code === t || norm(c.label) === t);
  if (exact) return exact.code;
  if (/extra/.test(t)) return "extras";
  if (/saison/.test(t)) return "saisonnier_4m";
  if (/cdii|interimaire/.test(t)) return "cdii";
  if (/interim/.test(t)) return "interim";
  if (/cdi/.test(t)) return "cdi";
  if (/cdd/.test(t)) return /(court|[1-5] ?mois)/.test(t) ? "cdd_court" : "cdd_6m";
  return "autre";
}

export function scoreFromText(v: string | null | undefined): string | null {
  const t = norm(v ?? "");
  return LEAD_SCORES.find((s) => s.code === t || norm(s.label) === t)?.code ?? null;
}

export function statusFromText(v: string | null | undefined): string | null {
  const t = norm(v ?? "");
  if (!t) return null;
  const exact = LEAD_STATUSES.find((s) => s.code === t || norm(s.label) === t);
  if (exact) return exact.code;
  if (/rdv pris|rendez-vous pris/.test(t)) return "rdv_pris";
  if (/proposition/.test(t)) return "proposition";
  if (/gagn/.test(t)) return "gagne";
  if (/perdu/.test(t)) return "perdu";
  if (/hors/.test(t)) return "hors_cible";
  if (/rappel/.test(t)) return "a_rappeler";
  if (/qualif/.test(t)) return "qualifie";
  if (/contact/.test(t)) return "contacte";
  return null;
}

export function sourceFromText(v: string | null | undefined): string | null {
  const t = norm(v ?? "");
  if (!t) return null;
  if (/(meta|facebook|instagram|formulaire|agence|parlerresto)/.test(t)) return "formulaire_meta";
  if (/site/.test(t)) return "site";
  if (/appel/.test(t)) return "appel_entrant";
  if (/recommand|bouche/.test(t)) return "recommandation";
  if (/terrain|visite/.test(t)) return "terrain";
  return "autre";
}

export function dateFromText(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

// « Saint-Denis 93200 » → { city: 'Saint-Denis', postalCode: '93200' }
export function splitCity(v: string | null | undefined): { city: string | null; postalCode: string | null } {
  const t = (v ?? "").trim();
  if (!t) return { city: null, postalCode: null };
  const m = t.match(/\b(\d{5})\b/);
  const postalCode = m ? m[1] : null;
  const city = t.replace(/\b\d{5}\b/, "").replace(/[\s,]+$/, "").replace(/^[\s,]+/, "").trim() || null;
  return { city, postalCode };
}

export function parseLeadsImport(text: string): LeadImportRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = ["\t", ";", ","].find((s) => lines[0].includes(s)) ?? ";";
  const cells = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));

  const first = cells[0].map(norm);
  const hasHeader = first.some((h) => /^(entreprise|restaurant|contact|telephone|tel\.?)$/.test(h) || /^date rec/.test(h));
  const rows: LeadImportRow[] = [];

  const empty = (): LeadImportRow => ({
    company: "", contactName: null, contactRole: null, phone: null, email: null, city: null, postalCode: null,
    positions: null, positionsCount: null, contractType: null, hiringDeadline: null, segment: null, score: null,
    status: null, source: null, campaign: null, receivedAt: null, notes: null,
  });

  if (hasHeader) {
    const map = first.map((h) => HEADERS.find((x) => x.match.test(h))?.key ?? null);
    for (const row of cells.slice(1)) {
      const r = empty();
      const raw: Partial<Record<keyof LeadImportRow, string>> = {};
      row.forEach((v, i) => {
        const k = map[i];
        if (k && v) raw[k] = v;
      });
      if (!raw.company) continue;
      r.company = raw.company;
      r.contactName = raw.contactName ?? null;
      r.contactRole = raw.contactRole ?? null;
      r.phone = raw.phone ?? null;
      r.email = raw.email ?? null;
      const loc = splitCity(raw.city);
      r.city = loc.city;
      r.postalCode = loc.postalCode;
      r.positions = raw.positions ?? null;
      r.positionsCount = raw.positionsCount ? Number(raw.positionsCount.replace(/\D/g, "")) || null : null;
      r.contractType = contractFromText(raw.contractType);
      r.hiringDeadline = raw.hiringDeadline ?? null;
      r.segment = segmentFromText(raw.segment);
      r.score = scoreFromText(raw.score);
      r.status = statusFromText(raw.status);
      r.source = sourceFromText(raw.source);
      r.campaign = raw.campaign ?? null;
      r.receivedAt = dateFromText(raw.receivedAt);
      r.notes = raw.notes ?? null;
      rows.push(r);
    }
    return rows;
  }

  for (const row of cells) {
    const [company, contact, phone, email, cityRaw, positions, nb, notes] = row;
    if (!company) continue;
    const r = empty();
    r.company = company;
    r.contactName = contact || null;
    r.phone = phone || null;
    r.email = email || null;
    const loc = splitCity(cityRaw);
    r.city = loc.city;
    r.postalCode = loc.postalCode;
    r.positions = positions || null;
    r.positionsCount = nb ? Number(nb.replace(/\D/g, "")) || null : null;
    r.notes = notes || null;
    rows.push(r);
  }
  return rows;
}

// ── Export ──────────────────────────────────────────────────────────────────
export type LeadExportRow = {
  lead_no: number | null;
  received_at: string;
  source: string;
  campaign: string | null;
  company: string;
  segment: string;
  contact_name: string | null;
  contact_role: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  postal_code: string | null;
  positions: string | null;
  positions_count: number;
  contract_type: string;
  hours_per_week: number | null;
  hiring_horizon: string;
  hiring_deadline: string | null;
  decision_maker: boolean | null;
  haccp_status: string;
  score: string | null;
  status: string;
  lost_reason: string | null;
  offer: string | null;
  owner_name: string | null;
  first_contact_at: string | null;
  attempts: number;
  next_action: string | null;
  next_action_on: string | null;
  rdv_at: string | null;
  rdv_mode: string | null;
  rdv_outcome: string | null;
  notes: string | null;
};

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "";
}
function fmtDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }) : "";
}

// Mêmes 24 colonnes que le Google Sheet de suivi (dans le même ordre), puis les colonnes propres à l'ERP.
export const EXPORT_HEADERS = [
  "Date réception", "Source / Canal", "Campagne (UTM)", "Entreprise", "Secteur", "Contact (Prénom NOM)", "Fonction",
  "Téléphone", "Email", "Ville / CP", "Poste(s) à pourvoir", "Nb postes", "Type de contrat envisagé", "Échéance embauche",
  "OPCO", "Score (Chaud/Tiède/Froid)", "Statut", "Propriétaire", "Date 1er contact", "Nb tentatives", "Prochaine action",
  "Date prochaine action", "Montant potentiel (€)", "Notes",
  "Réf", "Offre", "Heures/semaine", "Décideur", "HACCP", "RDV", "Mode RDV", "Issue RDV", "Raison perte",
];

export function leadsToCsv(rows: LeadExportRow[]): string {
  const lines = [EXPORT_HEADERS.map(csvCell).join(";")];
  for (const r of rows) {
    lines.push(
      [
        fmtDate(r.received_at), sourceLabel(r.source), r.campaign, r.company, segmentLabel(r.segment), r.contact_name, r.contact_role,
        r.phone, r.email, [r.city, r.postal_code].filter(Boolean).join(" "), r.positions, r.positions_count, contractLabel(r.contract_type),
        [horizonLabel(r.hiring_horizon), r.hiring_deadline].filter((x) => x && x !== "—").join(" — "),
        r.segment === "hors_restauration" ? "" : "AKTO", r.score ? r.score.charAt(0).toUpperCase() + r.score.slice(1) : "", leadStatusLabel(r.status), r.owner_name,
        fmtDate(r.first_contact_at), r.attempts, r.next_action, r.next_action_on ? fmtDate(`${r.next_action_on}T12:00:00Z`) : "",
        potentialAmount(r.positions_count), r.notes,
        leadRef(r.lead_no), offerLabel(r.offer), r.hours_per_week, r.decision_maker == null ? "" : r.decision_maker ? "Oui" : "Non",
        r.haccp_status, fmtDateTime(r.rdv_at), r.rdv_mode, r.rdv_outcome, r.lost_reason,
      ].map(csvCell).join(";"),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

// Réexport pratique pour les composants (couleur du score dans l'aperçu d'import)
export { scoreBadgeClass };
