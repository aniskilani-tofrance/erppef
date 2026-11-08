// Export de la liste d'attente (Admission → carte « Liste d'attente ») vers un tableur : Google
// Sheets (Fichier → Importer) ou Excel. Même ordre que l'écran : ordre d'arrivée, premier arrivé
// premier reproposé. Fonction pure, testée sans base.

import { formatPhone } from "@/lib/admission/phone";
import { resolveProvenance } from "@/lib/admission/sources";
import { reasonFits, reasonLabel } from "@/lib/admission/status";
import { learnerRef } from "@/lib/refs";

export type WaitlistLearner = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  learner_no: number | null;
  phone: string | null;
  email: string | null;
  level_assessed: string | null;
  created_at: string;
  contact_source: string | null;
  contact_source_detail: string | null;
  prescriber: string | null;
};

export type WaitlistContact = { learner_id: string; contacted_at: string; reason: string | null };

export const WAITLIST_COLUMNS = [
  "Rang",
  "N°",
  "Prénom",
  "Nom",
  "Téléphone",
  "E-mail",
  "Niveau évalué",
  "Arrivé le",
  "Motif de l'attente",
  "Dernier contact",
  "Provenance",
];

const dayFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

// Cellule CSV : guillemets si besoin ; un texte qui commence par = + - @ serait lu comme une
// formule par le tableur (les noms viennent aussi du formulaire public) → apostrophe devant.
function cell(value: string | null | undefined): string {
  let v = (value ?? "").replace(/\r?\n/g, " ").trim();
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  return /[";]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildWaitlistCsv(learners: readonly WaitlistLearner[], contacts: readonly WaitlistContact[]): string {
  const byLearner = new Map<string, WaitlistContact[]>();
  for (const c of contacts) byLearner.set(c.learner_id, [...(byLearner.get(c.learner_id) ?? []), c]);
  for (const list of byLearner.values()) list.sort((a, b) => b.contacted_at.localeCompare(a.contacted_at));

  const rows = [...learners]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((l, i) => {
      const history = byLearner.get(l.id) ?? [];
      // Motif du dernier contact qui en porte un pour la liste d'attente (comme à l'écran)
      const reason = history.find((h) => reasonFits(h.reason, "liste_attente"))?.reason;
      return [
        String(i + 1),
        learnerRef(l.learner_no),
        l.first_name,
        l.last_name,
        l.phone ? formatPhone(l.phone) : "",
        l.email,
        l.level_assessed,
        dayFr(l.created_at),
        reasonLabel(reason) ?? "non renseigné",
        history[0] ? dayFr(history[0].contacted_at) : "",
        resolveProvenance(l).text,
      ]
        .map(cell)
        .join(";");
    });
  return "﻿" + [WAITLIST_COLUMNS.join(";"), ...rows].join("\r\n");
}

export function waitlistFileName(today: Date = new Date()): string {
  const d = today.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" }); // AAAA-MM-JJ
  return `liste-attente_${d}.csv`;
}
