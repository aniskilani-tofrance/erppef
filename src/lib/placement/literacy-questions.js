// Bloc « littératie » (détection Pré-alpha / Alpha / Post-alpha / A1.1), placé EN TÊTE
// du test, dans un ORDRE FIXE (jamais mélangé). Conçu d'après le référentiel A1.1
// (Beacco/de Ferrari), les paliers DGLFLF et les outils de terrain (eva, CRI, DILF).
//
// Principes non négociables (spec docs/strategy — voir aide) :
// - Tout est audio-piloté : la consigne est lue automatiquement (LOW_LEVELS du lecteur).
// - noAudio: true dès qu'entendre l'option donnerait la réponse (lecture testée).
// - Stimuli lecture en CAPITALES (script le plus reconnu), sauf la phrase seuil A1.1.
// - Emoji concrets univoques uniquement, jamais seuls porteurs du sens (audio couplé).
// - Lexiques disjoints entre compréhension orale et lecture (pas d'effet d'apprentissage).
// - Aucun feedback d'échec côté candidat.
//
// skill : "declaratif" | "oral" | "lettres" (L0) | "chiffres" | "mots" (L1) | "lecture" (L2) | "ecriture"

export const literacyQuestions = [
  // ─── DÉCLARATIF (route la pédagogie, ne classe jamais seul) ───
  {
    id: 101,
    block: "litteratie",
    level: "Alpha",
    category: "Parcours",
    type: "big_choice",
    skill: "declaratif",
    question: "Quand vous étiez enfant, êtes-vous allé à l'école ?",
    options: ["🏫❌ Non, jamais", "🏫 Oui, un peu", "🏫🎓 Oui, longtemps"],
    // pas de champ correct : réponse déclarative
  },
  {
    id: 102,
    block: "litteratie",
    level: "Alpha",
    category: "Parcours",
    type: "big_choice",
    skill: "declaratif",
    question: "À l'école, c'était en français ?",
    options: ["🇫🇷 Oui", "🌍 Non"],
    skipIf: { questionId: 101, answerStartsWith: "🏫❌" }, // jamais scolarisé → sans objet
  },

  // ─── COMPRÉHENSION ORALE (toujours administrée : l'oral et l'écrit sont indépendants) ───
  {
    id: 103,
    block: "litteratie",
    level: "Alpha",
    category: "Écoute",
    type: "big_choice",
    skill: "oral",
    question: "Écoutez. Touchez la bonne image.",
    audioText: "Le téléphone.",
    options: ["📞", "🍌", "🏠", "⚽"],
    correct: "📞",
    noAudio: true,
  },
  {
    id: 104,
    block: "litteratie",
    level: "Alpha",
    category: "Écoute",
    type: "big_choice",
    skill: "oral",
    question: "Écoutez. Touchez la bonne image.",
    audioText: "Je voudrais un café, s'il vous plaît.",
    options: ["☕", "🥖", "🚌", "💊"],
    correct: "☕",
    noAudio: true,
  },
  {
    id: 105,
    block: "litteratie",
    level: "Alpha",
    category: "Écoute",
    type: "big_choice",
    skill: "oral",
    question: "Écoutez. Touchez la bonne image.",
    audioText: "Le chat.",
    options: ["🐱", "🚪", "🍎", "🧢"],
    correct: "🐱",
    noAudio: true,
  },

  // ─── PALIER L0 : ENTRÉE DANS L'ÉCRIT ───
  {
    id: 106,
    block: "litteratie",
    level: "Pré-alpha",
    category: "Écrit",
    type: "big_choice",
    skill: "lettres",
    question: "Touchez ce qui est écrit. Où sont les lettres ?",
    options: ["MAISON", "🌺", "♪ ♪ ♪", "🐦"],
    correct: "MAISON",
    noAudio: true,
  },
  {
    id: 107,
    block: "litteratie",
    level: "Pré-alpha",
    category: "Écrit",
    type: "big_choice",
    skill: "lettres",
    question: "Touchez la lettre A. A, comme dans AMI.",
    options: ["A", "M", "O", "7"], // le 7 teste la distinction lettres/chiffres
    correct: "A",
    noAudio: true,
    bigText: true,
  },
  {
    id: 108,
    block: "litteratie",
    level: "Pré-alpha",
    category: "Écrit",
    type: "big_choice",
    skill: "lettres",
    question: "Touchez votre prénom.",
    dynamicName: true, // options générées depuis le prénom (banque de distracteurs côté lecteur)
    options: [],       // remplies au chargement ; correct = prénom (comparé côté serveur)
    noAudio: true,
    bigText: true,
  },

  // ─── NUMÉRATIE (toujours administrée, souvent préservée — discriminant pré-alpha/alpha) ───
  {
    id: 109,
    block: "litteratie",
    level: "Alpha",
    category: "Nombres",
    type: "big_choice",
    skill: "chiffres",
    question: "Touchez le nombre trente-cinq.",
    options: ["35", "53", "15"],
    correct: "35",
    noAudio: true,
    bigText: true,
  },

  // ─── PALIER L1 : DÉCHIFFRAGE (distracteurs étagés pour l'analyse d'erreur) ───
  {
    id: 110,
    block: "litteratie",
    level: "Alpha",
    category: "Lecture",
    type: "big_choice",
    skill: "mots",
    question: "Écoutez le mot. Touchez le mot écrit.",
    audioText: "Pain.",
    options: ["PAIN", "BAIN", "PIED", "VÉLO"], // BAIN=p/b, PIED=1re lettre seule, VÉLO=aucun décodage
    correct: "PAIN",
    noAudio: true,
    bigText: true,
  },
  {
    id: 111,
    block: "litteratie",
    level: "Alpha",
    category: "Lecture",
    type: "big_choice",
    skill: "mots",
    question: "Écoutez le mot. Touchez le mot écrit.",
    audioText: "Bus.",
    options: ["BUS", "BAS", "SUB", "RIZ"], // SUB=sens de lecture, BAS=voyelle
    correct: "BUS",
    noAudio: true,
    bigText: true,
  },

  // ─── PALIER L2 : LECTURE-COMPRÉHENSION (seuil A1.1 — le stimulus n'est JAMAIS prononcé) ───
  {
    id: 112,
    block: "litteratie",
    level: "A1.1",
    category: "Lecture",
    type: "big_choice",
    skill: "lecture",
    question: "Lisez le mot. Touchez la bonne image.",
    stimulus: "TAXI",
    options: ["🚕", "🍎", "🐟", "🎩"],
    correct: "🚕",
    noAudio: true,
  },
  {
    id: 113,
    block: "litteratie",
    level: "A1.1",
    category: "Lecture",
    type: "big_choice",
    skill: "lecture",
    question: "Lisez la phrase. Touchez la bonne image.",
    stimulus: "Je mange une pomme.", // script standard : c'est précisément le seuil A1.1
    options: ["🍎", "☕", "🚌", "📞"],
    correct: "🍎",
    noAudio: true,
  },

  // ─── PRODUCTION CHIFFRÉE (informatif : un échec n'abaisse jamais le classement) ───
  {
    id: 114,
    block: "litteratie",
    level: "A1.1",
    category: "Nombres",
    type: "fill_keyboard",
    skill: "ecriture",
    question: "Écoutez le nombre. Écrivez-le avec les chiffres.",
    audioText: "Dix-sept.",
    template: "___",
    acceptedAnswers: ["17"],
    numeric: true,
  },
];

// Banque de distracteurs pour l'item prénom (généré côté lecteur) : on fabrique des
// pseudo-prénoms proches (même initiale, longueur voisine) — jamais de vrais prénoms
// d'autres apprenants.
export function nameDistractors(firstName) {
  const name = (firstName || "AMINA").toUpperCase().replace(/[^A-ZÀ-Ü-]/g, "").slice(0, 12) || "AMINA";
  const letters = "AEIOULMNRST";
  const swap = (s, i, j) => {
    const a = s.split("");
    [a[i], a[j]] = [a[j], a[i]];
    return a.join("");
  };
  const variants = new Set();
  if (name.length >= 4) variants.add(swap(name, 1, 2));                 // lettres internes inversées
  variants.add(name.slice(0, -1) + (name.endsWith("A") ? "I" : "A"));   // finale changée
  const mid = Math.floor(name.length / 2);
  variants.add(name.slice(0, mid) + letters[(name.charCodeAt(mid) || 65) % letters.length] + name.slice(mid + 1));
  variants.delete(name);
  const list = [...variants].slice(0, 3);
  // Complément pour les prénoms très courts : finale substituée, jamais le prénom lui-même.
  for (const letter of letters) {
    if (list.length >= 3) break;
    const candidate = name.slice(0, -1) + letter;
    if (candidate !== name && !list.includes(candidate)) list.push(candidate);
  }
  return list;
}
