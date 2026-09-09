// Modèles de messages du parcours d'admission : UN message par étape, jamais le même
// texte pour un « à contacter » et un « à convoquer ». Chaque modèle a un texte par
// défaut (ici) que la coordination peut retoucher dans l'onglet Admission → « Messages »
// (enregistré dans organizations.settings.whatsapp_templates, sans redéploiement).
//
// Variables : {prenom} {expediteur} {signature} {organisme} {lien} {date} {lieu}
// {groupe} {date_debut} {niveau}. Une ligne dont toutes les variables sont vides
// disparaît (ex. « 📍 {lieu} » sans lieu). Vouvoiement, phrases courtes : les
// destinataires apprennent le français.

export const ORG_NAME = "Parler Emploi Formation";

export const MESSAGE_STAGES = [
  {
    code: "premier_contact",
    label: "Premier contact",
    when: "Statut « Nouveau » : la personne a demandé des cours, personne ne l'a encore contactée.",
    variables: ["prenom", "expediteur", "signature", "organisme"],
    text: `Bonjour {prenom},

Je suis {expediteur} de {organisme}. Vous avez demandé des cours de français.

Je vous contacte pour organiser la suite : un test de niveau, puis une réunion d'information.

Pouvez-vous me répondre ici, sur WhatsApp, pour me dire si vous êtes toujours intéressé(e) ?

Merci, à bientôt,
{signature}`,
  },
  {
    code: "relance",
    label: "Relance (sans réponse)",
    when: "Statut « Injoignable » : un message ou un appel est resté sans réponse.",
    variables: ["prenom", "expediteur", "signature", "organisme"],
    text: `Bonjour {prenom},

Je suis {expediteur} de {organisme}. Je vous ai contacté(e) il y a quelques jours pour les cours de français, sans réponse.

Êtes-vous toujours intéressé(e) ? Répondez OUI ou NON à ce message.

Si vous préférez un appel, dites-moi le jour et l'heure qui vous conviennent.

Merci,
{signature}`,
  },
  {
    code: "test_positionnement",
    label: "Invitation au test de niveau",
    when: "Statut « Contacté » avec un test en ligne encore à faire : le lien personnel part avec les consignes.",
    variables: ["prenom", "expediteur", "signature", "organisme", "lien"],
    text: `Bonjour {prenom},

Je suis {expediteur} de {organisme}. Je me permets de vous contacter suite à votre demande de suivi des cours de français.

Voici votre lien pour passer le test de positionnement :
{lien}

Ce n'est pas une évaluation : nous voulons simplement connaître votre niveau réel.

Mettez-vous dans de bonnes conditions : au calme, avec votre téléphone chargé et le son au maximum pour bien entendre. Le test peut durer entre 5 et 35 minutes.

Vous allez être convoqué(e) — ou l'avez déjà été — à une réunion de rentrée à la suite du test.

Bon courage,
{signature}`,
  },
  {
    code: "suite_contact",
    label: "Prochaine étape (test fait)",
    when: "Statut « Contacté », test de niveau fait ou non demandé : on annonce la réunion d'information à venir.",
    variables: ["prenom", "expediteur", "signature", "organisme"],
    text: `Bonjour {prenom},

Merci pour votre réponse. Je suis {expediteur} de {organisme}.

La prochaine étape est une réunion d'information : nous présentons les cours, les horaires, et nous faisons un petit entretien oral avec vous. Ce n'est pas un examen.

Je vous envoie la date très bientôt. Avez-vous des jours ou des heures impossibles pour vous ? Dites-le-moi ici.

À bientôt,
{signature}`,
  },
  {
    code: "convocation",
    label: "Convocation à la réunion d'information",
    when: "Depuis la page de la réunion, bouton « Convoquer » : date, heure et lieu sont remplis automatiquement.",
    variables: ["prenom", "expediteur", "signature", "organisme", "date", "lieu"],
    text: `Bonjour {prenom},

Je suis {expediteur} de {organisme}.

Vous êtes invité(e) à une réunion d'information sur les cours de français :
📅 {date}
📍 {lieu}

Nous vous expliquons le programme, les horaires et le fonctionnement des cours.
Nous faisons aussi un petit entretien oral en français avec vous. Ce n'est pas un examen : c'est pour vous placer dans le bon groupe.

Merci de répondre à ce message pour confirmer votre présence : OUI ou NON.

À bientôt,
{signature}`,
  },
  {
    code: "rappel_reunion",
    label: "Rappel la veille de la réunion",
    when: "Bouton « Rappel » sur la page de la réunion, et email automatique la veille pour ceux qui ont une adresse.",
    variables: ["prenom", "signature", "organisme", "date", "lieu"],
    text: `Bonjour {prenom},

Petit rappel : la réunion d'information de {organisme} a lieu {date}.
📍 {lieu}

Nous vous attendons. Si vous ne pouvez pas venir, merci de nous prévenir en répondant à ce message.

À bientôt,
{signature}`,
  },
  {
    code: "reunion_manquee",
    label: "Absent(e) à la réunion",
    when: "Page de la réunion, personne passée « Absent(e) » : on propose une nouvelle date sans culpabiliser.",
    variables: ["prenom", "expediteur", "signature", "organisme", "date"],
    text: `Bonjour {prenom},

Je suis {expediteur} de {organisme}. Nous ne vous avons pas vu(e) à la réunion d'information ({date}).

Ce n'est pas grave. Une autre réunion est possible : répondez à ce message et nous trouvons une date ensemble.

À bientôt,
{signature}`,
  },
  {
    code: "apres_reunion",
    label: "Après le test oral (place proposée)",
    when: "Statut « Évalué » : la personne est venue, l'entretien oral est fait, on lui propose une place.",
    variables: ["prenom", "expediteur", "signature", "organisme"],
    text: `Bonjour {prenom},

Merci d'être venu(e) à la réunion d'information. Je suis {expediteur} de {organisme}.

Bonne nouvelle : nous vous proposons une place dans un groupe de français adapté à votre niveau.

Nous vous confirmons très bientôt le jour du premier cours et les horaires. Répondez OUI si vous êtes d'accord.

À bientôt,
{signature}`,
  },
  {
    code: "inscription",
    label: "Confirmation d'inscription",
    when: "Statut « Inscrit » : le groupe, le premier cours et le lieu sont remplis automatiquement.",
    variables: ["prenom", "signature", "organisme", "groupe", "date_debut", "lieu"],
    text: `Bonjour {prenom},

C'est confirmé : vous êtes inscrit(e) au groupe {groupe} de {organisme}.

📅 Premier cours : {date_debut}
📍 {lieu}

Merci d'arriver 10 minutes avant. Si vous ne pouvez pas venir un jour, prévenez-nous par ce message.

À bientôt,
{signature}`,
  },
  {
    code: "planning_groupe",
    label: "Planning du groupe",
    when: "Fiche du groupe, bouton WhatsApp à côté de chaque inscrit : les horaires, les dates et le lieu du groupe sont remplis automatiquement.",
    variables: ["prenom", "signature", "organisme", "groupe", "horaires", "date_debut", "date_fin", "lieu", "vacances"],
    text: `Bonjour {prenom},

Voici votre planning de cours de français ({groupe}) avec {organisme} :

📅 {horaires}
Du {date_debut} au {date_fin}.
📍 {lieu}
{vacances}

Merci d'arriver 10 minutes avant. Si vous ne pouvez pas venir un jour, prévenez-nous par ce message.

À bientôt,
{signature}`,
  },
  {
    code: "porte_ouverte",
    label: "Porte ouverte (sans suite)",
    when: "Statut « Sans suite » : la personne n'a pas donné suite, on laisse la porte ouverte.",
    variables: ["prenom", "expediteur", "signature", "organisme"],
    text: `Bonjour {prenom},

Je suis {expediteur} de {organisme}. Nous avions échangé au sujet des cours de français.

Si vous souhaitez reprendre, répondez simplement à ce message : nous vous trouverons une place.

Bonne continuation,
{signature}`,
  },
] as const;

export type MessageStage = (typeof MESSAGE_STAGES)[number]["code"];
export type Templates = Record<MessageStage, string>;

export const DEFAULT_TEMPLATES: Templates = Object.fromEntries(
  MESSAGE_STAGES.map((s) => [s.code, s.text]),
) as Templates;

export function stageInfo(code: MessageStage) {
  return MESSAGE_STAGES.find((s) => s.code === code)!;
}

// Modèles effectifs = défauts + retouches de l'organisme (settings.whatsapp_templates)
export function resolveTemplates(settings: unknown): Templates {
  const raw = (settings as { whatsapp_templates?: Record<string, unknown> } | null)?.whatsapp_templates ?? {};
  const out = { ...DEFAULT_TEMPLATES };
  for (const s of MESSAGE_STAGES) {
    const v = raw[s.code];
    if (typeof v === "string" && v.trim()) out[s.code] = v;
  }
  return out;
}

export type TemplateVars = Partial<Record<
  "prenom" | "expediteur" | "signature" | "organisme" | "lien" | "date" | "lieu" | "groupe" | "date_debut" | "date_fin" | "horaires" | "vacances" | "niveau",
  string | null | undefined
>>;

// Remplit un modèle. Règles de propreté pour un collage WhatsApp :
//  - une ligne dont toutes les variables sont vides et qui n'a pas d'autre mot disparaît ;
//  - « Bonjour {prenom}, » sans prénom devient « Bonjour, » ;
//  - jamais de double espace, jamais d'espace en fin de ligne, jamais 3 sauts de ligne.
export function renderTemplate(template: string, vars: TemplateVars): string {
  const lines = template.split("\n").map((line) => {
    let hadVar = false;
    let allEmpty = true;
    const out = line.replace(/\{([a-z_]+)\}/g, (_, key: string) => {
      hadVar = true;
      const v = (vars as Record<string, string | null | undefined>)[key]?.trim() ?? "";
      if (v) allEmpty = false;
      return v;
    });
    if (hadVar && allEmpty && !/[A-Za-zÀ-ÿ]/.test(out)) return null; // ligne purement décorative → supprimée
    return out;
  });
  return lines
    .filter((l): l is string => l !== null)
    .join("\n")
    .replace(/[ \t]+,/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Variables communes : prénom du destinataire, prénom de l'expéditeur, signature.
export function baseVars(learnerFirstName: string | null | undefined, senderFirstName: string | null | undefined): TemplateVars {
  const sender = senderFirstName?.trim() || null;
  return {
    prenom: learnerFirstName?.trim() || null,
    expediteur: sender,
    signature: sender ?? `L'équipe ${ORG_NAME}`,
    organisme: ORG_NAME,
  };
}

export function buildStageMessage(stage: MessageStage, vars: TemplateVars, templates: Templates = DEFAULT_TEMPLATES): string {
  // Sans prénom d'expéditeur, « Je suis  de … » devient « Je vous écris de la part de … »
  let tpl = templates[stage];
  if (!vars.expediteur) tpl = tpl.replace(/Je suis \{expediteur\} de \{organisme\}\./g, "Je vous écris de la part de {organisme}.");
  return renderTemplate(tpl, vars);
}

// ── Choix de l'étape selon la situation de l'apprenant ───────────────────────
export type LearnerSituation = {
  admissionStatus: string | null | undefined;
  pendingTestUrl?: string | null; // lien du test en ligne encore à faire
  levelAssessed?: string | null;
  upcomingMeeting?: { date: string; place: string | null } | null; // convocation à une réunion à venir
  enrollment?: { group: string; startsOn: string | null; place: string | null } | null;
};

export function pickStage(s: LearnerSituation): MessageStage {
  switch (s.admissionStatus) {
    case "injoignable":
      return "relance";
    case "contacte":
      return s.pendingTestUrl ? "test_positionnement" : "suite_contact";
    case "convoque":
      return s.upcomingMeeting ? "convocation" : s.pendingTestUrl ? "test_positionnement" : "suite_contact";
    case "evalue":
      return "apres_reunion";
    case "inscrit":
      return "inscription";
    case "sans_suite":
      return "porte_ouverte";
    default:
      return "premier_contact";
  }
}

// Message adapté à la situation : l'étape ET ses données (lien, date, groupe…).
export function messageForSituation(
  s: LearnerSituation,
  names: { learnerFirstName: string | null | undefined; senderFirstName: string | null | undefined },
  templates: Templates = DEFAULT_TEMPLATES,
): { stage: MessageStage; message: string } {
  const stage = pickStage(s);
  const vars: TemplateVars = {
    ...baseVars(names.learnerFirstName, names.senderFirstName),
    lien: s.pendingTestUrl ?? null,
    niveau: s.levelAssessed ?? null,
    date: s.upcomingMeeting?.date ?? null,
    lieu: stage === "inscription" ? (s.enrollment?.place ?? null) : (s.upcomingMeeting?.place ?? null),
    groupe: s.enrollment?.group ?? null,
    date_debut: s.enrollment?.startsOn ?? null,
  };
  return { stage, message: buildStageMessage(stage, vars, templates) };
}
