// Consignes GÉNÉRIQUES (par type de tâche) dans la langue de la personne, pour qu'elle comprenne
// QUOI faire sans que la traduction donne la réponse : le contenu testé reste en français.
// 10 langues de ToFrance. Traductions à faire relire par des locuteurs (statut : à relire),
// en particulier pachto (ps) et dari/persan (fa).

export type CleConsigne =
  | "ecouter" | "lire" | "completer" | "ordonner" | "relier" | "formulaire" | "ecrire" | "parler" | "toucher";

export const LANGUES = ["fr", "en", "es", "ar", "pt", "ru", "uk", "tr", "ps", "fa"] as const;
export type Langue = typeof LANGUES[number];

export const CONSIGNES: Record<CleConsigne, Record<Langue, string>> = {
  ecouter: {
    fr: "Écoutez l'audio, puis choisissez la bonne réponse.",
    en: "Listen to the audio, then choose the right answer.",
    es: "Escuche el audio y elija la respuesta correcta.",
    ar: "استمع إلى التسجيل، ثم اختر الإجابة الصحيحة.",
    pt: "Ouça o áudio e escolha a resposta certa.",
    ru: "Прослушайте запись и выберите правильный ответ.",
    uk: "Прослухайте запис і виберіть правильну відповідь.",
    tr: "Sesi dinleyin, sonra doğru cevabı seçin.",
    ps: "غږ واورئ، بیا سم ځواب وټاکئ.",
    fa: "صدا را گوش کنید، سپس جواب درست را انتخاب کنید.",
  },
  lire: {
    fr: "Lisez le texte en français, puis choisissez la bonne réponse.",
    en: "Read the French text, then choose the right answer.",
    es: "Lea el texto en francés y elija la respuesta correcta.",
    ar: "اقرأ النص بالفرنسية، ثم اختر الإجابة الصحيحة.",
    pt: "Leia o texto em francês e escolha a resposta certa.",
    ru: "Прочитайте текст на французском и выберите правильный ответ.",
    uk: "Прочитайте текст французькою і виберіть правильну відповідь.",
    tr: "Fransızca metni okuyun, sonra doğru cevabı seçin.",
    ps: "فرانسوي متن ولولئ، بیا سم ځواب وټاکئ.",
    fa: "متن فرانسوی را بخوانید، سپس جواب درست را انتخاب کنید.",
  },
  completer: {
    fr: "Complétez la phrase avec le bon mot.",
    en: "Complete the sentence with the right word.",
    es: "Complete la frase con la palabra correcta.",
    ar: "أكمل الجملة بالكلمة الصحيحة.",
    pt: "Complete a frase com a palavra certa.",
    ru: "Дополните предложение правильным словом.",
    uk: "Доповніть речення правильним словом.",
    tr: "Cümleyi doğru kelimeyle tamamlayın.",
    ps: "جمله په سم لغت بشپړه کړئ.",
    fa: "جمله را با کلمهٔ درست کامل کنید.",
  },
  ordonner: {
    fr: "Remettez les éléments dans le bon ordre.",
    en: "Put the items in the right order.",
    es: "Ponga los elementos en el orden correcto.",
    ar: "رتّب العناصر بالترتيب الصحيح.",
    pt: "Coloque os elementos na ordem certa.",
    ru: "Расставьте элементы в правильном порядке.",
    uk: "Розставте елементи в правильному порядку.",
    tr: "Öğeleri doğru sıraya koyun.",
    ps: "توکي په سم ترتیب کېږدئ.",
    fa: "موارد را به ترتیب درست بچینید.",
  },
  relier: {
    fr: "Associez ou classez les éléments.",
    en: "Match or sort the items.",
    es: "Relacione o clasifique los elementos.",
    ar: "اربط العناصر أو صنّفها.",
    pt: "Relacione ou classifique os elementos.",
    ru: "Соотнесите или распределите элементы.",
    uk: "Поєднайте або розподіліть елементи.",
    tr: "Öğeleri eşleştirin veya sınıflandırın.",
    ps: "توکي سره وصل یا ډلبندي کړئ.",
    fa: "موارد را به هم وصل یا دسته‌بندی کنید.",
  },
  formulaire: {
    fr: "Lisez le texte, puis remplissez le formulaire en français.",
    en: "Read the text, then fill in the form in French.",
    es: "Lea el texto y rellene el formulario en francés.",
    ar: "اقرأ النص، ثم املأ الاستمارة بالفرنسية.",
    pt: "Leia o texto e preencha o formulário em francês.",
    ru: "Прочитайте текст и заполните форму на французском.",
    uk: "Прочитайте текст і заповніть форму французькою.",
    tr: "Metni okuyun, sonra formu Fransızca doldurun.",
    ps: "متن ولولئ، بیا فورمه په فرانسوي ډکه کړئ.",
    fa: "متن را بخوانید، سپس فرم را به فرانسوی پر کنید.",
  },
  ecrire: {
    fr: "Écrivez votre réponse en français. Il n'y a pas de piège : écrivez comme vous pouvez.",
    en: "Write your answer in French. There is no trick: write as best you can.",
    es: "Escriba su respuesta en francés. No hay trampa: escriba como pueda.",
    ar: "اكتب إجابتك بالفرنسية. لا يوجد فخ: اكتب كما تستطيع.",
    pt: "Escreva a sua resposta em francês. Não há armadilha: escreva como puder.",
    ru: "Напишите ответ по-французски. Подвоха нет: пишите, как можете.",
    uk: "Напишіть відповідь французькою. Пастки немає: пишіть, як можете.",
    tr: "Cevabınızı Fransızca yazın. Tuzak yok: yapabildiğiniz gibi yazın.",
    ps: "خپل ځواب په فرانسوي ولیکئ. هیڅ چل نشته: څنګه چې کولی شئ ولیکئ.",
    fa: "جواب خود را به فرانسوی بنویسید. هیچ ترفندی در کار نیست: هر طور که می‌توانید بنویسید.",
  },
  parler: {
    fr: "Appuyez sur le micro et répondez en français, à voix haute. Votre voix est transformée en texte puis effacée.",
    en: "Press the microphone and answer in French, out loud. Your voice is turned into text, then deleted.",
    es: "Pulse el micrófono y responda en francés, en voz alta. Su voz se convierte en texto y luego se borra.",
    ar: "اضغط على الميكروفون وأجب بالفرنسية بصوت عالٍ. يتحول صوتك إلى نص ثم يُحذف.",
    pt: "Toque no microfone e responda em francês, em voz alta. A sua voz é transformada em texto e depois apagada.",
    ru: "Нажмите на микрофон и ответьте вслух по-французски. Ваш голос превращается в текст, затем удаляется.",
    uk: "Натисніть на мікрофон і відповідайте вголос французькою. Ваш голос перетворюється на текст, потім видаляється.",
    tr: "Mikrofona basın ve Fransızca, yüksek sesle cevap verin. Sesiniz metne dönüştürülür, sonra silinir.",
    ps: "مایکروفون کېکاږئ او په فرانسوي په لوړ غږ ځواب ورکړئ. ستاسو غږ په متن بدلېږي او بیا ړنګېږي.",
    fa: "میکروفون را بزنید و به فرانسوی با صدای بلند جواب دهید. صدای شما به متن تبدیل و سپس پاک می‌شود.",
  },
  toucher: {
    fr: "Écoutez, puis touchez la bonne réponse.",
    en: "Listen, then touch the right answer.",
    es: "Escuche y toque la respuesta correcta.",
    ar: "استمع، ثم المس الإجابة الصحيحة.",
    pt: "Ouça e toque na resposta certa.",
    ru: "Послушайте и нажмите на правильный ответ.",
    uk: "Послухайте і натисніть на правильну відповідь.",
    tr: "Dinleyin, sonra doğru cevaba dokunun.",
    ps: "واورئ، بیا سم ځواب ته لاس ورکړئ.",
    fa: "گوش کنید، سپس جواب درست را لمس کنید.",
  },
};

export function cleConsigne(q: { type: string; competence: string }): CleConsigne {
  switch (q.type) {
    case "big_choice": return "toucher";
    case "oral": return "parler";
    case "written": case "reformulate": return "ecrire";
    case "complete_form": return "formulaire";
    case "sentence_builder": case "order_sentences": return "ordonner";
    case "match_pairs": case "categorize": case "odd_one_out": return "relier";
    case "fill_in_blank": case "fill_keyboard": case "word_choice_text": return "completer";
    case "listen_choose": return q.competence === "CO" ? "ecouter" : q.competence === "CE" ? "lire" : "completer";
    default: return q.competence === "LANGUE" ? "completer" : "lire";
  }
}

/** Consigne générique dans la langue de la personne ; null en français (la consigne de l'item suffit). */
export function consigneTraduite(q: { type: string; competence: string }, langue: string): string | null {
  if (!langue || langue === "fr" || !(LANGUES as readonly string[]).includes(langue)) return null;
  return CONSIGNES[cleConsigne(q)][langue as Langue];
}

export const LANGUES_RTL = ["ar", "ps", "fa"];
