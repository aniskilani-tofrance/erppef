// Libellés du bouton d'écoute du test de positionnement, dans les 10 langues de ToFrance.
// Repris du front ToFrance (src/lib/positionnement/ecoute.ts) : HORS du module partagé.
// Traductions à faire relire par des locuteurs, en particulier pachto (ps) et dari/persan (fa).
import { LANGUES, type Langue } from "./client";

/** Libellés du bouton d'écoute, affichés sous le français pour qui ne lit pas encore le français. */
export type CleEcoute = "ecouter" | "encore" | "enCours" | "termine" | "dAbord";
export const LIBELLES_ECOUTE: Record<CleEcoute, Record<Langue, string>> = {
  ecouter: {
    fr: "Écouter", en: "Listen", es: "Escuchar", ar: "استمع", pt: "Ouvir",
    ru: "Слушать", uk: "Слухати", tr: "Dinle", ps: "واورئ", fa: "گوش کنید",
  },
  encore: {
    fr: "Écouter encore une fois", en: "Listen once more", es: "Escuchar otra vez", ar: "استمع مرة أخرى", pt: "Ouvir mais uma vez",
    ru: "Послушать ещё раз", uk: "Послухати ще раз", tr: "Bir kez daha dinle", ps: "یو ځل بیا واورئ", fa: "یک بار دیگر گوش کنید",
  },
  enCours: {
    fr: "Écoute en cours…", en: "Playing…", es: "Reproduciendo…", ar: "جارٍ التشغيل…", pt: "A tocar…",
    ru: "Идёт воспроизведение…", uk: "Відтворення…", tr: "Çalıyor…", ps: "غږ روان دی…", fa: "در حال پخش…",
  },
  termine: {
    fr: "Écoute terminée", en: "Listening finished", es: "Escucha terminada", ar: "انتهى الاستماع", pt: "Escuta terminada",
    ru: "Прослушивание окончено", uk: "Прослуховування завершено", tr: "Dinleme bitti", ps: "اورېدل پای ته ورسېدل", fa: "گوش دادن تمام شد",
  },
  dAbord: {
    fr: "Écoutez d'abord", en: "Listen first", es: "Escuche primero", ar: "استمع أولاً", pt: "Ouça primeiro",
    ru: "Сначала послушайте", uk: "Спочатку послухайте", tr: "Önce dinleyin", ps: "لومړی واورئ", fa: "اول گوش کنید",
  },
};

/** Libellé d'écoute dans la langue de la personne ; null en français ou langue inconnue. */
export function libelleEcoute(cle: CleEcoute, langue: string): string | null {
  if (!langue || langue === "fr" || !(LANGUES as readonly string[]).includes(langue)) return null;
  return LIBELLES_ECOUTE[cle][langue as Langue];
}
