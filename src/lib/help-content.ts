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
    roles: [...ALL, "setter"],
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
        title: "Se former à l'outil",
        steps: [
          "Menu « Formation » : des parcours interactifs par rôle (leçons courtes, exercices réels, quiz de validation).",
          "Comptez 30 minutes pour le parcours Formateur, 1 h 20 pour le parcours Coordinateur — à votre rythme, la progression est mémorisée.",
          "Refaites un module quand vous voulez : c'est la meilleure façon de découvrir une fonction que vous n'utilisez pas encore.",
        ],
      },
      {
        title: "Suivre les nouveautés de l'outil",
        steps: [
          "À chaque mise à jour, vous recevez un email « Quoi de neuf » : ce qui change pour votre rôle, en français simple, avec le lien vers la leçon de la Formation qui l'explique.",
          "Dès la connexion, un bandeau « Nouveau » défile en haut du Dashboard (et sur l'écran de connexion) : un clic ouvre la leçon concernée, la croix le masque jusqu'à la prochaine nouveauté. Passez la souris dessus pour l'arrêter.",
          "Menu « Formation » : la carte « Quoi de neuf » reprend les dernières nouveautés qui vous concernent. Refaire la leçon prend 5 minutes.",
          "Une idée, un irritant, une question : répondez à l'email. L'outil évolue chaque semaine avec vos retours.",
        ],
      },
      {
        title: "S'y retrouver dans le menu",
        steps: [
          "Dashboard : votre page d'accueil — elle s'adapte à votre rôle.",
          "Planning : le calendrier de toutes les séances (vue liste sur téléphone). Une couleur par formatrice, légende en haut ; le sélecteur « Couleurs » permet de colorer par financeur ou par salle. Chaque formatrice choisit sa couleur sur sa fiche (Formateurs → crayon).",
          "Recherche rapide : ⌘K (ou Ctrl+K), ou la loupe en haut du menu — tapez un nom d'apprenant, de groupe, de formateur ou de salle et sautez-y directement.",
          "Numéros uniques : chaque apprenant a une référence A-0001 et chaque groupe une référence G-0001 (visibles dans les listes et les fiches, reprises dans les exports financeurs). Tapez « A-42 » ou « G-7 » dans la recherche pour un accès direct.",
          "Le Dashboard commence par « À faire aujourd'hui » : feuilles d'émargement à clôturer, groupes qui démarrent sans salle ou sans formateur — chaque ligne est cliquable vers l'action.",
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
        title: "Voir mes cours dans mon agenda (Google, iPhone, Outlook…)",
        steps: [
          "Rien à installer : l'ERP crée un agenda Google « Cours PEF — votre nom » et le partage avec l'adresse email de votre fiche formateur. Chaque nuit il y pousse vos séances à venir (groupe, salle, adresse et « Comment trouver la salle » quand elles sont renseignées) et met à jour celles qui ont été déplacées ou annulées. Vous pouvez le lire, pas le modifier : le planning se change avec la coordination.",
          "Sur ordinateur : ouvrez calendar.google.com avec cette adresse. L'agenda est dans la colonne de gauche, sous « Autres agendas » (Google vous a aussi envoyé un email « … a partagé un agenda avec vous »). Cochez-le pour l'afficher, décochez-le pour le masquer.",
          "Application Google Agenda (Android ou iPhone) : menu ☰ → tout en bas « Paramètres » → sous votre compte, touchez « Cours PEF — votre nom » → activez « Synchroniser ». Vos cours s'affichent avec vos autres agendas ; réglez une notification par défaut pour être prévenu(e) avant chaque séance.",
          "Calendrier de l'iPhone (l'application Apple) : les agendas partagés ne sont pas repris par défaut. Dans Safari, connecté(e) à votre compte Google, ouvrez calendar.google.com/calendar/syncselect, cochez « Cours PEF — votre nom » et enregistrez. Vérifiez aussi que votre compte Google est ajouté dans Réglages → Apps → Calendrier → Comptes, avec « Calendriers » activé.",
          "Calendrier Samsung : il reprend les agendas de votre compte Google. Ouvrez-le → ☰ → « Gérer les calendriers » → cochez « Cours PEF — votre nom » (si besoin, activez d'abord « Synchroniser » dans l'application Google Agenda).",
          "Outlook, Thunderbird ou une autre application : dans calendar.google.com → ⚙️ Paramètres → à gauche, « Cours PEF — votre nom » → « Intégrer l'agenda » → copiez « Adresse secrète au format iCal ». Dans l'autre application, choisissez « Ajouter un calendrier depuis Internet » (ou « par URL ») et collez l'adresse : l'agenda se met à jour tout seul, avec quelques heures de délai selon l'application. Ne partagez jamais cette adresse : elle donne accès à votre agenda.",
          "Vous ne trouvez pas l'agenda ? Il faut que l'email de votre fiche formateur soit une adresse Google (Gmail, ou une adresse professionnelle sur Google comme @parleremploi.fr) et que vous soyez connecté(e) avec elle. Sinon, demandez à la coordination de corriger l'email de votre fiche : l'agenda est repartagé à la synchronisation suivante (chaque nuit, ou tout de suite avec « Synchroniser maintenant »).",
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
        title: "Poser un congé ou déclarer une absence",
        steps: [
          "Menu « Congés » (ou la carte « Mes congés et absences » du Dashboard) : dates, motif, une précision si besoin.",
          "Salarié(e) : c'est une demande. La coordination la valide ou la refuse, vous recevez la réponse par email. Tant qu'elle est « À valider », vous pouvez la retirer.",
          "Vacataire ou prestataire : l'absence est enregistrée tout de suite, sans validation. La coordination est prévenue par email et déplace vos séances si besoin.",
          "Une absence validée est respectée par le moteur de planning : aucune séance ne vous sera placée dessus. Les séances déjà planifiées sur la période sont signalées à la coordination.",
        ],
      },
      {
        title: "Évaluer mes apprenants à mi-parcours et en fin de parcours",
        steps: [
          "Vous recevez un email une semaine avant chaque jalon, puis la veille : « Ouvrir la grille d'évaluation ». Le menu « Évaluations » liste aussi vos groupes avec les dates.",
          "Pour chaque apprenant, quatre compétences (comprendre à l'oral, parler, lire, écrire) en trois crans : NA non acquis, EC en cours d'acquisition, A acquis. Puis le niveau atteint et, si vous voulez, un mot d'appréciation. C'est enregistré à chaque clic, deux minutes par personne.",
          "En appui, le petit test : « Lancer les tests » crée un lien par apprenant (20 questions au niveau du groupe, 15 à 20 minutes sur téléphone), à envoyer par WhatsApp. Quand il est passé, « Reprendre » pré-remplit la ligne : ajustez d'après ce que vous observez en classe, votre grille est la référence.",
          "En fin de parcours, quand les quatre compétences sont renseignées, l'icône attestation donne le PDF à remettre à l'apprenant avec son certificat de réalisation.",
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
          "Paramètres → « Catalogue des dispositifs » : créez vos formations (code, volume d'heures, rythme par défaut).",
          "Niveaux : indiquez le niveau de base (entrée) — le niveau visé se remplit automatiquement avec le niveau CECRL suivant (modifiable, jusqu'au C2).",
          "Vous pouvez désigner un « formateur à privilégier » : il sera présélectionné à chaque création de groupe sur ce dispositif.",
          "Supprimer un dispositif : possible seulement s'il n'a servi à aucun groupe ; sinon l'ERP propose de le désactiver (l'historique est conservé).",
          "Paramètres → « Financeurs » : chaque financeur a une couleur, celle des séances dans le planning.",
          "Salles : nom, capacité, équipements. Une salle inactive n'est plus proposée par le moteur.",
          "Horaires d'ouverture par salle : bouton « Horaires » sur la carte de la salle — définissez ses créneaux (ex. lundi 9h-12h) si elle n'est pas disponible en continu ; sans créneau, elle suit les horaires de l'organisme.",
          "Paramètres → « Fermetures » : posez vos fermetures exceptionnelles ; fériés et vacances scolaires zone C sont déjà connus.",
        ],
      },
      {
        title: "Valider les congés",
        steps: [
          "Menu « Congés » : les demandes des salariés à valider, les absences à venir de toute l'équipe, l'historique des décisions. Aussi sur la fiche de chaque formateur (carte « Absences et congés ») et dans « À faire aujourd'hui ».",
          "« Valider » ou « Refuser » (avec un mot pour le formateur) : il est prévenu par email. L'email de demande indique combien de séances sont déjà planifiées sur la période.",
          "Les vacataires et prestataires déclarent sans validation : vous recevez l'email d'information et déplacez leurs séances depuis le Planning.",
          "Seules les absences validées sont prises en compte par le moteur et affichées dans le bandeau « Absences » du Planning.",
        ],
      },
      {
        title: "Créer un formateur (et son compte)",
        steps: [
          "Formateurs → « Nouveau formateur » : photo, contrat, coût horaire chargé, plafond d'heures hebdo, priorité.",
          "Renseignez ses disponibilités récurrentes sur sa fiche : le moteur ne le placera jamais en dehors.",
          "Si vous saisissez son email, il reçoit automatiquement une invitation à se connecter (rôle formateur, lié à sa fiche).",
          "Sur sa fiche, déposez CV et diplômes (« Qualifications ») : c'est votre preuve Qualiopi ind. 21-22.",
          "Supprimer un formateur (admin, icône poubelle sur sa fiche) : possible seulement s'il n'a ni groupe ni séance ; sinon l'ERP propose de le désactiver — il disparaît du moteur et des listes, l'historique des heures et émargements est conservé.",
        ],
      },
      {
        title: "Accueillir un stagiaire : co-animation ou atelier",
        steps: [
          "Un stagiaire est une fiche formateur avec le contrat « Stagiaire » (Formateurs → Nouveau formateur) : établissement et date de fin de stage, email pour son compte (rôle formateur), disponibilités, couleur sur le planning, agenda Google. Coût horaire : 0 ou la gratification. La convention de stage se dépose sur sa fiche, carte « Convention de stage et documents » (intitulé « Convention de stage ») : tant qu'elle n'y est pas, la fiche l'affiche en orange.",
          "Co-animation : sur la fiche du groupe, carte Formateur → « Co-animation » : choisissez le stagiaire (ou un second formateur). Il est posé sur toutes les séances à venir du groupe ; les séances passées ne bougent pas. Sur une séance précise : Planning → ouvrir la séance → « Co-animation ».",
          "Ce que voit le stagiaire : ses séances co-animées sur son Dashboard (badge « co-animation »), dans le Planning (filtre par formateur), dans son agenda Google, et il peut ouvrir la feuille d'émargement. La feuille reste contre-signée par la formatrice ; son nom apparaît « avec … (stagiaire) » sur la feuille et les plannings.",
          "Atelier propre : créez un groupe dont le formateur est le stagiaire. Le moteur ne propose jamais un stagiaire d'office (il le classe après les salariés et vacataires) : choisissez-le à la main dans la liste des formateurs proposés.",
          "Congés : un stagiaire déclare ses absences comme un vacataire (pas de validation), la coordination est prévenue. Un co-animateur ne peut pas être sur deux séances à la même heure : le planning refuse le chevauchement.",
        ],
      },
      {
        title: "Gérer les comptes et les rôles",
        steps: [
          "Paramètres → « Utilisateurs et rôles » : la liste des comptes, avec le rôle modifiable (admin seulement).",
          "Le badge « Jamais connecté » signale un compte non activé ; « vu il y a X jours » indique la dernière connexion.",
          "Menu ⋯ de chaque utilisateur : renvoyer l'invitation, envoyer un lien de réinitialisation de mot de passe, renommer, ou retirer l'accès.",
          "Retirer l'accès est réversible : la personne ne peut plus se connecter mais sa fiche et son historique restent ; vous pouvez la réinviter plus tard.",
          "« Inviter un utilisateur » pour un non-formateur (coordinateur, lecture seule).",
          "Un changement de rôle s'applique à la prochaine connexion de la personne.",
        ],
      },
      {
        title: "Les agendas Google des formateurs",
        steps: [
          "Paramètres → carte « Agendas Google des formateurs » : l'ERP tient un agenda « Cours PEF — Prénom Nom » par formateur, partagé en lecture avec l'email de sa fiche, et un agenda « Cours PEF — Tous les formateurs » avec toutes les séances de l'organisme (formatrice dans le titre, « formateur à affecter » sinon). La synchronisation tourne chaque nuit vers 6 h ; « Synchroniser maintenant » lance une passe tout de suite et affiche le bilan (agendas, séances poussées, inchangées, retirées, agendas renommés, partages ajoutés, erreurs).",
          "Accès de la direction : tous les comptes ERP de rôle admin reçoivent automatiquement chaque agenda en écriture (un nouvel admin est ajouté à la passe suivante). « Voir tous les agendas » liste chaque agenda avec ses partages et un bouton « Ouvrir dans Google Agenda » qui l'ajoute à votre Google Agenda s'il n'y est pas encore (connectez-vous avec votre adresse admin). Astuce : affichez seulement « Tous les formateurs » pour une vue d'ensemble, ou les agendas individuels pour comparer.",
          "Un formateur ne voit rien : (1) vérifiez que l'email de sa fiche est une adresse Google (Gmail ou @parleremploi.fr) ; (2) s'il vient d'être créé, renommé ou si son email a changé, cliquez « Synchroniser maintenant » : l'agenda est renommé et repartagé, Google lui envoie l'invitation ; (3) envoyez-lui Aide → « Voir mes cours dans mon agenda » pour l'afficher sur son téléphone ou dans Outlook.",
          "Chaque événement porte le groupe, la salle, son adresse et « Comment trouver la salle » : renseignez ces deux champs sur les fiches des salles pour que les formateurs les aient sous la main.",
          "L'ERP ne touche qu'à ses propres événements : ce que vous ajoutez à la main dans ces agendas est conservé. Une séance annulée ou déplacée disparaît ou bouge à la passe suivante ; seules les séances qui ont changé sont réécrites.",
          "Des erreurs « Rate Limit Exceeded » peuvent apparaître lors d'une première grosse passe (rentrée, nouveau formateur) : l'ERP réessaie de lui-même, et ce qui reste est rattrapé la nuit suivante.",
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
          "Cadrage du calendrier : choisissez un rythme type (Matins 9h-12h, Après-midis 13h-16h, Journées, ou Personnalisé) et les jours de cours — décochez un jour pour limiter les déplacements des apprenants.",
          "Indiquez si besoin un formateur et une salle à privilégier : le moteur les favorise sans les imposer, et explique s'il doit s'en écarter.",
          "GROUPE DE NIVEAU : si le dispositif a un niveau d'entrée, le formulaire liste les apprenants de ce niveau sans groupe actif (niveau issu du test de positionnement), tous cochés — décochez au besoin : ils seront inscrits à la création du groupe.",
          "« Proposer un planning optimal » : le moteur choisit formateur et salle, saute fériés/vacances, et explique ses choix.",
          "Vérifiez la proposition (alternatives, coûts, avertissements) puis validez : toutes les séances sont créées d'un coup.",
        ],
      },
      {
        title: "Inscrire les apprenants",
        steps: [
          "Typologie sans effort : saisissez l'adresse (rue + commune + CP) puis « Détecter depuis l'adresse » — la case QPV se coche seule (périmètres officiels ANCT 2024). Modifiable à la main.",
          "« Inscrire des apprenants… » (fiche du groupe) : recherche + filtres sur tous les critères (niveau, langue, quartier, commune, QPV, sexe, âge, situation, scolarisation, prescripteur), cases à cocher, inscription en lot. Le niveau d'entrée du dispositif est pré-filtré.",
          "Quartier (Saint-Ouen) : sélectionnez le quartier de résidence (Centre-Ville-Cordon, Les Docks, Vieux-Saint-Ouen, Debain-Michelet-Bauer, Garibaldi - Les Puces, Arago-Pasteur-Zola-Hugo) — il alimente le bilan territorialisé de la Ville.",
          "Adresses importées : si la colonne Adresse (+ Commune ou CP) est remplie, la case QPV se détecte automatiquement à l'import et à la synchronisation Drive — plus rien à cliquer fiche par fiche.",
          "Fichier partagé Google Drive : déposez le tableur des apprenants dans le dossier « Apprenant ERPPEF » — les NOUVELLES lignes sont importées automatiquement chaque nuit (bouton « Synchroniser le Drive » pour ne pas attendre). Aucun doublon : les lignes déjà importées sont reconnues.",
          "Import en lot : « Choisir un fichier Excel » accepte directement le modèle .xlsx fourni (menus déroulants intégrés, notice incluse) — ou collez vos lignes. Les colonnes de typologie (Naissance, Sexe, Adresse, Commune, CP, Situation, QPV, RQTH, Scolarisation, Prescripteur, Quartier) alimentent les bilans financeurs dès la rentrée.",
          "Au fil de l'eau : fiche du groupe → « Créer et inscrire » (photo possible immédiatement, à la caméra).",
          "En masse : Apprenants → « Importer une liste » — collez votre tableau Excel (Prénom;Nom;Téléphone;Email;Langue;Niveau) et inscrivez tout le monde dans un groupe en une fois.",
          "L'effectif (n / capacité) s'affiche partout ; un badge rouge signale un dépassement.",
          "Supprimer un apprenant (icône poubelle, page Apprenants) : possible seulement s'il n'est inscrit dans aucun groupe et n'a jamais émargé — sa fiche, sa photo et son test sont alors effacés. Inscrit ? Retirez-le d'abord du groupe (fiche du groupe → « Retirer ») ou marquez sa sortie de parcours pour garder l'historique.",
          "Supprimer plusieurs apprenants : cochez-les dans la première colonne (la case d'en-tête coche tous les apprenants sans groupe affichés — combinez avec la recherche ⌘K pour cibler), puis « Supprimer (n) » en haut de la page. Les apprenants inscrits ne sont pas cochables.",
        ],
      },
      {
        title: "Positionner un apprenant (test de français)",
        steps: [
          "À la création d'un apprenant SANS niveau évalué, un test de positionnement est généré automatiquement (page Apprenants, colonne « Test de positionnement »).",
          "Bouton « WhatsApp » (colonne Test de positionnement) : WhatsApp s'ouvre avec l'invitation déjà écrite — consignes (ce n'est pas une évaluation, au calme, téléphone chargé, son au maximum, 5 à 35 minutes, réunion de rentrée à venir) + le lien personnel, signé de votre prénom. Relisez, appuyez sur Envoyer. Le contact est noté dans le journal d'admission.",
          "« Copier » : même message dans le presse-papiers, pour un SMS ou un email. Le lien est à usage unique.",
          "L'apprenant passe le test seul (~30 min : écoute, lecture, écriture — activé pour téléphone). Ses productions écrites sont corrigées par IA.",
          "Le test commence par un bloc « littératie » 100 % audio et tactile (consignes lues à voix haute, grandes tuiles) qui détecte les très bas niveaux : Pré-alpha, Alpha, Post-alpha, A1.1. Quelqu'un qui ne lit pas s'arrête là en ~5 minutes — il ne subit jamais les 56 questions écrites.",
          "Les questions A1/A2 du test sont elles aussi lues à voix haute (consigne et réponses) : un petit lecteur n'est pas pénalisé par la lecture des consignes.",
          "Astuce accueil : lancez le test AVEC la personne (bouton « Commencer » appuyé ensemble) — c'est ce premier geste qui active le son sur iPhone/iPad.",
          "Dès qu'il termine : « Test fait · niveau » et le score apparaissent dans la liste, et son « Niveau évalué » se remplit automatiquement sur sa fiche.",
          "Sous le niveau A1, le test est un REPÉRAGE, pas un verdict : le profil affiché (Pré-alpha, Alpha…) est à confirmer en entretien. Le candidat, lui, ne voit jamais ces étiquettes — seulement un message positif. « À évaluer avec un accompagnant » signale une difficulté avec la tablette elle-même, pas un niveau de français.",
          "Le niveau reste modifiable à la main après votre entretien de positionnement — le test est une aide, pas une sentence.",
          "« Générer le test » relance une nouvelle tentative (nouveau lien) si besoin — par exemple après plusieurs mois de cours.",
        ],
      },
      {
        title: "Ajuster le planning",
        steps: [
          "Glissez-déposez une séance pour la déplacer : si le créneau est pris (salle ou formateur), elle revient avec un message — impossible de créer un conflit.",
          "Cliquez une séance pour changer formateur, salle, ou l'annuler.",
          "Sélectionnez un créneau vide pour créer une séance ponctuelle (rattrapage).",
          "Supprimer une séance : lien discret en bas de sa fiche, en deux clics de confirmation. Refusé si elle a des émargements (registre légal) — annulez-la plutôt : l'annulation garde la trace, la suppression efface tout.",
          "Les vacances et fériés apparaissent en fond grisé.",
          "Les absences des formateurs (congés, jours de formation…) s'affichent dans le bandeau « Absences » en haut du calendrier — et en barres colorées dans les vues mois et année. Elles se saisissent sur la fiche du formateur, et le moteur ne planifie jamais dessus.",
        ],
      },
      {
        title: "Diffuser le planning (apprenants, financeurs)",
        steps: [
          "Fiche du groupe → carte « Diffuser le planning ». Quatre fichiers : « PDF apprenants » (lisible, par mois, avec le lieu et le numéro à prévenir), « PDF financeur » (prévisionnel avec durées, cumul d'heures, statut des séances, mentions légales), « CSV » (tableur, une ligne par séance) et « Calendrier .ics ».",
          "Le fichier .ics s'ouvre sur un téléphone ou dans Google Agenda / Outlook : toutes les séances s'ajoutent d'un coup. Envoyez-le par email ou WhatsApp, ou faites-le scanner.",
          "Pour un FINANCEUR, tous ses groupes d'un coup : Rapports → choisissez le financeur → « Plannings des groupes (PDF) » (page de garde récapitulative : groupe, jours et horaires, période, salle, formatrice, heures ; puis le planning prévisionnel détaillé de chaque groupe en cours ou à venir), ou CSV (une ligne par séance, colonne Groupe) ou .ics. Idéal pour la Ville de Saint-Ouen : les trois cours municipaux en un seul document.",
          "Pour un APPRENANT : liste Apprenants → colonne Groupes → icône calendrier à côté de ses groupes → PDF « Vos plannings de cours » (version apprenants, un chapitre par groupe s'il en a plusieurs). Le bouton n'apparaît qu'une fois la personne inscrite dans un groupe ; avant, donnez-lui le « PDF apprenants » depuis la fiche du groupe visé.",
          "Pour l'ACCUEIL ou la rentrée : page Groupes → « Tous les plannings (PDF) » : sommaire de tous les groupes en cours + chaque planning, à imprimer et afficher ; « version financeur » et .ics disponibles par la même adresse.",
          "Aux apprenants sur WhatsApp : à côté de chaque inscrit, « Planning WhatsApp » ouvre WhatsApp avec les horaires, les dates de début et de fin, le lieu et la règle des vacances déjà écrits (modèle « Planning du groupe », retouchable dans Apprenants → Admission → Messages).",
          "Par email : « Email + PDF aux inscrits » envoie le même message avec le PDF apprenants en pièce jointe à tous les inscrits qui ont une adresse.",
          "Au financeur : téléchargez le PDF financeur et le CSV, joignez-les à votre email. Le planning est prévisionnel ; les heures réalisées se prouvent ensuite par les feuilles d'émargement et le bilan (Rapports).",
          "Le lieu vient de la salle : renseignez l'adresse ET « Comment trouver la salle » (métro, entrée, étage, interphone) sur la fiche de chaque salle (Salles → crayon). Les deux apparaissent dans les plannings PDF, le calendrier et les messages WhatsApp ou email : convocation, rappel, inscription, planning.",
          "Le planning change (séance déplacée, rattrapage) ? Regénérez simplement les fichiers : ils reflètent toujours les séances actuelles.",
        ],
      },
      {
        title: "Faire vivre le groupe (statut, rattrapages)",
        steps: [
          "Fiche du groupe → « Modifier » : renommez, changez le financeur, la capacité, les notes, et le statut (En attente, Ouvert, Complet, Terminé, Annulé).",
          "Clôturez un groupe en fin de parcours en passant son statut à « Terminé ».",
          "Si des séances ont été annulées, un bandeau rouge affiche les heures manquantes : « Replanifier automatiquement » ajoute des séances de rattrapage à la suite du planning, sur le même rythme.",
          "« Reconduire » (fiche du groupe) : crée la session suivante à l'identique — même dispositif, formateur, salle et rythme — avec un planning complet régénéré depuis la date choisie, nouvelles vacances sautées.",
          "Rappels automatiques : « Modifier » le groupe → cochez « Rappels automatiques » — chaque apprenant AVEC email reçoit la veille la liste de ses cours du lendemain. Les formateurs reçoivent aussi une relance pour leurs feuilles d'émargement oubliées.",
        ],
      },
    ],
  },
  {
    id: "admission",
    title: "Admission : contact, réunion d'information, test oral",
    roles: TEAM,
    articles: [
      {
        title: "Prendre contact (WhatsApp d'abord)",
        steps: [
          "Page Apprenants → onglet « Admission » → « À contacter » : les nouveaux (arrivés du Drive ou créés à la main) jamais contactés, puis les injoignables à relancer. Les plus anciens d'abord.",
          "« Écrire » ouvre WhatsApp (application ou WhatsApp Web sur ordinateur) avec le message de premier contact déjà écrit et signé de votre prénom. Relisez, adaptez si besoin, appuyez sur Envoyer.",
          "Dès que WhatsApp s'ouvre, le contact est noté dans le journal et le statut passe à « Contacté » : la personne quitte la liste « À contacter ».",
          "Un appel, une réponse, un refus : icône carnet « Noter un contact » — canal, résultat, note, et le statut proposé (modifiable). Le journal garde qui a parlé à qui, et quand.",
          "Les statuts : Nouveau → Contacté (ou Injoignable) → Convoqué → Évalué (test oral fait) → Inscrit (dans un groupe, automatique). « Sans suite » = la personne ne donne pas suite.",
          "Le bouton WhatsApp et le carnet sont aussi dans la liste Apprenants (colonne Admission), avec un filtre par statut en haut de la page.",
          "Pas de WhatsApp ou numéro inexploitable : le bouton est grisé — appelez, puis notez le contact.",
          "Un message par étape, jamais le même texte : Nouveau → « Premier contact » ; Injoignable → « Relance » ; Contacté → le lien du test s'il reste à faire, sinon « Prochaine étape » ; Convoqué → la convocation avec date et lieu ; Évalué → « Place proposée » ; Inscrit → confirmation avec le groupe et le premier cours ; Sans suite → « Porte ouverte ». Le bouton dit toujours quelle étape il envoie.",
          "Retoucher les textes : onglet Admission → « Messages ». Un texte par étape, variables entre accolades ({prenom}, {date}, {lieu}, {groupe}…), aperçu rempli avec un exemple, « Revenir au texte d'origine » à tout moment. Enregistré pour toute l'équipe, aussi pour les emails de convocation et de rappel.",
          "Comment la personne NOUS a contactés : fiche apprenant → bloc « Parcours d'admission » → « Nous a contactés par » (bouche-à-oreille, passage à l'accueil, téléphone, WhatsApp, email, site, réseaux sociaux, France Travail, partenaire, affiche) + une précision libre (nom du partenaire, page…). C'est aussi la colonne « Canal de contact » du tableur Drive/Excel. La carte « D'où viennent les demandes » (onglet Admission) et le bilan financeur (Rapports) en donnent la répartition.",
          "La provenance se lit d'un coup d'œil : une pastille devant chaque nom (liste Apprenants et onglet Admission) dont la couleur donne la FAMILLE. Bleu marine = Maison de quartier (orienté par une MDQ, donc cours municipaux BOP104 de la Ville de Saint-Ouen). Vert = Contact direct (la personne a contacté l'association elle-même : accueil, téléphone, WhatsApp, site, bouche-à-oreille… donc cours PEF A1 / A2). Orange = Prescripteur ou partenaire (France Travail, mission locale, CCAS, association). Pastille creuse = non renseigné. Sous le nom : le canal et sa précision (« Maison de quartier — Landy »).",
          "D'où vient la pastille : d'abord du champ « Nous a contactés par » (avec « Maison de quartier » + « Laquelle ? »), sinon du champ « Prescripteur » tel que vous le tapez déjà : « MDQ » ou « MDQ Landy » = maison de quartier (la précision est lue après MDQ), « France Travail », « Mission locale », « asso » = contact direct. Rien à ressaisir pour les fiches existantes.",
          "Le filtre « Toutes les provenances » (à côté du filtre par statut) sert de légende : par famille d'abord (Maison de quartier, Contact direct, Prescripteur, Non renseigné, avec les effectifs), puis par canal. La carte « D'où viennent les demandes » (onglet Admission) donne les mêmes familles avec le détail par maison de quartier et par canal, total et 30 derniers jours.",
        ],
      },
      {
        title: "Constituer le dossier administratif (pièce d'identité, justificatif)",
        steps: [
          "Fiche apprenant (crayon dans la liste) → bloc « Dossier administratif » : trois emplacements, Pièce d'identité recto, Pièce d'identité verso (rien pour un passeport), Justificatif de domicile ; plus « Autres documents » (titre de séjour, attestation France Travail, RIB, diplôme…) avec un intitulé libre. Le compteur « 2 / 3 pièces » dit où en est le dossier.",
          "Depuis un iPhone ou un Android : « Photo / scan » ouvre directement l'appareil photo, cadrez la pièce à plat sous une bonne lumière. Pour un scan net et redressé sur iPhone : « Fichier » → « Choisir un fichier » → bouton ⋯ en haut → « Scanner des documents » → validez : le PDF est déposé.",
          "Depuis un ordinateur : « Fichier » accepte une photo (JPG, PNG, HEIC) ou un PDF, 15 Mo maximum. Une photo est réduite avant envoi (2000 px), un PDF est conservé tel quel.",
          "Recto, verso et justificatif sont uniques : « Refaire » remplace la pièce précédente. « Voir » ouvre la pièce dans un nouvel onglet (lien valable 1 h, à ne pas transmettre) ; la corbeille la supprime.",
          "Protection des données : ces pièces ne sont visibles que par l'admin et la coordination (jamais par les formateurs ni le setter, même via l'API), elles sont stockées dans un espace privé et supprimées avec la fiche de l'apprenant. Ne gardez que ce que le financeur exige, et pas plus longtemps que le parcours et ses obligations de justification.",
          "Une fiche qui vient d'être créée n'a pas encore d'emplacement : enregistrez-la, puis rouvrez-la pour ajouter les pièces.",
        ],
      },
      {
        title: "Convoquer à une réunion d'information",
        steps: [
          "Onglet Admission → « Nouvelle réunion » : titre, date, heures, salle (ou lieu en clair), capacité. Le lieu apparaît dans le message envoyé.",
          "Sur la page de la réunion : « Ajouter des convoqués » (recherche + cases à cocher ; les inscrits et « sans suite » sont masqués par défaut). Ou bien, depuis Apprenants : cochez des personnes → « Convoquer (n) ».",
          "Chaque ligne a un bouton « Convoquer » : WhatsApp s'ouvre avec la convocation prête (date, heure, lieu, petit entretien oral annoncé comme n'étant pas un examen, demande de réponse OUI/NON). Envoyez ; la ligne passe en « Envoyée » et le statut d'admission en « Convoqué ».",
          "Pour ceux qui préfèrent l'email : icône enveloppe (une personne) ou « Envoyer par email (n) » (tous ceux à envoyer qui ont une adresse). L'email part de la boîte de l'organisme.",
          "Quand la personne répond OUI : passez la ligne en « Confirmée ». La veille, bouton « Rappel » (WhatsApp) ; un rappel email part automatiquement le matin pour ceux qui ont un email.",
          "Le jour J : passez chaque présent en « Présent(e) », les autres en « Absent(e) » ou « Excusé(e) ». La présence figure dans le dossier d'entrée PDF.",
          "Le Dashboard et l'email d'alertes du matin signalent les convocations à envoyer et la réunion du lendemain.",
        ],
      },
      {
        title: "Enregistrer le test oral (entretien de positionnement)",
        steps: [
          "Pendant la réunion, sur la ligne de la personne : « Test oral » → date (pré-remplie), niveau à l'oral, évaluateur (pré-rempli avec votre nom), commentaire. 20 secondes.",
          "Cochez « Retenir ce niveau comme Niveau évalué » : la fiche est mise à jour — c'est ce niveau que le sélecteur d'inscription des groupes utilise.",
          "Le statut d'admission passe à « Évalué ». Il ne reste qu'à inscrire la personne dans un groupe (fiche du groupe → « Inscrire des apprenants… ») : le statut devient « Inscrit » tout seul.",
          "Le test oral est aussi modifiable depuis la fiche apprenant (bloc « Parcours d'admission »), et il figure dans le dossier d'entrée PDF avec le test en ligne et le besoin exprimé (preuve Qualiopi ind. 4 et 8).",
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
        title: "Envoyer chaque semaine les feuilles d'émargement au financeur",
        steps: [
          "Fiche du groupe → carte « Feuilles d'émargement au financeur » : activez l'envoi hebdomadaire, indiquez les destinataires (une adresse par ligne) et les personnes en copie, puis « Enregistrer ». Chez PEF, les trois cours municipaux sont déjà réglés : Cordon → mba@…, Landy → miscache@…, et gfenzi@ + nchahbani@ reçoivent les trois sites.",
          "Chaque vendredi après-midi (16 h l'été, 15 h l'hiver), l'ERP envoie automatiquement un email par groupe avec les feuilles CLÔTURÉES de la semaine en pièces jointes (un PDF signé par séance), la liste des séances avec le nombre de présents, et une copie à la coordination.",
          "Une feuille non clôturée le vendredi n'est pas envoyée : elle est signalée dans l'email et repart la semaine suivante une fois clôturée. Si rien n'est clôturé, le financeur ne reçoit rien et la coordination est prévenue par email. Le cours du samedi matin part avec l'email du vendredi suivant.",
          "« Envoyer maintenant » envoie tout de suite ce qui est clôturé depuis le dernier envoi (rattrapage, demande du financeur). « M'envoyer un test » envoie le même email à vous seul, sans toucher au dernier envoi : faites-le avant la rentrée pour voir le rendu.",
          "L'historique sous la carte garde chaque envoi : date, statut (envoyé, reporté, rien à envoyer, erreur), nombre de feuilles, destinataires. En cas d'erreur SMTP, réessayez avec « Envoyer maintenant ».",
        ],
      },
      {
        title: "Évaluer les acquis : mi-parcours, fin de parcours, attestation (ind. 11)",
        steps: [
          "Deux jalons par groupe, posés automatiquement : mi-parcours à la moitié des heures planifiées, finale à la dernière séance (fiche groupe → carte « Évaluations de parcours », ou menu « Évaluations » pour tous les groupes). Les dates se changent sur la page du groupe ; vide = automatique.",
          "La formatrice est prévenue par email une semaine avant le jalon, puis la veille, tant que les grilles ne sont pas complètes. Le jalon apparaît aussi dans « À faire aujourd'hui » de la coordination la semaine venue et tant qu'il est incomplet.",
          "La grille (page Évaluations du groupe) : pour chaque inscrit, quatre compétences du référentiel CECRL (comprendre à l'oral, parler, lire, écrire) en trois crans NA / EC / A (non acquis, en cours d'acquisition, acquis), un niveau atteint (A1.1 à B2) et un commentaire. Enregistrement automatique à chaque clic ; cliquer à nouveau efface.",
          "Le test ciblé, en appui : « Lancer les tests » crée pour chaque inscrit un lien de 20 questions au niveau visé du groupe et au niveau suivant (sans bloc littératie), à envoyer par WhatsApp ou à copier. Une fois passé, « Reprendre » pré-remplit la ligne d'après le score (à ajuster : la grille de la formatrice reste la référence). Le test ne modifie jamais le niveau d'entrée de la fiche.",
          "Attestation d'acquis : dès que les quatre compétences de la grille finale sont renseignées, une icône sur la ligne donne le PDF (heures suivies, niveau à l'entrée et niveau atteint, compétences à mi-parcours et en fin de parcours, appréciation). Document de l'organisme, il ne vaut pas certification officielle (DCL, TCF, DELF) : il complète le certificat de réalisation.",
          "Bilan financeur (Rapports) : une section « Acquis en fin de parcours » apparaît dès qu'une grille finale existe : compétences acquises, niveaux atteints, nombre d'apprenants ayant progressé d'au moins un niveau depuis l'entrée.",
        ],
      },
      {
        title: "Produire les documents pour un financeur",
        steps: [
          "Feuille d'émargement PDF : sur la séance clôturée → « Télécharger le PDF » ou « Déposer sur le Drive » (classée par formation dans le Drive partagé).",
          "Certificat de réalisation : fiche du groupe → lien « Certificat » à côté de l'apprenant (dates et heures réellement suivies).",
          "Export d'assiduité : fiche du groupe → « Export assiduité (CSV) » — s'ouvre dans Excel.",
        ],
      },
      {
        title: "Analyser le besoin à l'entrée (critère 2, ind. 4)",
        steps: [
          "Fiche apprenant → bloc « Analyse du besoin à l'entrée » : objectif visé (menu), besoin exprimé avec ses mots, date de l'entretien d'entrée.",
          "Le test de positionnement complète ce recueil : besoin + niveau = l'analyse demandée par l'auditeur.",
          "« Télécharger le dossier d'entrée (PDF) » (dans le même bloc) : la preuve individuelle — identité, besoin, positionnement — à classer ou imprimer.",
          "Ces colonnes existent aussi dans le modèle Excel (Objectif, Besoin) : le recueil peut se faire dès l'inscription papier/tableur.",
        ],
      },
      {
        title: "Tenir la veille (critère 6, ind. 23-25)",
        steps: [
          "Qualité → « Registre de veille » → « Nouvelle entrée » : type (légale / métiers / pédagogique), source, lien, et deux lignes sur ce que vous en retenez.",
          "Cochez « Diffusée à l'équipe » quand l'info a été partagée (réunion, mail) : c'est la preuve d'exploitation.",
          "Visez une entrée par mois minimum — l'auditeur juge la régularité. Si un mois passe sans entrée, l'email d'alertes du 1er du mois vous le rappelle.",
          "Sources faciles : lettre Centre Inffo (légale), France Travail / OPCO (métiers), Le français dans le monde ou fil DELF/DCL (pédagogique FLE).",
        ],
      },
      {
        title: "Déclarer la sous-traitance (ind. 27)",
        steps: [
          "Un formateur freelance qui vous facture = un sous-traitant : sur sa fiche, « Modifier » → contrat « Prestataire (freelance) ».",
          "Déposez ses documents sur sa fiche : contrat de sous-traitance, CV, attestation d'assurance (et certificat Qualiopi si son activité y est soumise).",
          "Qualité → carte « Sous-traitance » : la liste de vos prestataires avec l'état de leur dossier (badge rouge = documents manquants).",
          "Aucun prestataire ? La carte l'affiche : c'est votre réponse à l'indicateur 27.",
        ],
      },
      {
        title: "Générer le bilan d'un financeur (Rapports)",
        steps: [
          "Menu « Rapports » : choisissez le financeur et la période (presets : année civile, trimestre, année de formation).",
          "Le bilan se calcule tout seul : heures réalisées, bénéficiaires uniques, assiduité moyenne (émargements clôturés), abandons/terminés, et typologie des publics (sexe, âge, situation, QPV, RQTH, scolarisation, communes).",
          "« Bilan PDF » = le document à joindre au compte-rendu ; « Détail CSV » = le nominatif par groupe et par bénéficiaire ; « Déposer sur le Drive » = classement automatique dans « Bilans financeurs ».",
          "La typologie vient des fiches apprenants (section « Typologie ») : plus elle est remplie, moins le bilan affiche de « Non renseigné ». Complétez-la à l'inscription, c'est 30 secondes par personne.",
          "Un abandon se déclare sur la fiche du groupe (menu ⋯ de l'apprenant → « Marquer en abandon ») : il reste compté dans le bilan — ne supprimez jamais une inscription réelle.",
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
          "Les alertes assiduité apparaissent sur le Dashboard et la page Qualité : apprenant sous 70 % de présence ou 3 absences de suite. Contactez-le et notez l'action dans sa fiche.",
        ],
      },
    ],
  },
  {
    id: "leads",
    title: "Leads restaurateurs (mini-CRM)",
    roles: ["admin", "coordinator", "setter"],
    articles: [
      {
        title: "Rappeler un nouveau lead sous 24 h",
        steps: [
          "Menu « Leads resto » (ou votre Dashboard si vous êtes commercial) : la carte « À rappeler sous 24 h » liste les leads jamais contactés, le plus ancien en premier ; en rouge au-delà de 24 h.",
          "Regardez d'abord l'horloge du service en haut : vert = c'est l'heure d'appeler (9h30-11h30, 14h30-17h30) ; orange ou gris = emails, SMS et préparation des fiches, pas d'appel.",
          "Ouvrez la fiche, bouton « Appeler » : le téléphone compose le numéro et la fenêtre « Noter » s'ouvre pour enregistrer le résultat dès que vous raccrochez.",
          "Messagerie ? Notez « Messagerie », puis SMS → « SMS n°1 — après appel manqué » : le texte est déjà écrit, vous n'avez qu'à envoyer.",
        ],
      },
      {
        title: "Qualifier en 7 questions et noter le résultat",
        steps: [
          "Bouton « Modifier la fiche » : la partie « Qualification » suit l'ordre de l'appel — taille, postes (cuisine ou salle), pour quand, contrat et heures par semaine, ce qui coince, décideur, HACCP.",
          "Un contrat « Extras » ou « CDD < 6 mois » affiche un avertissement : pas de POEI possible, déroulez la cascade (FLE cuisine/salle, AKTO, HACCP) et notez l'offre qui accroche.",
          "Le score est proposé automatiquement (chaud / tiède / froid) d'après ces réponses ; vous pouvez le forcer.",
          "Dans « Noter », choisissez le résultat : le statut suivant est pré-rempli et ne recule jamais ; la prochaine action et sa date sont proposées d'après la cadence, modifiables.",
        ],
      },
      {
        title: "Envoyer un SMS, un WhatsApp ou un email du kit",
        steps: [
          "Sur la fiche : le menu SMS ne contient qu'un modèle à envoyer à la main, « rappel de créneau promis » — il part depuis l'ERP via Twilio, pas depuis votre téléphone, et le journal note l'envoi. Les autres SMS sont automatiques (voir l'article suivant).",
          "WhatsApp : mêmes textes, pour les restaurateurs qui y répondent mieux ; le message s'ouvre dans WhatsApp déjà rempli. Email : six modèles (confirmation, documentation, relance J3, rupture J10, réponse écrite, no-show) qui s'ouvrent dans votre messagerie.",
          "Tout est pré-rempli : prénom du contact, postes, date et heure du RDV, prochain groupe, lien Calendly, votre prénom. Relisez, envoyez. Chaque envoi est tracé dans le journal de la fiche et compte comme une tentative.",
          "Les mots viennent de la campagne parlerresto : « formé directement dans votre restaurant », « 3 jours chez vous / 2 jours chez nous », « 0 € de reste à charge sur la formation ». Ne les remplacez pas par « gratuit ».",
        ],
      },
      {
        title: "Lire le journal d'une fiche avant de rappeler",
        steps: [
          "Le journal, en bas à droite de la fiche, raconte toute l'histoire du lead dans l'ordre, du plus récent au plus ancien.",
          "Une ligne « E-mail envoyé » ou « SMS envoyé » signale un message parti automatiquement. Survolez-la : l'objet et le texte complet s'affichent. Lisez-les avant d'appeler, le restaurateur les a déjà reçus et il s'attend à ce que vous le sachiez.",
          "Une ligne « E-mail programmé » signale un rappel encore à venir, avec la date et l'heure auxquelles il partira. Si le rendez-vous bouge, ces rappels sont annulés puis reprogrammés tout seuls.",
          "La couleur du trait et l'icône disent le type : e-mail, SMS, appel, rendez-vous, changement de statut, note d'équipe. En tête, le compte des messages envoyés et des rappels programmés.",
          "L'aperçu est reconstitué avec les informations actuelles de la fiche : si le rendez-vous a été déplacé depuis, l'aperçu affiche le nouvel horaire. Pour retrouver le message tel qu'il est parti, ouvrez Brevo ou Twilio, l'identifiant figure dans la ligne.",
        ],
      },
      {
        title: "Les messages qui partent tout seuls (emails Brevo, SMS Twilio)",
        steps: [
          "Interrupteur : Leads → Réglages → « Envois automatiques au prospect ». Tant qu'il est sur « Désactivés », l'ERP n'écrit jamais au restaurateur de lui-même — utile pendant les tests. La direction l'active le jour du lancement de la campagne.",
          "Une fois activés : invitation à réserver un créneau, envoyée dix minutes après le formulaire et uniquement à ceux qui n'ont rien réservé sur la page de remerciement ; confirmation par e-mail et par SMS dès qu'un créneau Calendly est réservé ; rappel par email la veille et deux heures avant ; message le jour d'un rendez-vous manqué, avec le lien pour recaler.",
          "Il n'y a aucune restriction d'horaire : ces messages répondent à une action que le restaurateur vient de faire, ils partent donc dans la seconde, de jour comme de nuit. Le même message n'est jamais envoyé deux fois à la même fiche : chaque envoi laisse une marque dans le journal.",
          "Si le restaurateur déplace ou annule son créneau Calendly, les rappels déjà programmés chez Brevo sont annulés puis reprogrammés sur le nouvel horaire. La fiche affiche « emails Brevo J-1 et H-2 programmés ».",
          "Un restaurateur ne peut pas répondre à nos SMS : ils partent sous un nom de marque, pas sous un numéro, et un nom de marque ne reçoit rien. Aucun message ne l'invite donc à répondre ; ils renvoient tous vers le lien de modification de son e-mail de confirmation, vers le Calendly, ou annoncent un appel. Les e-mails, eux, sont bien réponsables : les réponses arrivent sur contact@parleremploi.fr.",
          "Avant d'activer : purger les leads de test, vérifier l'expéditeur Brevo (adresse et nom validés) et l'expéditeur Twilio (numéro ou nom d'expéditeur rattaché au service de messagerie). Sans les clés Brevo et Twilio en production, rien ne part, même interrupteur sur « Activés ».",
        ],
      },
      {
        title: "Poser le RDV avec la direction et le faire tenir",
        steps: [
          "Proposez toujours deux créneaux hors service (les créneaux types sont rappelés sur la fiche), jamais « quand êtes-vous disponible ? ». Dans le restaurant, entre les deux services, le rendez-vous tient mieux.",
          "Bouton « Poser le RDV » : date, heure, comment (téléphone, sur place, visio). Le statut passe à « RDV pris » et la prochaine action devient « SMS de rappel la veille ».",
          "Tout de suite après : Email → « Email n°1 — confirmation de RDV ».",
          "La veille : la carte « SMS de rappel à envoyer pour demain » vous le rappelle ; SMS → « SMS n°3 — rappel de RDV ». Le lendemain, notez « RDV tenu », « No-show » ou « Reporté » sur la fiche.",
        ],
      },
      {
        title: "Relancer sans harceler : la cadence J0 → J10",
        steps: [
          "J0 appel + SMS n°1 si messagerie · J1 appel à un autre créneau (matin ↔ coupure) · J3 email n°3 · J6 appel + SMS n°2 « dernière tentative » · J10 email n°4 « je ferme votre dossier ? ».",
          "Après chaque tentative notée, la fiche affiche l'étape suivante et sa date ; la carte « Relances dues » de la page Leads regroupe tout ce qui est à faire aujourd'hui ou en retard.",
          "Au-delà de 5 tentatives sans réponse : statut « Perdu », raison « Injoignable ». Jamais plus de deux messages vocaux sur un même lead.",
        ],
      },
      {
        title: "Importer, exporter, régler (direction)",
        steps: [
          "« Importer » : collez les lignes du Google Sheet de suivi (avec la ligne d'en-têtes) ou une liste simple « Entreprise ; Contact ; Téléphone ; Email ; Ville CP ; Postes ; Nb ; Notes » — un aperçu s'affiche avant l'import.",
          "« Exporter CSV » : les 24 colonnes du Sheet de suivi dans le même ordre, puis les colonnes propres à l'ERP (référence, offre, heures, décideur, HACCP, RDV). Ouvrable dans Excel ou Google Sheets.",
          "« Réglages » (direction) : la date du prochain groupe restauration (l'argument d'urgence des scripts), le lien Calendly de qualification, le lien Calendly de direction, les deux créneaux types, le nom de la personne qui tient le RDV, et l'interrupteur des envois automatiques. Ils alimentent tous les modèles.",
          "Paramètres → Utilisateurs → « Inviter » avec le rôle « Commercial (setter) » : la personne ne voit que les leads, la Formation et l'Aide.",
        ],
      },
      {
        title: "Brancher la landing, Brevo, Meta et Calendly : les leads arrivent tout seuls",
        steps: [
          "Leads → Réglages → partie « Leads qui arrivent tout seuls » : choisissez à qui attribuer les nouveaux leads (le setter) et l'email prévenu à chaque arrivée, puis Enregistrer : l'adresse du webhook apparaît (…/api/leads/inbound?token=…). Copiez-la.",
          "Brevo : Automations → nouveau scénario → point d'entrée « Formulaire soumis » (ou « Contact ajouté à la liste ») → action « Appeler un webhook » (POST) avec cette adresse : le contact et ses attributs (PRENOM, NOM, SMS, ENTREPRISE…) créent la fiche.",
          "Formulaire de la landing (Manus) : en plus de Brevo, envoyez le formulaire en POST vers la même adresse (JSON ou formulaire classique) avec entreprise, prénom, nom, téléphone, email, ville, postes, utm_source, utm_campaign.",
          "Meta Lead Ads : dans Make, module « Facebook Lead Ads → Watch leads » puis « HTTP → Make a request » (POST, JSON, corps = le lead) vers l'adresse : le nom du visuel (ad_name) devient la campagne de la fiche.",
          "Calendly (forfait Standard ou plus) : Intégrations → Webhooks → événements « Invitee Created » et « Invitee Canceled » vers la même adresse. Deux cas : le Calendly du setter (l'hôte du créneau = l'email de notification, ou un créneau nommé « appel » / « découverte ») note un appel de qualification réservé (statut « À rappeler », prochaine action à la date du créneau) ; le Calendly de la direction pose le RDV sur la fiche (statut « RDV pris »). La fiche est retrouvée par email ou téléphone, ou créée.",
          "Test : ouvrez l'adresse du webhook dans le navigateur : « Point d'entrée actif » confirme le jeton. Un même téléphone ou email reçu deux fois en 30 jours ne crée pas de doublon : l'événement est noté sur la fiche existante.",
          "Le jeton est un secret : s'il fuit, Réglages → « Régénérer le jeton » (l'ancienne adresse cesse de fonctionner) ; « Fermer le webhook » coupe tout.",
        ],
      },
      {
        title: "Ce qu'on ne dit jamais à un restaurateur",
        steps: [
          "Jamais « 100 % gratuit » ni « ça ne vous coûte rien » : dire « financé par France Travail, 0 € de reste à charge sur la formation ».",
          "Jamais « aucun engagement » : « vous ne vous engagez qu'à l'embauche en fin de parcours, si le candidat a le niveau ».",
          "Jamais de promesse sur un montant AKTO, sur l'attestation HACCP réglementaire, sur les titres de séjour ou le travail non déclaré.",
          "Jamais de tarif ni de devis : c'est le rendez-vous de la direction. « Très bonne question — c'est exactement ce qu'on vous détaille en RDV, mardi 10h ou jeudi 15h ? »",
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
    q: "Mes cours n'apparaissent pas dans mon agenda Google.",
    a: "L'agenda « Cours PEF — votre nom » est partagé avec l'email de votre fiche formateur : connectez-vous à Google avec cette adresse, puis cochez-le sous « Autres agendas » (ordinateur) ou activez « Synchroniser » dans les paramètres de l'application Google Agenda (téléphone). Si l'adresse de votre fiche n'est pas une adresse Google, demandez à la coordination de la corriger : l'agenda est repartagé à la synchronisation suivante. Mode d'emploi complet : Aide → « Voir mes cours dans mon agenda ».",
    roles: ALL,
  },
  {
    q: "Comment scanner la pièce d'identité d'un apprenant avec mon iPhone ?",
    a: "Ouvrez sa fiche depuis la liste Apprenants, bloc « Dossier administratif ». Soit « Photo / scan » (appareil photo, pièce à plat), soit, pour un PDF net et redressé : « Fichier » → « Choisir un fichier » → ⋯ → « Scanner des documents ». La pièce est stockée dans un espace privé réservé à la coordination et supprimée avec la fiche.",
    roles: TEAM,
  },
  {
    q: "Puis-je déplacer une séance depuis mon agenda Google ?",
    a: "Non : l'agenda est en lecture seule et l'ERP le réécrit chaque nuit. Un changement de planning se demande à la coordination, qui le fait dans l'ERP ; votre agenda suit la nuit suivante.",
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
    q: "Une séance a été annulée : comment rattraper les heures ?",
    a: "Ouvrez la fiche du groupe : un bandeau rouge indique les heures manquantes par rapport au volume du dispositif. « Replanifier automatiquement » ajoute des séances de rattrapage à la suite du planning (même rythme, mêmes formateur et salle). En cas de conflit, ajustez ensuite dans le planning.",
    roles: TEAM,
  },
  {
    q: "Comment clôturer un groupe terminé ?",
    a: "Fiche du groupe → « Modifier » → statut « Terminé ». Le groupe sort des listes actives mais tout son historique (émargements, assiduité, certificats) reste consultable et exportable.",
    roles: TEAM,
  },
  {
    q: "L'ERP est-il sauvegardé ?",
    a: "Oui : chaque dimanche matin, une sauvegarde complète des données (apprenants, séances, émargements, enquêtes…) est déposée automatiquement dans le Drive partagé, dossier « Sauvegardes ». La base Supabase a en plus ses propres sauvegardes.",
    roles: TEAM,
  },
  {
    q: "Comment fonctionne le test de positionnement ?",
    a: "Chaque apprenant créé sans niveau reçoit un lien personnel (colonne « Test de positionnement » → « Copier l'invitation » : message de consignes + lien, à coller dans WhatsApp/SMS/email). Le test (~30 min : écoute, lecture, écriture, corrigé en partie par IA) attribue un niveau A1 à B2 qui remplit automatiquement sa fiche, avec la mention « Test fait » et le score. Le niveau reste modifiable après entretien, et « Générer le test » crée une nouvelle tentative si besoin.",
    roles: TEAM,
  },
  {
    q: "Une salle n'est disponible que certains jours ou certaines heures.",
    a: "Page Salles → bouton « Horaires » de la salle : ajoutez ses créneaux d'ouverture (jour + heures). Le moteur de planification n'y placera plus aucune séance en dehors, et l'expliquera dans les alternatives (« Salle fermée le… »).",
    roles: TEAM,
  },
  {
    q: "Le son de bienvenue ne se joue pas à la connexion.",
    a: "Vérifiez le volume de l'appareil et que l'onglet n'est pas en sourdine. Certains navigateurs bloquent le son : il se jouera à la connexion suivante. Ce son est purement décoratif, rien n'est perdu.",
    roles: ALL,
  },
  {
    q: "L'image reste noire quand je prends une photo d'un apprenant.",
    a: "Le navigateur n'a pas donné accès à la caméra. Cliquez l'icône caméra dans la barre d'adresse et autorisez pef-erp.vercel.app, puis réessayez. Sur tablette ou téléphone, l'accès se règle dans les réglages du navigateur. Vous pouvez toujours « Importer » une photo prise avec l'appareil photo de l'appareil.",
    roles: TEAM,
  },
  {
    q: "Le bouton WhatsApp ne fait rien, ou ouvre une page blanche.",
    a: "Sur ordinateur, le lien ouvre WhatsApp Web (ou l'application WhatsApp si elle est installée) : il faut être connecté à WhatsApp sur cet appareil. Sur téléphone, l'application WhatsApp s'ouvre directement. Si le bouton est grisé, le numéro de la fiche est absent ou inexploitable (mettez-le au format 06 12 34 56 78 ou +33 6 12 34 56 78).",
    roles: TEAM,
  },
  {
    q: "Puis-je modifier le message WhatsApp avant de l'envoyer ?",
    a: "Oui : le message n'est que pré-rempli dans WhatsApp. Vous pouvez le relire, le compléter ou le traduire avant d'appuyer sur Envoyer. L'ERP ne voit pas ce que vous envoyez : il note seulement qu'un contact a eu lieu.",
    roles: TEAM,
  },
  {
    q: "Puis-je utiliser l'ERP sur téléphone ?",
    a: "Oui : le menu se replie, le planning passe en vue liste, et l'émargement fonctionne très bien sur téléphone ou tablette. Pour le paramétrage et les imports, l'ordinateur reste plus confortable.",
    roles: ALL,
  },
];
