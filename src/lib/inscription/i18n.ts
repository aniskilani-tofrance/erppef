// Formulaire d'inscription rapide (/inscription) : textes en trois langues.
// Public : adultes arrivés en France, niveau A1 (lisent peu), sur téléphone.
// Règles d'écriture : phrases de 3 à 6 mots, vouvoiement, un pictogramme par choix.
// Seuls les LIBELLÉS changent avec la langue : les codes enregistrés restent les mêmes.
// Client et serveur (aucune dépendance).

export const SIGNUP_LOCALES = ["fr", "en", "ar"] as const;
export type SignupLocale = (typeof SIGNUP_LOCALES)[number];

export function toLocale(raw: string | null | undefined): SignupLocale {
  return (SIGNUP_LOCALES as readonly string[]).includes(raw ?? "") ? (raw as SignupLocale) : "fr";
}

export const LOCALE_META: Record<SignupLocale, { label: string; htmlLang: string; dir: "ltr" | "rtl" }> = {
  fr: { label: "Français facile", htmlLang: "fr", dir: "ltr" },
  en: { label: "English", htmlLang: "en", dir: "ltr" },
  ar: { label: "العربية", htmlLang: "ar", dir: "rtl" },
};

// ── Choix proposés (codes stables, enregistrés en base) ─────────────────────
// Plus demandées dans le formulaire (22/10/2026) ; gardées pour les fiches déjà remplies.
export const SIGNUP_LANGUAGES = [
  { code: "arabe", emoji: "🗣️", fr: "Arabe", en: "Arabic", ar: "العربية" },
  { code: "anglais", emoji: "🗣️", fr: "Anglais", en: "English", ar: "الإنجليزية" },
  { code: "dari_pachto", emoji: "🗣️", fr: "Dari / Pachto", en: "Dari / Pashto", ar: "الدارية / البشتو" },
  { code: "tamoul", emoji: "🗣️", fr: "Tamoul", en: "Tamil", ar: "التاميلية" },
  { code: "bengali", emoji: "🗣️", fr: "Bengali", en: "Bengali", ar: "البنغالية" },
  { code: "soninke_bambara", emoji: "🗣️", fr: "Soninké / Bambara", en: "Soninke / Bambara", ar: "السونينكية / البامبارا" },
  { code: "espagnol", emoji: "🗣️", fr: "Espagnol", en: "Spanish", ar: "الإسبانية" },
  { code: "autre", emoji: "➕", fr: "Autre langue", en: "Other language", ar: "لغة أخرى" },
] as const;
export type SignupLanguage = (typeof SIGNUP_LANGUAGES)[number]["code"];

export const FRENCH_LEVELS = [
  { code: "pas_du_tout", emoji: "🙅", fr: "Pas du tout", en: "Not at all", ar: "لا، أبدًا" },
  { code: "un_peu", emoji: "🤏", fr: "Un peu", en: "A little", ar: "قليلًا" },
  { code: "bien", emoji: "👍", fr: "Bien", en: "Well", ar: "جيدًا" },
] as const;
export type FrenchLevel = (typeof FRENCH_LEVELS)[number]["code"];

// Ville : Saint-Ouen (où ont lieu les cours) ou une autre ville, à préciser si on veut.
export const CITY_CHOICES = [
  { code: "saint_ouen", emoji: "📍", fr: "Saint-Ouen (93400)", en: "Saint-Ouen (93400)", ar: "سان-أوان (93400)" },
  { code: "autre", emoji: "🏙️", fr: "Autre ville", en: "Another town", ar: "مدينة أخرى" },
] as const;
export type CityChoice = (typeof CITY_CHOICES)[number]["code"];
export const SAINT_OUEN = { city: "Saint-Ouen", postalCode: "93400" } as const;

// Plus demandés dans le formulaire (22/10/2026) ; gardés pour les fiches déjà remplies.
export const AVAILABILITIES = [
  { code: "matin", emoji: "🌅", fr: "Le matin", en: "Morning", ar: "صباحًا" },
  { code: "apres_midi", emoji: "☀️", fr: "L'après-midi", en: "Afternoon", ar: "بعد الظهر" },
  { code: "soir", emoji: "🌙", fr: "Le soir", en: "Evening", ar: "مساءً" },
] as const;
export type Availability = (typeof AVAILABILITIES)[number]["code"];

// Erreurs renvoyées par la validation : un code, traduit à l'affichage.
export type SignupErrorCode = "name" | "phone" | "french" | "city" | "consent" | "server" | "link";

export type SignupTexts = {
  title: string;
  intro: string;
  introPoints: [string, string, string]; // ⏱️ 📱 💬
  start: string;
  next: string;
  back: string;
  step: string; // « {n} » et « {total} »
  nameQ: string;
  firstName: string;
  lastName: string;
  phoneQ: string;
  phoneLabel: string;
  phoneHint: string;
  frenchQ: string;
  frenchHint: string;
  cityQ: string;
  cityOtherLabel: string;
  cityOtherHint: string;
  consentQ: string;
  consent: string;
  more: string;
  submit: string;
  sending: string;
  doneTitle: string;
  doneText: string;
  doneNotice: string;
  doneWrite: string;
  // Réservation d'un créneau sur l'écran de fin
  chooseTitle: string;
  addressLabel: string;
  callMe: string;
  booking: string;
  booked: string; // « {day} » et « {time} »
  keepMessage: string;
  addToCalendar: string;
  calendarTitle: string;
  slotTaken: string;
  bookingExpired: string;
  errors: Record<SignupErrorCode, string>;
  privacyTitle: string;
  privacyBack: string;
  privacy: { h: string; p: string }[];
};

const PRIVACY_CONTACT = "contact@parleremploi.fr";

export const SIGNUP_TEXTS: Record<SignupLocale, SignupTexts> = {
  fr: {
    title: "Cours de français",
    intro: "Inscription rapide : 2 minutes.",
    introPoints: ["2 minutes", "Sur votre téléphone", "Nous vous contactons"],
    start: "Commencer",
    next: "Suivant",
    back: "Retour",
    step: "Étape {n} sur {total}",
    nameQ: "Votre nom ?",
    firstName: "Prénom",
    lastName: "Nom",
    phoneQ: "Votre numéro WhatsApp ?",
    phoneLabel: "Numéro WhatsApp",
    phoneHint: "Exemple : +33 6 12 34 56 78. Autre pays : changez +33.",
    frenchQ: "Vous parlez français ?",
    frenchHint: "Pas de test ici. Juste pour savoir.",
    cityQ: "Vous habitez où ?",
    cityOtherLabel: "Quelle ville ?",
    cityOtherHint: "Pas obligatoire.",
    consentQ: "Dernière étape",
    consent: "ParlerEmploi garde mes infos pour me contacter pour une formation.",
    more: "En savoir plus",
    submit: "Envoyer",
    sending: "Envoi…",
    doneTitle: "Merci !",
    doneText: "Nous vous contactons dès que possible.",
    doneNotice: "Attention : votre place n'est pas encore assurée.",
    doneWrite: "Écrire à ParlerEmploi",
    chooseTitle: "Choisissez un rendez-vous",
    addressLabel: "Adresse",
    callMe: "Je préfère qu'on m'appelle",
    booking: "Réservation…",
    booked: "Rendez-vous le {day} à {time}",
    keepMessage: "Gardez ce message.",
    addToCalendar: "Ajouter à mon agenda",
    calendarTitle: "Rendez-vous ParlerEmploi",
    slotTaken: "Ce rendez-vous vient d'être pris. Choisissez-en un autre.",
    bookingExpired: "Trop tard pour choisir ici. Nous vous appelons sur WhatsApp.",
    errors: {
      name: "Écrivez votre prénom et votre nom.",
      phone: "Ce numéro ne marche pas. Vérifiez.",
      french: "Choisissez une réponse.",
      city: "Choisissez une réponse.",
      consent: "Cochez la case pour envoyer.",
      server: "Problème. Réessayez, s'il vous plaît.",
      link: "Ce lien ne marche pas. Demandez un nouveau lien.",
    },
    privacyTitle: "Vos informations",
    privacyBack: "Retour au formulaire",
    privacy: [
      { h: "Qui garde vos informations ?", p: "ParlerEmploi Formation, organisme de formation à Saint-Ouen (SIRET 924 182 546 00011)." },
      { h: "Pourquoi ?", p: "Pour vous contacter et vous proposer une formation de français : test de niveau, réunion d'information, inscription dans un groupe." },
      { h: "Quelles informations ?", p: "Prénom, nom, numéro WhatsApp, langues parlées, français (ce que vous dites), disponibilités, ville ou quartier. Le lien peut dire d'où vous venez (par exemple une maison de quartier)." },
      { h: "Qui les voit ?", p: "Seulement l'équipe de ParlerEmploi Formation. Nous ne vendons pas vos informations. Elles sont stockées chez nos prestataires techniques (hébergement du site et base de données)." },
      { h: "Combien de temps ?", p: "2 ans après notre dernier contact avec vous, puis nous les supprimons. Si vous suivez une formation, votre dossier de formation est gardé le temps exigé par la loi." },
      { h: "Vos droits", p: `Vous pouvez voir, corriger ou supprimer vos informations, et retirer votre accord à tout moment. Écrivez à ${PRIVACY_CONTACT} ou sur WhatsApp. Vous pouvez aussi vous plaindre à la CNIL (cnil.fr).` },
    ],
  },
  en: {
    title: "French classes",
    intro: "Quick sign-up: 2 minutes.",
    introPoints: ["2 minutes", "On your phone", "We contact you"],
    start: "Start",
    next: "Next",
    back: "Back",
    step: "Step {n} of {total}",
    nameQ: "Your name?",
    firstName: "First name",
    lastName: "Last name",
    phoneQ: "Your WhatsApp number?",
    phoneLabel: "WhatsApp number",
    phoneHint: "Example: +33 6 12 34 56 78. Other country: change +33.",
    frenchQ: "Do you speak French?",
    frenchHint: "This is not a test. Just to know.",
    cityQ: "Where do you live?",
    cityOtherLabel: "Which town?",
    cityOtherHint: "Optional.",
    consentQ: "Last step",
    consent: "ParlerEmploi keeps my details to contact me about a course.",
    more: "Learn more",
    submit: "Send",
    sending: "Sending…",
    doneTitle: "Thank you!",
    doneText: "We will contact you as soon as possible.",
    doneNotice: "Please note: your place is not guaranteed yet.",
    doneWrite: "Write to ParlerEmploi",
    chooseTitle: "Choose an appointment",
    addressLabel: "Address",
    callMe: "I prefer a phone call",
    booking: "Booking…",
    booked: "Appointment on {day} at {time}",
    keepMessage: "Keep this message.",
    addToCalendar: "Add to my calendar",
    calendarTitle: "ParlerEmploi appointment",
    slotTaken: "This time was just taken. Choose another one.",
    bookingExpired: "Too late to choose here. We will call you on WhatsApp.",
    errors: {
      name: "Write your first name and last name.",
      phone: "This number does not work. Please check.",
      french: "Choose one answer.",
      city: "Choose one answer.",
      consent: "Tick the box to send.",
      server: "Problem. Please try again.",
      link: "This link does not work. Ask for a new link.",
    },
    privacyTitle: "Your information",
    privacyBack: "Back to the form",
    privacy: [
      { h: "Who keeps your information?", p: "ParlerEmploi Formation, a training organisation in Saint-Ouen, France (SIRET 924 182 546 00011)." },
      { h: "Why?", p: "To contact you and offer you a French course: level test, information meeting, place in a group." },
      { h: "What information?", p: "First name, last name, WhatsApp number, languages, your French (what you tell us), availability, town or neighbourhood. The link may say where you come from (for example a community centre)." },
      { h: "Who sees it?", p: "Only the ParlerEmploi Formation team. We never sell your information. It is stored by our technical providers (website hosting and database)." },
      { h: "How long?", p: "2 years after our last contact with you, then we delete it. If you take a course, your training file is kept as long as the law requires." },
      { h: "Your rights", p: `You can see, correct or delete your information, and withdraw your consent at any time. Write to ${PRIVACY_CONTACT} or on WhatsApp. You can also complain to the CNIL (cnil.fr), the French data protection authority.` },
    ],
  },
  ar: {
    title: "دروس اللغة الفرنسية",
    intro: "تسجيل سريع: دقيقتان.",
    introPoints: ["دقيقتان", "من هاتفك", "سنتواصل معك"],
    start: "ابدأ",
    next: "التالي",
    back: "رجوع",
    step: "الخطوة {n} من {total}",
    nameQ: "ما اسمك؟",
    firstName: "الاسم الأول",
    lastName: "اسم العائلة",
    phoneQ: "ما رقم واتساب الخاص بك؟",
    phoneLabel: "رقم واتساب",
    phoneHint: "مثال: ‎+33 6 12 34 56 78. بلد آخر: غيّر ‎+33.",
    frenchQ: "هل تتكلم الفرنسية؟",
    frenchHint: "هذا ليس امتحانًا. فقط للمعرفة.",
    cityQ: "أين تسكن؟",
    cityOtherLabel: "ما اسم المدينة؟",
    cityOtherHint: "اختياري.",
    consentQ: "الخطوة الأخيرة",
    consent: "تحتفظ ParlerEmploi بمعلوماتي للتواصل معي بخصوص دورة تدريبية.",
    more: "لمعرفة المزيد",
    submit: "إرسال",
    sending: "جارٍ الإرسال…",
    doneTitle: "شكرًا!",
    doneText: "سنتواصل معك في أقرب وقت ممكن.",
    doneNotice: "تنبيه: مكانك في الدورة غير مضمون بعد.",
    doneWrite: "راسل ParlerEmploi",
    chooseTitle: "اختر موعدًا",
    addressLabel: "العنوان",
    callMe: "أفضّل أن تتصلوا بي",
    booking: "جارٍ الحجز…",
    booked: "موعدك يوم {day} الساعة {time}",
    keepMessage: "احتفظ بهذه الرسالة.",
    addToCalendar: "أضف إلى تقويمي",
    calendarTitle: "موعد ParlerEmploi",
    slotTaken: "هذا الموعد أُخذ للتو. اختر موعدًا آخر.",
    bookingExpired: "فات وقت الاختيار هنا. سنتصل بك على واتساب.",
    errors: {
      name: "اكتب اسمك الأول واسم عائلتك.",
      phone: "هذا الرقم غير صحيح. تحقق منه.",
      french: "اختر جوابًا واحدًا.",
      city: "اختر جوابًا واحدًا.",
      consent: "ضع علامة في المربع للإرسال.",
      server: "حدثت مشكلة. حاول مرة أخرى من فضلك.",
      link: "هذا الرابط لا يعمل. اطلب رابطًا جديدًا.",
    },
    privacyTitle: "معلوماتك",
    privacyBack: "العودة إلى الاستمارة",
    privacy: [
      { h: "من يحتفظ بمعلوماتك؟", p: "ParlerEmploi Formation، مؤسسة تدريب في سانت أوان، فرنسا (SIRET 924 182 546 00011)." },
      { h: "لماذا؟", p: "للتواصل معك واقتراح دورة في اللغة الفرنسية: اختبار المستوى، اجتماع إعلامي، مكان في مجموعة." },
      { h: "ما هي المعلومات؟", p: "الاسم الأول، اسم العائلة، رقم واتساب، اللغات، مستواك في الفرنسية (كما تقول)، أوقات فراغك، المدينة أو الحي. قد يذكر الرابط من أين أتيت (مثلًا دار الحي)." },
      { h: "من يراها؟", p: "فريق ParlerEmploi Formation فقط. لا نبيع معلوماتك أبدًا. تُحفظ لدى مزوّدينا التقنيين (استضافة الموقع وقاعدة البيانات)." },
      { h: "إلى متى؟", p: "سنتان بعد آخر تواصل معك، ثم نحذفها. إذا تابعت دورة، يُحفظ ملف التدريب المدة التي يفرضها القانون." },
      { h: "حقوقك", p: `يمكنك الاطلاع على معلوماتك أو تصحيحها أو حذفها، وسحب موافقتك في أي وقت. اكتب إلى ${PRIVACY_CONTACT} أو على واتساب. يمكنك أيضًا تقديم شكوى إلى CNIL ‏(cnil.fr)، هيئة حماية البيانات في فرنسا.` },
    ],
  },
};

export function stepLabel(t: SignupTexts, n: number, total: number): string {
  return t.step.replace("{n}", String(n)).replace("{total}", String(total));
}

// Contact affiché sur l'écran de fin.
export const SIGNUP_CONTACT = {
  name: "ParlerEmploi Formation",
  // Numéro de l'association (cours de français), affiché à la fin du formulaire et
  // ouvert par le bouton « Écrire à ParlerEmploi ».
  phone: "+33 6 14 33 99 73",
  whatsapp: "33614339973",
  email: PRIVACY_CONTACT,
};
