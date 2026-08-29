import nodemailer from "nodemailer";

// Envoi d'emails aux apprenants et formateurs via la boîte de l'organisme
// (SMTP Hostinger, la même que les invitations Supabase). Resend reste réservé
// aux alertes internes vers l'admin (domaine non vérifié = pas d'envoi externe).
//
// Variables d'environnement : SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
// (+ SMTP_FROM optionnel, défaut = SMTP_USER). Sans elles, sendMail renvoie false
// et l'appelant continue sans erreur (fonctionnalité inerte tant que non configurée).

export function mailerConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!mailerConfigured()) return false;

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });

  try {
    await transport.sendMail({
      from: `ParlerEmploi Formation <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    return true;
  } catch (e) {
    console.error("[mailer]", e instanceof Error ? e.message : e);
    return false;
  }
}
