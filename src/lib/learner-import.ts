// Parsing PARTAGÉ des lignes d'apprenants (dialog d'import ET synchronisation Drive).
// Colonnes, dans l'ordre :
// Prénom;Nom;Téléphone;Email;Langue;Niveau;Naissance;Sexe;Adresse;Commune;CP;Situation;QPV;RQTH;Scolarisation;Prescripteur;Quartier
// (ligne d'en-têtes optionnelle, séparateur ; , ou tabulation, tout est facultatif après Nom).

import { ACTIVITIES, EDUCATION, GENDERS, buildLookup } from "@/lib/referentiels";

export type ImportRow = {
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  firstLanguage: string | null;
  levelAssessed: string | null;
  birthDate: string | null;
  gender: "femme" | "homme" | "autre" | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  activityStatus: "demandeur_emploi" | "rsa" | "salarie" | "scolaire_etudiant" | "inactif_autre" | null;
  qpv: boolean | null;
  rqth: boolean | null;
  educationLevel: "non_scolarise" | "primaire" | "secondaire" | "superieur" | null;
  prescriber: string | null;
  district: string | null;
};

// « 12/05/1988 » ou « 1988-05-12 » → 'YYYY-MM-DD'
export function parseDate(v: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

export function parseBool(v: string): boolean | null {
  if (/^(oui|o|yes|1|vrai)$/i.test(v)) return true;
  if (/^(non|n|no|0|faux)$/i.test(v)) return false;
  return null;
}

// Correspondances texte → code : DÉRIVÉES du référentiel unique (src/lib/referentiels.ts),
// les mêmes listes que les formulaires de l'ERP et le modèle Excel généré.
const genderOf = buildLookup(GENDERS);
const activityOf = buildLookup(ACTIVITIES);
const educationOf = buildLookup(EDUCATION);

export function parseImportText(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const sep = [";", "\t", ","].find((s) => lines[0].includes(s)) ?? ";";
  const rows = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));
  // Ligne d'en-têtes ? (contient « nom » ou « prénom » sans être un vrai nom probable)
  if (/pr[ée]nom|^nom$|t[ée]l[ée]phone|email/i.test(rows[0].join("|"))) rows.shift();
  return rows
    .filter((c) => c[0] && c[1])
    .map((c) => ({
      firstName: c[0],
      lastName: c[1],
      phone: c[2] || null,
      email: c[3] || null,
      firstLanguage: c[4] || null,
      levelAssessed: c[5] || null,
      birthDate: c[6] ? parseDate(c[6]) : null,
      gender: c[7] ? (genderOf(c[7]) as ImportRow["gender"]) : null,
      address: c[8] || null,
      city: c[9] || null,
      postalCode: c[10] || null,
      activityStatus: c[11] ? (activityOf(c[11]) as ImportRow["activityStatus"]) : null,
      qpv: c[12] ? parseBool(c[12]) : null,
      rqth: c[13] ? parseBool(c[13]) : null,
      educationLevel: c[14] ? (educationOf(c[14]) as ImportRow["educationLevel"]) : null,
      prescriber: c[15] || null,
      district: c[16] || null,
    }));
}

// Empreinte stable d'une ligne (prénom+nom+téléphone+naissance normalisés) :
// c'est elle qui rend la synchronisation Drive idempotente.
export function rowFingerprint(row: ImportRow): string {
  const norm = (s: string | null) =>
    (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const base = `${norm(row.firstName)}|${norm(row.lastName)}|${norm(row.phone)}|${row.birthDate ?? ""}`;
  let h = 5381;
  for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) >>> 0;
  return `v1-${h.toString(16)}`;
}

export function rowToDbColumns(row: ImportRow, orgId: string) {
  return {
    org_id: orgId,
    first_name: row.firstName,
    last_name: row.lastName,
    phone: row.phone,
    email: row.email,
    first_language: row.firstLanguage,
    level_assessed: row.levelAssessed,
    birth_date: row.birthDate,
    gender: row.gender,
    address: row.address,
    city: row.city,
    postal_code: row.postalCode,
    activity_status: row.activityStatus,
    qpv: row.qpv,
    rqth: row.rqth,
    education_level: row.educationLevel,
    prescriber: row.prescriber,
    district: row.district,
  };
}
