// ============================================================
// TEST DE POSITIONNEMENT FLE — ParlerEmploi Formation
// Types de questions disponibles :
//   listen_choose        — Écouter et choisir (audio TTS + QCM)
//   fill_in_blank        — Compléter les blancs (QCM)
//   fill_keyboard        — Texte à trou saisie clavier libre
//   complete_dialogue    — Compléter un dialogue (QCM)
//   safety_instruction   — Consignes de sécurité (QCM)
//   scenario_tree        — Scénario décisionnel (QCM)
//   reformulate          — Reformuler une phrase (écrit libre)
//   written              — Production écrite libre
//   oral                 — Production orale
//   match_pairs          — Relier des paires
//   read_comprehension   — Lire un texte puis QCM
//   order_sentences      — Remettre dans l'ordre
//   true_false_justify   — Vrai/Faux + justification
//   complete_form        — Remplir un formulaire
//   word_choice_text     — Texte à menus déroulants
//   categorize           — Classer des mots
//   odd_one_out          — Trouver l'intrus
//   sentence_builder     — Remettre les mots en ordre
//   email_response       — Répondre à un email
// timeLimit (secondes) : défini par question — null = sans limite
// ============================================================

export const questions = [

  // ─── BLOC 1 : COMPRÉHENSION ORALE (A1–B1) ──────────────
  {
    id: 1,
    level: "A1",
    category: "Compréhension Orale",
    type: "listen_choose",
    timeLimit: 45,
    question: "Écoutez. Quel jour est mentionné ?",
    audioText: "On se voit lundi prochain.",
    options: ["Mardi", "Mercredi", "Lundi", "Jeudi"],
    correct: "Lundi",
    explanation: "La phrase mentionne 'lundi prochain'."
  },
  {
    id: 2,
    level: "A1",
    category: "Compréhension Orale",
    type: "listen_choose",
    timeLimit: 60,
    question: "Écoutez la consigne du responsable. Que demande-t-il ?",
    audioText: "Rangez votre poste de travail avant de partir, s'il vous plaît.",
    options: ["Appeler un collègue", "Ranger son poste de travail avant de partir", "Fermer la porte", "Vérifier l'heure de départ"],
    correct: "Ranger son poste de travail avant de partir",
    explanation: "La consigne est clairement de ranger son poste de travail avant de partir."
  },
  {
    id: 3,
    level: "A2",
    category: "Compréhension Orale",
    type: "listen_choose",
    timeLimit: 60,
    question: "Écoutez. Que demande le responsable ?",
    audioText: "Pouvez-vous envoyer ce document avant seize heures s'il vous plaît ?",
    options: ["D'imprimer un document", "D'envoyer un document avant 16h", "De rester après 16h", "D'appeler un client"],
    correct: "D'envoyer un document avant 16h",
    explanation: "Le responsable demande d'envoyer le document avant 16h."
  },
  {
    id: 4,
    level: "B1",
    category: "Compréhension Orale",
    type: "listen_choose",
    timeLimit: 75,
    question: "Écoutez l'annonce. À quelle heure part le train ?",
    audioText: "Le train en provenance de Paris partira à quinze heures trente du quai numéro trois.",
    options: ["14h30", "15h30", "16h30", "17h30"],
    correct: "15h30",
    explanation: "L'annonce indique clairement que le train partira à 15h30."
  },
  {
    id: 5,
    level: "B1",
    category: "Compréhension Orale",
    type: "listen_choose",
    timeLimit: 90,
    question: "Écoutez. Que doit faire l'employé ?",
    audioText: "Merci de remplir le formulaire de demande de congé au moins deux semaines à l'avance et de le remettre à votre responsable.",
    options: ["Partir en congé sans prévenir", "Remplir un formulaire de congé deux semaines à l'avance", "Envoyer un email à la direction", "Appeler le service RH le jour même"],
    correct: "Remplir un formulaire de congé deux semaines à l'avance",
    explanation: "La consigne précise : formulaire à remplir et à remettre deux semaines avant le départ."
  },

  // ─── BLOC 2 : GRAMMAIRE — FILL IN BLANK (QCM) ──────────
  {
    id: 6,
    level: "A1",
    category: "Grammaire",
    type: "fill_in_blank",
    timeLimit: 45,
    question: "Complétez la phrase avec le bon mot.",
    template: "Je ___ français.",
    blank_answer: "suis",
    options: ["suis", "ai", "est", "as"],
    correct: "suis",
    explanation: "On utilise 'suis' avec 'je' : Je suis français."
  },
  {
    id: 7,
    level: "A1",
    category: "Grammaire",
    type: "fill_in_blank",
    timeLimit: 45,
    question: "Choisissez la bonne forme pour compléter.",
    template: "Elle ___ à Paris.",
    blank_answer: "habite",
    options: ["habite", "habiter", "habitez", "habitent"],
    correct: "habite",
    explanation: "Avec 'elle', on conjugue : elle habite."
  },
  {
    id: 8,
    level: "A2",
    category: "Grammaire",
    type: "fill_in_blank",
    timeLimit: 60,
    question: "Complétez avec la forme correcte.",
    template: "Hier, nous ___ au cinéma.",
    blank_answer: "sommes allés",
    options: ["allons", "sommes allés", "irons", "allions"],
    correct: "sommes allés",
    explanation: "Le passé composé de 'aller' avec 'nous' : nous sommes allés."
  },
  {
    id: 9,
    level: "B1",
    category: "Grammaire",
    type: "fill_in_blank",
    timeLimit: 60,
    question: "Complétez avec la forme qui convient.",
    template: "Si j'avais le temps, je ___ ce livre.",
    blank_answer: "lirais",
    options: ["lis", "lirais", "lirai", "lisais"],
    correct: "lirais",
    explanation: "Si + imparfait → conditionnel présent : je lirais."
  },
  {
    id: 10,
    level: "B2",
    category: "Grammaire",
    type: "fill_in_blank",
    timeLimit: 75,
    question: "Choisissez la forme correcte.",
    template: "Bien qu'il ___ fatigué, il a continué à travailler.",
    blank_answer: "soit",
    options: ["est", "soit", "était", "serait"],
    correct: "soit",
    explanation: "Après 'bien que', on utilise le subjonctif : bien qu'il soit."
  },

  // ─── BLOC 3 : FILL KEYBOARD (saisie libre) ──────────────
  {
    id: 11,
    level: "A1",
    category: "Grammaire",
    type: "fill_keyboard",
    timeLimit: 60,
    question: "Écrivez le mot qui manque dans la phrase.",
    template: "Bonjour ! Je ___ Maria.",
    correctAnswer: "suis",
    acceptedAnswers: ["suis", "m'appelle"],
    explanation: "On dit 'Je suis Maria' ou 'Je m'appelle Maria'."
  },
  {
    id: 12,
    level: "A2",
    category: "Grammaire",
    type: "fill_keyboard",
    timeLimit: 75,
    question: "Complétez avec la bonne préposition.",
    template: "Il travaille ___ lundi ___ vendredi.",
    correctAnswer: "du,au",
    acceptedAnswers: ["du,au", "du , au", "du au"],
    explanation: "On dit 'du lundi au vendredi'."
  },
  {
    id: 13,
    level: "B1",
    category: "Grammaire",
    type: "fill_keyboard",
    timeLimit: 90,
    question: "Conjuguez le verbe entre parenthèses au temps correct.",
    template: "Quand il (arriver) ___, nous (manger) ___ déjà.",
    correctAnswer: "est arrivé,avions déjà mangé",
    acceptedAnswers: ["est arrivé,avions déjà mangé", "arriva,avions mangé"],
    explanation: "Passé composé + plus-que-parfait pour exprimer l'antériorité."
  },

  // ─── BLOC 4 : SITUATIONS PROFESSIONNELLES ───────────────
  {
    id: 14,
    level: "A1",
    category: "Situations Professionnelles",
    type: "scenario_tree",
    timeLimit: 60,
    question: "Vous arrivez au travail. Votre responsable vous donne une consigne que vous n'avez pas comprise. Que faites-vous ?",
    context: "🏢 Votre premier jour dans l'entreprise.",
    options: ["Vous faites semblant de comprendre", "Vous demandez poliment de répéter", "Vous ignorez la consigne", "Vous rentrez chez vous"],
    correct: "Vous demandez poliment de répéter",
    explanation: "Il est toujours préférable de demander des clarifications plutôt que de mal exécuter une tâche."
  },
  {
    id: 15,
    level: "A1",
    category: "Situations Professionnelles",
    type: "scenario_tree",
    timeLimit: 60,
    question: "Vous êtes malade et ne pouvez pas venir travailler. Que devez-vous faire ?",
    context: "📱 Il est 7h du matin.",
    options: ["Ne rien dire", "Envoyer un message à votre responsable le plus tôt possible", "Venir quand même", "Demander à un collègue de travailler à votre place"],
    correct: "Envoyer un message à votre responsable le plus tôt possible",
    explanation: "Il faut toujours prévenir son employeur en cas d'absence."
  },
  {
    id: 16,
    level: "A2",
    category: "Situations Professionnelles",
    type: "scenario_tree",
    timeLimit: 75,
    question: "Vous arrivez en retard à une réunion. Que dites-vous ?",
    context: "⏰ Vous avez 10 minutes de retard.",
    options: ["Rien, vous vous asseyez.", "Excusez-moi pour le retard.", "C'est de votre faute.", "Je suis fatigué."],
    correct: "Excusez-moi pour le retard.",
    explanation: "Il est important de s'excuser lorsqu'on arrive en retard."
  },
  {
    id: 17,
    level: "B1",
    category: "Situations Professionnelles",
    type: "scenario_tree",
    timeLimit: 90,
    question: "Votre responsable vous demande de réaliser une tâche que vous ne savez pas faire. Que dites-vous ?",
    context: "💼 Nouvelle mission en réunion.",
    options: ["Vous dites que vous la ferez sans demander d'aide", "Vous expliquez honnêtement et demandez un accompagnement", "Vous refusez catégoriquement", "Vous demandez à un collègue de le faire en secret"],
    correct: "Vous expliquez honnêtement et demandez un accompagnement",
    explanation: "L'honnêteté et la demande de soutien sont des signes de professionnalisme."
  },
  {
    id: 18,
    level: "B2",
    category: "Situations Professionnelles",
    type: "scenario_tree",
    timeLimit: 90,
    question: "Un client se plaint d'un service rendu par votre entreprise. Comment gérez-vous la situation ?",
    context: "📞 Appel entrant d'un client mécontent.",
    options: ["Vous niez les faits", "Vous écoutez, reformulez, vous excusez et proposez une solution", "Vous renvoyez le client vers un autre service sans explication", "Vous raccrochez"],
    correct: "Vous écoutez, reformulez, vous excusez et proposez une solution",
    explanation: "La gestion d'une réclamation repose sur l'écoute, la reformulation et la solution."
  },

  // ─── BLOC 5 : CONSIGNES DE SÉCURITÉ ─────────────────────
  {
    id: 19,
    level: "A1",
    category: "Situations Professionnelles",
    type: "safety_instruction",
    timeLimit: 60,
    question: "Vous voyez ce panneau dans l'atelier. Que signifie-t-il ?",
    safetyIcon: "🚫🔥",
    safetyLabel: "INTERDICTION DE FUMER",
    options: ["Fumer est autorisé ici", "Il est interdit de fumer dans cette zone", "Fumer est obligatoire", "Allumer un feu est conseillé"],
    correct: "Il est interdit de fumer dans cette zone",
    explanation: "Le panneau d'interdiction de fumer signifie que toute cigarette est prohibée dans la zone."
  },
  {
    id: 20,
    level: "A2",
    category: "Situations Professionnelles",
    type: "safety_instruction",
    timeLimit: 60,
    question: "Vous lisez cette instruction de sécurité. Que devez-vous faire ?",
    safetyIcon: "⚠️",
    safetyLabel: "En cas d'incendie, ne prenez pas l'ascenseur. Utilisez les escaliers de secours.",
    options: ["Prendre l'ascenseur pour aller plus vite", "Utiliser les escaliers de secours", "Rester dans son bureau", "Appeler ses collègues"],
    correct: "Utiliser les escaliers de secours",
    explanation: "En cas d'incendie, l'ascenseur est dangereux. Il faut toujours utiliser les escaliers de secours."
  },

  // ─── BLOC 6 : MATCH PAIRS ────────────────────────────────
  {
    id: 21,
    level: "A2",
    category: "Vocabulaire Professionnel",
    type: "match_pairs",
    timeLimit: 90,
    question: "Reliez chaque document à sa définition.",
    pairs: [
      { left: "CV", right: "Résumé de votre parcours professionnel" },
      { left: "Contrat de travail", right: "Document signé entre employeur et employé" },
      { left: "Fiche de paie", right: "Document qui détaille votre salaire mensuel" },
      { left: "RIB", right: "Relevé d'identité bancaire pour recevoir votre salaire" },
    ],
    explanation: "Ces documents sont essentiels dans la vie professionnelle en France."
  },
  {
    id: 22,
    level: "B1",
    category: "Vocabulaire Professionnel",
    type: "match_pairs",
    timeLimit: 90,
    question: "Reliez chaque mot à son contraire dans un contexte professionnel.",
    pairs: [
      { left: "Ponctuel", right: "En retard" },
      { left: "Autonome", right: "Dépendant" },
      { left: "Formel", right: "Informel" },
      { left: "Embauche", right: "Licenciement" },
    ],
    explanation: "Les antonymes sont utiles pour nuancer son expression professionnelle."
  },

  // ─── BLOC 7 : COMPLÉTER UN DIALOGUE ─────────────────────
  {
    id: 23,
    level: "A1",
    category: "Grammaire",
    type: "complete_dialogue",
    timeLimit: 60,
    question: "Complétez ce dialogue entre un employé et un client.",
    dialogue: [
      { speaker: "Client", text: "Bonjour, je voudrais parler à M. Dupont." },
      { speaker: "Employé", text: "___" },
    ],
    options: [
      "Oui c'est moi, quoi ?",
      "Bonjour ! Un instant s'il vous plaît, je vous le passe.",
      "Il n'est pas là, au revoir.",
      "Appelez plus tard."
    ],
    correct: "Bonjour ! Un instant s'il vous plaît, je vous le passe.",
    explanation: "Une réponse professionnelle au téléphone est toujours polie et propose une aide concrète."
  },
  {
    id: 24,
    level: "A2",
    category: "Grammaire",
    type: "complete_dialogue",
    timeLimit: 75,
    question: "Complétez ce dialogue en entreprise.",
    dialogue: [
      { speaker: "Responsable", text: "Pouvez-vous finir ce rapport pour demain matin ?" },
      { speaker: "Employé", text: "___" },
    ],
    options: [
      "Non, c'est trop de travail.",
      "Oui, je ferai de mon mieux. Y a-t-il des points prioritaires ?",
      "Pourquoi moi ?",
      "Je ne sais pas faire les rapports."
    ],
    correct: "Oui, je ferai de mon mieux. Y a-t-il des points prioritaires ?",
    explanation: "Accepter une mission en demandant des précisions montre du professionnalisme."
  },
  {
    id: 25,
    level: "B1",
    category: "Grammaire",
    type: "complete_dialogue",
    timeLimit: 75,
    question: "Complétez cet échange lors d'un entretien d'embauche.",
    dialogue: [
      { speaker: "Recruteur", text: "Quels sont vos points forts ?" },
      { speaker: "Candidat", text: "___" },
    ],
    options: [
      "Je suis toujours en retard mais je travaille bien.",
      "Je suis rigoureux, je m'adapte facilement et j'aime travailler en équipe.",
      "Je ne sais pas vraiment.",
      "Je suis le meilleur dans mon domaine."
    ],
    correct: "Je suis rigoureux, je m'adapte facilement et j'aime travailler en équipe.",
    explanation: "Il faut présenter ses qualités de façon concrète et positive lors d'un entretien."
  },

  // ─── BLOC 8 : VOCABULAIRE PROFESSIONNEL ─────────────────
  {
    id: 26,
    level: "A1",
    category: "Vocabulaire Professionnel",
    type: "listen_choose",
    timeLimit: 45,
    question: "Qu'est-ce qu'une « tenue de travail » ?",
    audioText: "Qu'est-ce qu'une tenue de travail ?",
    options: ["Des vêtements portés pour faire du sport", "Des vêtements appropriés et propres pour travailler", "La décoration du bureau", "L'heure d'arrivée"],
    correct: "Des vêtements appropriés et propres pour travailler",
    explanation: "La tenue de travail désigne les vêtements adaptés au poste."
  },
  {
    id: 27,
    level: "A2",
    category: "Vocabulaire Professionnel",
    type: "listen_choose",
    timeLimit: 45,
    question: "Qu'est-ce qu'un CV ?",
    audioText: "Comment s'appelle le document qui résume votre parcours professionnel ?",
    options: ["Une lettre", "Un contrat", "Un CV", "Une facture"],
    correct: "Un CV",
    explanation: "Le CV (Curriculum Vitae) résume vos expériences, formations et compétences."
  },
  {
    id: 28,
    level: "B1",
    category: "Vocabulaire Professionnel",
    type: "listen_choose",
    timeLimit: 60,
    question: "Que signifie « être polyvalent » au travail ?",
    audioText: "Que signifie être polyvalent au travail ?",
    options: ["Être spécialisé dans un seul domaine", "Savoir effectuer plusieurs types de tâches différentes", "Travailler à temps partiel", "Refuser certaines missions"],
    correct: "Savoir effectuer plusieurs types de tâches différentes",
    explanation: "La polyvalence permet d'intervenir sur des postes variés."
  },
  {
    id: 29,
    level: "B2",
    category: "Vocabulaire Professionnel",
    type: "listen_choose",
    timeLimit: 75,
    question: "Que désigne la « confidentialité professionnelle » ?",
    audioText: "Que désigne la notion de confidentialité professionnelle ?",
    options: [
      "Le droit de partager toutes les informations de l'entreprise",
      "L'obligation de ne pas divulguer des informations sensibles liées au travail",
      "Un type de contrat de travail",
      "Une réunion à huis clos"
    ],
    correct: "L'obligation de ne pas divulguer des informations sensibles liées au travail",
    explanation: "La confidentialité professionnelle protège les données de l'entreprise et des clients."
  },

  // ─── BLOC 9 : ODD ONE OUT (intrus) ──────────────────────
  {
    id: 30,
    level: "A2",
    category: "Vocabulaire Professionnel",
    type: "odd_one_out",
    timeLimit: 45,
    question: "Quel mot n'appartient pas à la même famille que les autres ?",
    options: ["contrat", "embauche", "météo", "salaire"],
    correct: "météo",
    explanation: "'Météo' n'a pas de lien avec le monde du travail, contrairement aux trois autres."
  },
  {
    id: 31,
    level: "B1",
    category: "Vocabulaire Professionnel",
    type: "odd_one_out",
    timeLimit: 45,
    question: "Quel mot est l'intrus dans cette liste professionnelle ?",
    options: ["réunion", "compte rendu", "ordre du jour", "recette de cuisine"],
    correct: "recette de cuisine",
    explanation: "Les trois premiers termes appartiennent au contexte des réunions professionnelles."
  },

  // ─── BLOC 10 : SENTENCE BUILDER ─────────────────────────
  {
    id: 32,
    level: "A1",
    category: "Grammaire",
    type: "sentence_builder",
    timeLimit: 60,
    question: "Remettez ces mots dans le bon ordre pour former une phrase correcte.",
    words: ["travaille", "Je", "lundi", "le"],
    correctSentence: "Je travaille le lundi.",
    explanation: "L'ordre correct est : sujet + verbe + complément de temps."
  },
  {
    id: 33,
    level: "A2",
    category: "Grammaire",
    type: "sentence_builder",
    timeLimit: 75,
    question: "Remettez ces mots dans le bon ordre.",
    words: ["dans", "l'entreprise", "depuis", "travaille", "Il", "ans", "trois"],
    correctSentence: "Il travaille dans l'entreprise depuis trois ans.",
    explanation: "Le verbe 'travailler depuis' exprime une action qui a commencé dans le passé et continue."
  },

  // ─── BLOC 11 : CATEGORIZE ────────────────────────────────
  {
    id: 34,
    level: "A2",
    category: "Vocabulaire Professionnel",
    type: "categorize",
    timeLimit: 90,
    question: "Classez ces expressions : sont-elles formelles ou informelles ?",
    categories: ["Formel", "Informel"],
    items: [
      { text: "Veuillez trouver ci-joint...", category: "Formel" },
      { text: "T'inquiète, c'est bon !", category: "Informel" },
      { text: "Je me permets de vous contacter...", category: "Formel" },
      { text: "Salut, t'as deux minutes ?", category: "Informel" },
      { text: "Dans l'attente de votre réponse...", category: "Formel" },
      { text: "On se fait une pause ?", category: "Informel" },
    ],
    explanation: "Le registre formel est utilisé dans les écrits professionnels officiels."
  },
  {
    id: 35,
    level: "B1",
    category: "Situations Professionnelles",
    type: "categorize",
    timeLimit: 90,
    question: "Classez ces comportements au travail : sont-ils obligatoires, conseillés ou interdits ?",
    categories: ["Obligatoire", "Conseillé", "Interdit"],
    items: [
      { text: "Porter les EPI dans les zones signalées", category: "Obligatoire" },
      { text: "Dire bonjour à ses collègues", category: "Conseillé" },
      { text: "Fumer dans les locaux fermés", category: "Interdit" },
      { text: "Prévenir en cas d'absence", category: "Obligatoire" },
      { text: "Proposer de l'aide à un collègue", category: "Conseillé" },
      { text: "Divulguer des informations confidentielles", category: "Interdit" },
    ],
    explanation: "Connaître les obligations et interdictions professionnelles est essentiel."
  },

  // ─── BLOC 12 : READ COMPREHENSION ───────────────────────
  {
    id: 36,
    level: "A2",
    category: "Compréhension Écrite",
    type: "read_comprehension",
    timeLimit: 120,
    passage: "Avis interne — À tous les employés\n\nLe bureau sera fermé le vendredi 14 juillet en raison de la fête nationale. Les employés qui doivent travailler ce jour-là recevront une compensation. Merci de consulter votre responsable pour plus d'informations.",
    question: "Pourquoi le bureau sera-t-il fermé le 14 juillet ?",
    options: [
      "Pour des travaux de rénovation",
      "En raison de la fête nationale",
      "Parce que le responsable est absent",
      "Pour une formation obligatoire"
    ],
    correct: "En raison de la fête nationale",
    explanation: "L'avis précise explicitement 'en raison de la fête nationale'."
  },
  {
    id: 37,
    level: "B1",
    category: "Compréhension Écrite",
    type: "read_comprehension",
    timeLimit: 150,
    passage: "Règlement intérieur — Extrait\n\nTout salarié est tenu de respecter les horaires de travail définis dans son contrat. En cas de retard non justifié répété, l'employeur peut engager une procédure disciplinaire. Les absences doivent être signalées avant 9h au service des ressources humaines. Un arrêt de travail doit être transmis dans les 48 heures suivant son émission.",
    question: "Dans quel délai doit-on transmettre un arrêt de travail ?",
    options: [
      "Dans les 24 heures",
      "Dans les 48 heures",
      "Dans la semaine",
      "Avant 9h le lendemain"
    ],
    correct: "Dans les 48 heures",
    explanation: "Le règlement stipule 'dans les 48 heures suivant son émission'."
  },
  {
    id: 38,
    level: "B2",
    category: "Compréhension Écrite",
    type: "read_comprehension",
    timeLimit: 180,
    passage: "Note de service — Direction générale\n\nDans le cadre de notre démarche qualité, l'entreprise met en place à partir du 1er septembre un nouveau protocole d'évaluation des compétences. Chaque collaborateur sera évalué semestriellement par son manager direct sur la base d'une grille de critères définis conjointement avec les représentants du personnel. Ces entretiens remplaceront les évaluations annuelles actuelles et permettront un suivi plus régulier du développement professionnel.",
    question: "Quelle est la principale différence entre le nouveau et l'ancien système d'évaluation ?",
    options: [
      "Le nouveau système est géré par les RH et non par les managers",
      "Les évaluations passeront d'annuelles à semestrielles",
      "Les critères ne seront plus définis par la direction",
      "Les entretiens seront supprimés au profit de formulaires"
    ],
    correct: "Les évaluations passeront d'annuelles à semestrielles",
    explanation: "La note précise que les entretiens semestriels 'remplaceront les évaluations annuelles actuelles'."
  },

  // ─── BLOC 13 : TRUE / FALSE + JUSTIFY ───────────────────
  {
    id: 39,
    level: "B1",
    category: "Compréhension Écrite",
    type: "true_false_justify",
    timeLimit: 120,
    passage: "L'entreprise DuoBat annonce l'ouverture de son nouveau site de production à Lyon. Ce site créera 150 emplois d'ici deux ans. Les candidatures sont ouvertes à partir du 1er octobre sur le site internet de l'entreprise.",
    statement: "Les candidatures sont ouvertes immédiatement.",
    correct: "Faux",
    justification: "à partir du 1er octobre",
    options: ["Vrai", "Faux"],
    explanation: "Le texte précise 'à partir du 1er octobre', donc les candidatures ne sont pas encore ouvertes."
  },
  {
    id: 40,
    level: "B2",
    category: "Compréhension Écrite",
    type: "true_false_justify",
    timeLimit: 120,
    passage: "Dans le cadre du plan de formation 2026, tous les salariés en CDI ayant plus d'un an d'ancienneté peuvent bénéficier d'une formation financée intégralement par l'entreprise. Les demandes doivent être soumises avant le 30 juin auprès du service RH.",
    statement: "Un salarié en CDD avec 2 ans d'ancienneté peut bénéficier de cette formation.",
    correct: "Faux",
    justification: "tous les salariés en CDI",
    options: ["Vrai", "Faux"],
    explanation: "Le plan est réservé aux 'salariés en CDI' — un CDD est exclu."
  },

  // ─── BLOC 14 : ORDER SENTENCES ───────────────────────────
  {
    id: 41,
    level: "A2",
    category: "Grammaire",
    type: "order_sentences",
    timeLimit: 90,
    question: "Remettez ces phrases dans le bon ordre pour former un email professionnel cohérent.",
    sentences: [
      "Cordialement, Ahmed Benali",
      "Objet : Absence du 15 au 16 mai",
      "Bonjour Madame Martin,",
      "Je vous informe que je serai absent les 15 et 16 mai pour raisons médicales.",
      "Je transmettrai un certificat médical dès que possible."
    ],
    correctOrder: [2, 1, 3, 4, 0],
    explanation: "Un email professionnel commence par la formule d'appel, puis l'objet, le corps du message et la formule de politesse."
  },
  {
    id: 42,
    level: "B1",
    category: "Grammaire",
    type: "order_sentences",
    timeLimit: 120,
    question: "Remettez ces étapes dans le bon ordre pour gérer une réclamation client.",
    sentences: [
      "Proposer une solution concrète",
      "Écouter le client sans l'interrompre",
      "S'excuser sincèrement",
      "Reformuler le problème pour vérifier la compréhension",
      "Faire un suivi pour s'assurer de la satisfaction"
    ],
    correctOrder: [1, 3, 2, 0, 4],
    explanation: "La gestion d'une réclamation suit un protocole précis : écoute, reformulation, excuse, solution, suivi."
  },

  // ─── BLOC 15 : WORD CHOICE TEXT ─────────────────────────
  {
    id: 43,
    level: "A2",
    category: "Grammaire",
    type: "word_choice_text",
    timeLimit: 90,
    question: "Choisissez le bon mot dans chaque liste déroulante pour compléter cet email.",
    textParts: [
      "Bonjour ",
      { blank: 0, options: ["Monsieur", "Mec", "Salut"] },
      " Martin,\n\nJe vous ",
      { blank: 1, options: ["contacte", "appelle", "écris"] },
      " pour vous informer de mon ",
      { blank: 2, options: ["absence", "présence", "retard"] },
      " demain. Je reste disponible par email.\n\nCordialement,"
    ],
    correctBlanks: ["Monsieur", "contacte", "absence"],
    explanation: "Un email professionnel utilise un registre formel."
  },
  {
    id: 44,
    level: "B1",
    category: "Grammaire",
    type: "word_choice_text",
    timeLimit: 90,
    question: "Complétez ce compte rendu de réunion.",
    textParts: [
      "La réunion s'est ",
      { blank: 0, options: ["tenue", "passée", "faite"] },
      " le 12 mai. Les participants ont ",
      { blank: 1, options: ["convenu", "décidé", "pensé"] },
      " de reporter le projet. Un nouveau calendrier sera ",
      { blank: 2, options: ["établi", "créé", "fait"] },
      " d'ici la semaine prochaine."
    ],
    correctBlanks: ["tenue", "convenu", "établi"],
    explanation: "Ces termes appartiennent au vocabulaire formel des documents professionnels."
  },

  // ─── BLOC 16 : COMPLETE FORM ─────────────────────────────
  {
    id: 45,
    level: "A1",
    category: "Situations Professionnelles",
    type: "complete_form",
    timeLimit: 120,
    question: "Lisez les informations ci-dessous et remplissez le formulaire d'absence.",
    context: "Marie Dupont, employée depuis 3 ans, demande un congé du 20 au 24 juin 2026 pour raisons personnelles. Son responsable s'appelle Pierre Martin.",
    formFields: [
      { label: "Nom et prénom de l'employé(e)", key: "name", answer: "Marie Dupont" },
      { label: "Motif de l'absence", key: "reason", answer: "Raisons personnelles" },
      { label: "Date de début", key: "start", answer: "20 juin 2026" },
      { label: "Date de fin", key: "end", answer: "24 juin 2026" },
      { label: "Nom du responsable", key: "manager", answer: "Pierre Martin" },
    ],
    explanation: "Remplir un formulaire administratif nécessite de repérer les informations clés dans un texte."
  },
  {
    id: 46,
    level: "A2",
    category: "Situations Professionnelles",
    type: "complete_form",
    timeLimit: 120,
    question: "Complétez la fiche d'incident à partir des informations suivantes.",
    context: "Le 10 mai 2026 à 14h30, Jean-Paul Moreau, magasinier, s'est blessé à la main droite en manipulant une caisse. Il a été soigné par l'infirmière du site et a pu reprendre son poste.",
    formFields: [
      { label: "Nom de la personne blessée", key: "victim", answer: "Jean-Paul Moreau" },
      { label: "Date et heure de l'incident", key: "datetime", answer: "10 mai 2026 à 14h30" },
      { label: "Nature de la blessure", key: "injury", answer: "Blessure à la main droite" },
      { label: "Cause de l'incident", key: "cause", answer: "Manipulation d'une caisse" },
      { label: "Suite donnée", key: "followup", answer: "Soins par l'infirmière, reprise du poste" },
    ],
    explanation: "Une fiche d'incident doit contenir qui, quand, quoi, comment et les suites données."
  },

  // ─── BLOC 17 : EMAIL RESPONSE ────────────────────────────
  {
    id: 47,
    level: "A2",
    category: "Situations Professionnelles",
    type: "email_response",
    timeLimit: 90,
    emailFrom: "responsable@entreprise.fr",
    emailSubject: "Réunion demain à 9h",
    emailBody: "Bonjour,\n\nJe vous rappelle que la réunion d'équipe aura lieu demain matin à 9h00 en salle B.\n\nMerci de confirmer votre présence.\n\nCordialement,\nM. Lambert",
    question: "Quelle est la meilleure réponse à envoyer à M. Lambert ?",
    options: [
      "Bonjour M. Lambert, je confirme ma présence à la réunion de demain à 9h. Cordialement.",
      "Ok c'est bon.",
      "Je ne suis pas sûr de pouvoir venir.",
      "Pourquoi cette réunion ? Je ne suis pas au courant."
    ],
    correct: "Bonjour M. Lambert, je confirme ma présence à la réunion de demain à 9h. Cordialement.",
    explanation: "Une réponse professionnelle répète les informations clés et utilise une formule de politesse."
  },
  {
    id: 48,
    level: "B1",
    category: "Situations Professionnelles",
    type: "email_response",
    timeLimit: 90,
    emailFrom: "client@socièté.com",
    emailSubject: "Réclamation — Commande n°4521",
    emailBody: "Madame, Monsieur,\n\nJ'ai reçu ma commande n°4521 mais deux articles manquent. Je souhaite être remboursé ou recevoir les articles manquants dans les meilleurs délais.\n\nCordialement,\nM. Petit",
    question: "Quelle réponse convient le mieux à cette réclamation ?",
    options: [
      "C'est votre faute, vous n'avez pas bien vérifié le colis.",
      "Monsieur Petit, nous prenons note de votre réclamation et nous engageons à vous envoyer les articles manquants sous 48h. Veuillez nous excuser pour ce désagrément.",
      "Nous allons voir ce que nous pouvons faire.",
      "Appelez notre service client."
    ],
    correct: "Monsieur Petit, nous prenons note de votre réclamation et nous engageons à vous envoyer les articles manquants sous 48h. Veuillez nous excuser pour ce désagrément.",
    explanation: "Une bonne réponse à une réclamation reconnaît le problème, s'excuse et propose une solution claire."
  },

  // ─── BLOC 18 : COMPRÉHENSION ÉCRITE CLASSIQUE ───────────
  {
    id: 49,
    level: "B1",
    category: "Compréhension Écrite",
    type: "listen_choose",
    timeLimit: 75,
    question: "Lisez : « Malgré la pluie, nous avons continué notre promenade. » Qu'est-ce qui est vrai ?",
    audioText: "Malgré la pluie, nous avons continué notre promenade.",
    options: ["Ils ont arrêté à cause de la pluie", "Ils ont continué malgré la pluie", "Il ne pleuvait pas", "Ils sont rentrés"],
    correct: "Ils ont continué malgré la pluie",
    explanation: "'Malgré' indique qu'ils ont continué en dépit de la pluie."
  },
  {
    id: 50,
    level: "B2",
    category: "Compréhension Écrite",
    type: "listen_choose",
    timeLimit: 90,
    question: "Lisez : « Tout accident du travail doit être déclaré dans les 24 heures. » Que signifie cette règle ?",
    audioText: "Tout accident du travail doit être déclaré dans les vingt-quatre heures suivant sa survenance.",
    options: ["On peut attendre plusieurs jours", "L'accident doit être signalé au plus tard le lendemain", "L'accident n'a pas besoin d'être déclaré", "La déclaration est facultative"],
    correct: "L'accident doit être signalé au plus tard le lendemain",
    explanation: "'Dans les 24 heures' signifie au plus tard le lendemain de l'accident."
  },

  // ─── BLOC 19 : REFORMULER ────────────────────────────────
  {
    id: 51,
    level: "A2",
    category: "Grammaire",
    type: "reformulate",
    timeLimit: null,
    question: "Reformulez cette phrase de manière plus polie pour un contexte professionnel.",
    originalText: "Donnez-moi le dossier.",
    placeholder: "Pourriez-vous me donner le dossier, s'il vous plaît ?",
    minWords: 5,
    criteria: ["Utilise une formule de politesse", "Garde le même sens", "Ton professionnel"]
  },
  {
    id: 52,
    level: "B1",
    category: "Grammaire",
    type: "reformulate",
    timeLimit: null,
    question: "Réécrivez cette phrase en utilisant le conditionnel pour la rendre plus courtoise.",
    originalText: "Je veux prendre rendez-vous.",
    placeholder: "Je voudrais prendre rendez-vous, s'il vous plaît.",
    minWords: 5,
    criteria: ["Utilise le conditionnel", "Ton poli et professionnel", "Sens conservé"]
  },

  // ─── BLOC 20 : PRODUCTION ÉCRITE ─────────────────────────
  {
    id: 53,
    level: "A2",
    category: "Expression Écrite",
    type: "written",
    timeLimit: null,
    question: "Écrivez un message court à votre responsable pour lui expliquer que vous serez absent(e) demain et pourquoi. (3-4 phrases)",
    placeholder: "Exemple : Bonjour M. Martin, Je vous informe que je serai absent(e) demain car je suis malade. Je vous transmettrai un certificat médical dès que possible. Cordialement,",
    minWords: 25,
    criteria: ["Formule de politesse en début et fin", "Explique la raison de l'absence", "Ton professionnel", "Phrases simples et correctes"]
  },
  {
    id: 54,
    level: "B1",
    category: "Expression Écrite",
    type: "written",
    timeLimit: null,
    question: "Rédigez un email à un client pour confirmer un rendez-vous. Précisez le jour, l'heure et le lieu. (4-5 phrases)",
    placeholder: "Exemple : Madame, Monsieur, Je me permets de vous confirmer notre rendez-vous du...",
    minWords: 35,
    criteria: ["Formule d'appel professionnelle", "Confirme clairement les détails (jour, heure, lieu)", "Formule de politesse finale", "Texte cohérent et bien structuré"]
  },

  // ─── BLOC 21 : PRODUCTION ORALE ──────────────────────────
  {
    id: 55,
    level: "A1",
    category: "Production Orale",
    type: "oral",
    timeLimit: null,
    question: "Présentez-vous : dites votre prénom, votre pays d'origine et votre métier (ou métier souhaité).",
    minDuration: 10,
    criteria: ["Prononciation compréhensible", "Donne au moins 2 informations personnelles", "Phrases simples et claires"]
  },
  {
    id: 56,
    level: "B1",
    category: "Production Orale",
    type: "oral",
    timeLimit: null,
    question: "Décrivez votre dernière expérience professionnelle ou de bénévolat. Quelles tâches faisiez-vous ? Qu'avez-vous appris ?",
    minDuration: 20,
    criteria: ["Utilise le passé", "Décrit des tâches concrètes", "S'exprime avec aisance", "Vocabulaire professionnel"]
  },
];