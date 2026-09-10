import type { AppRole } from "@/lib/auth";

// Journal des mises à jour de l'ERP, écrit pour l'équipe (pas pour les développeurs).
// RÈGLE : chaque livraison en production = une entrée ici + la ou les leçons de la
// Formation mises à jour. Le cron du matin envoie alors l'email « Quoi de neuf » à
// chaque membre de l'équipe (formateurs, coordination, admin) selon son rôle ; la page
// Formation affiche les mêmes nouveautés avec le lien vers la leçon.

export type UpdateItem = {
  text: string;
  roles: AppRole[]; // qui est concerné (l'email et la page filtrent par rôle)
};

export type AppUpdate = {
  id: string; // stable, jamais réutilisé : sert à savoir si l'email est parti
  date: string; // YYYY-MM-DD (date de mise en production)
  title: string;
  summary: string; // une phrase, en français simple
  items: UpdateItem[];
  training: { moduleId: string; lessonId: string; label: string }[]; // où l'apprendre
};

const TEAM: AppRole[] = ["admin", "coordinator"];
const ALL: AppRole[] = ["admin", "coordinator", "trainer"];
const LEADS: AppRole[] = ["admin", "coordinator", "setter"]; // le mini-CRM des leads restaurateurs

export const APP_UPDATES: AppUpdate[] = [
  {
    id: "2026-09-11-leads-restaurateurs",
    date: "2026-09-11",
    title: "Leads restaurateurs : le mini-CRM du setter",
    summary: "Nouveau menu « Leads resto » : les restaurateurs qui laissent leurs coordonnées (campagne parlerresto) sont rappelés sous 24 h, qualifiés en 7 questions et transformés en rendez-vous — avec les SMS et emails du kit pré-remplis.",
    items: [
      { text: "Menu « Leads resto » : « À traiter aujourd'hui » (nouveaux à rappeler sous 24 h, relances dues, SMS de rappel de RDV, RDV du jour), l'entonnoir par statut, la liste filtrable (statut, score, segment, suivi, recherche).", roles: LEADS },
      { text: "Sur chaque fiche : Appeler, SMS, WhatsApp et Email pré-remplis avec les modèles du kit (appel manqué, dernière tentative, rappel de RDV la veille, confirmation, documentation, relance J3, rupture J10, no-show), chacun tracé dans le journal.", roles: LEADS },
      { text: "Après chaque tentative, la cadence J0 → J1 → J3 → J6 → J10 propose la prochaine action et sa date ; l'horloge du service dit quand ne pas appeler (jamais 11h30-14h30, jamais après 17h30).", roles: LEADS },
      { text: "En haut de la liste, les chiffres du point hebdo : reçus, rappelés sous 24 h, qualifiés, RDV pris, show rate, gagnés, pipeline. Export CSV aux colonnes du Sheet de suivi ; import par collage.", roles: ["admin", "coordinator"] },
      { text: "Nouveau rôle « Commercial (setter) » (Paramètres → Utilisateurs) : accès aux leads, à la Formation et à l'Aide seulement — jamais aux apprenants ni aux formateurs. Bouton « Réglages » sur la page Leads : date du prochain groupe, Calendly, créneaux types.", roles: ["admin", "coordinator"] },
      { text: "Les leads arrivent tout seuls : Réglages → adresse du webhook à coller dans Brevo (automation « Appeler un webhook »), dans le formulaire de la landing, dans Make pour Meta Lead Ads et dans Calendly (le RDV se pose sur la fiche). Chaque nouveau lead est attribué au setter et annoncé par email « à rappeler sous 24 h » ; les doublons sous 30 jours sont notés, pas recréés.", roles: ["admin", "coordinator"] },
      { text: "Quand un restaurateur remplit le formulaire, sa fiche apparaît toute seule dans « À rappeler sous 24 h » et vous recevez un email avec le lien : plus rien à recopier.", roles: ["setter"] },
    ],
    training: [{ moduleId: "m1-leads", lessonId: "journee", label: "Ma journée de setter" }],
  },
  {
    id: "2026-09-09-conges-formateurs",
    date: "2026-09-09",
    title: "Congés et absences depuis votre compte",
    summary: "Nouveau menu « Congés » : les salariés demandent leurs congés, les vacataires et prestataires déclarent leurs absences, la coordination est prévenue par email.",
    items: [
      { text: "Menu « Congés » ou carte « Mes congés et absences » du Dashboard : dates, motif, une précision. Salarié(e) : demande validée par la coordination, réponse par email. Vacataire ou prestataire : absence enregistrée tout de suite.", roles: ["trainer"] },
      { text: "Une absence validée est respectée par le planning : aucune séance ne vous sera placée dessus.", roles: ["trainer"] },
      { text: "Menu « Congés » : les demandes à valider, les absences à venir de l'équipe, l'historique. Valider / refuser en un clic avec un mot au formateur ; l'email de demande compte les séances déjà planifiées sur la période. Rappel dans « À faire aujourd'hui » et l'email du matin.", roles: TEAM },
    ],
    training: [
      { moduleId: "f3-reflexes", lessonId: "imprevus", label: "Imprévus et changements" },
      { moduleId: "c3-equipe", lessonId: "formateurs", label: "Un formateur prêt à planifier" },
    ],
  },
  {
    id: "2026-09-09-planning-a-diffuser",
    date: "2026-09-09",
    title: "Le planning du groupe, prêt à envoyer",
    summary: "Sur chaque fiche de groupe : PDF apprenants, PDF financeur, CSV, calendrier .ics, WhatsApp par inscrit et email groupé avec le PDF.",
    items: [
      { text: "Carte « Diffuser le planning » sur la fiche du groupe : PDF lisible pour les apprenants (par mois, lieu, numéro à prévenir), PDF prévisionnel pour le financeur (durées, cumul, statut des séances), CSV et calendrier .ics.", roles: TEAM },
      { text: "À côté de chaque inscrit, « Planning WhatsApp » envoie les horaires, les dates et le lieu déjà écrits ; « Email + PDF aux inscrits » envoie le tout en une fois.", roles: TEAM },
      { text: "Votre planning de groupe est disponible en PDF et en calendrier .ics depuis la fiche du groupe : ajoutez toutes vos séances à votre téléphone en un geste.", roles: ["trainer"] },
      { text: "Le planning affiche le samedi et les cours du soir jusqu'à 21h30 : le B1 de Berthoud (mardi soir, samedi matin) est visible.", roles: ALL },
      { text: "Les heures affichées sur le planning sont désormais exactes : elles étaient décalées de deux heures (fuseau horaire). Les feuilles d'émargement, rappels et plannings PDF étaient déjà justes.", roles: ALL },
      { text: "Les couleurs du planning sont celles des formatrices (légende en haut) : on voit d'un coup d'œil qui est où. Un sélecteur permet de repasser aux couleurs par financeur ou par salle. La couleur se change sur la fiche de la formatrice.", roles: ALL },
      { text: "Prise de photo à la caméra réparée : l'image n'est plus noire, et si le navigateur refuse la caméra, un message l'explique et propose de choisir une photo.", roles: TEAM },
      { text: "Les salles ont maintenant une adresse et des consignes « Comment trouver la salle » (Salles → crayon) : métro, entrée, étage, interphone. Elles apparaissent dans les plannings, le calendrier et les messages aux apprenants (convocation, rappel, inscription, planning).", roles: TEAM },
    ],
    training: [{ moduleId: "c5-vie-quotidienne", lessonId: "documents", label: "Les documents financeurs" }],
  },
  {
    id: "2026-09-09-messages-par-etape",
    date: "2026-09-09",
    title: "Un message WhatsApp par étape",
    summary: "Le bouton WhatsApp envoie désormais un message différent selon l'étape : premier contact, relance, lien du test, convocation, place proposée, inscription.",
    items: [
      { text: "Le message est choisi tout seul : un contacté dont le test reste à faire reçoit son lien, un convoqué reçoit la date et la salle de sa réunion, un inscrit reçoit son groupe et la date du premier cours.", roles: TEAM },
      { text: "Bouton « Messages » dans l'onglet Admission : retouchez chaque texte, avec aperçu, sans rien demander à personne. Les emails de convocation et de rappel suivent les mêmes textes.", roles: TEAM },
      { text: "Nouvelle carte « Évalués, à inscrire » : les personnes dont le test oral est fait et qui attendent un groupe.", roles: TEAM },
      { text: "Un bandeau « Nouveau » défile en haut de votre Dashboard à chaque mise à jour : un clic ouvre la leçon, la croix le masque jusqu'à la prochaine nouveauté. Le même bandeau vous accueille sur l'écran de connexion.", roles: ALL },
    ],
    training: [{ moduleId: "c3-equipe", lessonId: "admission", label: "L'admission : WhatsApp, réunion d'information, test oral" }],
  },
  {
    id: "2026-09-05-admission-whatsapp",
    date: "2026-09-05",
    title: "Admission sur WhatsApp, réunions d'information, test oral",
    summary: "Tout le parcours entre la demande de cours et l'inscription se pilote dans l'onglet Admission de la page Apprenants.",
    items: [
      { text: "Un bouton ouvre WhatsApp avec le message déjà écrit ; le contact est noté dans un journal partagé et le statut d'admission avance tout seul (nouveau → contacté → convoqué → évalué → inscrit).", roles: TEAM },
      { text: "Réunions d'information : convoqués par cases à cocher, convocation WhatsApp ou email en un clic, confirmation, présence, rappel la veille.", roles: TEAM },
      { text: "Le test oral d'entrée se saisit en 20 secondes pendant la réunion : il remplit le niveau de la fiche et le dossier d'entrée PDF.", roles: TEAM },
      { text: "Sur la fiche de chaque apprenant, vous voyez maintenant son niveau à l'oral (test d'entrée) et par quel canal il nous a contactés : utile avant le premier cours.", roles: ["trainer"] },
      { text: "Champ « Nous a contactés par » (bouche-à-oreille, France Travail, réseaux sociaux…) et carte « D'où viennent les demandes » ; le bilan financeur montre la répartition par canal.", roles: TEAM },
    ],
    training: [{ moduleId: "c3-equipe", lessonId: "admission", label: "L'admission : WhatsApp, réunion d'information, test oral" }],
  },
  {
    id: "2026-09-04-qualiopi-et-invitation-test",
    date: "2026-09-04",
    title: "Qualiopi 100 % dans l'ERP et invitation au test prête à envoyer",
    summary: "Analyse du besoin à l'entrée, registre de veille et sous-traitance : plus aucun indicateur Qualiopi hors de l'outil.",
    items: [
      { text: "Fiche apprenant : bloc « Analyse du besoin à l'entrée » (objectif, besoin exprimé, date d'entretien) et dossier d'entrée PDF à télécharger.", roles: TEAM },
      { text: "Page Qualité : registre de veille (une entrée par mois suffit, rappel automatique le 1er du mois) et carte Sous-traitance.", roles: TEAM },
      { text: "« Copier l'invitation » au test : le message complet (consignes + lien, signé de votre prénom) prêt à coller.", roles: TEAM },
      { text: "Suppression sécurisée d'un apprenant, unitaire ou en lot : impossible s'il a une inscription ou un émargement.", roles: TEAM },
    ],
    training: [
      { moduleId: "c5-vie-quotidienne", lessonId: "qualite", label: "Assiduité et audit Qualiopi" },
      { moduleId: "c3-equipe", lessonId: "positionnement", label: "Le test de positionnement" },
    ],
  },
  {
    id: "2026-08-31-rappels-voix-humaine",
    date: "2026-08-31",
    title: "Rappels automatiques, relances et test à voix humaine",
    summary: "Moins d'absents, moins de feuilles oubliées, et un test de positionnement que même un non-lecteur peut passer.",
    items: [
      { text: "Vos apprenants reçoivent la veille de chaque cours un email de rappel (groupe, heure, salle) si les rappels sont activés sur le groupe.", roles: ALL },
      { text: "Une feuille d'émargement oubliée ? Vous recevez un email de relance avec le lien direct, et un encadré rouge sur votre Dashboard.", roles: ["trainer"] },
      { text: "Le test de positionnement commence par un bloc 100 % audio et tactile, avec une vraie voix humaine : les personnes jamais scolarisées ne sont plus mises en échec par la lecture.", roles: ALL },
      { text: "Vos jours de formation (université) sont dans le planning : aucune séance ne sera placée dessus.", roles: ["trainer"] },
      { text: "Guide du formateur en 8 pages (PDF) et plaquette de l'outil disponibles auprès de la coordination.", roles: ALL },
    ],
    training: [
      { moduleId: "f2-emargement", lessonId: "cloturer", label: "Clôturer : le geste qui compte" },
      { moduleId: "f3-reflexes", lessonId: "imprevus", label: "Imprévus et changements" },
    ],
  },
];

// Nouveautés visibles par un rôle (au moins un point le concerne), les plus récentes d'abord.
export function updatesForRole(role: AppRole): AppUpdate[] {
  return APP_UPDATES
    .map((u) => ({ ...u, items: u.items.filter((i) => i.roles.includes(role)) }))
    .filter((u) => u.items.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// Éléments du bandeau « Nouveau » (Dashboard, connexion) : les plus récents d'abord.
export function tickerItemsForRole(role: AppRole | null, limit = 3): { id: string; date: string; title: string; summary: string; href: string }[] {
  const source = role ? updatesForRole(role) : [...APP_UPDATES].sort((a, b) => b.date.localeCompare(a.date));
  return source.slice(0, limit).map((u) => ({
    id: u.id,
    date: new Date(`${u.date}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" }),
    title: u.title,
    summary: u.summary,
    href: u.training[0] ? `/formation/${u.training[0].moduleId}` : "/formation",
  }));
}

export function formatUpdateDate(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
}
