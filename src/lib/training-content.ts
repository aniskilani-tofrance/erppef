// Parcours de formation interactifs de l'ERP PEF.
// Pédagogie : objectifs annoncés → leçons courtes en étapes → exercice réel
// (« À vous de jouer ») → quiz de validation avec explication de la bonne réponse.

export type QuizQuestion = {
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
};

export type Lesson = {
  id: string;
  title: string;
  intro?: string;
  steps: string[];
  tip?: string;
  practice?: { instruction: string; href?: string; hrefLabel?: string };
};

export type TrainingModule = {
  id: string;
  track: "formateur" | "coordinateur";
  order: number;
  title: string;
  duration: string; // estimation affichée
  objectives: string[];
  lessons: Lesson[];
  quiz: QuizQuestion[];
};

export const TRAINING_MODULES: TrainingModule[] = [
  // ───────────────────────── PARCOURS FORMATEUR ─────────────────────────
  {
    id: "f1-prise-en-main",
    track: "formateur",
    order: 1,
    title: "Prise en main",
    duration: "10 min",
    objectives: [
      "Me connecter et retrouver mes cours du jour",
      "Savoir où changer mon mot de passe",
      "Comprendre ce que l'ERP fait pour moi",
    ],
    lessons: [
      {
        id: "connexion",
        title: "Ma première connexion",
        intro: "L'ERP est votre outil quotidien : planning, feuilles d'émargement, suivi de vos groupes.",
        steps: [
          "Ouvrez pef-erp.vercel.app (ordinateur, tablette ou téléphone).",
          "Connectez-vous avec votre email professionnel et votre mot de passe (défini via l'email d'invitation).",
          "Votre Dashboard s'ouvre : il n'affiche QUE ce qui vous concerne — vos séances du jour, vos feuilles à clôturer, votre semaine.",
          "Mot de passe perdu ? « Mot de passe oublié ? » sur l'écran de connexion : un lien arrive par email.",
        ],
        tip: "Ajoutez la page à l'écran d'accueil de votre téléphone : elle s'utilise comme une application.",
        practice: {
          instruction: "Ouvrez « Mon compte » (en bas du menu) et vérifiez votre email. Si vous utilisez encore un mot de passe temporaire, changez-le maintenant.",
          href: "/compte",
          hrefLabel: "Ouvrir Mon compte",
        },
      },
      {
        id: "dashboard",
        title: "Lire mon Dashboard",
        steps: [
          "« Aujourd'hui » : vos séances du jour, avec un bouton Émargement direct pour chacune.",
          "Un encadré rouge « Feuilles à clôturer » apparaît si une feuille d'émargement des 7 derniers jours n'est pas clôturée : traitez-le en priorité.",
          "« Ma semaine » : toutes vos séances, avec un badge « émargée » quand la feuille est close.",
          "Vos cours sont aussi dans votre agenda Google personnel « Cours PEF — votre nom », mis à jour chaque nuit.",
        ],
        tip: "Le badge « émargée » est votre liste de contrôle : en fin de semaine, toutes vos séances passées doivent l'avoir.",
      },
    ],
    quiz: [
      {
        question: "Où retrouvez-vous vos séances du jour en un coup d'œil ?",
        choices: ["Sur mon Dashboard, dès la connexion", "Dans le menu Planning uniquement", "En demandant au coordinateur"],
        answerIndex: 0,
        explanation: "Le Dashboard du formateur affiche directement vos séances du jour avec le bouton Émargement.",
      },
      {
        question: "Un encadré rouge apparaît sur votre Dashboard. Que signale-t-il ?",
        choices: ["Une panne de l'ERP", "Une feuille d'émargement passée non clôturée", "Un message du coordinateur"],
        answerIndex: 1,
        explanation: "L'encadré rouge liste vos feuilles d'émargement oubliées : ce sont des documents obligatoires, clôturez-les au plus vite.",
      },
      {
        question: "Comment changer votre mot de passe quand vous êtes connecté(e) ?",
        choices: ["Impossible, il faut demander à l'admin", "En se réinscrivant", "Menu « Mon compte » en bas à gauche"],
        answerIndex: 2,
        explanation: "« Mon compte » permet de changer son mot de passe à tout moment (l'actuel est demandé par sécurité).",
      },
    ],
  },
  {
    id: "f2-emargement",
    track: "formateur",
    order: 2,
    title: "L'émargement de A à Z",
    duration: "15 min",
    objectives: [
      "Faire signer un groupe en début de séance",
      "Gérer retards, absences et cas particuliers",
      "Clôturer proprement (et pourquoi c'est important)",
    ],
    lessons: [
      {
        id: "ouvrir",
        title: "Ouvrir la feuille et faire signer",
        intro: "La feuille d'émargement électronique remplace le papier : mêmes signatures, plus de valeur (horodatage), zéro classeur.",
        steps: [
          "Depuis le Dashboard ou le Planning, ouvrez la séance → « Feuille d'émargement » → « Ouvrir l'émargement ».",
          "Un QR code s'affiche : scannez-le avec la tablette (ou votre téléphone) — la liste des apprenants apparaît, avec leurs photos.",
          "Faites circuler la tablette : chacun touche son nom, signe au doigt, valide. La ligne se verrouille (coche verte).",
          "Sur votre écran, la liste se met à jour toute seule : vous voyez qui a signé en temps réel.",
        ],
        tip: "Les photos des apprenants rendent la liste très rapide à utiliser, même avec un public peu à l'aise en lecture.",
      },
      {
        id: "cas-particuliers",
        title: "Retards, absents, erreurs",
        steps: [
          "Un retardataire ? Le lien reste valable jusqu'à la clôture : il signe en arrivant. Posez-lui le statut « Retard » pour la traçabilité.",
          "Un absent ? Rien à faire : à la clôture, tout inscrit sans signature ni statut est marqué absent automatiquement. Vous pouvez aussi poser « Absent » à la main.",
          "Quelqu'un a signé sur la mauvaise ligne ? Marquez cette ligne « Absent » (la signature erronée s'efface) puis faites re-signer au bon endroit.",
          "La signature refuse de partir ? Vérifiez la connexion de la tablette et réessayez : rien n'est perdu tant que la feuille est ouverte.",
        ],
      },
      {
        id: "cloturer",
        title: "Clôturer : le geste qui compte",
        intro: "La clôture transforme la feuille en document légal et met tout l'ERP à jour.",
        steps: [
          "Vérifiez la liste : chacun doit avoir une signature ou un statut.",
          "« Contre-signer et clôturer » : signez à votre tour (votre signature est obligatoire sur la feuille).",
          "À la clôture : la séance passe automatiquement en « réalisée », l'assiduité de chaque apprenant se met à jour, et la feuille PDF devient disponible.",
          "Après clôture, seule l'équipe de coordination peut rouvrir la feuille pour correction.",
        ],
        tip: "Clôturez à la fin de chaque séance, pas en fin de semaine : c'est 30 secondes, et le suivi d'assiduité reste exact en continu.",
        practice: {
          instruction: "Repérez votre prochaine séance dans le planning et localisez son bouton « Feuille d'émargement » (sans l'ouvrir si la séance n'a pas lieu).",
          href: "/planning",
          hrefLabel: "Ouvrir le planning",
        },
      },
    ],
    quiz: [
      {
        question: "Que deviennent les inscrits qui n'ont ni signé ni reçu de statut au moment de la clôture ?",
        choices: ["Ils restent « en attente »", "La clôture est bloquée", "Ils sont marqués absents automatiquement"],
        answerIndex: 2,
        explanation: "La clôture complète la feuille : les non-signés sans statut deviennent absents — la feuille est toujours complète.",
      },
      {
        question: "Un apprenant arrive 40 minutes en retard. Que faites-vous ?",
        choices: ["Il signe à son arrivée et vous posez le statut « Retard »", "Il ne peut plus signer", "Vous signez à sa place"],
        answerIndex: 0,
        explanation: "Le lien reste actif jusqu'à la clôture. On ne signe JAMAIS à la place d'un apprenant.",
      },
      {
        question: "Pourquoi clôturer la feuille à chaque fin de séance ?",
        choices: [
          "Pour libérer la tablette",
          "Parce que la séance passe en « réalisée », l'assiduité se met à jour et le document devient officiel",
          "Ce n'est pas nécessaire",
        ],
        answerIndex: 1,
        explanation: "La clôture est le geste qui alimente tout : heures réalisées, assiduité, alertes décrochage, documents financeurs.",
      },
    ],
  },
  {
    id: "f3-reflexes",
    track: "formateur",
    order: 3,
    title: "Les bons réflexes",
    duration: "5 min",
    objectives: [
      "Savoir réagir aux imprévus (absence, changement de salle)",
      "Savoir où trouver de l'aide",
    ],
    lessons: [
      {
        id: "imprevus",
        title: "Imprévus et changements",
        steps: [
          "Vous serez absent(e) ? Prévenez le coordinateur au plus tôt : il enregistre l'absence et déplace ou réaffecte les séances.",
          "Changement de salle ou d'horaire : c'est aussi le coordinateur qui modifie le planning ; votre agenda Google se met à jour dans la nuit.",
          "Un doute sur un apprenant (absences répétées…) : signalez-le — l'ERP le détecte aussi (alerte à 3 absences de suite), mais votre œil humain reste irremplaçable.",
        ],
      },
      {
        id: "aide",
        title: "Trouver de l'aide",
        steps: [
          "Menu « Aide » (en bas à gauche) : mode d'emploi par tâche et questions fréquentes, adaptés à votre rôle.",
          "Le manuel complet imprimable est dans Aide → « Manuel complet imprimable ».",
          "Cette formation reste accessible à tout moment : refaites un module quand vous voulez.",
        ],
        practice: {
          instruction: "Ouvrez la page Aide et parcourez la section « Au quotidien (formateur) » : c'est votre antisèche.",
          href: "/aide",
          hrefLabel: "Ouvrir l'Aide",
        },
      },
    ],
    quiz: [
      {
        question: "Vous êtes malade demain matin. Quel est le bon réflexe ?",
        choices: ["Annuler la séance moi-même dans l'ERP", "Ne rien faire, l'ERP le détectera", "Prévenir le coordinateur au plus tôt"],
        answerIndex: 2,
        explanation: "C'est le coordinateur qui gère le planning (annulation, remplacement, rattrapage) : prévenez-le dès que possible.",
      },
      {
        question: "Où trouvez-vous le mode d'emploi de l'ERP à tout moment ?",
        choices: ["Menu « Aide », en bas à gauche", "Il faut demander par email", "Sur Google"],
        answerIndex: 0,
        explanation: "La page Aide (et son manuel imprimable) est toujours accessible et adaptée à votre rôle.",
      },
    ],
  },

  // ──────────────────────── PARCOURS COORDINATEUR ────────────────────────
  {
    id: "c1-tour-proprietaire",
    track: "coordinateur",
    order: 1,
    title: "Le tour du propriétaire",
    duration: "10 min",
    objectives: [
      "Comprendre la logique de l'ERP (qui fait quoi)",
      "Connaître les rôles et leurs droits",
    ],
    lessons: [
      {
        id: "philosophie",
        title: "La logique de l'outil",
        intro: "Un principe : vous décrivez le besoin, le moteur propose, vous validez — et la base garantit qu'aucun conflit n'est possible.",
        steps: [
          "Vous paramétrez une fois : dispositifs, financeurs, salles (et leurs horaires), formateurs (et leurs disponibilités).",
          "À la création d'un groupe, le moteur calcule un planning complet : formateur le moins coûteux disponible, plus petite salle suffisante, vacances et fériés sautés.",
          "Vous gardez toujours la main : alternatives affichées avec les raisons, préférences possibles, ajustements au glisser-déposer.",
          "Impossible de créer un conflit : si une salle ou un formateur est déjà pris, l'ERP refuse et vous l'explique.",
        ],
      },
      {
        id: "roles",
        title: "Les 4 rôles",
        steps: [
          "Administrateur : tout, y compris Paramètres et gestion des comptes (vous).",
          "Coordinateur : tout le quotidien (groupes, planning, apprenants, émargements, qualité) sauf les Paramètres.",
          "Formateur : SON planning, SES feuilles d'émargement, son compte. Il ne voit ni les coûts ni les autres formateurs.",
          "Lecture seule : consultation générale sans modification (partenaire, direction).",
        ],
        tip: "Un changement de rôle s'applique à la prochaine connexion de la personne.",
      },
    ],
    quiz: [
      {
        question: "Que se passe-t-il si vous déplacez une séance sur un créneau où la salle est déjà prise ?",
        choices: ["L'ERP refuse le déplacement et explique le conflit", "Les deux séances cohabitent", "La première séance est écrasée"],
        answerIndex: 0,
        explanation: "La base de données elle-même interdit les conflits : la séance revient à sa place avec un message explicite.",
      },
      {
        question: "Un formateur peut-il voir le coût horaire de ses collègues ?",
        choices: ["Oui, tout est partagé", "Non : les coûts sont réservés à l'équipe de coordination", "Seulement s'il le demande"],
        answerIndex: 1,
        explanation: "Le rôle formateur ne voit que son propre quotidien — jamais les données économiques.",
      },
    ],
  },
  {
    id: "c2-parametrage",
    track: "coordinateur",
    order: 2,
    title: "Paramétrer l'organisme",
    duration: "15 min",
    objectives: [
      "Créer un dispositif complet (niveaux, rythme, formateur privilégié)",
      "Configurer financeurs, salles et fermetures",
    ],
    lessons: [
      {
        id: "dispositifs",
        title: "Les dispositifs (vos formations)",
        steps: [
          "Paramètres → Catalogue des dispositifs → « Nouveau dispositif » : code, nom, volume total d'heures, rythme hebdo par défaut.",
          "Niveau de base (entrée) : le niveau visé se remplit tout seul avec le niveau CECRL suivant (modifiable, jusqu'au C2).",
          "« Formateur à privilégier » : il sera présélectionné à chaque groupe créé sur ce dispositif.",
          "Un dispositif utilisé par des groupes ne peut pas être supprimé (l'historique est protégé) : désactivez-le à la place.",
        ],
      },
      {
        id: "financeurs-salles",
        title: "Financeurs, salles, fermetures",
        steps: [
          "Financeurs : chaque financeur a une couleur — celle de ses séances dans le planning. Un regard suffit pour voir qui finance quoi.",
          "Salles : capacité et équipements. Si une salle n'est pas disponible en continu, bouton « Horaires » : définissez ses créneaux d'ouverture, le moteur les respectera.",
          "Fermetures : vos fermetures exceptionnelles (l'ERP connaît déjà fériés et vacances zone C jusqu'en 2028).",
        ],
        practice: {
          instruction: "Vérifiez que chacun de vos dispositifs a bien ses deux niveaux (entrée → visé) et son volume d'heures exact.",
          href: "/parametres",
          hrefLabel: "Ouvrir les Paramètres",
        },
      },
    ],
    quiz: [
      {
        question: "Vous choisissez « A2 » comme niveau de base d'un dispositif. Que fait l'ERP ?",
        choices: ["Rien de plus", "Il refuse sans niveau visé saisi", "Il propose automatiquement « B1 » comme niveau visé"],
        answerIndex: 2,
        explanation: "Le niveau visé se préremplit avec le niveau CECRL suivant — modifiable si votre formation vise plus loin.",
      },
      {
        question: "La salle du 2e étage n'est disponible que le matin. Comment l'indiquer ?",
        choices: ["En le notant dans les équipements", "Page Salles → « Horaires » → créneaux d'ouverture", "Impossible, il faut y penser à chaque groupe"],
        answerIndex: 1,
        explanation: "Les horaires d'ouverture par salle sont une contrainte dure : le moteur n'y placera jamais de séance en dehors.",
      },
      {
        question: "Pourquoi ne peut-on pas supprimer un dispositif déjà utilisé par des groupes ?",
        choices: ["Pour préserver l'historique légal (séances, émargements)", "Un bug connu", "Il faut être administrateur"],
        answerIndex: 0,
        explanation: "Les émargements sont un registre légal : on désactive le dispositif (il disparaît des nouveaux groupes), on ne détruit jamais l'historique.",
      },
    ],
  },
  {
    id: "c3-equipe",
    track: "coordinateur",
    order: 3,
    title: "Formateurs, apprenants et comptes",
    duration: "15 min",
    objectives: [
      "Créer un formateur opérationnel (dispos, coût, compte)",
      "Inscrire des apprenants un par un ou en masse",
      "Mener l'admission : contact WhatsApp, réunion d'information, test oral",
    ],
    lessons: [
      {
        id: "formateurs",
        title: "Un formateur prêt à planifier",
        steps: [
          "Formateurs → « Nouveau formateur » : photo, contrat (salarié/vacataire), coût horaire chargé, plafond d'heures hebdo, priorité (1 = premier choix).",
          "Sur sa fiche : ses disponibilités récurrentes (jours + heures). C'est LA donnée que le moteur respecte à la lettre.",
          "Email renseigné = invitation automatique : il reçoit un lien, choisit son mot de passe, et voit son planning.",
          "Déposez ses CV et diplômes (« Qualifications ») : preuve Qualiopi ind. 21-22 toujours prête.",
        ],
        tip: "Le moteur choisit dans l'ordre : salarié avant vacataire, coût croissant, puis votre priorité manuelle.",
      },
      {
        id: "positionnement",
        title: "Le test de positionnement",
        intro: "Fini le test papier : chaque apprenant reçoit un lien personnel, et son niveau arrive tout seul dans sa fiche.",
        steps: [
          "Créez un apprenant sans renseigner son niveau : un test est généré automatiquement (visible colonne « Test de positionnement »).",
          "« Copier l'invitation » → un message complet (consignes + lien personnel, signé de votre prénom) est dans le presse-papiers : collez-le dans WhatsApp, SMS ou email. Pas besoin de compte pour l'apprenant.",
          "Le test commence par un bloc « littératie » 100 % audio et tactile, avec une vraie voix humaine : consignes lues, grandes tuiles, jamais de lecture imposée. Il détecte les très bas niveaux (Pré-alpha, Alpha, Post-alpha, A1.1) et s'arrête tôt pour un non-lecteur (~5 min) au lieu d'infliger 56 questions écrites.",
          "Pour les lecteurs, le test continue (~30 minutes : écoute, lecture, écriture, très bien sur téléphone) et classe de A1 à B2. Les écrits sont corrigés par IA.",
          "À la fin : « Test fait · niveau » + score dans la liste, et le « Niveau évalué » de la fiche est rempli automatiquement (Pré-alpha → B2).",
          "Important : sous le niveau A1, le candidat ne voit JAMAIS son étiquette (message positif uniquement) — le profil s'affiche côté équipe, à confirmer en entretien. « À évaluer avec un accompagnant » = difficulté avec la tablette, pas un niveau de français.",
          "Complétez toujours par votre entretien : le niveau reste modifiable à la main — le test prépare l'entretien, il ne le remplace pas.",
          "Re-tester quelqu'un (après plusieurs mois de cours) : bouton « Refaire » à côté du résultat — nouveau lien, l'ancien résultat est conservé.",
        ],
        tip: "Pour un import CSV de cohorte, laissez la colonne Niveau vide : tous les apprenants auront leur test généré d'un coup — il ne reste qu'à envoyer les liens.",
        practice: {
          instruction: "Sur la liste Apprenants, repérez la colonne « Test de positionnement » et copiez un lien de test (ou générez-en un sur une fiche de test).",
          href: "/apprenants",
          hrefLabel: "Ouvrir les Apprenants",
        },
      },
      {
        id: "admission",
        title: "L'admission : WhatsApp, réunion d'information, test oral",
        intro: "Entre la demande de cours et l'inscription, tout se passe dans l'onglet Admission de la page Apprenants — WhatsApp d'abord, parce que c'est là que le public répond.",
        steps: [
          "Onglet Admission → « À contacter » : les nouveaux jamais contactés et les injoignables à relancer, les plus anciens d'abord. « Écrire » ouvre WhatsApp avec le premier message déjà rédigé ; vous relisez et envoyez. Le statut passe à « Contacté » tout seul.",
          "Un appel ou une réponse : icône carnet « Noter un contact » (canal, résultat, note). Le journal garde la mémoire de l'équipe.",
          "Sur la fiche, renseignez « Nous a contactés par » (bouche-à-oreille, France Travail, réseaux sociaux…) : la carte « D'où viennent les demandes » et le bilan financeur montrent quels canaux amènent du monde.",
          "« Nouvelle réunion » : date, heure, salle ou lieu, capacité. Puis « Ajouter des convoqués » (cases à cocher) ou, depuis Apprenants, cochez → « Convoquer (n) ».",
          "Sur la réunion, chaque ligne a « Convoquer » : WhatsApp s'ouvre avec la convocation complète (date, lieu, entretien oral annoncé sans stress, réponse OUI/NON). Email possible pour ceux qui préfèrent.",
          "Réponse OUI → « Confirmée ». La veille → « Rappel » WhatsApp (l'email de rappel part seul). Le jour J → « Présent(e) » puis « Test oral » : niveau à l'oral en 20 secondes, recopié dans la fiche.",
          "Inscription dans un groupe = statut « Inscrit » automatique. Dossier d'entrée PDF : besoin, test en ligne, test oral, réunion suivie — la preuve complète.",
        ],
        tip: "Le message WhatsApp n'est que pré-rempli : adaptez-le, traduisez-le si besoin. L'ERP note seulement qu'un contact a eu lieu.",
        practice: {
          instruction: "Ouvrez Apprenants → onglet Admission, repérez la liste « À contacter » et le bouton « Nouvelle réunion » (sans envoyer de message).",
          href: "/apprenants/admission",
          hrefLabel: "Ouvrir l'onglet Admission",
        },
      },
      {
        id: "apprenants",
        title: "Apprenants : fiche, photo, import",
        steps: [
          "Un par un : « Nouvel apprenant » — photo à la caméra (webcam ou tablette, aperçu en direct), langue première, niveau évalué (positionnement d'entrée, ind. 8), et inscription immédiate à un groupe.",
          "Typologie (section dédiée) : c'est elle qui remplit les bilans financeurs. Astuce : saisissez l'adresse puis « Détecter depuis l'adresse » — la case QPV se coche seule (périmètres officiels). Si la commune est Saint-Ouen, le champ Quartier apparaît (6 quartiers).",
          "Chaque apprenant reçoit une référence unique A-0001 (sous son nom) : c'est elle qu'on met sur les dossiers papier — tapez-la dans la recherche ⌘K pour retrouver la fiche instantanément.",
          "En masse : « Importer une liste » — collez les colonnes depuis Excel (6 colonnes de base + typologie complète jusqu'à 17 colonnes), aperçu, et inscription groupée. Une cohorte de 12 en 30 secondes.",
          "Sans niveau renseigné, un test de positionnement est généré automatiquement : copiez son lien depuis la liste et envoyez-le à l'apprenant — son niveau remplira sa fiche tout seul (« Test fait »).",
          "La colonne Assiduité de la liste se remplit toute seule au fil des émargements.",
        ],
        practice: {
          instruction: "Ouvrez « Importer une liste » et regardez le format attendu (sans importer) : vous serez prêt(e) le jour de la rentrée.",
          href: "/apprenants",
          hrefLabel: "Ouvrir les Apprenants",
        },
      },
    ],
    quiz: [
      {
        question: "Quelle donnée du formateur le moteur respecte-t-il de façon absolue ?",
        choices: ["Sa photo", "Ses disponibilités récurrentes (et son plafond hebdo)", "Son ancienneté"],
        answerIndex: 1,
        explanation: "Disponibilités, absences et plafond hebdo sont des contraintes dures : jamais de séance en dehors.",
      },
      {
        question: "Vous créez un apprenant sans renseigner son niveau. Que se passe-t-il ?",
        choices: [
          "Un test de positionnement est généré automatiquement, prêt à être envoyé",
          "Rien : il faut demander un test par email",
          "L'ERP refuse de créer la fiche",
        ],
        answerIndex: 0,
        explanation: "Sans niveau connu, l'ERP prépare le test tout seul : il ne reste qu'à copier le lien et l'envoyer à l'apprenant.",
      },
      {
        question: "L'apprenant a terminé son test de positionnement. Où atterrit son niveau ?",
        choices: [
          "Nulle part : il faut le recopier depuis un email",
          "Uniquement dans un rapport PDF",
          "Directement dans le « Niveau évalué » de sa fiche, avec « Test fait » et le score",
        ],
        answerIndex: 2,
        explanation: "Le résultat remplit la fiche automatiquement — et reste modifiable après votre entretien de positionnement.",
      },
      {
        question: "Un nouvel apprenant est arrivé du Drive hier. Quel est le premier geste ?",
        choices: [
          "L'inscrire tout de suite dans un groupe",
          "Apprenants → onglet Admission → « À contacter » → « Écrire » : WhatsApp s'ouvre avec le premier message prêt",
          "Attendre qu'il appelle",
        ],
        answerIndex: 1,
        explanation: "Le public répond sur WhatsApp : le premier contact part en un clic, et le statut passe à « Contacté » tout seul.",
      },
      {
        question: "Comment inscrire 12 nouveaux apprenants le jour de la rentrée ?",
        choices: ["Fiche par fiche obligatoirement", "Demander au formateur", "« Importer une liste » : coller le tableau Excel + inscription groupée"],
        answerIndex: 2,
        explanation: "L'import CSV crée les fiches et inscrit tout le monde dans le groupe choisi, en une seule opération.",
      },
    ],
  },
  {
    id: "c4-groupes",
    track: "coordinateur",
    order: 4,
    title: "Créer un groupe et son calendrier",
    duration: "20 min",
    objectives: [
      "Cadrer un calendrier type (rythme, jours, préférences)",
      "Lire et arbitrer la proposition du moteur",
    ],
    lessons: [
      {
        id: "cadrage",
        title: "Le cadrage en 5 questions",
        steps: [
          "Groupes → « Nouveau groupe » : dispositif (le financeur et le formateur privilégié se préremplissent), date de début, effectif.",
          "Vacances scolaires : cochée = pas de cours pendant les vacances (cas le plus courant). Décochez pour un public qui continue l'été.",
          "Rythme : Matins (9h-12h), Après-midis (13h-16h), Journées, ou Personnalisé (créneaux libres dans le cadre 9h-12h/13h-20h).",
          "Jours de cours : décochez un jour (ex. mercredi) pour limiter les déplacements des apprenants.",
          "Formateur/salle à privilégier : le moteur les favorise sans les imposer.",
        ],
      },
      {
        id: "revue",
        title: "Lire la proposition avant de valider",
        intro: "L'écran de revue est votre moment de contrôle : tout y est expliqué.",
        steps: [
          "Le formateur retenu, avec le coût total projeté, et TOUTES les alternatives : chaque formateur écarté affiche la raison exacte (indisponible, plafond atteint, conflit).",
          "La salle retenue (la plus petite suffisante) et les alternatives.",
          "Les avertissements : dernière séance raccourcie, créneau hors horaires, aucune solution… Lisez-les, ils évitent les surprises.",
          "Les séances sautées (vacances, fériés) sont listées : vous savez pourquoi le groupe finit à telle date.",
          "Validez : toutes les séances sont créées d'un coup, la salle est réservée, le formateur affecté.",
        ],
        practice: {
          instruction: "Lancez une proposition de groupe test (sans la valider !) et lisez les alternatives de formateurs : repérez les raisons d'exclusion.",
          href: "/groupes/nouveau",
          hrefLabel: "Ouvrir le wizard",
        },
      },
    ],
    quiz: [
      {
        question: "Le moteur propose le vacataire alors que Marie est salariée. Où trouver l'explication ?",
        choices: ["Nulle part, c'est une boîte noire", "Dans les alternatives de l'écran de revue : la raison exacte y est affichée", "Dans les logs techniques"],
        answerIndex: 1,
        explanation: "Chaque formateur écarté affiche sa raison : plafond hebdo atteint, indisponibilité, absence, conflit de créneau…",
      },
      {
        question: "Un groupe de salariés doit avoir cours uniquement mardi et jeudi après le travail. Quel cadrage ?",
        choices: [
          "Rythme « Personnalisé » avec des créneaux mardi/jeudi en fin de journée (dans le cadre 13h-20h)",
          "Impossible dans l'ERP",
          "Créer deux groupes",
        ],
        answerIndex: 0,
        explanation: "Le rythme Personnalisé accepte n'importe quels créneaux dans les fenêtres d'ouverture — ex. mardi et jeudi 18h-20h.",
      },
      {
        question: "Valider la proposition d'un groupe crée…",
        choices: ["Uniquement le groupe, les séances restent à créer", "Un brouillon", "Le groupe ET toutes ses séances, salle réservée et formateur affecté"],
        answerIndex: 2,
        explanation: "La validation est transactionnelle : tout est créé d'un coup, ou rien (en cas de conflit apparu entre-temps).",
      },
    ],
  },
  {
    id: "c5-vie-quotidienne",
    track: "coordinateur",
    order: 5,
    title: "Faire vivre le planning et prouver la qualité",
    duration: "20 min",
    objectives: [
      "Ajuster le planning au quotidien (déplacements, rattrapages)",
      "Produire les documents financeurs en 2 clics",
      "Piloter l'assiduité et préparer un audit",
    ],
    lessons: [
      {
        id: "ajustements",
        title: "Ajustements quotidiens",
        steps: [
          "Déplacer une séance : glisser-déposer dans le planning. En cas de conflit, elle revient avec l'explication.",
          "Séance ponctuelle (rattrapage isolé) : sélectionnez un créneau vide dans la vue semaine.",
          "Séances annulées : la fiche du groupe affiche un bandeau « X h manquantes » — « Replanifier automatiquement » ajoute les rattrapages à la suite du planning.",
          "Fin de parcours : fiche du groupe → « Modifier » → statut « Terminé ».",
        ],
      },
      {
        id: "documents",
        title: "Les documents financeurs",
        steps: [
          "Feuille d'émargement PDF : depuis la séance clôturée — « Télécharger » ou « Déposer sur le Drive » (classement automatique par formation).",
          "Certificat de réalisation : fiche du groupe → « Certificat » à côté de l'apprenant (dates et heures réellement suivies).",
          "Export d'assiduité CSV par groupe : le récapitulatif chiffré à joindre aux factures France Travail/OPCO.",
        ],
        tip: "Tout est calculé depuis les émargements réels : si les feuilles sont clôturées au fil de l'eau, vos documents sont toujours justes.",
      },
      {
        id: "qualite",
        title: "Assiduité et audit Qualiopi",
        steps: [
          "Le Dashboard affiche le taux de présence global et les apprenants en alerte (moins de 70 % ou 3 absences de suite) : appelez-les, notez l'action dans leur fiche.",
          "Enquête de satisfaction : fiche du groupe → QR code anonyme en fin de session (1 minute). Les moyennes s'affichent sur la fiche.",
          "Réclamations : page Qualité → registre — consignez la réclamation ET l'action corrective (c'est elle qui compte en audit).",
          "Analyse du besoin (ind. 4) : sur la fiche apprenant, objectif visé + besoin exprimé + date d'entretien, puis « Télécharger le dossier d'entrée (PDF) » — la preuve individuelle.",
          "Veille (critère 6) : page Qualité → registre de veille, une entrée par mois minimum (source lue + 2 lignes) ; l'email d'alertes du 1er du mois vous rappelle si un mois est vide.",
          "Sous-traitance (ind. 27) : un formateur freelance = contrat « Prestataire » sur sa fiche + ses documents ; la carte Sous-traitance de la page Qualité signale les dossiers incomplets.",
          "Jour d'audit : ouvrez la page Qualité — le tableau « où sont les preuves » guide l'auditeur indicateur par indicateur.",
        ],
        practice: {
          instruction: "Ouvrez la page Qualité et parcourez le tableau des indicateurs : associez chaque preuve à l'écran qui la produit.",
          href: "/qualite",
          hrefLabel: "Ouvrir la page Qualité",
        },
      },
    ],
    quiz: [
      {
        question: "3 séances d'un groupe ont été annulées (formateur malade). Comment maintenir le volume d'heures ?",
        choices: [
          "Recréer un groupe",
          "Fiche du groupe → bandeau « heures manquantes » → « Replanifier automatiquement »",
          "Modifier le volume du dispositif",
        ],
        answerIndex: 1,
        explanation: "La replanification ajoute les séances de rattrapage à la suite du planning, sur le même rythme.",
      },
      {
        question: "France Travail demande la preuve d'assiduité d'un stagiaire. Vous produisez…",
        choices: [
          "Une attestation sur l'honneur",
          "Une capture d'écran du planning",
          "Le certificat de réalisation + l'export d'assiduité, générés depuis les émargements signés",
        ],
        answerIndex: 2,
        explanation: "Ces documents sont calculés depuis les signatures horodatées : c'est la preuve la plus solide possible.",
      },
      {
        question: "Un apprenant apparaît en rouge sur le Dashboard avec « 62 % de présence ». Le bon réflexe ?",
        choices: [
          "Le contacter rapidement et tracer l'action (risque de décrochage, ind. 12 Qualiopi)",
          "Le désinscrire",
          "Attendre la fin du parcours",
        ],
        answerIndex: 0,
        explanation: "L'alerte sert à agir tôt : un appel tracé dans sa fiche est à la fois la bonne pratique pédagogique et la preuve du suivi.",
      },
    ],
  },
  {
    id: "c6-pilotage",
    track: "coordinateur",
    order: 6,
    title: "Piloter vite et rendre compte aux financeurs",
    duration: "15 min",
    objectives: [
      "Naviguer en 2 secondes (recherche globale, références, À faire)",
      "Composer des groupes de niveau et inscrire en lot avec filtres",
      "Générer un bilan financeur complet en 3 clics",
    ],
    lessons: [
      {
        id: "navigation-express",
        title: "Navigation express",
        steps: [
          "⌘K (ou Ctrl+K, ou la loupe du menu) : tapez un nom d'apprenant, de groupe, de formateur ou de salle — accès direct. Tapez une référence (« A-42 », « G-7 ») pour ouvrir la fiche exacte.",
          "Le Dashboard commence par « À faire aujourd'hui » : feuilles d'émargement à clôturer, groupes qui démarrent sans salle ou sans formateur — chaque ligne mène à l'action.",
          "Les rappels automatiques travaillent pour vous : email la veille aux apprenants (à activer par groupe dans « Modifier ») et relance des formateurs sur leurs feuilles oubliées.",
        ],
        practice: {
          instruction: "Faites ⌘K et tapez « G-1 » : vous devez arriver sur votre premier groupe.",
        },
      },
      {
        id: "groupes-niveau",
        title: "Groupes de niveau et inscriptions filtrées",
        steps: [
          "À la création d'un groupe dont le dispositif a un niveau d'entrée, l'encadré « Groupe de niveau » liste les apprenants de ce niveau sans groupe actif, tous cochés : décochez au besoin, ils seront inscrits avec le planning.",
          "Sur une fiche de groupe, « Inscrire des apprenants… » ouvre le sélecteur filtré : recherche + filtres niveau, langue, quartier, commune, QPV, sexe, âge, situation, scolarisation, prescripteur — cochez, inscrivez en lot.",
          "Sorties de parcours : menu ⋯ d'un inscrit → « Marquer en abandon » ou « terminé » (daté, compté dans les bilans). Ne supprimez une inscription QUE pour une erreur de saisie.",
          "« Reconduire » (fiche du groupe) : la session suivante à l'identique, planning régénéré depuis la nouvelle date, vacances sautées.",
        ],
        tip: "Le niveau vient du test de positionnement : plus vos apprenants sont testés, plus les groupes de niveau se composent tout seuls.",
      },
      {
        id: "bilans-financeurs",
        title: "Le bilan financeur en 3 clics",
        steps: [
          "Menu « Rapports » : choisissez le financeur et la période (presets : année civile, trimestre, année de formation).",
          "Tout se calcule seul : heures réalisées (émargements clôturés), bénéficiaires uniques, assiduité, abandons/terminés, et la typologie complète (sexe, âge, situation, QPV, quartiers de Saint-Ouen, scolarisation…).",
          "« Bilan PDF » à joindre au compte-rendu, « Détail CSV » pour le nominatif (avec les références A-XXXX), « Déposer sur le Drive » pour l'archivage automatique.",
          "Moins de « Non renseigné » = un bilan plus convaincant : la typologie se complète en 30 secondes à l'inscription de chaque apprenant.",
        ],
        practice: {
          instruction: "Ouvrez Rapports, générez le bilan d'un financeur sur l'année en cours et téléchargez le PDF.",
          href: "/rapports",
          hrefLabel: "Ouvrir les Rapports",
        },
      },
    ],
    quiz: [
      {
        question: "Le plus court chemin vers la fiche du groupe G-0007 ?",
        choices: ["Menu Groupes puis chercher dans la liste", "⌘K puis taper « G-7 »", "Demander au formateur"],
        answerIndex: 1,
        explanation: "La recherche globale comprend les références : « G-7 » ou « A-42 » ouvrent directement la bonne fiche.",
      },
      {
        question: "La Ville veut le bilan de ses financements avec la répartition par quartier. Vous faites…",
        choices: [
          "Un tableau Excel à la main pendant deux jours",
          "Rapports → financeur Ville → période → « Bilan PDF »",
          "Une capture d'écran du Dashboard",
        ],
        answerIndex: 1,
        explanation: "Le bilan agrège heures, bénéficiaires, assiduité et typologie (quartiers compris) depuis les données réelles — en quelques secondes.",
      },
      {
        question: "Un apprenant arrête sa formation en cours de route. Le bon geste ?",
        choices: [
          "Supprimer son inscription du groupe",
          "Menu ⋯ → « Marquer en abandon » : daté, conservé, compté dans les bilans",
          "Ne rien faire",
        ],
        answerIndex: 1,
        explanation: "La suppression efface l'historique ; l'abandon daté le préserve — les financeurs demandent le nombre de sorties.",
      },
      {
        question: "Comment composer un groupe « femmes niveau Alpha du quartier Les Docks » ?",
        choices: [
          "C'est impossible sans export Excel",
          "« Inscrire des apprenants… » → filtres Sexe + Niveau + Quartier → « Cocher tous les filtrés » → Inscrire",
          "Créer un dispositif spécial",
        ],
        answerIndex: 1,
        explanation: "Le sélecteur filtré croise tous les critères de la fiche apprenant et inscrit en lot.",
      },
    ],
  },
];

export const TRACKS = [
  { id: "formateur", label: "Parcours Formateur", description: "Prise en main, émargement, bons réflexes — 30 minutes.", roles: ["trainer", "admin", "coordinator"] },
  { id: "coordinateur", label: "Parcours Coordinateur", description: "Paramétrage, groupes, planning, qualité, bilans — 1 h 35 au total, à votre rythme.", roles: ["admin", "coordinator", "viewer"] },
] as const;
