"use client";

// Passation du test de positionnement (version ToFrance) par lien personnel /test/<jeton>.
// Téléphone d'abord, public A1. Le serveur décide des questions (parcours adaptatif) et corrige ;
// ici on affiche une question à la fois et on envoie les réponses à la fin de chaque petit bloc.
// Chaque bloc envoyé est rangé : la personne peut fermer la page et reprendre plus tard.
// Aucun consentement en plus de celui de l'ancien test (même case, même texte). Réponses orales
// au micro du téléphone (reconnaissance vocale du navigateur), repli à l'écrit.
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { repondrePositionnement, terminerPositionnement } from "@/app/test/[token]/positionnement-actions";
import { arreterLecture, lire } from "@/lib/positionnement/audio";
import type { EtapeTest, ResultatTest } from "@/lib/positionnement/etape";
import { texteFr } from "@/lib/positionnement/textes";
import { EntrainementLitteratie } from "./entrainement";
import { FinTest } from "./fin";
import { QuestionPositionnement } from "./question";
import { Bilingue } from "./traduit";

type Phase = "accueil" | "entrainement" | "questions" | "envoi" | "fin" | "erreur";
type EtapeEnCours = Extract<EtapeTest, { statut: "en_cours" }>;

const primaryClass =
  "inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[#00504E] px-6 text-xl font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,80,78,0.8)] transition hover:bg-[#003D3B] active:scale-[0.99] disabled:opacity-60";

export function PassationPositionnement({ token, etapeInitiale, langue }: { token: string; etapeInitiale: EtapeEnCours; langue: string }) {
  const [phase, setPhase] = useState<Phase>("accueil");
  const [etape, setEtape] = useState<EtapeEnCours>(etapeInitiale);
  const [index, setIndex] = useState(0);
  const [bloc, setBloc] = useState<Record<number, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [reste, setReste] = useState<number | null>(null);
  // Case de l'ancien test, cochée d'office quand la personne reprend un test commencé.
  const [accord, setAccord] = useState(etapeInitiale.commence);
  const debutBloc = useRef<number>(0);
  const relancer = useRef<(() => void) | null>(null);

  useEffect(() => () => arreterLecture(), []);

  const q = etape.items[index];

  // Minuteur par question (temps limite de l'item) : à zéro, on passe à la suite.
  const [tempsDe, setTempsDe] = useState<number | null>(null);
  if (phase === "questions" && q && tempsDe !== q.id) {
    setTempsDe(q.id);
    setReste(typeof q.timeLimit === "number" ? q.timeLimit : null);
  }
  useEffect(() => {
    if (reste === null || phase !== "questions") return;
    if (reste <= 0) { void suivant(); return; }
    const t = window.setTimeout(() => setReste((r) => (r === null ? null : r - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [reste, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Secondes passées depuis le dernier envoi (le serveur les additionne). */
  function secondes(): number {
    const s = Math.max(0, Math.round((Date.now() - debutBloc.current) / 1000));
    debutBloc.current = Date.now();
    return s;
  }

  function echec(message: string, reessai: (() => void) | null) {
    relancer.current = reessai;
    setErreur(message);
    setPhase("erreur");
  }

  /** Réponse du serveur : écran de fin, ou bloc suivant (vide = parcours fini, à clôturer). */
  async function suite(r: ResultatTest, reessai: () => void) {
    if (!r.ok) { echec(r.error, reessai); return; }
    if (r.etape.statut === "fait") { setPhase("fin"); return; }
    setBloc({});
    setIndex(0);
    setEtape(r.etape);
    if (!r.etape.items.length) { await finir(false); return; }
    setPhase("questions");
  }

  function commencer() {
    lire("Bonjour !"); // ce premier geste débloque le son sur iPhone
    debutBloc.current = Date.now();
    if (!etape.items.length) { void finir(false); return; }
    setIndex(0);
    setPhase(!etape.commence && etape.bloc.startsWith("litteratie") ? "entrainement" : "questions");
  }

  async function finir(abandon: boolean) {
    setPhase("envoi");
    const s = secondes();
    const envoyer = async (): Promise<void> => {
      try {
        const r = await terminerPositionnement({ token, secondes: s, langue, interfaceAbandon: abandon });
        await suite(r, () => { setPhase("envoi"); void envoyer(); });
      } catch {
        echec("Le service ne répond pas. Vérifiez la connexion et réessayez.", () => { setPhase("envoi"); void envoyer(); });
      }
    };
    await envoyer();
  }

  async function suivant() {
    if (!q) return;
    arreterLecture();
    if (index < etape.items.length - 1) { setIndex(index + 1); return; }
    setPhase("envoi");
    const reponses = Object.fromEntries(etape.items.map((x) => [String(x.id), bloc[x.id] ?? ""]));
    const s = secondes();
    const envoyer = async (): Promise<void> => {
      try {
        const r = await repondrePositionnement({ token, reponses, secondes: s, langue });
        await suite(r, () => { setPhase("envoi"); void envoyer(); });
      } catch {
        echec("Le service ne répond pas. Vérifiez la connexion et réessayez.", () => { setPhase("envoi"); void envoyer(); });
      }
    };
    await envoyer();
  }

  if (phase === "fin") return <FinTest langue={langue} prenom={etape.prenom} />;

  if (phase === "envoi") {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-6 text-center text-lg text-[#00504E]">
        <Loader2 className="h-10 w-10 animate-spin" aria-hidden />
        <Bilingue cle="instant" langue={langue} className="items-center" />
      </main>
    );
  }

  if (phase === "erreur") {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold text-[#00504E] [font-family:var(--font-test-title),inherit]">
          <Bilingue cle="probleme" langue={langue} className="items-center" />
        </h1>
        <p className="text-lg text-zinc-700">{erreur}</p>
        <button type="button" className={primaryClass} onClick={() => (relancer.current ? relancer.current() : window.location.reload())}>
          <Bilingue cle="reessayer" langue={langue} className="items-center" />
        </button>
      </main>
    );
  }

  if (phase === "entrainement") {
    return <EntrainementLitteratie onFini={() => setPhase("questions")} onAbandon={() => void finir(true)} />;
  }

  if (phase === "accueil") {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-5 px-4 py-8 text-lg">
        {/* eslint-disable-next-line @next/next/no-img-element -- asset statique, page légère */}
        <img src="/logo-pef.png" alt="ParlerEmploi Formation" className="mx-auto h-12 w-auto" />
        <div className="space-y-5 rounded-3xl bg-white p-5 shadow-[0_12px_40px_-24px_rgba(0,80,78,0.45)] ring-1 ring-[#00504E]/10">
          <h1 className="text-[2rem] leading-tight font-bold text-[#00504E] [font-family:var(--font-test-title),inherit]">
            <Bilingue cle="bonjour" langue={langue} prenom={etape.prenom} className="gap-1" />
          </h1>
          <p className="text-lg">
            <Bilingue cle="intro" langue={langue} className="gap-1" />
          </p>
          <ul className="space-y-3">
            {([["🔊", "son"], ["🤫", "seul"], ["🎤", "micro"]] as const).map(([emoji, cle]) => (
              <li key={cle} className="flex items-start gap-3">
                <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#E8F6F0] text-2xl">{emoji}</span>
                <Bilingue cle={cle} langue={langue} className="pt-1.5 font-medium" />
              </li>
            ))}
          </ul>
          {!etape.commence && (
            <label className="flex cursor-pointer items-start gap-4 rounded-2xl border-2 border-zinc-200 bg-white p-4 text-base transition-colors has-[:checked]:border-[#00504E] has-[:checked]:bg-[#E8F6F0] has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#32CF8A]/40">
              <input type="checkbox" checked={accord} onChange={(e) => setAccord(e.target.checked)} className="peer sr-only" />
              <span
                aria-hidden
                className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border-2 border-zinc-300 bg-white text-base font-bold text-transparent peer-checked:border-[#00504E] peer-checked:bg-[#00504E] peer-checked:text-white"
              >
                ✓
              </span>
              <Bilingue cle="accord" langue={langue} className="gap-1" />
            </label>
          )}
          <button type="button" className={primaryClass} disabled={!accord} onClick={commencer}>
            <Bilingue cle={etape.commence ? "reprendre" : "commencer"} langue={langue} className="items-center" />
            <ArrowRight className="h-6 w-6 shrink-0" aria-hidden />
          </button>
        </div>
      </main>
    );
  }

  if (!q) return null;
  const repondu = Boolean(bloc[q.id]);

  return (
    <main className="mx-auto min-h-[100dvh] max-w-xl space-y-5 px-4 pt-4 pb-36 text-lg">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm font-semibold text-[#00504E]">
          <span>{texteFr("titre")}</span>
          {reste !== null && <span className={reste <= 10 ? "text-red-700" : ""}>⏱️ {reste} s</span>}
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-[#E8F6F0]" role="progressbar" aria-valuenow={etape.progression} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-[#32CF8A] transition-[width] duration-300" style={{ width: `${etape.progression}%` }} />
        </div>
      </div>
      <QuestionPositionnement
        key={q.id}
        item={q}
        prenom={etape.prenom}
        langue={langue}
        valeur={bloc[q.id] ?? ""}
        onChange={(v) => setBloc((b) => ({ ...b, [q.id]: v }))}
      />
      <div className="fixed inset-x-0 bottom-0 border-t border-[#00504E]/10 bg-[#F3FAF7]/95 p-3 backdrop-blur">
        {/* Pas de retour en arrière (comme ToFrance) : une écoute limitée ne se rejoue pas. */}
        <div className="mx-auto max-w-xl">
          <button type="button" className={primaryClass} onClick={() => void suivant()}>
            <Bilingue cle={repondu ? "suivant" : "passer"} langue={langue} className="items-center" />
            <ArrowRight className="h-6 w-6 shrink-0" aria-hidden />
          </button>
        </div>
      </div>
    </main>
  );
}
