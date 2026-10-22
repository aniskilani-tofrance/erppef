// Items AJOUTÉS le 15/10/2026 pour couvrir les 4 compétences (décision d'Anis du 15/10) :
// au moins 3 items par compétence et par niveau en A1, A2, B1, et 2 en B2.
// Écrits par Claude, ACTIFS dans la banque (le test reste derrière l'interrupteur
// « test_positionnement », éteint en production) et marqués « à relire » : Anis les relit en passant
// le test, puis un formateur FLE. Liste lisible : docs/qa/test-positionnement/items-a-relire.md.
//
// Règles d'écriture : vie quotidienne et professionnelle en France (logement, santé, démarches,
// emploi, restauration, propreté, aide à la personne, BTP, logistique) ; sans stéréotype ni piège
// culturel ; sans nom de marque ni d'organisme ; type de tâche inspiré des épreuves publiques du DELF,
// sans reprendre de sujet existant. QCM : une seule bonne réponse, ordre des options tiré au hasard
// à l'affichage. Les audios de CO sont synthétisés comme les autres consignes (tts.ts).

import type { Item } from "./types.ts";

const R = { relecture: "a_relire" as const, auteur: "claude" };

export const ITEMS_NOUVEAUX: Item[] = [
  // ─────────────── COMPRÉHENSION ORALE (audio non affiché) ───────────────
  {
    id: 201, level: "A1", competence: "CO", ...R, category: "Compréhension Orale", type: "listen_choose", timeLimit: 45,
    question: "Écoutez le message. Quand pouvez-vous aller chercher le médicament ?",
    audioText: "Bonjour, c'est la pharmacie. Votre médicament est arrivé. Vous pouvez venir le chercher demain matin.",
    options: ["Demain matin", "Ce soir", "Aujourd'hui à midi", "Lundi après-midi"],
    correct: "Demain matin",
    explanation: "Le message dit « demain matin ».",
  },
  {
    id: 202, level: "A2", competence: "CO", ...R, category: "Compréhension Orale", type: "listen_choose", timeLimit: 60,
    question: "Écoutez le message de votre chef d'équipe. Qu'est-ce qui change demain ?",
    audioText: "Bonjour, c'est votre chef d'équipe. Demain, vous commencez à six heures au lieu de sept heures, au même endroit. N'oubliez pas vos chaussures de sécurité.",
    options: ["L'heure de début", "Le lieu de travail", "La tenue de travail", "Le nom du chef"],
    correct: "L'heure de début",
    explanation: "« Six heures au lieu de sept heures » : seule l'heure change ; le lieu est le même, les chaussures sont un rappel.",
  },
  {
    id: 203, level: "A2", competence: "CO", ...R, category: "Compréhension Orale", type: "listen_choose", timeLimit: 60,
    question: "Écoutez le répondeur du cabinet médical. Quand pouvez-vous appeler pour un rendez-vous ?",
    audioText: "Bonjour, le cabinet médical est fermé le samedi. Pour prendre un rendez-vous, appelez du lundi au vendredi, entre neuf heures et dix-huit heures.",
    options: ["Du lundi au vendredi", "Le samedi matin", "Tous les jours", "Seulement le lundi"],
    correct: "Du lundi au vendredi",
    explanation: "Le répondeur dit « du lundi au vendredi, entre neuf heures et dix-huit heures ».",
  },
  {
    id: 204, level: "B1", competence: "CO", ...R, category: "Compréhension Orale", type: "listen_choose", timeLimit: 75,
    question: "Écoutez le message. Que devez-vous faire si vous n'êtes pas disponible jeudi ?",
    audioText: "Bonjour, je vous appelle au sujet de votre candidature pour le poste d'agent de restauration. Le responsable aimerait vous rencontrer jeudi à quatorze heures. Si ce n'est pas possible pour vous, rappelez-moi avant mercredi soir pour fixer un autre moment.",
    options: ["Rappeler avant mercredi soir", "Venir quand même jeudi matin", "Envoyer un nouveau CV", "Attendre un autre appel"],
    correct: "Rappeler avant mercredi soir",
    explanation: "« Si ce n'est pas possible, rappelez-moi avant mercredi soir. »",
  },
  {
    id: 205, level: "B2", competence: "CO", ...R, category: "Compréhension Orale", type: "listen_choose", timeLimit: 90,
    question: "Écoutez l'annonce faite en réunion. Qu'est-ce qui a changé par rapport à ce qui était prévu ?",
    audioText: "Contrairement à ce qui avait été annoncé, la formation aux premiers secours ne sera pas obligatoire pour l'ensemble des salariés. Elle sera d'abord réservée aux équipes qui travaillent seules sur les chantiers. Les autres pourront s'inscrire au second semestre, dans la limite des places disponibles.",
    options: [
      "La formation n'est plus obligatoire pour tout le monde",
      "La formation est annulée",
      "La formation devient obligatoire pour tout le monde",
      "Tout le monde fera la formation au second semestre",
    ],
    correct: "La formation n'est plus obligatoire pour tout le monde",
    explanation: "« Contrairement à ce qui avait été annoncé… ne sera pas obligatoire pour l'ensemble des salariés » : il faut repérer le changement et la nuance.",
  },
  {
    id: 206, level: "B2", competence: "CO", ...R, category: "Compréhension Orale", type: "listen_choose", timeLimit: 90,
    question: "Écoutez le message adressé aux locataires. Qui va payer les travaux, et pourquoi ?",
    audioText: "Après la visite de l'expert, le propriétaire reconnaît que l'humidité dans l'appartement vient d'un défaut de la toiture, et non d'une mauvaise aération. Il s'engage donc à faire les travaux à ses frais. Il demande seulement aux locataires de lui laisser l'accès au logement la semaine prochaine.",
    options: [
      "Le propriétaire, parce que le problème vient de la toiture",
      "Les locataires, parce qu'ils n'aèrent pas assez",
      "Le propriétaire et les locataires, à parts égales",
      "Personne, parce que les travaux sont reportés",
    ],
    correct: "Le propriétaire, parce que le problème vient de la toiture",
    explanation: "Cause (« vient d'un défaut de la toiture, et non d'une mauvaise aération ») et conséquence (« donc à ses frais »).",
  },

  // ─────────────── COMPRÉHENSION ÉCRITE (vraie lecture en A1) ───────────────
  {
    id: 211, level: "A1", competence: "CE", ...R, priorite: 1, category: "Compréhension Écrite", type: "read_comprehension", timeLimit: 60,
    passage: "SMS de Karim :\nSalut ! Je suis malade. Je ne viens pas au travail aujourd'hui. Tu peux prévenir le chef ? Merci.",
    question: "Que demande Karim ?",
    options: ["De prévenir le chef", "De venir chez lui", "D'acheter des médicaments", "De travailler à sa place"],
    correct: "De prévenir le chef",
    explanation: "« Tu peux prévenir le chef ? »",
  },
  {
    id: 212, level: "A1", competence: "CE", ...R, priorite: 1, category: "Compréhension Écrite", type: "read_comprehension", timeLimit: 60,
    passage: "MAIRIE — Inscriptions à l'école\nOuvert le lundi, le mardi et le jeudi\nde 9 h à 12 h\nApportez un justificatif de domicile.",
    question: "Quel jour le service est-il fermé ?",
    options: ["Le mercredi", "Le lundi", "Le mardi", "Le jeudi"],
    correct: "Le mercredi",
    explanation: "Seuls le lundi, le mardi et le jeudi sont indiqués.",
  },
  {
    id: 213, level: "A1", competence: "CE", ...R, priorite: 2, category: "Compréhension Écrite", type: "read_comprehension", timeLimit: 60,
    passage: "OFFRE D'EMPLOI\nRestaurant cherche plongeur (H/F).\nTemps plein. Début : 3 novembre.\nAppelez le 01 23 45 67 89.",
    question: "Quel poste est proposé ?",
    options: ["Plongeur", "Cuisinier", "Serveur", "Livreur"],
    correct: "Plongeur",
    explanation: "« Restaurant cherche plongeur ».",
  },

  // ─────────────── PRODUCTION ORALE (micro, transcription, audio effacé) ───────────────
  {
    id: 221, level: "A1", competence: "PO", ...R, category: "Production Orale", type: "oral", timeLimit: null, dureeMax: 45, minWords: 8,
    question: "Dites quelles langues vous parlez et depuis quand vous êtes en France.",
    criteria: ["Nomme au moins une langue", "Dit depuis quand (ou l'année d'arrivée)", "Phrases simples compréhensibles"],
  },
  {
    id: 222, level: "A1", competence: "PO", ...R, category: "Production Orale", type: "oral", timeLimit: null, dureeMax: 45, minWords: 6,
    question: "Vous êtes à la boulangerie. Saluez, demandez du pain et demandez le prix.",
    criteria: ["Salue", "Demande un produit", "Demande le prix (combien…)"],
  },
  {
    id: 223, level: "A2", competence: "PO", ...R, category: "Production Orale", type: "oral", timeLimit: null, dureeMax: 60, minWords: 25,
    question: "Décrivez votre logement ou votre quartier : combien de pièces, ce qu'il y a autour, ce que vous aimez ou n'aimez pas.",
    criteria: ["Décrit le lieu (pièces, commerces, transports)", "Donne une appréciation simple", "Phrases reliées (et, mais, parce que)"],
  },
  {
    id: 224, level: "A2", competence: "PO", ...R, category: "Production Orale", type: "oral", timeLimit: null, dureeMax: 60, minWords: 20,
    question: "Vous appelez votre employeur : vous êtes malade aujourd'hui. Expliquez la situation et dites quand vous pensez revenir.",
    criteria: ["Formule de politesse", "Explique l'absence", "Indique quand il ou elle revient", "Propose un justificatif ou une solution"],
  },
  {
    id: 225, level: "A2", competence: "PO", ...R, category: "Production Orale", type: "oral", timeLimit: null, dureeMax: 60, minWords: 25,
    question: "Racontez votre journée d'hier : ce que vous avez fait le matin, l'après-midi et le soir.",
    criteria: ["Utilise le passé composé", "Suit l'ordre de la journée", "Utilise des repères de temps (le matin, ensuite…)"],
  },
  {
    id: 226, level: "B1", competence: "PO", ...R, category: "Production Orale", type: "oral", timeLimit: null, dureeMax: 90, minWords: 50,
    question: "Une nouvelle personne arrive dans votre équipe (cuisine, entrepôt, chantier ou nettoyage : choisissez). Expliquez-lui comment se passe une journée de travail et les règles de sécurité importantes.",
    criteria: ["Explique les étapes d'une journée", "Donne au moins deux règles de sécurité", "Conseils (il faut, n'oublie pas…)", "Discours suivi et clair"],
  },
  {
    id: 227, level: "B1", competence: "PO", ...R, category: "Production Orale", type: "oral", timeLimit: null, dureeMax: 90, minWords: 50,
    question: "Racontez une difficulté que vous avez rencontrée en France (une démarche, le logement, le travail) et comment vous l'avez résolue.",
    criteria: ["Raconte au passé (passé composé, imparfait)", "Explique le problème et la solution", "Donne son ressenti ou ce qu'il ou elle a appris"],
  },
  {
    id: 228, level: "B2", competence: "PO", ...R, category: "Production Orale", type: "oral", timeLimit: null, dureeMax: 120, minWords: 90,
    question: "Certaines entreprises proposent de travailler quatre jours par semaine au lieu de cinq. Donnez votre avis : les avantages, les inconvénients, et votre position.",
    criteria: ["Prend position clairement", "Au moins deux arguments et un exemple", "Nuance (cependant, d'un autre côté…)", "Discours organisé"],
  },
  {
    id: 229, level: "B2", competence: "PO", ...R, category: "Production Orale", type: "oral", timeLimit: null, dureeMax: 120, minWords: 90,
    question: "Selon vous, faut-il bien parler français avant de commencer à travailler, ou peut-on l'apprendre en travaillant ? Argumentez avec des exemples.",
    criteria: ["Prend position", "Arguments pour et contre", "Exemples concrets", "Conclusion"],
  },

  // ─────────────── PRODUCTION ÉCRITE (tâches graduées) ───────────────
  {
    id: 231, level: "A1", competence: "PE", ...R, category: "Expression Écrite", type: "written", timeLimit: null, minWords: 10,
    question: "Présentez-vous par écrit, en phrases simples : votre prénom, votre pays, le métier que vous faites ou que vous voulez faire, et une langue que vous parlez. (Vous pouvez inventer.)",
    placeholder: "Je m'appelle…",
    criteria: ["Donne les 4 informations", "Phrases simples (je m'appelle, je suis, je parle…)"],
  },
  {
    id: 232, level: "A1", competence: "PE", ...R, category: "Expression Écrite", type: "written", timeLimit: null, minWords: 12,
    question: "Écrivez un petit message à votre voisin ou votre voisine : vous l'invitez à prendre un café samedi. Donnez l'heure et le numéro de votre appartement.",
    placeholder: "Bonjour…",
    criteria: ["Salue et invite", "Donne le jour et l'heure", "Donne le numéro de l'appartement", "Formule pour finir"],
  },
  {
    id: 233, level: "A1", competence: "PE", ...R, category: "Expression Écrite", type: "written", timeLimit: null, minWords: 10,
    question: "Vous êtes en retard. Écrivez un SMS à votre collègue : dites que vous êtes en retard, pourquoi, et à quelle heure vous arrivez.",
    placeholder: "Bonjour, …",
    criteria: ["Dit qu'il ou elle est en retard", "Donne une raison", "Donne une heure d'arrivée"],
  },
  {
    id: 234, level: "A2", competence: "PE", ...R, category: "Expression Écrite", type: "written", timeLimit: null, minWords: 30,
    question: "Vous cherchez un logement. Écrivez un message au propriétaire d'une annonce : présentez-vous, posez deux questions sur l'appartement et proposez un jour pour le visiter. (40 mots environ)",
    placeholder: "Bonjour Madame, Monsieur, …",
    criteria: ["Se présente", "Pose deux questions", "Propose un jour de visite", "Formules de politesse"],
  },
  {
    id: 235, level: "B1", competence: "PE", ...R, category: "Expression Écrite", type: "written", timeLimit: null, minWords: 60,
    question: "Vous venez de faire une semaine de stage en restauration ou en logistique (choisissez). Écrivez un courriel à votre conseillère emploi : racontez ce que vous avez fait, ce qui vous a plu et une difficulté rencontrée. (80 mots environ)",
    placeholder: "Bonjour Madame, …",
    criteria: ["Raconte au passé", "Ce qui a plu, avec une raison", "Une difficulté expliquée", "Courriel organisé avec formules"],
  },
  {
    id: 236, level: "B2", competence: "PE", ...R, category: "Expression Écrite", type: "written", timeLimit: null, minWords: 100,
    question: "Dans votre ville, la mairie veut fermer le centre social le samedi pour faire des économies. Écrivez un texte d'environ 120 mots pour donner votre avis, avec des arguments et des exemples.",
    placeholder: "À mon avis, …",
    criteria: ["Prend position", "Au moins deux arguments développés", "Exemples", "Texte articulé (introduction, connecteurs, conclusion)"],
  },
  {
    id: 237, level: "B2", competence: "PE", ...R, category: "Expression Écrite", type: "written", timeLimit: null, minWords: 100,
    question: "Un journal local pose la question : « Les entreprises doivent-elles payer les cours de français de leurs salariés ? » Écrivez votre réponse argumentée (environ 120 mots).",
    placeholder: "Je pense que…",
    criteria: ["Prend position", "Arguments pour et contre", "Exemples", "Texte articulé et nuancé"],
  },
];
