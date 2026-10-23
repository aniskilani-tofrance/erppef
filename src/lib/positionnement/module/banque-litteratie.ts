// Bloc littératie (14 items, ordre fixe) : Pré-alpha / Alpha / Post-alpha / A1.1.
// FICHIER DE DONNÉES — généré une fois depuis l'outil d'origine (15/10/2026), puis maintenu ici.
// Textes inchangés : le nom de chaque audio est l'empreinte de son texte (tts.ts).

import type { Item } from "./types.ts";

export const ITEMS_LITTERATIE: Item[] = [
  {
    "id": 101,
    "block": "litteratie",
    "level": "Alpha",
    "category": "Parcours",
    "type": "big_choice",
    "skill": "declaratif",
    "question": "Quand vous étiez enfant, êtes-vous allé à l'école ?",
    "options": [
      "🏫❌ Non, jamais",
      "🏫 Oui, un peu",
      "🏫🎓 Oui, longtemps"
    ],
    "competence": "LITTERATIE"
  },
  {
    "id": 102,
    "block": "litteratie",
    "level": "Alpha",
    "category": "Parcours",
    "type": "big_choice",
    "skill": "declaratif",
    "question": "À l'école, c'était en français ?",
    "options": [
      "🇫🇷 Oui",
      "🌍 Non"
    ],
    "skipIf": {
      "questionId": 101,
      "answerStartsWith": "🏫❌"
    },
    "competence": "LITTERATIE"
  },
  {
    "id": 103,
    "block": "litteratie",
    "level": "Alpha",
    "category": "Écoute",
    "type": "big_choice",
    "skill": "oral",
    "question": "Écoutez. Touchez la bonne image.",
    "audioText": "Le téléphone.",
    "options": [
      "📞",
      "🍌",
      "🏠",
      "⚽"
    ],
    "correct": "📞",
    "noAudio": true,
    "competence": "LITTERATIE"
  },
  {
    "id": 104,
    "block": "litteratie",
    "level": "Alpha",
    "category": "Écoute",
    "type": "big_choice",
    "skill": "oral",
    "question": "Écoutez. Touchez la bonne image.",
    "audioText": "Je voudrais un café, s'il vous plaît.",
    "options": [
      "☕",
      "🥖",
      "🚌",
      "💊"
    ],
    "correct": "☕",
    "noAudio": true,
    "competence": "LITTERATIE"
  },
  {
    "id": 105,
    "block": "litteratie",
    "level": "Alpha",
    "category": "Écoute",
    "type": "big_choice",
    "skill": "oral",
    "question": "Écoutez. Touchez la bonne image.",
    "audioText": "Le chat.",
    "options": [
      "🐱",
      "🚪",
      "🍎",
      "🧢"
    ],
    "correct": "🐱",
    "noAudio": true,
    "competence": "LITTERATIE"
  },
  {
    "id": 106,
    "block": "litteratie",
    "level": "Pré-alpha",
    "category": "Écrit",
    "type": "big_choice",
    "skill": "lettres",
    "question": "Touchez ce qui est écrit. Où sont les lettres ?",
    "options": [
      "MAISON",
      "🌺",
      "♪ ♪ ♪",
      "🐦"
    ],
    "correct": "MAISON",
    "noAudio": true,
    "competence": "LITTERATIE"
  },
  {
    "id": 107,
    "block": "litteratie",
    "level": "Pré-alpha",
    "category": "Écrit",
    "type": "big_choice",
    "skill": "lettres",
    "question": "Touchez la lettre A. A, comme dans AMI.",
    "options": [
      "A",
      "M",
      "O",
      "7"
    ],
    "correct": "A",
    "noAudio": true,
    "bigText": true,
    "competence": "LITTERATIE"
  },
  {
    "id": 108,
    "block": "litteratie",
    "level": "Pré-alpha",
    "category": "Écrit",
    "type": "big_choice",
    "skill": "lettres",
    "question": "Touchez votre prénom.",
    "dynamicName": true,
    "options": [],
    "noAudio": true,
    "bigText": true,
    "competence": "LITTERATIE"
  },
  {
    "id": 109,
    "block": "litteratie",
    "level": "Alpha",
    "category": "Nombres",
    "type": "big_choice",
    "skill": "chiffres",
    "question": "Touchez le nombre trente-cinq.",
    "options": [
      "35",
      "53",
      "15"
    ],
    "correct": "35",
    "noAudio": true,
    "bigText": true,
    "competence": "LITTERATIE"
  },
  {
    "id": 110,
    "block": "litteratie",
    "level": "Alpha",
    "category": "Lecture",
    "type": "big_choice",
    "skill": "mots",
    "question": "Écoutez le mot. Touchez le mot écrit.",
    "audioText": "Pain.",
    "options": [
      "PAIN",
      "BAIN",
      "PIED",
      "VÉLO"
    ],
    "correct": "PAIN",
    "noAudio": true,
    "bigText": true,
    "competence": "LITTERATIE"
  },
  {
    "id": 111,
    "block": "litteratie",
    "level": "Alpha",
    "category": "Lecture",
    "type": "big_choice",
    "skill": "mots",
    "question": "Écoutez le mot. Touchez le mot écrit.",
    "audioText": "Bus.",
    "options": [
      "BUS",
      "BAS",
      "SUB",
      "RIZ"
    ],
    "correct": "BUS",
    "noAudio": true,
    "bigText": true,
    "competence": "LITTERATIE"
  },
  {
    "id": 112,
    "block": "litteratie",
    "level": "A1.1",
    "category": "Lecture",
    "type": "big_choice",
    "skill": "lecture",
    "question": "Lisez le mot. Touchez la bonne image.",
    "stimulus": "TAXI",
    "options": [
      "🚕",
      "🍎",
      "🐟",
      "🎩"
    ],
    "correct": "🚕",
    "noAudio": true,
    "competence": "LITTERATIE"
  },
  {
    "id": 113,
    "block": "litteratie",
    "level": "A1.1",
    "category": "Lecture",
    "type": "big_choice",
    "skill": "lecture",
    "question": "Lisez la phrase. Touchez la bonne image.",
    "stimulus": "Je mange une pomme.",
    "options": [
      "🍎",
      "☕",
      "🚌",
      "📞"
    ],
    "correct": "🍎",
    "noAudio": true,
    "competence": "LITTERATIE"
  },
  {
    "id": 114,
    "block": "litteratie",
    "level": "A1.1",
    "category": "Nombres",
    "type": "fill_keyboard",
    "skill": "ecriture",
    "question": "Écoutez le nombre. Écrivez-le avec les chiffres.",
    "audioText": "Dix-sept.",
    "template": "___",
    "acceptedAnswers": [
      "17"
    ],
    "numeric": true,
    "competence": "LITTERATIE"
  }
];
