import type { AppRole } from "@/lib/auth";

// Contenu du manuel et de la FAQ. Chaque section/question déclare les rôles
// concernés : la page Aide ne montre à chacun que ce qui le concerne.

export type HelpArticle = {
  title: string;
  steps: string[]; // une étape par ligne, langage simple
};

export type HelpSection = {
  id: string;
  title: string;
  roles: AppRole[]; // rôles qui voient la section
  articles: HelpArticle[];
};

const ALL: AppRole[] = ["admin", "coordinator", "trainer", "viewer"];
const TEAM: AppRole[] = ["admin", "coordinator"];

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "demarrer",
    title: "Démarrer",
    roles: ALL,
    articles: [
      {
        title: "Se connecter",
        steps: [
          "Ouvrez https://pef-erp.vercel.app sur ordinateur, tablette ou téléphone.",
          "Saisissez votre email professionnel et votre mot de passe, puis « Se connecter ».",
          "Première connexion ? Vous avez reçu un email d'invitation : cliquez sur son lien et choisissez votre mot de passe.",
        ],
      },
      {
        title: "Mot de passe oublié ou à changer",
        steps: [
          "Oublié : sur l'écran de connexion, cliquez « Mot de passe oublié ? », saisissez votre email, puis suivez le lien reçu par email.",
          "Le changer : une fois connecté, menu « Mon compte » (en bas à gauche) → saisissez l'actuel puis le nouveau.",
        ],
      },
      {
        title: "S'y retrouver dans le menu",
        steps: [
          "Dashboard : votre page d'accueil — elle s'adapte à votre rôle.",
          "Planning : le calendrier de toutes les séances (vue liste sur téléphone).",
          "Groupes / Apprenants / Formateurs / Salles : les fiches de l'organisme.",
          "Qualité et Paramètres : réservés à l'équipe de coordination.",
        ],
      },
    ],
  },
  {
    id: "formateur",
    title: "Au quotidien (formateur)",
    roles: ["trainer", "admin", "coordinator"],
    articles: [
      {
        title: "Ma journée",
        steps: [
          "À la connexion, votre Dashboard affiche vos séances du jour avec un bouton « Émargement » pour chacune.",
          "Un encadré rouge signale vos feuilles d'émargement oubliées : clôturez-les au plus vite, ce sont des documents obligatoires.",
          "Vos cours apparaissent aussi dans votre agenda Google personnel (« Cours PEF — votre nom »), mis à jour chaque nuit.",
        ],
      },
      {
        title: "Faire signer la feuille d'émargement",
        steps: [
          "Depuis votre Dashboard ou le Planning, ouvrez la séance → « Feuille d'émargement » → « Ouvrir l'émargement ».",
          "Scannez le QR code avec la tablette (ou votre téléphone) : la liste des apprenants s'affiche avec leurs photos.",
          "Faites circuler la tablette : chacun touche son nom, signe au doigt, valide. Sa ligne se verrouille avec une coche verte.",
          "Sur votre écran, posez les statuts manquants : « Retard » ou « Absent » (les non-signés seront marqués absents à la clôture).",
          "Cliquez « Contre-signer et clôturer », signez à votre tour : la séance passe automatiquement en « réalisée ».",
          "Un retardataire arrive après coup ? Le lien reste valable jusqu'à la clôture (au plus tard 24 h après la séance).",
        ],
      },
      {
        title: "Signaler une absence ou un imprévu",
        steps: [
          "Prévenez votre coordinateur : il enregistre votre absence sur votre fiche, et le planning en tient compte.",
          "Séance à déplacer : c'est aussi le coordinateur qui la déplace dans le Planning (glisser-déposer).",
        ],
      },
    ],
  },
  {
    id: "parametrage",
    title: "Paramétrer l'organisme",
    roles: TEAM,
    articles: [
      {
        title: "Le socle : dispositifs, financeurs, salles, fermetures",
        steps: [
          "Paramètres → « Catalogue des dispositifs » : créez vos formations (code, volume d'heures, rythme par défaut, niveau).",
          "Paramètres → « Financeurs » : chaque financeur a une couleur, celle des séances dans le planning.",
          "Salles : nom, capacité, équipements. Une salle inactive n'est plus proposée par le moteur.",
          "Paramètres → « Fermetures » : posez vos fermetures exceptionnelles ; fériés et vacances scolaires zone C sont déjà connus.",
        ],
      },
      {
        title: "Créer un formateur (et son compte)",
        steps: [
          "Formateurs → « Nouveau formateur » : photo, contrat, coût horaire chargé, plafond d'heures hebdo, priorité.",
          "Renseignez ses disponibilités récurrentes sur sa fiche : le moteur ne le placera jamais en dehors.",
          "Si vous saisissez son email, il reçoit automatiquement une invitation à se connecter (rôle formateur, lié à sa fiche).",
          "Sur sa fiche, déposez CV et diplômes (« Qualifications ») : c'est votre preuve Qualiopi ind. 21-22.",
        ],
      },
      {
        title: "Gérer les comptes et les rôles",
        steps: [
          "Paramètres → « Utilisateurs et rôles » : la liste des comptes, avec le rôle modifiable (admin seulement).",
          "« Inviter un utilisateur » pour un non-formateur (coordinateur, lecture seule).",
          "Un changement de rôle s'applique à la prochaine connexion de la personne.",
        ],
      },
    ],
  },
  {
    id: "groupes",
    title: "Groupes et planning",
    roles: TEAM,
    articles: [
      {
        title: "Créer un groupe (le moteur fait le planning)",
        steps: [
          "Groupes → « Nouveau groupe » : dispositif, financeur, date de début, effectif attendu.",
          "Cochez ou non « Pas de cours pendant les vacances scolaires » selon le public.",
          "Besoin d'horaires précis ? « Définir les créneaux manuellement » (cadre : 9h-12h / 13h-20h).",
          "« Proposer un planning optimal » : le moteur choisit formateur et salle, saute fériés/vacances, et explique ses choix.",
          "Vérifiez la proposition (alternatives, coûts, avertissements) puis validez : toutes les séances sont créées d'un coup.",
        ],
      },
      {
        title: "Inscrire les apprenants",
        steps: [
          "Au fil de l'eau : fiche du groupe → « Créer et inscrire » (photo possible immédiatement, à la caméra).",
          "En masse : Apprenants → « Importer une liste » — collez votre tableau Excel (Prénom;Nom;Téléphone;Email;Langue;Niveau) et inscrivez tout le monde dans un groupe en une fois.",
          "L'effectif (n / capacité) s'affiche partout ; un badge rouge signale un dépassement.",
        ],
      },
      {
        title: "Ajuster le planning",
        steps: [
          "Glissez-déposez une séance pour la déplacer : si le créneau est pris (salle ou formateur), elle revient avec un message — impossible de créer un conflit.",
          "Cliquez une séance pour changer formateur, salle, ou l'annuler.",
          "Sélectionnez un créneau vide pour créer une séance ponctuelle (rattrapage).",
          "Les vacances et fériés apparaissent en fond grisé.",
        ],
      },
    ],
  },
  {
    id: "conformite",
    title: "Preuves et conformité (Qualiopi)",
    roles: TEAM,
    articles: [
      {
        title: "Produire les documents pour un financeur",
        steps: [
          "Feuille d'émargement PDF : sur la séance clôturée → « Télécharger le PDF » ou « Déposer sur le Drive » (classée par formation dans le Drive partagé).",
          "Certificat de réalisation : fiche du groupe → lien « Certificat » à côté de l'apprenant (dates et heures réellement suivies).",
          "Export d'assiduité : fiche du groupe → « Export assiduité (CSV) » — s'ouvre dans Excel.",
        ],
      },
      {
        title: "Mesurer la satisfaction (ind. 30)",
        steps: [
          "Fiche du groupe → « Enquête de satisfaction » → « Ouvrir l'enquête ».",
          "Faites scanner le QR code en fin de séance : questionnaire anonyme d'une minute (5 notes + commentaire).",
          "Les moyennes et commentaires s'affichent sur la fiche ; clôturez l'enquête quand vous avez assez de réponses.",
        ],
      },
      {
        title: "Réclamations et audit",
        steps: [
          "Page Qualité → « Registre des réclamations » : consignez chaque réclamation et surtout l'action corrective (ind. 31-32).",
          "La page Qualité regroupe vos indicateurs (assiduité, heures, satisfaction) et un tableau « où sont les preuves » par indicateur Qualiopi : c'est l'écran à montrer à l'auditeur.",
          "Les alertes décrochage (3 absences de suite) y apparaissent : contactez l'apprenant et notez l'action dans sa fiche.",
        ],
      },
    ],
  },
];

export type FaqItem = { q: string; a: string; roles: AppRole[] };

export const FAQ: FaqItem[] = [
  {
    q: "Le lien reçu par email (invitation ou mot de passe) ne fonctionne pas.",
    a: "Les liens expirent et ne servent qu'une fois. Refaites une demande : « Mot de passe oublié ? » sur l'écran de connexion, ou demandez à l'administrateur de renvoyer l'invitation depuis votre fiche.",
    roles: ALL,
  },
  {
    q: "Un apprenant a signé pour un autre, ou s'est trompé de nom.",
    a: "Sur l'écran de gestion de la feuille, marquez la bonne personne « Absent » (cela efface la signature erronée), puis faites-la re-signer. Si la feuille est déjà clôturée, un administrateur peut la rouvrir (« Rouvrir pour correction »).",
    roles: ALL,
  },
  {
    q: "Je ne vois pas mes séances sur mon Dashboard (formateur).",
    a: "Votre compte n'est probablement pas relié à votre fiche formateur. Demandez au coordinateur de vous réinviter depuis votre fiche (bouton « Renvoyer l'invitation ») : le lien se fait automatiquement.",
    roles: ALL,
  },
  {
    q: "Le moteur ne propose pas le formateur que j'attendais.",
    a: "La proposition affiche les alternatives avec la raison exacte (créneau occupé, hors disponibilités, plafond hebdo atteint, absence). Vérifiez la fiche du formateur : disponibilités récurrentes et plafond d'heures. Vous pouvez toujours choisir une alternative dans l'écran de revue.",
    roles: TEAM,
  },
  {
    q: "Je déplace une séance et elle revient à sa place.",
    a: "C'est la protection anti-conflit : la salle ou le formateur est déjà pris sur ce créneau (le message précise lequel). Choisissez un autre créneau, une autre salle, ou déplacez d'abord la séance gênante.",
    roles: TEAM,
  },
  {
    q: "Un groupe doit avoir cours pendant les vacances scolaires.",
    a: "Décochez « Pas de cours pendant les vacances scolaires » à la création du groupe. Les jours fériés et les fermetures de l'organisme restent toujours sans cours.",
    roles: TEAM,
  },
  {
    q: "Qui voit les photos des apprenants ?",
    a: "Uniquement les personnes connectées à l'ERP et la tablette d'émargement. Les photos servent à l'accueil et à l'émargement ; vous pouvez les retirer à tout moment depuis la fiche (bouton « Retirer »).",
    roles: ALL,
  },
  {
    q: "L'apprenant refuse de signer ou n'a pas pu venir : que met-on sur la feuille ?",
    a: "Posez le statut à la main : « Absent » ou « Retard ». À la clôture, les inscrits sans signature ni statut sont automatiquement marqués absents — la feuille est donc toujours complète.",
    roles: ALL,
  },
  {
    q: "Où retrouver les feuilles d'émargement des mois passés ?",
    a: "Deux endroits : la fiche du groupe (chaque séance → « Feuille ») pour le détail, et le Drive partagé « Emargements ERPPEF » où les PDF déposés sont classés par formation.",
    roles: TEAM,
  },
  {
    q: "Comment préparer un contrôle ou un audit Qualiopi ?",
    a: "Ouvrez la page Qualité : les indicateurs y sont à jour en continu, et le tableau « où sont les preuves » pointe l'écran qui prouve chaque indicateur (assiduité, satisfaction, réclamations, qualifications des formateurs). Complétez avec les PDF du Drive.",
    roles: TEAM,
  },
  {
    q: "Le son de bienvenue ne se joue pas à la connexion.",
    a: "Vérifiez le volume de l'appareil et que l'onglet n'est pas en sourdine. Certains navigateurs bloquent le son : il se jouera à la connexion suivante. Ce son est purement décoratif, rien n'est perdu.",
    roles: ALL,
  },
  {
    q: "Puis-je utiliser l'ERP sur téléphone ?",
    a: "Oui : le menu se replie, le planning passe en vue liste, et l'émargement fonctionne très bien sur téléphone ou tablette. Pour le paramétrage et les imports, l'ordinateur reste plus confortable.",
    roles: ALL,
  },
];
