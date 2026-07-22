import { Readable } from "node:stream";
import { google } from "googleapis";

// Dépôt des feuilles d'émargement sur le Google Drive de l'organisme via un compte
// de service. Prérequis (variables d'environnement) :
//   GDRIVE_SERVICE_ACCOUNT_EMAIL  — email du compte de service
//   GDRIVE_SERVICE_ACCOUNT_KEY   — clé privée PEM (les \n littéraux sont acceptés)
//   GDRIVE_EMARGEMENTS_FOLDER_ID — id du dossier racine « Émargements »
//   GDRIVE_IMPERSONATE_USER      — optionnel : email Workspace au nom duquel agir
//                                  (délégation domain-wide). Sans lui, le compte de
//                                  service écrit en son nom propre : cela exige un
//                                  DRIVE PARTAGÉ (un « Mon Drive » refuse les fichiers
//                                  d'un compte de service, qui n'a pas de quota).
// Arborescence : <racine>/<nom du groupe>/<emargement_YYYY-MM-DD_groupe.pdf>

const FOLDER_MIME = "application/vnd.google-apps.folder";

export function driveConfigured(): boolean {
  return Boolean(
    process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GDRIVE_SERVICE_ACCOUNT_KEY &&
    process.env.GDRIVE_EMARGEMENTS_FOLDER_ID,
  );
}

function driveClient() {
  const auth = new google.auth.JWT({
    email: process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GDRIVE_SERVICE_ACCOUNT_KEY!.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive"],
    subject: process.env.GDRIVE_IMPERSONATE_USER || undefined,
  });
  return google.drive({ version: "v3", auth });
}

const escapeQuery = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export async function uploadSheetToDrive(opts: {
  folderName: string;
  fileName: string;
  pdf: Uint8Array;
}): Promise<{ link: string | null }> {
  const drive = driveClient();
  const rootId = process.env.GDRIVE_EMARGEMENTS_FOLDER_ID!;
  const common = { supportsAllDrives: true, includeItemsFromAllDrives: true };

  // Sous-dossier de la formation : réutilisé s'il existe, créé sinon.
  const { data: folders } = await drive.files.list({
    q: `name = '${escapeQuery(opts.folderName)}' and '${rootId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id)",
    ...common,
  });
  let folderId = folders.files?.[0]?.id ?? null;
  if (!folderId) {
    const { data: created } = await drive.files.create({
      requestBody: { name: opts.folderName, mimeType: FOLDER_MIME, parents: [rootId] },
      fields: "id",
      supportsAllDrives: true,
    });
    folderId = created.id!;
  }

  // Même séance redéposée = même nom de fichier → on remplace au lieu de dupliquer.
  const media = { mimeType: "application/pdf", body: Readable.from(Buffer.from(opts.pdf)) };
  const { data: existing } = await drive.files.list({
    q: `name = '${escapeQuery(opts.fileName)}' and '${folderId}' in parents and trashed = false`,
    fields: "files(id)",
    ...common,
  });

  let fileId: string;
  if (existing.files?.[0]?.id) {
    fileId = existing.files[0].id;
    await drive.files.update({ fileId, media, supportsAllDrives: true });
  } else {
    const { data: file } = await drive.files.create({
      requestBody: { name: opts.fileName, parents: [folderId] },
      media,
      fields: "id",
      supportsAllDrives: true,
    });
    fileId = file.id!;
  }

  const { data: meta } = await drive.files.get({
    fileId,
    fields: "webViewLink",
    supportsAllDrives: true,
  });
  return { link: meta.webViewLink ?? null };
}
