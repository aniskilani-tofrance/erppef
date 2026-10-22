"use client";

// Affichage d'un item du test (téléphone d'abord, repris de ToFrance) et saisie de la réponse
// au format attendu par la correction serveur. Les options sont mélangées à l'affichage ;
// aucune bonne réponse n'est connue ici. Tâches orales : au micro du téléphone (reconnaissance
// vocale du navigateur, micro.tsx), repli à l'écrit ; aucune voix enregistrée.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Lock, Play, Volume2 } from "lucide-react";
import {
  LANGUES_RTL, LIBELLES_COMPETENCE, NIVEAUX_LECTURE_AUTO, distracteursPrenom, optionsLues,
  type Competence, type Item,
} from "@/lib/positionnement/client";
import { arreterLecture, lire } from "@/lib/positionnement/audio";
import { consigneAffichee } from "@/lib/positionnement/consigne";
import { libelleEcoute, type CleEcoute } from "@/lib/positionnement/ecoute";
import { cn } from "@/lib/utils";
import { MicroVocal, useMicroDisponible } from "./micro";
import { Bilingue } from "./traduit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function melanger<T>(t: T[]): T[] {
  const a = [...t];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const TYPES_QCM = ["listen_choose", "fill_in_blank", "complete_dialogue", "safety_instruction", "scenario_tree", "odd_one_out", "read_comprehension", "email_response", "big_choice"];

/** Filet de sécurité : si la fin d'une lecture n'est jamais signalée, on débloque quand même. */
const DELAI_MAX_LECTURE = 45_000;

const champClass =
  "block w-full rounded-2xl border-2 border-zinc-200 bg-white px-4 text-lg text-zinc-950 outline-none transition-colors focus:border-[#00504E] focus:ring-4 focus:ring-[#32CF8A]/30";

interface Props {
  item: Item;
  prenom: string;
  langue: string;
  valeur: string;
  onChange: (v: string) => void;
}

export function QuestionPositionnement({ item: q, prenom, langue, valeur, onChange }: Props) {
  const [ecoutes, setEcoutes] = useState(0);
  const [enLecture, setEnLecture] = useState(false);
  const [entendu, setEntendu] = useState(false);
  const [attirer, setAttirer] = useState(0);
  // Tâche orale : micro si le navigateur sait transformer la voix en texte, sinon à l'écrit.
  const microDisponible = useMicroDisponible();
  const [choixEcrit, setChoixEcrit] = useState(false);
  const oralParEcrit = q.type === "oral" && (choixEcrit || microDisponible === false);
  const traduction = consigneAffichee(q as Any, langue, oralParEcrit);
  const rtl = LANGUES_RTL.includes(langue);
  const options = useMemo(() => {
    if (q.dynamicName) return melanger([(prenom || "").toUpperCase(), ...distracteursPrenom(prenom)]);
    return q.options && !q.stimulus ? melanger(q.options) : q.options ?? [];
  }, [q, prenom]);

  // Compréhension écrite : jamais d'audio du texte (ce serait tester l'oral).
  const audio = q.audioText && q.competence !== "CE" ? String(q.audioText) : "";
  const maxEcoutes = q.competence === "CO" ? 2 : 5;
  const monte = useRef(true);
  const lectureRef = useRef(false);
  const dejaJoue = useRef(false);
  useEffect(() => { monte.current = true; return () => { monte.current = false; }; }, []);

  /** Joue l'audio de l'item. En automatique, rien n'est compté si le navigateur bloque la lecture. */
  const jouer = useCallback((auto: boolean) => {
    if (!audio || lectureRef.current) return;
    lectureRef.current = true;
    dejaJoue.current = true;
    if (!auto) setEcoutes((n) => n + 1);
    setEnLecture(true);
    let demarre: boolean | null = null;
    let fini = false;
    let securite = 0;
    const conclure = () => {
      window.clearTimeout(securite);
      lectureRef.current = false;
      if (!monte.current) return;
      setEnLecture(false);
      setEntendu(true);
    };
    const surFin = () => { fini = true; if (demarre) conclure(); };
    void lire(audio, surFin, surFin).then((ok) => {
      demarre = ok;
      if (!ok) {
        lectureRef.current = false;
        if (!monte.current) return;
        setEnLecture(false);
        if (auto) dejaJoue.current = false; // lecture auto bloquée : le bouton reste « à toucher »
        else setEntendu(true); // un geste qui échoue ne doit jamais bloquer le test
        return;
      }
      if (auto && monte.current) setEcoutes((n) => n + 1);
      if (fini) conclure();
      else securite = window.setTimeout(conclure, DELAI_MAX_LECTURE);
    });
  }, [audio]);

  // Bas niveaux (public qui ne lit pas forcément) : consigne lue automatiquement, puis l'audio de
  // l'item enchaîné ; cette lecture automatique compte comme la 1re écoute.
  useEffect(() => {
    if (!NIVEAUX_LECTURE_AUTO.includes(q.level)) return;
    let actif = true;
    const t = window.setTimeout(() => {
      if (dejaJoue.current) return;
      void lire(q.question, audio ? () => { if (actif && !dejaJoue.current) jouer(true); } : undefined);
    }, 400);
    return () => { actif = false; window.clearTimeout(t); arreterLecture(); };
  }, [q.id, q.level, q.question, audio, jouer]);

  const lireOptions = optionsLues(q as Any);
  const verrouille = !!audio && !entendu;
  const signalerEcoute = () => setAttirer((n) => n + 1);

  return (
    <div className="space-y-5">
      {q.competence !== "LITTERATIE" && (
        <span className="inline-flex rounded-full bg-[#E8F6F0] px-3 py-1 text-sm font-semibold text-[#00504E]">
          {LIBELLES_COMPETENCE[q.competence as Competence]}
        </span>
      )}

      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <h2 className="flex-1 text-xl leading-snug font-bold [font-family:var(--font-test-title),inherit]">{q.question}</h2>
          <button
            type="button"
            aria-label="Écouter la consigne"
            onClick={() => lire(q.question)}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-[#E8F6F0] text-[#00504E] active:scale-95"
          >
            <Volume2 className="h-6 w-6" />
          </button>
        </div>
        {traduction && (
          <p className="rounded-xl bg-white/70 px-3 py-2 text-base text-zinc-700 ring-1 ring-[#00504E]/10" dir={rtl ? "rtl" : "ltr"} lang={langue}>
            {traduction}
          </p>
        )}
      </div>

      {audio && (
        <BoutonEcoute langue={langue} ecoutes={ecoutes} maxEcoutes={maxEcoutes} enLecture={enLecture} attirer={attirer} onJouer={() => jouer(false)} />
      )}

      <Support q={q} />

      {verrouille && (TYPES_QCM.includes(q.type) || q.type === "fill_keyboard") && (
        <p className="flex flex-wrap items-center gap-x-2 text-base text-zinc-600" data-testid="ecouter-dabord">
          <span aria-hidden="true">👂</span><span>Écoutez d&apos;abord</span>
          {libelleEcoute("dAbord", langue) && (
            <span dir={rtl ? "rtl" : "ltr"} lang={langue}>· {libelleEcoute("dAbord", langue)}</span>
          )}
        </p>
      )}

      {TYPES_QCM.includes(q.type) && (
        <div className={q.type === "big_choice" ? "grid grid-cols-2 gap-3" : "space-y-3"}>
          {options.map((o) => (
            <button
              key={o}
              type="button"
              aria-disabled={verrouille || undefined}
              aria-pressed={valeur === o}
              onClick={() => {
                if (verrouille) { signalerEcoute(); return; }
                onChange(o);
                if (lireOptions && !/^\p{Extended_Pictographic}/u.test(o)) lire(o);
              }}
              className={cn(
                "relative w-full rounded-2xl border-2 px-4 text-start transition",
                verrouille
                  ? "cursor-not-allowed border-dashed border-zinc-300 bg-zinc-100 text-zinc-500 opacity-60"
                  : cn("active:scale-[0.98]", valeur === o ? "border-[#00504E] bg-[#E8F6F0] font-semibold text-[#00504E]" : "border-zinc-200 bg-white"),
                q.type === "big_choice"
                  ? cn("flex aspect-square items-center justify-center text-center", q.bigText ? "text-3xl font-bold" : "text-5xl")
                  : "min-h-14 py-3 text-lg",
              )}
            >
              {verrouille && <Verrou />}
              {o}
            </button>
          ))}
        </div>
      )}

      {q.type === "fill_keyboard" && verrouille && (
        <button type="button" aria-disabled onClick={signalerEcoute}
          className="relative flex h-14 w-full items-center rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-100 px-3 text-zinc-500 opacity-60">
          <Verrou />
        </button>
      )}
      {q.type === "fill_keyboard" && !verrouille && (
        <input
          inputMode={q.numeric ? "numeric" : "text"}
          className={cn(champClass, "h-14 text-xl")}
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          aria-label="Votre réponse"
        />
      )}
      {q.type === "true_false_justify" && <VraiFaux valeur={valeur} onChange={onChange} />}
      {q.type === "match_pairs" && <Paires q={q} valeur={valeur} onChange={onChange} />}
      {q.type === "categorize" && <Classer q={q} valeur={valeur} onChange={onChange} />}
      {q.type === "order_sentences" && <Ordonner q={q} onChange={onChange} />}
      {q.type === "sentence_builder" && <ConstruirePhrase q={q} valeur={valeur} onChange={onChange} />}
      {q.type === "word_choice_text" && <TexteAChoix q={q} valeur={valeur} onChange={onChange} />}
      {q.type === "complete_form" && <Formulaire q={q} valeur={valeur} onChange={onChange} />}
      {(q.type === "written" || q.type === "reformulate" || (q.type === "oral" && oralParEcrit)) && (
        <ZoneEcrite q={q} langue={langue} valeur={valeur} onChange={onChange} />
      )}
      {q.type === "oral" && !oralParEcrit && (
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-lg font-semibold text-[#00504E]">
            <Bilingue cle="microIntro" langue={langue} />
          </p>
          <MicroVocal dureeMax={Number(q.dureeMax ?? 60)} langue={langue} valeur={valeur} onChange={onChange} onEcrit={() => setChoixEcrit(true)} />
        </div>
      )}
    </div>
  );
}

/** Production écrite — et tâche orale en repli à l'écrit (« écrivez ce que vous diriez »). */
function ZoneEcrite({ q, langue, valeur, onChange }: { q: Item; langue: string; valeur: string; onChange: (v: string) => void }) {
  const mots = valeur.split(/\s+/).filter(Boolean).length;
  return (
    <div className="space-y-2">
      {q.type === "oral" && (
        <p className="flex items-start gap-2 text-base font-medium text-[#00504E]">
          <span aria-hidden>✍️</span>
          <Bilingue cle="oralEcrit" langue={langue} />
        </p>
      )}
      <label className="block space-y-1">
        <span className="sr-only">Votre réponse</span>
        <textarea
          rows={q.level === "B2" ? 10 : 6}
          value={valeur}
          placeholder={String(q.placeholder ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={cn(champClass, "py-3 leading-relaxed")}
        />
      </label>
      <p className="text-end text-sm text-zinc-500">{mots} mot{mots > 1 ? "s" : ""}</p>
    </div>
  );
}

/** Petit cadenas + oreille sur une réponse pas encore accessible (il faut écouter d'abord). */
function Verrou() {
  return (
    <span className="pointer-events-none absolute end-2 top-2 flex items-center gap-0.5 text-sm" aria-hidden="true">
      <Lock className="h-3.5 w-3.5" />👂
    </span>
  );
}

interface BoutonEcouteProps {
  langue: string;
  ecoutes: number;
  maxEcoutes: number;
  enLecture: boolean;
  /** Incrémenté quand la personne touche une réponse verrouillée : le bouton s'agite. */
  attirer: number;
  onJouer: () => void;
}

const LIBELLES_FR: Record<CleEcoute, string> = {
  ecouter: "Écouter", encore: "Écouter encore une fois", enCours: "Écoute en cours…", termine: "Écoute terminée", dAbord: "Écoutez d'abord",
};

/** Bouton d'écoute compréhensible sans lire : grand, coloré, animé tant que rien n'a été écouté. */
function BoutonEcoute({ langue, ecoutes, maxEcoutes, enLecture, attirer, onJouer }: BoutonEcouteProps) {
  const [secoue, setSecoue] = useState(false);
  useEffect(() => {
    if (!attirer) return;
    const debut = window.setTimeout(() => setSecoue(true), 0);
    const fin = window.setTimeout(() => setSecoue(false), 1200);
    return () => { window.clearTimeout(debut); window.clearTimeout(fin); };
  }, [attirer]);

  const jamais = ecoutes === 0 && !enLecture;
  const epuise = ecoutes >= maxEcoutes && !enLecture;
  const cle: CleEcoute = enLecture ? "enCours" : ecoutes === 0 ? "ecouter" : epuise ? "termine" : "encore";
  const traduit = libelleEcoute(cle, langue);
  const restantes = Math.max(0, maxEcoutes - ecoutes);
  const rtl = LANGUES_RTL.includes(langue);

  return (
    <div className="space-y-2">
      <div className={cn("relative", secoue && "motion-safe:animate-bounce")}>
        {(jamais || secoue) && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl ring-4 ring-[#32CF8A]/60 motion-safe:animate-pulse" />
        )}
        <button
          type="button"
          data-testid="bouton-ecoute"
          aria-live="polite"
          disabled={enLecture || epuise}
          onClick={onJouer}
          className={cn(
            "relative flex w-full items-center justify-center gap-3 rounded-2xl px-4 text-lg transition",
            jamais ? "h-24 shadow-lg" : "h-16",
            jamais || enLecture ? "bg-[#00504E] text-white" : "bg-[#E8F6F0] text-[#00504E]",
            epuise && "opacity-60",
          )}
        >
          {enLecture ? <Ondes /> : (
            <span className={cn("flex shrink-0 items-center", jamais ? "gap-1" : "gap-0.5")} aria-hidden="true">
              <Play className={jamais ? "h-9 w-9 fill-current" : "h-6 w-6 fill-current"} />
              <Volume2 className={jamais ? "h-9 w-9" : "h-6 w-6"} />
            </span>
          )}
          <span className="flex flex-col items-start leading-tight">
            <span className="font-semibold">{LIBELLES_FR[cle]}</span>
            {traduit && <span className="text-sm font-normal opacity-90" dir={rtl ? "rtl" : "ltr"} lang={langue}>{traduit}</span>}
          </span>
          {jamais && (
            <span aria-hidden="true" className="pointer-events-none absolute end-4 bottom-1 text-3xl motion-safe:animate-bounce">👆</span>
          )}
        </button>
      </div>
      <div className="flex items-center justify-center gap-1.5" role="img" aria-label={`${restantes} écoute${restantes > 1 ? "s" : ""} restante${restantes > 1 ? "s" : ""} sur ${maxEcoutes}`} data-testid="pastilles-ecoute">
        {Array.from({ length: maxEcoutes }, (_, i) => (
          <span key={i} data-restante={i < restantes ? "oui" : "non"}
            className={cn("h-3 w-3 rounded-full border-2 border-[#00504E]", i < restantes ? "bg-[#00504E]" : "bg-transparent")} />
        ))}
      </div>
    </div>
  );
}

/** Barres animées pendant la lecture (figées si la personne réduit les animations). */
function Ondes() {
  return (
    <span className="flex h-9 shrink-0 items-end gap-1" aria-hidden="true">
      {[0, 150, 300, 450].map((d, i) => (
        <span key={d} className={cn("w-1.5 rounded-full bg-current motion-safe:animate-pulse", ["h-4", "h-8", "h-6", "h-9"][i])} style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}

function Encadre({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl bg-white p-4 ring-1 ring-[#00504E]/10", className)}>{children}</div>;
}

function Support({ q }: { q: Item }) {
  const a = q as Any;
  return (
    <>
      {a.stimulus && <p className="py-4 text-center text-4xl font-bold tracking-wide">{a.stimulus}</p>}
      {a.context && <Encadre className="text-base">{a.context}</Encadre>}
      {a.safetyLabel && (
        <div className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 text-center">
          <div className="text-3xl">{a.safetyIcon}</div>
          <p className="mt-1 font-semibold">{a.safetyLabel}</p>
        </div>
      )}
      {a.passage && <Encadre className="text-base leading-relaxed whitespace-pre-line">{a.passage}</Encadre>}
      {a.statement && <p className="font-medium">« {a.statement} »</p>}
      {a.template && <Encadre className="text-lg">{a.template}</Encadre>}
      {a.originalText && <Encadre className="text-lg">« {a.originalText} »</Encadre>}
      {a.dialogue && (
        <div className="space-y-2">
          {(a.dialogue as { speaker: string; text: string }[]).map((l, i) => (
            <p key={i} className="rounded-xl bg-white p-3 text-base ring-1 ring-[#00504E]/10"><strong>{l.speaker} :</strong> {l.text}</p>
          ))}
        </div>
      )}
      {a.emailBody && (
        <Encadre className="text-base">
          <p className="text-sm text-zinc-500">De : {a.emailFrom} · Objet : {a.emailSubject}</p>
          <p className="mt-2 whitespace-pre-line">{a.emailBody}</p>
        </Encadre>
      )}
    </>
  );
}

const lireJson = <T,>(v: string, defaut: T): T => { try { return v ? JSON.parse(v) : defaut; } catch { return defaut; } };

function BoutonChoix({ actif, onClick, children, className }: { actif: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={cn(
        "rounded-2xl border-2 px-4 font-semibold transition active:scale-[0.98]",
        actif ? "border-[#00504E] bg-[#00504E] text-white" : "border-zinc-200 bg-white text-zinc-900",
        className,
      )}
    >
      {children}
    </button>
  );
}

function VraiFaux({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  const v = lireJson(valeur, { tf: "", justif: "" });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {["Vrai", "Faux"].map((x) => (
          <BoutonChoix key={x} actif={v.tf === x} className="h-14 text-lg" onClick={() => onChange(JSON.stringify({ ...v, tf: x }))}>{x}</BoutonChoix>
        ))}
      </div>
      <input
        className={cn(champClass, "h-14")}
        placeholder="Mots du texte qui le montrent"
        value={v.justif}
        onChange={(e) => onChange(JSON.stringify({ ...v, justif: e.target.value }))}
      />
    </div>
  );
}

/** À relier : colonne A dans l'ordre, colonne B reçue à part et triée (aucune paire toute faite). */
function Paires({ q, valeur, onChange }: { q: Item; valeur: string; onChange: (v: string) => void }) {
  const a = q as Any;
  const gauches = (a.pairs as { left: string }[]).map((p) => p.left);
  const droites = (a.rights as string[] | undefined) ?? [];
  const v = lireJson<Record<string, string>>(valeur, {});
  return (
    <div className="space-y-4">
      {gauches.map((g) => (
        <label key={g} className="block space-y-1">
          <span className="text-lg font-semibold">{g}</span>
          <select
            className={cn(champClass, "h-14 px-3")}
            value={v[g] ?? ""}
            onChange={(e) => onChange(JSON.stringify({ ...v, [g]: e.target.value }))}
          >
            <option value="">Choisir…</option>
            {droites.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

function Classer({ q, valeur, onChange }: { q: Item; valeur: string; onChange: (v: string) => void }) {
  const a = q as Any;
  const v = lireJson<Record<string, string>>(valeur, {});
  const elements = useMemo(() => melanger(a.items as { text: string }[]), [a.items]);
  return (
    <div className="space-y-4">
      {elements.map((it) => (
        <div key={it.text} className="space-y-2">
          <p className="text-base font-semibold">{it.text}</p>
          <div className="flex flex-wrap gap-2">
            {(a.categories as string[]).map((c) => (
              <BoutonChoix key={c} actif={v[it.text] === c} className="min-h-12 text-base" onClick={() => onChange(JSON.stringify({ ...v, [it.text]: c }))}>{c}</BoutonChoix>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Ordonner({ q, onChange }: { q: Item; onChange: (v: string) => void }) {
  const [ordre, setOrdre] = useState(() => ((q as Any).sentences as string[]).map((text, origIdx) => ({ text, origIdx })));
  // L'ordre de départ compte comme une réponse (la personne peut le garder).
  useEffect(() => { onChange(JSON.stringify(ordre)); }, [ordre]); // eslint-disable-line react-hooks/exhaustive-deps
  const bouger = (i: number, d: number) => setOrdre((o) => {
    const j = i + d;
    if (j < 0 || j >= o.length) return o;
    const n = [...o];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  return (
    <ol className="space-y-2">
      {ordre.map((s, i) => (
        <li key={s.origIdx} className="flex items-center gap-2 rounded-2xl bg-white p-2 text-base ring-1 ring-[#00504E]/10">
          <span className="w-6 text-center font-bold text-[#00504E]">{i + 1}</span>
          <span className="flex-1">{s.text}</span>
          <button type="button" aria-label="Monter" onClick={() => bouger(i, -1)} className="grid size-11 place-items-center rounded-xl bg-[#E8F6F0] text-[#00504E]"><ArrowUp className="h-5 w-5" /></button>
          <button type="button" aria-label="Descendre" onClick={() => bouger(i, 1)} className="grid size-11 place-items-center rounded-xl bg-[#E8F6F0] text-[#00504E]"><ArrowDown className="h-5 w-5" /></button>
        </li>
      ))}
    </ol>
  );
}

function ConstruirePhrase({ q, valeur, onChange }: { q: Item; valeur: string; onChange: (v: string) => void }) {
  const mots = useMemo(() => melanger(((q as Any).words as string[]).map((m, i) => ({ m, i }))), [q]);
  const choisis = valeur ? valeur.split("|") : [];
  const [utilises, setUtilises] = useState<number[]>([]);
  return (
    <div className="space-y-3">
      <div className="min-h-14 rounded-2xl border-2 border-dashed border-[#00504E]/30 bg-white p-3 text-xl">{choisis.join(" ") || "…"}</div>
      <div className="flex flex-wrap gap-2">
        {mots.map(({ m, i }) => (
          <button
            key={i}
            type="button"
            disabled={utilises.includes(i)}
            onClick={() => { setUtilises((u) => [...u, i]); onChange([...choisis, m].join("|")); }}
            className="min-h-12 rounded-2xl border-2 border-zinc-200 bg-white px-4 text-lg font-medium disabled:opacity-30"
          >
            {m}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => { setUtilises([]); onChange(""); }} className="text-base font-medium text-[#00504E] underline">
        Recommencer
      </button>
    </div>
  );
}

function TexteAChoix({ q, valeur, onChange }: { q: Item; valeur: string; onChange: (v: string) => void }) {
  const v = lireJson<string[]>(valeur, []);
  return (
    <p className="rounded-2xl bg-white p-4 leading-loose whitespace-pre-line ring-1 ring-[#00504E]/10">
      {((q as Any).textParts as (string | { blank: number; options: string[] })[]).map((p, i) =>
        typeof p === "string" ? <span key={i}>{p}</span> : (
          <select key={i} className="mx-1 rounded-lg border-2 border-zinc-200 bg-white px-1 py-1" value={v[p.blank] ?? ""}
            onChange={(e) => { const n = [...v]; n[p.blank] = e.target.value; onChange(JSON.stringify(n)); }}>
            <option value="">…</option>
            {p.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
    </p>
  );
}

function Formulaire({ q, valeur, onChange }: { q: Item; valeur: string; onChange: (v: string) => void }) {
  const v = lireJson<Record<string, string>>(valeur, {});
  return (
    <div className="space-y-3">
      {((q as Any).formFields as { label: string; key: string }[]).map((f) => (
        <label key={f.key} className="block space-y-1">
          <span className="text-base font-semibold">{f.label}</span>
          <input className={cn(champClass, "h-12")} value={v[f.key] ?? ""} onChange={(e) => onChange(JSON.stringify({ ...v, [f.key]: e.target.value }))} />
        </label>
      ))}
    </div>
  );
}
