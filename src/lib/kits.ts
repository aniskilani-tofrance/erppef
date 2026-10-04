// Kits de séance : le PDF complet d'une séance (script formatrice + fiches apprenants),
// produit hors ERP et déposé sur la séance. Réservé à l'équipe : jamais visible des apprenants
// (émargement, enquête, test, plannings envoyés), ni des rôles viewer et setter.

export const KIT_BUCKET = "kits"; // bucket PRIVÉ, sans aucune policy client : accès par le serveur uniquement
export const KIT_MAX_BYTES = 30 * 1024 * 1024;
export const KIT_LINK_SECONDS = 300; // un lien transféré ne fonctionne plus après 5 minutes

const TZ = "Europe/Paris";

export type KitFileName = {
  groupNo: number;
  date: string; // AAAA-MM-JJ, heure de Paris
  time: string; // HH:MM, heure de Paris
  level: string | null;
  sequenceNo: number | null;
  seanceNo: number | null;
};

// kit_G3_2026-10-05_14h00_A2_S1-1.pdf · kit_G-4_2026-10-06_9h00.pdf · « (1) » de macOS toléré.
const KIT_NAME =
  /^kit[_-]G-?(\d{1,3})[_-](\d{4})-(\d{2})-(\d{2})[_-](\d{1,2})h(\d{2})(?:[_-]([ABC][12](?:\.\d)?))?(?:[_-]S(\d{1,2})-(\d{1,2}))?(?:[^/]*)\.pdf$/i;

export function parseKitFileName(fileName: string): KitFileName | null {
  const m = KIT_NAME.exec(fileName.trim());
  if (!m) return null;
  const [, g, y, mo, d, h, mi, level, seq, seance] = m;
  const hour = Number(h);
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31 || hour > 23 || Number(mi) > 59) return null;
  return {
    groupNo: Number(g),
    date: `${y}-${mo}-${d}`,
    time: `${String(hour).padStart(2, "0")}:${mi}`,
    level: level ? level.toUpperCase() : null,
    sequenceNo: seq ? Number(seq) : null,
    seanceNo: seance ? Number(seance) : null,
  };
}

/** Date et heure de début d'une séance à Paris, pour la retrouver d'après le nom du kit. */
export function parisDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("fr-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return { date, time };
}

/** Sous-dossier de rangement après import : « semaine du 5 octobre 2026 » (lundi de la semaine). */
export function kitWeekFolder(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return `semaine du ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`;
}

/** Un seul kit par séance : le dépôt suivant remplace le précédent. */
export function kitStoragePath(orgId: string, sessionId: string): string {
  return `${orgId}/${sessionId}.pdf`;
}

/** Nom proposé au téléchargement : celui du fichier déposé, sans caractère gênant. */
export function kitDownloadName(fileName: string): string {
  const base = fileName.replace(/[/\\]/g, "-").trim();
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

export type KitAccessInput = {
  role: string;
  myTrainerId: string | null; // fiche formateur liée au compte connecté
  session: { trainerId: string | null; coTrainerId: string | null };
};

/** Même règle que la policy SQL : coordination ou formateur (titulaire, remplaçant, co-animateur) de la séance. */
export function canDownloadKit({ role, myTrainerId, session }: KitAccessInput): boolean {
  if (role === "admin" || role === "coordinator") return true;
  if (role !== "trainer" || !myTrainerId) return false;
  return session.trainerId === myTrainerId || session.coTrainerId === myTrainerId;
}

export function canManageKits(role: string): boolean {
  return role === "admin" || role === "coordinator";
}
