// Numéros de téléphone → lien WhatsApp « clic pour écrire » (https://wa.me/<numéro>).
// Aucune API, aucun coût : le lien ouvre WhatsApp (application ou WhatsApp Web) avec
// le message pré-rempli ; la personne connectée n'a plus qu'à appuyer sur Envoyer.
//
// Le public de l'organisme est majoritairement joignable sur WhatsApp : c'est le
// canal privilégié pour la prise de contact et les convocations.

// Numéro au format international sans « + » (ex. 33612345678), ou null si inexploitable.
// Règles : « +… » et « 00… » sont pris tels quels ; un numéro français à 10 chiffres
// (06/07…) ou à 9 chiffres sans le 0 devient 33… ; le reste est supposé déjà international.
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (hasPlus) {
    // international explicite : rien à changer
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.length === 10 && digits.startsWith("0")) {
    digits = `33${digits.slice(1)}`;
  } else if (digits.length === 9 && /^[1-9]/.test(digits)) {
    digits = `33${digits}`;
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

// Lien « clic pour écrire » avec message pré-rempli. null si le numéro est inexploitable.
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

// Affichage lisible d'un numéro français (06 12 34 56 78) ; les autres restent tels quels.
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "—";
  const number = toWhatsAppNumber(raw);
  if (number && number.startsWith("33") && number.length === 11) {
    const local = `0${number.slice(2)}`;
    return local.replace(/(\d{2})(?=\d)/g, "$1 ");
  }
  return raw.trim();
}
