// Textes de l'interface du test de positionnement (accueil, boutons, fin). Public : adultes
// arrivés en France, niveau A1, sur téléphone. Mots simples, phrases courtes, vouvoiement.
// Le test est en français : chaque texte s'affiche en français, avec dessous la langue du
// formulaire d'inscription quand elle existe ici (anglais, arabe littéraire). Les consignes des
// questions, elles, existent dans les 10 langues du module (consignes.ts).
// Client et serveur (aucune dépendance).

export const LANGUES_INTERFACE = ["fr", "en", "ar"] as const;
type LangueInterface = (typeof LANGUES_INTERFACE)[number];

export type CleTexte =
  | "bonjour" | "intro" | "son" | "seul" | "micro" | "infos" | "commencer" | "reprendre"
  | "suivant" | "passer" | "titre" | "instant" | "oralEcrit" | "reponse"
  | "microIntro" | "microParler" | "microArreter" | "microEncore" | "microEcoute" | "microTexte"
  | "microEcrire" | "microRefuse" | "microRien"
  | "merci" | "enregistre" | "contact" | "ecrire" | "dejaFait" | "dejaFaitTexte"
  | "probleme" | "reessayer";

export const TEXTES: Record<CleTexte, Record<LangueInterface, string>> = {
  bonjour: { fr: "Bonjour {prenom} 👋", en: "Hello {prenom} 👋", ar: "مرحبًا {prenom} 👋" },
  intro: {
    fr: "Ce test montre votre niveau de français. Il dure environ 30 minutes. Les questions changent avec vos réponses : rien à réviser.",
    en: "This test shows your French level. It takes about 30 minutes. The questions change with your answers: nothing to study.",
    ar: "يبيّن هذا الاختبار مستواك في اللغة الفرنسية. يستغرق نحو 30 دقيقة. تتغيّر الأسئلة حسب إجاباتك: لا حاجة إلى المراجعة.",
  },
  son: { fr: "Mettez le son.", en: "Turn the sound on.", ar: "شغّل الصوت." },
  seul: { fr: "Répondez seul ou seule, sans traducteur.", en: "Answer alone, without a translator.", ar: "أجب وحدك، دون مترجم." },
  micro: {
    fr: "Pour certaines questions, vous parlez au téléphone.",
    en: "For some questions, you speak to the phone.",
    ar: "في بعض الأسئلة، تتحدث إلى الهاتف.",
  },
  // Plus de case à cocher (décision d'Anis, 23/10 : le consentement est donné à l'inscription) :
  // un lien vers l'information RGPD, qui dit aussi ce que devient la voix au micro.
  infos: {
    fr: "Vos informations et le micro : en savoir plus",
    en: "Your information and the microphone: learn more",
    ar: "معلوماتك والميكروفون: لمعرفة المزيد",
  },
  commencer: { fr: "Commencer le test", en: "Start the test", ar: "ابدأ الاختبار" },
  reprendre: { fr: "Continuer le test", en: "Continue the test", ar: "تابع الاختبار" },
  suivant: { fr: "Suivant", en: "Next", ar: "التالي" },
  passer: { fr: "Je ne sais pas, suivant", en: "I don't know, next", ar: "لا أعرف، التالي" },
  titre: { fr: "Test de français", en: "French test", ar: "اختبار اللغة الفرنسية" },
  instant: { fr: "Un instant…", en: "One moment…", ar: "لحظة من فضلك…" },
  oralEcrit: {
    fr: "Écrivez en français ce que vous diriez.",
    en: "Write in French what you would say.",
    ar: "اكتب بالفرنسية ما كنت ستقوله.",
  },
  reponse: { fr: "Votre réponse", en: "Your answer", ar: "إجابتك" },
  // Réponses orales : reconnaissance vocale du navigateur (rien n'est enregistré par l'ERP).
  microIntro: {
    fr: "Touchez 🎤 et parlez. Le téléphone écrit ce que vous dites.",
    en: "Touch 🎤 and speak. The phone writes what you say.",
    ar: "المس 🎤 وتحدّث. يكتب الهاتف ما تقوله.",
  },
  microParler: { fr: "Touchez pour parler", en: "Touch to speak", ar: "المس للتحدث" },
  microArreter: { fr: "J'ai fini", en: "I'm done", ar: "انتهيت" },
  microEncore: { fr: "Parler encore une fois", en: "Speak once more", ar: "تحدّث مرة أخرى" },
  microEcoute: { fr: "Je vous écoute…", en: "I'm listening…", ar: "أستمع إليك…" },
  microTexte: {
    fr: "Ce que le téléphone a écrit (vous pouvez corriger) :",
    en: "What the phone wrote (you can correct it):",
    ar: "ما كتبه الهاتف (يمكنك تصحيحه):",
  },
  microEcrire: { fr: "Je préfère écrire", en: "I prefer to write", ar: "أفضّل الكتابة" },
  microRefuse: {
    fr: "Le micro ne marche pas ici. Écrivez votre réponse.",
    en: "The microphone does not work here. Write your answer.",
    ar: "الميكروفون لا يعمل هنا. اكتب إجابتك.",
  },
  microRien: {
    fr: "Nous n'avons rien entendu. Réessayez, plus près du téléphone.",
    en: "We heard nothing. Try again, closer to the phone.",
    ar: "لم نسمع شيئًا. حاول مرة أخرى بالقرب من الهاتف.",
  },
  merci: { fr: "Merci !", en: "Thank you!", ar: "شكرًا!" },
  enregistre: { fr: "Votre test est enregistré.", en: "Your test is saved.", ar: "تم تسجيل اختبارك." },
  contact: {
    fr: "Nous vous contactons dès que possible.",
    en: "We will contact you as soon as possible.",
    ar: "سنتواصل معك في أقرب وقت ممكن.",
  },
  ecrire: { fr: "Écrire à ParlerEmploi", en: "Write to ParlerEmploi", ar: "راسل ParlerEmploi" },
  dejaFait: { fr: "Test déjà passé ✓", en: "Test already done ✓", ar: "تم إجراء الاختبار ✓" },
  dejaFaitTexte: {
    fr: "Merci {prenom} ! Votre test est bien enregistré.",
    en: "Thank you {prenom}! Your test is saved.",
    ar: "شكرًا {prenom}! تم تسجيل اختبارك.",
  },
  probleme: { fr: "Un problème est survenu.", en: "Something went wrong.", ar: "حدثت مشكلة." },
  reessayer: { fr: "Réessayer", en: "Try again", ar: "أعد المحاولة" },
};

/** Texte en français, avec le prénom (ou sans, proprement). */
export function texteFr(cle: CleTexte, prenom = ""): string {
  return remplir(TEXTES[cle].fr, prenom);
}

/** Le même texte dans la langue de la personne ; null en français ou langue non traduite ici. */
export function texteTraduit(cle: CleTexte, langue: string, prenom = ""): string | null {
  if (langue === "fr" || !(LANGUES_INTERFACE as readonly string[]).includes(langue)) return null;
  return remplir(TEXTES[cle][langue as LangueInterface], prenom);
}

function remplir(t: string, prenom: string): string {
  return prenom ? t.replace("{prenom}", prenom) : t.replace(/ ?\{prenom\}/, "");
}
