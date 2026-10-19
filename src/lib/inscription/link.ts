import { renderTemplate } from "@/lib/admission/templates";

// Lien d'inscription rapide et message WhatsApp qui l'accompagne (client et serveur).

/** Provenance du lien (?src=) : texte court, sans balise ni caractère de contrôle. */
export function sanitizeSrc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
  return v || null;
}

/** https://…/inscription, avec ?src= si une provenance est donnée. */
export function buildSignupUrl(origin: string, src?: string | null): string {
  const base = `${origin.replace(/\/+$/, "")}/inscription`;
  const s = sanitizeSrc(src);
  return s ? `${base}?src=${encodeURIComponent(s)}` : base;
}

/** Message prêt à coller : le modèle « Lien d'inscription » rempli avec le lien. */
export function buildSignupMessage(template: string, link: string): string {
  return renderTemplate(template, { lien_inscription: link });
}

/** Partage WhatsApp sans destinataire : la personne choisit le contact ou le groupe. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
