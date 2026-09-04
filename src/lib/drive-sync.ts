import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseImportText, rowFingerprint, rowToDbColumns } from "@/lib/learner-import";
import { enrichRowsWithQpv } from "@/lib/geo/enrich-qpv";

// Synchronisation « fichier Drive → liste des apprenants » SANS compte de service :
// le dossier est partagé « tous ceux qui ont le lien », on lit sa vue publique pour
// trouver le tableur, on télécharge son export, on n'insère que les lignes NOUVELLES
// (empreinte prénom+nom+téléphone+naissance). Cron quotidien + bouton manuel.

const FOLDER_ID = process.env.DRIVE_APPRENANTS_FOLDER_ID ?? "1ox1SzPXa_VoD4UeOC_ph-wHcpVWlfzEQ";
const ORG_SLUG = process.env.SYNC_ORG_SLUG ?? "pef";

type DriveEntry = { id: string; name: string; isSheet: boolean };

// Vue publique du dossier (HTML statique) : ids + noms des fichiers.
async function listPublicFolder(folderId: string): Promise<DriveEntry[]> {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`dossier inaccessible (${res.status})`);
  const html = await res.text();
  const entries: DriveEntry[] = [];
  const re = /href="https:\/\/(docs|drive)\.google\.com\/(?:spreadsheets\/d\/|file\/d\/|open\?id=)([A-Za-z0-9_-]{20,})[^"]*"[^>]*>[\s\S]{0,2000}?flip-entry-title">([^<]+)</g;
  for (const m of html.matchAll(re)) {
    entries.push({ id: m[2], name: m[3].trim(), isSheet: m[1] === "docs" });
  }
  if (entries.length === 0) {
    // Repli si la structure des liens change : blocs « entry-<id> … flip-entry-title »
    // (un nom sans extension = Google Sheet natif, exporté en xlsx au téléchargement)
    const reFallback = /id="entry-([A-Za-z0-9_-]{20,})"[\s\S]{0,2000}?flip-entry-title">([^<]+)</g;
    for (const m of html.matchAll(reFallback)) {
      const name = m[2].trim();
      entries.push({ id: m[1], name, isSheet: !/\.\w{2,5}$/.test(name) });
    }
  }
  return entries;
}

async function downloadSpreadsheet(entry: DriveEntry): Promise<ArrayBuffer> {
  const url = entry.isSheet
    ? `https://docs.google.com/spreadsheets/d/${entry.id}/export?format=xlsx`
    : `https://drive.google.com/uc?export=download&id=${entry.id}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "follow" });
  if (!res.ok) throw new Error(`téléchargement impossible (${res.status})`);
  return res.arrayBuffer();
}

export type SyncResult = {
  ok: boolean;
  fileName?: string;
  added: number;
  skipped: number;
  invalid: number;
  message: string;
};

export async function syncLearnersFromDrive(): Promise<SyncResult> {
  const supabase = createAdminClient();

  const { data: org } = await supabase.from("organizations").select("id").eq("slug", ORG_SLUG).single();
  if (!org) return { ok: false, added: 0, skipped: 0, invalid: 0, message: "Organisation introuvable" };

  let entries: DriveEntry[];
  try {
    entries = await listPublicFolder(FOLDER_ID);
  } catch (e) {
    return { ok: false, added: 0, skipped: 0, invalid: 0, message: `Dossier Drive inaccessible : ${e instanceof Error ? e.message : "erreur"}` };
  }
  const sheet = entries.find(
    (f) => f.isSheet || /\.(xlsx|xls|csv)$/i.test(f.name),
  );
  if (!sheet) {
    return { ok: false, added: 0, skipped: 0, invalid: 0, message: "Aucun tableur trouvé dans le dossier partagé (déposez le modèle apprenants)." };
  }

  let rowsText: string;
  try {
    const buffer = await downloadSpreadsheet(sheet);
    const wb = XLSX.read(buffer);
    const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("apprenant")) ?? wb.SheetNames[0];
    rowsText = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName], { FS: ";", blankrows: false });
  } catch (e) {
    return { ok: false, fileName: sheet.name, added: 0, skipped: 0, invalid: 0, message: `Fichier illisible : ${e instanceof Error ? e.message : "erreur"}` };
  }

  const rows = parseImportText(rowsText);
  if (!rows.length) {
    return { ok: true, fileName: sheet.name, added: 0, skipped: 0, invalid: 0, message: "Fichier lu, aucune ligne à importer." };
  }

  // Déjà connus : par empreinte (imports précédents) ET par nom+contact (saisies manuelles)
  const { data: existing } = await supabase
    .from("learners")
    .select("first_name, last_name, phone, birth_date, import_fingerprint")
    .eq("org_id", org.id);
  const knownPrints = new Set((existing ?? []).map((l) => l.import_fingerprint).filter(Boolean));
  const knownManual = new Set(
    (existing ?? []).map((l) =>
      rowFingerprint({
        firstName: l.first_name, lastName: l.last_name, phone: l.phone, birthDate: l.birth_date,
        email: null, firstLanguage: null, levelAssessed: null, gender: null, address: null,
        city: null, postalCode: null, activityStatus: null, qpv: null, rqth: null,
        educationLevel: null, prescriber: null, district: null, entryGoal: null, entryNeed: null,
        contactSource: null, contactSourceDetail: null,
      }),
    ),
  );

  let skipped = 0;
  const seen = new Set<string>();
  const toInsert: (ReturnType<typeof rowToDbColumns> & { import_fingerprint: string })[] = [];
  for (const row of rows) {
    const print = rowFingerprint(row);
    if (knownPrints.has(print) || knownManual.has(print) || seen.has(print)) {
      skipped += 1;
      continue;
    }
    seen.add(print);
    toInsert.push({ ...rowToDbColumns(row, org.id), import_fingerprint: print });
  }

  let added = 0;
  if (toInsert.length) {
    // QPV automatique sur les nouvelles lignes uniquement (budget large : cron nocturne)
    const newRows = rows.filter((r) => seen.has(rowFingerprint(r)));
    await enrichRowsWithQpv(newRows, 30_000).catch(() => 0);
    for (const ins of toInsert) {
      const src = newRows.find((r) => rowFingerprint(r) === ins.import_fingerprint);
      if (src && src.qpv != null) ins.qpv = src.qpv;
    }
    const { data: created, error } = await supabase.from("learners").insert(toInsert).select("id, level_assessed");
    if (error) {
      return { ok: false, fileName: sheet.name, added: 0, skipped, invalid: 0, message: `Insertion impossible : ${error.message}` };
    }
    added = created?.length ?? 0;
    // Sans niveau connu → test de positionnement généré (même règle que la saisie manuelle)
    const withoutLevel = (created ?? []).filter((l) => !l.level_assessed).map((l) => ({ org_id: org.id, learner_id: l.id }));
    if (withoutLevel.length) await supabase.from("placement_tests").insert(withoutLevel);
  }

  return {
    ok: true,
    fileName: sheet.name,
    added,
    skipped,
    invalid: 0,
    message: `${added} ${added > 1 ? "nouveaux apprenants importés" : "nouvel apprenant importé"}, ${skipped} déjà connu${skipped > 1 ? "s" : ""} (fichier « ${sheet.name} »).`,
  };
}
