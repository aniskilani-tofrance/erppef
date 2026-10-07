import { sendMail } from "@/lib/mailer";

// Relance des formateurs : feuilles d'émargement non clôturées.
// Deux passages : le soir même (cron « relance-emargement », séances du jour) et le
// lendemain matin (cron « alertes », séances des 48 dernières heures). Un seul email
// par formateur et par passage, qui liste toutes ses feuilles en attente.

export type UnclosedSheet = {
  id: string;
  starts_at: string;
  groups: unknown;
  trainers: unknown;
};

export type RelanceMoment = "soir" | "matin";

export function groupRelancesByTrainer(
  sheets: UnclosedSheet[],
): Map<string, { firstName: string; lines: string[] }> {
  const byTrainer = new Map<string, { firstName: string; lines: string[] }>();
  for (const s of sheets) {
    const trainer = s.trainers as { first_name: string; email: string | null } | null;
    if (!trainer?.email) continue;
    const group = (s.groups as { name: string } | null)?.name ?? "?";
    const day = new Date(s.starts_at).toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris",
    });
    const entry = byTrainer.get(trainer.email) ?? { firstName: trainer.first_name.trim(), lines: [] };
    entry.lines.push(`${group} — séance du ${day} : https://pef-erp.vercel.app/seances/${s.id}/emargement`);
    byTrainer.set(trainer.email, entry);
  }
  return byTrainer;
}

export function relanceEmail(moment: RelanceMoment, firstName: string, lines: string[]): { subject: string; html: string } {
  const plural = lines.length > 1;
  const subject =
    moment === "soir"
      ? `Ce soir : ${plural ? `${lines.length} feuilles` : "une feuille"} d'émargement à clôturer`
      : `Feuille${plural ? "s" : ""} d'émargement à clôturer`;
  const intro =
    moment === "soir"
      ? plural
        ? "Vos séances d'aujourd'hui sont terminées, mais ces feuilles d'émargement ne sont pas encore clôturées :"
        : "Votre séance d'aujourd'hui est terminée, mais sa feuille d'émargement n'est pas encore clôturée :"
      : `Il reste ${plural ? "des feuilles" : "une feuille"} d'émargement à contre-signer et clôturer :`;
  const outro =
    moment === "soir"
      ? "<p>30 secondes : ouvrez le lien, vérifiez les présences, puis « Contre-signer et clôturer ». Sans clôture, les présences ne comptent pas (assiduité, attestations, envoi à la Ville).</p>"
      : "";
  return {
    subject,
    html: `<p>Bonjour ${firstName},</p>
<p>${intro}</p>
<ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>
${outro}<p>Merci !<br/>ParlerEmploi Formation</p>`,
  };
}

export async function sendTrainerRelances(sheets: UnclosedSheet[], moment: RelanceMoment): Promise<number> {
  let sent = 0;
  for (const [email, entry] of groupRelancesByTrainer(sheets)) {
    const { subject, html } = relanceEmail(moment, entry.firstName, entry.lines);
    if (await sendMail({ to: email, subject, html })) sent += 1;
  }
  return sent;
}
