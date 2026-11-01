import {
  COTISATION_EUROS,
  DOCUMENT_TEXT_VERSIONS,
  RETRACTATION_DAYS,
  membershipPeriod,
  membershipYearLabel,
  type SignedDocumentKind,
} from "./regles";

// Textes des trois documents, en français facile (phrases courtes, vouvoiement). Repris
// des modèles de l'association (Drive : « Règlement Interieur PEF.docx », « Contrat
// Formation PEF.docx », « Contrat général de formation » BOP 104) et adaptés aux cours et
// ateliers de l'association. La même source sert à l'écran du téléphone ET au PDF signé :
// ce qui est lu est exactement ce qui est signé. Tout changement de fond = nouvelle
// version (DOCUMENT_TEXT_VERSIONS dans regles.ts).

// Mentions légales de l'ASSOCIATION (jamais celles de la SASU).
export const ASSOCIATION = {
  name: "ParlerEmploi Formation",
  form: "Association loi 1901 · organisme de formation",
  address: "23 avenue Gabriel Péri, 93400 Saint-Ouen-sur-Seine",
  siret: "924 182 546 00011",
  nda: "11931070593",
  ndaLine: "Déclaration d'activité n° 11931070593 (préfecture d'Île-de-France)",
  president: "Anis Kilani",
  presidentTitle: "président",
  phone: "06 14 33 99 73",
  email: "contact@parleremploi.fr",
  city: "Saint-Ouen-sur-Seine",
};

export type TextSection = { heading: string; paragraphs?: string[]; bullets?: string[] };

export type DocumentText = {
  kind: SignedDocumentKind;
  version: string;
  title: string;
  subtitle: string;
  essentials: string[]; // « L'essentiel » : 3 à 5 phrases, en tête d'écran et de PDF
  sections: TextSection[];
  acceptLabel: string; // case à cocher avant de signer
};

export type LearnerForText = {
  firstName: string;
  lastName: string;
  birthDate: string | null; // AAAA-MM-JJ
  gender: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  ref: string | null; // A-0042
};

export type GroupForText = {
  name: string;
  programName: string | null;
  level: string | null; // niveau visé (dispositif)
  entryLevel: string | null; // niveau demandé à l'entrée
  kind: "cours" | "atelier";
  startsOn: string | null;
  endsOn: string | null;
  totalHours: number | null;
  schedule: string | null; // « lundi 9h-12h, jeudi 9h-12h »
  place: string | null; // salle et adresse
  capacity: number | null;
  trainerName: string | null;
  priceEuros: number; // prix de la formation pour la personne (0 = gratuit)
};

const longDay = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const hoursLabel = (h: number) => `${(Math.round(h * 10) / 10).toString().replace(".", ",")} heures`;

export function learnerFullName(l: Pick<LearnerForText, "firstName" | "lastName">): string {
  return `${l.firstName === "?" ? "" : l.firstName} ${l.lastName}`.trim();
}

/** Lignes d'identité de la personne (PDF) : nom, naissance, adresse, contact. */
export function learnerIdentityLines(l: LearnerForText): string[] {
  const born = l.gender === "femme" ? "née" : l.gender === "homme" ? "né" : "né(e)";
  const address = [l.address, [l.postalCode, l.city].filter(Boolean).join(" ")].filter((x) => x && x.trim()).join(", ");
  return [
    `${learnerFullName(l)}${l.ref ? ` (dossier n° ${l.ref})` : ""}`,
    l.birthDate ? `${born} le ${longDay(l.birthDate)}` : null,
    address ? `domicile : ${address}` : null,
    [l.phone ? `téléphone : ${l.phone}` : null, l.email ? `email : ${l.email}` : null].filter(Boolean).join(" · ") || null,
  ].filter((x): x is string => Boolean(x));
}

// ── 1. Bulletin d'adhésion ──────────────────────────────────────────────────

export function adhesionText(year: number, cotisationEuros = COTISATION_EUROS): DocumentText {
  const label = membershipYearLabel(year);
  const amount = `${cotisationEuros} €`;
  return {
    kind: "adhesion",
    version: DOCUMENT_TEXT_VERSIONS.adhesion,
    title: "Bulletin d'adhésion à l'association",
    subtitle: `Année ${label} (${membershipPeriod(year)})`,
    essentials: [
      `Vous devenez membre de l'association ${ASSOCIATION.name}.`,
      `La cotisation est de ${amount} pour l'année ${label}.`,
      "Vous payez une seule fois pour toute l'année, même si vous suivez plusieurs cours ou ateliers.",
      "Vous pouvez partir quand vous voulez.",
    ],
    sections: [
      {
        heading: "L'association",
        paragraphs: [
          `${ASSOCIATION.name} est une association loi 1901. Elle donne des cours de français et des ateliers aux adultes.`,
          "Elle accompagne chaque personne dans son parcours : vie de tous les jours, formation, emploi.",
        ],
      },
      {
        heading: "Ma demande d'adhésion",
        paragraphs: [
          `Je demande à devenir membre de l'association ${ASSOCIATION.name} pour l'année ${label}.`,
          `Mon adhésion commence quand l'association reçoit ce bulletin signé. Elle finit le 31 août ${year + 1}.`,
          "Pour l'année suivante, il faut adhérer de nouveau.",
        ],
      },
      {
        heading: "La cotisation",
        bullets: [
          `Montant : ${amount} pour l'année ${label}.`,
          "Vous payez en espèces, par chèque (à l'ordre de « ParlerEmploi Formation »), par virement, par carte bancaire ou en ligne (HelloAsso).",
          `Vous payez après le délai pour changer d'avis du contrat de formation : ${RETRACTATION_DAYS.sur_place} jours après la signature (${RETRACTATION_DAYS.lien} jours si vous signez avec le lien, chez vous).`,
          "L'association vous donne un reçu.",
          "La cotisation n'est pas le prix des cours : c'est votre participation à la vie de l'association.",
        ],
      },
      {
        heading: "Mes droits de membre",
        bullets: [
          "Je suis invité(e) à l'assemblée générale : la réunion de tous les membres, une fois par an (en octobre). L'invitation arrive au moins 15 jours avant.",
          "À l'assemblée générale, je peux voter.",
          "Je reçois les informations de l'association.",
          "Je peux lire les statuts de l'association : je les demande à l'équipe.",
        ],
      },
      {
        heading: "Mes engagements",
        bullets: [
          "Je respecte les statuts et le règlement intérieur de l'association.",
          "Je respecte les autres membres, les formatrices, les bénévoles et les lieux.",
        ],
      },
      {
        heading: "La fin de l'adhésion",
        bullets: [
          "Je peux partir quand je veux : je préviens l'équipe (message, email ou lettre).",
          "L'adhésion peut aussi finir pour un motif grave, après une explication avec le bureau de l'association (statuts, article 8).",
          "La cotisation payée n'est pas rendue, sauf si je change d'avis pendant le délai prévu au contrat de formation.",
        ],
      },
      {
        heading: "Mes données personnelles",
        paragraphs: [
          "L'association garde mes informations (nom, coordonnées, cours suivis, paiements) pour gérer mon adhésion et mes cours. Elle ne les vend pas.",
          `Je peux les voir, les corriger ou demander leur suppression : ${ASSOCIATION.email}.`,
        ],
      },
    ],
    acceptLabel: `J'ai lu le bulletin d'adhésion. Je demande à devenir membre et je paierai la cotisation de ${amount}.`,
  };
}

// ── 2. Contrat de formation ─────────────────────────────────────────────────

export function contratText(g: GroupForText): DocumentText {
  const atelier = g.kind === "atelier";
  const formation = g.programName ?? g.name;
  const what = atelier ? "l'atelier" : "le cours";
  const free = g.priceEuros <= 0;
  const period = g.startsOn && g.endsOn ? `du ${longDay(g.startsOn)} au ${longDay(g.endsOn)}` : g.startsOn ? `à partir du ${longDay(g.startsOn)}` : "selon le planning remis";
  const duration = g.totalHours && g.totalHours > 0 ? hoursLabel(g.totalHours) : null;

  return {
    kind: "contrat_formation",
    version: DOCUMENT_TEXT_VERSIONS.contrat_formation,
    title: "Contrat de formation professionnelle",
    subtitle: "Articles L6353-3 à L6353-7 du Code du travail",
    essentials: [
      `${atelier ? "L'atelier" : "Le cours"} : ${formation}${duration ? `, ${duration}` : ""}, ${period}.`,
      free ? "La formation est gratuite pour vous." : `Prix de la formation pour vous : ${g.priceEuros} €.`,
      `Vous avez ${RETRACTATION_DAYS.sur_place} jours pour changer d'avis (${RETRACTATION_DAYS.lien} jours si vous signez avec le lien, chez vous).`,
      "Vous venez à chaque séance et vous signez la feuille de présence.",
    ],
    sections: [
      {
        heading: "Les deux parties",
        paragraphs: [
          `D'une part, l'association ${ASSOCIATION.name}, ${ASSOCIATION.address}. SIRET ${ASSOCIATION.siret}. ${ASSOCIATION.ndaLine}. Elle est représentée par ${ASSOCIATION.president}, ${ASSOCIATION.presidentTitle}. Dans ce contrat : « l'association ».`,
          "D'autre part, la personne qui signe ce contrat (nom et coordonnées ci-dessous). Dans ce contrat : « vous », le stagiaire.",
          "Ce contrat est conclu en application des articles L6353-3 à L6353-7 du Code du travail.",
        ],
      },
      {
        heading: "1. L'objet du contrat",
        paragraphs: [
          `L'association organise pour vous ${what} « ${formation} » (groupe ${g.name}).`,
          atelier
            ? "C'est un atelier de français en groupe, animé par des bénévoles, dans le cadre d'une action de formation (article L6313-1 du Code du travail)."
            : "C'est une action de formation (article L6313-1 du Code du travail) : un cours de français langue étrangère (FLE).",
          `Objectif : mieux comprendre, parler, lire et écrire le français, pour la vie de tous les jours et pour le travail.${g.level ? ` Niveau visé : ${g.level} (Cadre européen commun de référence pour les langues).` : ""}`,
        ],
      },
      {
        heading: "2. Le programme",
        bullets: [
          "Comprendre et parler dans les situations de tous les jours : transport, santé, démarches, école, travail.",
          "Lire et écrire des textes simples et utiles (messages, formulaires, documents).",
          "Connaître la vie en France, les services publics et les lieux de la ville.",
          "Apprendre les mots du travail et préparer votre projet : CV, lettre, entretien.",
          ...(atelier ? ["Pratiquer en groupe, à votre rythme, avec des activités concrètes."] : []),
        ],
        paragraphs: ["Le programme est adapté à votre niveau, mesuré au début de la formation."],
      },
      {
        heading: "3. Durée, dates, lieu et groupe",
        bullets: [
          `Durée : ${duration ?? "selon le planning remis"}.`,
          `Dates : ${period}.`,
          ...(g.schedule ? [`Horaires : ${g.schedule}.`] : []),
          `Lieu : ${g.place ?? "communiqué avec le planning"}.`,
          `Effectif : ${g.capacity ? `${g.capacity} personnes au maximum dans le groupe` : "un petit groupe"}.`,
          "Vous recevez le planning des séances. Il peut changer : l'association vous prévient.",
        ],
      },
      {
        heading: "4. Le niveau demandé pour commencer",
        paragraphs: [
          g.entryLevel
            ? `Pour suivre cette formation, il faut avoir le niveau ${g.entryLevel} environ. Un test de positionnement (écrit et oral) le vérifie avant le début.`
            : "Aucun diplôme n'est demandé. Un test de positionnement (écrit et oral) mesure votre niveau avant le début.",
        ],
      },
      {
        heading: "5. Comment se passe la formation",
        bullets: [
          "En présentiel, dans une salle, en petit groupe.",
          "Supports de cours (fiches, documents, exercices). Parfois des exercices sur ordinateur ou sur téléphone.",
          atelier
            ? "Les ateliers sont animés par des bénévoles, avec le suivi de l'équipe pédagogique de l'association."
            : "Les cours sont donnés par des formatrices de français langue étrangère (FLE), diplômées ou en master FLE.",
          ...(g.trainerName ? [`${atelier ? "Animation" : "Formatrice ou formateur"} du groupe : ${g.trainerName}.`] : []),
        ],
      },
      {
        heading: "6. Le suivi et l'évaluation",
        bullets: [
          "Au début : test de positionnement.",
          "Pendant : exercices et évaluation à mi-parcours.",
          "À la fin : évaluation des 4 compétences (comprendre, parler, lire, écrire).",
          "À chaque séance, vous signez la feuille de présence.",
          "À la fin, vous recevez une attestation de fin de formation, avec vos résultats. Ce n'est pas un diplôme.",
        ],
      },
      {
        heading: "7. Le prix et le paiement",
        bullets: [
          free
            ? "La formation est gratuite pour vous : 0 €. Elle est financée par l'association (avec des subventions publiques)."
            : `Prix de la formation : ${g.priceEuros} € (association non soumise à la TVA).`,
          `L'adhésion à l'association (${COTISATION_EUROS} € par an) est demandée à part, avec le bulletin d'adhésion.`,
          "Rien n'est à payer avant la fin du délai pour changer d'avis (article L6353-6 du Code du travail).",
        ],
      },
      {
        heading: "8. Le délai pour changer d'avis (rétractation)",
        bullets: [
          `Vous avez ${RETRACTATION_DAYS.sur_place} jours après la signature pour changer d'avis (article L6353-5 du Code du travail).`,
          `Si vous signez à distance (avec le lien, chez vous), ce délai est de ${RETRACTATION_DAYS.lien} jours (Code de la consommation).`,
          "Pour changer d'avis, envoyez une lettre recommandée avec accusé de réception à l'association. Prévenez aussi l'équipe par message ou par email.",
          "Dans ce cas, vous ne payez rien, et la cotisation déjà payée vous est rendue.",
        ],
      },
      {
        heading: "9. Absences, arrêt de la formation",
        bullets: [
          "Venez à toutes les séances. En cas d'absence ou de retard, prévenez la formatrice ou l'équipe.",
          free
            ? "Si vous ne pouvez plus venir (raison grave ou force majeure, ou autre raison), prévenez l'équipe : le contrat s'arrête. La formation étant gratuite, vous ne payez rien."
            : "Si vous ne pouvez plus venir pour une raison grave (force majeure), le contrat s'arrête : vous payez seulement les heures déjà faites (article L6353-7 du Code du travail).",
          "Si l'association arrête la formation, elle vous prévient. Une séance annulée est remplacée quand c'est possible.",
          "En cas de faute grave, l'association peut arrêter la formation, selon le règlement intérieur.",
        ],
      },
      {
        heading: "10. Le règlement intérieur",
        paragraphs: ["Vous recevez le règlement intérieur avec ce contrat. Vous le respectez pendant toute la formation."],
      },
      {
        heading: "11. Une question, une réclamation, un désaccord",
        bullets: [
          `Parlez-en à la formatrice ou à l'équipe, ou écrivez à ${ASSOCIATION.email} (téléphone ${ASSOCIATION.phone}). L'association vous répond.`,
          "En cas de désaccord, nous cherchons d'abord une solution ensemble. Sinon, le tribunal compétent peut être saisi.",
        ],
      },
    ],
    acceptLabel: "J'ai lu le contrat de formation. Je suis d'accord.",
  };
}

// ── 3. Règlement intérieur ──────────────────────────────────────────────────

export function reglementText(): DocumentText {
  return {
    kind: "reglement_interieur",
    version: DOCUMENT_TEXT_VERSIONS.reglement_interieur,
    title: "Règlement intérieur",
    subtitle: "Pour les stagiaires de l'association · articles L6352-3 et R6352-1 à R6352-15 du Code du travail",
    essentials: [
      "Venez à l'heure. Prévenez si vous êtes absent(e). Signez la feuille de présence.",
      "Respectez les personnes, le matériel et les lieux.",
      "Pas d'alcool, pas de drogue, pas de cigarette dans les salles.",
      "En cas de problème grave, l'association peut donner une sanction, après vous avoir écouté(e).",
    ],
    sections: [
      {
        heading: "Article 1 — Pour qui ?",
        paragraphs: [
          `Ce règlement s'applique à toutes les personnes qui suivent un cours ou un atelier de ${ASSOCIATION.name} (les stagiaires), pendant toute la formation.`,
          "Les cours ont lieu dans des salles prêtées par la Ville ou par des partenaires : les règles de ces lieux s'appliquent aussi.",
        ],
      },
      {
        heading: "Article 2 — Santé et sécurité",
        bullets: [
          "Respectez les consignes de sécurité du lieu (incendie, évacuation). Elles sont affichées.",
          "Il est interdit de fumer et de vapoter dans les locaux.",
          "Il est interdit de venir en état d'ivresse ou sous l'effet de la drogue, et d'apporter de l'alcool ou de la drogue.",
          "Gardez les lieux propres.",
        ],
      },
      {
        heading: "Article 3 — Accident",
        paragraphs: ["Un accident pendant la formation ou sur le trajet ? Prévenez tout de suite la formatrice ou l'équipe. Un témoin peut aussi prévenir."],
      },
      {
        heading: "Article 4 — Le matériel et les documents",
        bullets: [
          "Prenez soin du matériel prêté (livres, tablettes, ordinateurs). Utilisez-le seulement pour la formation.",
          "Ne prenez aucun objet ni document sans autorisation.",
          "Les documents du cours sont pour vous. Il est interdit de les copier ou de les vendre.",
        ],
      },
      {
        heading: "Article 5 — Horaires, retards et absences",
        bullets: [
          "Les horaires sont dans votre planning. Venez à l'heure.",
          "En cas de retard ou d'absence, prévenez la formatrice ou l'équipe (WhatsApp, SMS ou appel) et dites pourquoi.",
          "Ne partez pas pendant la séance sans raison.",
          "Signez la feuille de présence à chaque séance (sur la tablette).",
          "Si votre formation est payée par un employeur ou un financeur, l'association l'informe de vos absences.",
        ],
      },
      {
        heading: "Article 6 — L'accès aux salles",
        bullets: [
          "Vous venez dans les salles seulement pour la formation.",
          "Ne faites pas entrer de personnes extérieures sans l'accord de l'équipe.",
          "Il est interdit de vendre des produits dans les salles.",
        ],
      },
      {
        heading: "Article 7 — Le respect et le comportement",
        bullets: [
          "Soyez poli(e) et respectueux(se) avec tout le monde : stagiaires, formatrices, bénévoles, personnel des lieux.",
          "La violence, les insultes, le harcèlement, le racisme et toute discrimination sont interdits.",
          "Venez dans une tenue correcte.",
          "Téléphone en silencieux pendant la séance. Pas de photo ni de vidéo d'une personne sans son accord.",
        ],
      },
      {
        heading: "Article 8 — Vos affaires personnelles",
        paragraphs: ["Gardez vos affaires avec vous. L'association n'est pas responsable en cas de perte, de vol ou de casse."],
      },
      {
        heading: "Article 9 — Les sanctions",
        paragraphs: [
          "Si vous ne respectez pas ce règlement, l'association peut prendre une sanction. Elle choisit selon la gravité :",
        ],
        bullets: [
          "1. un avertissement écrit ;",
          "2. un blâme ;",
          "3. une exclusion pour quelques jours ;",
          "4. une exclusion définitive de la formation.",
          "Il n'y a jamais d'amende.",
          "Si votre formation est payée par un employeur ou un financeur, l'association l'informe de la sanction.",
        ],
      },
      {
        heading: "Article 10 — Vos droits avant une sanction",
        bullets: [
          "Aucune sanction sans que vous soyez informé(e) avant, par écrit, de ce qui vous est reproché.",
          "Si la sanction peut changer votre présence en formation (exclusion), l'association vous convoque à un entretien, par lettre recommandée ou par lettre remise en main propre. La lettre donne la date, l'heure, le lieu et le motif.",
          "Vous pouvez venir avec une personne de votre choix : un(e) stagiaire ou un(e) salarié(e) de l'association.",
          "Pendant l'entretien, on vous explique le motif et on écoute vos explications.",
          "La sanction est décidée au moins un jour franc et au plus 15 jours après l'entretien. Elle vous est remise par écrit, avec ses raisons.",
          "Pour une faute très grave, l'association peut vous demander de ne plus venir tout de suite, en attendant la décision. Les règles ci-dessus restent respectées.",
        ],
      },
      {
        heading: "Article 11 — Les délégués des stagiaires",
        paragraphs: [
          "Pour une formation de plus de 500 heures, les stagiaires élisent un délégué et un suppléant (articles R6352-9 à R6352-15 du Code du travail). Les délégués proposent des améliorations et portent les réclamations des stagiaires.",
        ],
      },
      {
        heading: "Article 12 — Une remarque, une réclamation",
        paragraphs: [
          `Parlez-en à la formatrice ou à l'équipe, ou écrivez à ${ASSOCIATION.email}. L'association note chaque réclamation et vous répond.`,
        ],
      },
      {
        heading: "Article 13 — Remise et entrée en vigueur",
        paragraphs: [
          "Ce règlement est remis à chaque stagiaire avant le début de la formation. Il s'applique dès sa remise.",
          `Version du ${longDay(DOCUMENT_TEXT_VERSIONS.reglement_interieur)}.`,
        ],
      },
    ],
    acceptLabel: "J'ai lu le règlement intérieur. Je l'accepte et je le respecte.",
  };
}

export function documentText(kind: SignedDocumentKind, ctx: { year: number; group: GroupForText }): DocumentText {
  if (kind === "adhesion") return adhesionText(ctx.year);
  if (kind === "contrat_formation") return contratText(ctx.group);
  return reglementText();
}

/** Texte brut (Markdown) d'un document : relecture par l'association avant la mise en ligne. */
export function documentMarkdown(t: DocumentText): string {
  const out = [`# ${t.title}`, "", `*${t.subtitle}* — version du ${t.version}`, "", "## L'essentiel", "", ...t.essentials.map((e) => `- ${e}`), ""];
  for (const s of t.sections) {
    out.push(`## ${s.heading}`, "");
    for (const p of s.paragraphs ?? []) out.push(p, "");
    if (s.bullets?.length) out.push(...s.bullets.map((b) => `- ${b}`), "");
  }
  out.push("---", "", `☐ ${t.acceptLabel}`, "", "Signature au doigt, horodatée.", "");
  return out.join("\n");
}
