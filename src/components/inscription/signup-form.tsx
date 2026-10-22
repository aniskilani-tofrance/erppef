"use client";

import { useActionState, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { submitSignup, type SignupState, type SignupValues } from "@/app/inscription/actions";
import {
  CITY_CHOICES,
  FRENCH_LEVELS,
  LOCALE_META,
  SIGNUP_LOCALES,
  SIGNUP_TEXTS,
  stepLabel,
  type SignupErrorCode,
  type SignupLocale,
} from "@/lib/inscription/i18n";
import { cn } from "@/lib/utils";
import { SignupBooking } from "@/components/inscription/signup-booking";
import { SignupShell as Shell } from "@/components/inscription/signup-shell";
import { postToHost } from "@/lib/inscription/embed";
import { carriedEntries } from "@/lib/inscription/carry";

// Formulaire d'inscription rapide, pour un public A1 sur téléphone : une question par
// écran, gros boutons, pictogrammes, trois langues, couleurs ParlerEmploi. Sans
// JavaScript, tous les écrans s'affichent l'un sous l'autre et le formulaire s'envoie
// quand même (action serveur).

const STEPS = ["intro", "name", "phone", "french", "city", "consent"] as const;
type Step = (typeof STEPS)[number];
const QUESTION_COUNT = STEPS.length - 1; // l'accueil n'est pas une question

const STEP_OF_ERROR: Record<SignupErrorCode, Step> = {
  name: "name",
  phone: "phone",
  french: "french",
  city: "city",
  consent: "consent",
  server: "consent",
  link: "consent",
};

const EMPTY: SignupValues = {
  firstName: "",
  lastName: "",
  phone: "+33 ",
  french: "",
  cityChoice: "",
  city: "",
  consent: false,
};

// Vrai une fois l'application chargée dans le navigateur (faux au rendu serveur).
const noop = () => () => {};
function useEnhanced(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

// Contrôle d'un écran avant « Suivant » (le serveur revalide tout).
function stepError(step: Step, v: SignupValues): SignupErrorCode | null {
  switch (step) {
    case "name":
      return v.firstName.trim() && v.lastName.trim() ? null : "name";
    case "phone":
      return v.phone.replace(/\D/g, "").replace(/^33$/, "").length >= 8 ? null : "phone";
    case "french":
      return v.french ? null : "french";
    case "city":
      return v.cityChoice ? null : "city";
    case "consent":
      return v.consent ? null : "consent";
    default:
      return null;
  }
}

export function SignupForm({
  locale,
  orgSlug,
  src,
  stamp,
  embed = false,
}: {
  locale: SignupLocale;
  orgSlug: string | null;
  src: string | null;
  stamp: string;
  /** Formulaire dans l'iframe du site (/inscription?embed=1). */
  embed?: boolean;
}) {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(submitSignup, { status: "idle" });
  const enhanced = useEnhanced();
  const [lang, setLang] = useState<SignupLocale>(locale);
  const [values, setValues] = useState<SignupValues>(state.status === "error" ? state.values : EMPTY);
  const [step, setStep] = useState<Step>(state.status === "error" ? STEP_OF_ERROR[state.error] : "intro");
  const [error, setError] = useState<SignupErrorCode | null>(state.status === "error" ? state.error : null);

  // Réponse du serveur : on revient sur l'écran de l'erreur (ajustement pendant le rendu).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "error") {
      setError(state.error);
      setStep(STEP_OF_ERROR[state.error]);
    }
  }

  // Iframe du site : la page qui accueille le formulaire sait que l'inscription est faite,
  // et remonte en haut du formulaire si besoin (l'écran de fin est plus court).
  useEffect(() => {
    if (!embed || state.status !== "done") return;
    postToHost({ type: "pef-inscription:done" });
    postToHost({ type: "pef-inscription:step" });
  }, [embed, state.status]);

  const t = SIGNUP_TEXTS[lang];
  const meta = LOCALE_META[lang];
  const index = STEPS.indexOf(step);
  const forward = meta.dir === "rtl" ? "←" : "→";
  const backward = meta.dir === "rtl" ? "→" : "←";

  function set<K extends keyof SignupValues>(key: K, value: SignupValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setError(null);
  }
  function go(to: number) {
    setStep(STEPS[Math.max(0, Math.min(STEPS.length - 1, to))]);
    setError(null);
    // Dans l'iframe du site, c'est la page parente qui remonte en haut du formulaire.
    if (embed) postToHost({ type: "pef-inscription:step" });
    else window.scrollTo({ top: 0 });
  }
  function next() {
    const e = stepError(step, values);
    if (e) return setError(e);
    go(index + 1);
  }
  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    if (!enhanced) return;
    for (const s of STEPS) {
      const e = stepError(s, values);
      if (e) {
        ev.preventDefault();
        setStep(s);
        setError(e);
        return;
      }
    }
  }

  const query = (l: SignupLocale) => {
    const p = new URLSearchParams();
    if (l !== "fr") p.set("lang", l);
    if (orgSlug) p.set("o", orgSlug);
    if (src) p.set("src", src);
    if (embed) p.set("embed", "1");
    const q = p.toString();
    return q ? `?${q}` : "";
  };

  const shown = (s: Step) => !enhanced || step === s;

  if (state.status === "done") return <SignupBooking locale={lang} offer={state.booking ?? null} testUrl={state.testUrl ?? null} embed={embed} />;

  const switcher = (
    <nav aria-label="Langue / Language / اللغة" className="mx-auto flex w-fit gap-1 rounded-full bg-[#E8F6F0] p-1">
      {SIGNUP_LOCALES.map((l) => (
        <a
          key={l}
          href={query(l)}
          lang={LOCALE_META[l].htmlLang}
          aria-current={l === lang ? "true" : undefined}
          onClick={(e) => {
            e.preventDefault();
            setLang(l);
            window.history.replaceState(null, "", query(l) || window.location.pathname);
          }}
          className={cn(
            "rounded-full px-4 py-2 text-base transition-colors",
            l === lang ? "bg-white font-semibold text-[#00504E] shadow-sm" : "text-zinc-700 hover:text-[#00504E]",
          )}
        >
          {LOCALE_META[l].label}
        </a>
      ))}
    </nav>
  );

  return (
    <Shell meta={meta} switcher={switcher} embed={embed}>
      <form action={formAction} onSubmit={onSubmit} noValidate={enhanced} className="space-y-7">
        <input type="hidden" name="t" value={stamp} />
        <input type="hidden" name="lang" value={lang} />
        {orgSlug && <input type="hidden" name="o" value={orgSlug} />}
        {src && <input type="hidden" name="src" value={src} />}
        {/* Champ piège : invisible pour les personnes, rempli par les robots. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Site web
            <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>
        {/* Un seul écran affiché à la fois : les réponses des autres partent en champs cachés. */}
        {enhanced &&
          carriedEntries(values, step).map(([name, value], i) => (
            <input key={`${name}-${i}-${value}`} type="hidden" name={name} value={value} />
          ))}

        {shown("intro") && (
          <section className="space-y-6 text-center">
            <div className="space-y-3">
              <p className="mx-auto w-fit rounded-full bg-[#E8F6F0] px-3 py-1 text-sm font-semibold tracking-wide text-[#00504E]">
                ParlerEmploi · Saint-Ouen
              </p>
              <h1 className="text-[2rem] leading-tight font-bold text-[#00504E] [font-family:var(--font-signup-title),inherit]">{t.title}</h1>
            </div>
            <ul className="mx-auto grid max-w-xs gap-3 text-start">
              {(["⏱️", "📱", "💬"] as const).map((icon, i) => (
                <li key={icon} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-lg ring-1 ring-zinc-200">
                  <Bubble>{icon}</Bubble>
                  <span className="font-medium">{t.introPoints[i]}</span>
                </li>
              ))}
            </ul>
            {enhanced && (
              <PrimaryButton onClick={() => go(1)}>
                {t.start} <span aria-hidden>{forward}</span>
              </PrimaryButton>
            )}
          </section>
        )}

        {shown("name") && (
          <Question n={1} t={t} icon="👤" title={t.nameQ} enhanced={enhanced}>
            <Field label={t.firstName}>
              <input
                name="firstName"
                required
                maxLength={60}
                autoComplete="given-name"
                value={values.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label={t.lastName}>
              <input
                name="lastName"
                required
                maxLength={60}
                autoComplete="family-name"
                value={values.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                className={inputClass}
              />
            </Field>
          </Question>
        )}

        {shown("phone") && (
          <Question n={2} t={t} icon="📱" title={t.phoneQ} enhanced={enhanced}>
            <Field label={t.phoneLabel} hint={t.phoneHint}>
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                dir="ltr"
                required
                maxLength={40}
                autoComplete="tel"
                value={values.phone}
                onChange={(e) => set("phone", e.target.value)}
                className={cn(inputClass, "text-left tracking-wide")}
              />
            </Field>
          </Question>
        )}

        {shown("french") && (
          <Question n={3} t={t} icon="🇫🇷" title={t.frenchQ} hint={t.frenchHint} enhanced={enhanced}>
            <div className="grid gap-3">
              {FRENCH_LEVELS.map((f) => (
                <Choice
                  key={f.code}
                  name="french"
                  value={f.code}
                  checked={values.french === f.code}
                  onChange={() => set("french", f.code)}
                  emoji={f.emoji}
                  label={f[lang]}
                />
              ))}
            </div>
          </Question>
        )}

        {shown("city") && (
          <Question n={4} t={t} icon="🏠" title={t.cityQ} enhanced={enhanced}>
            <div className="grid gap-3">
              {CITY_CHOICES.map((c) => (
                <Choice
                  key={c.code}
                  name="cityChoice"
                  value={c.code}
                  checked={values.cityChoice === c.code}
                  onChange={() => set("cityChoice", c.code)}
                  emoji={c.emoji}
                  label={c[lang]}
                />
              ))}
            </div>
            {(!enhanced || values.cityChoice === "autre") && (
              <Field label={t.cityOtherLabel} hint={t.cityOtherHint}>
                <input
                  name="city"
                  maxLength={80}
                  autoComplete="address-level2"
                  value={values.city}
                  onChange={(e) => set("city", e.target.value)}
                  className={inputClass}
                />
              </Field>
            )}
          </Question>
        )}

        {shown("consent") && (
          <Question n={5} t={t} icon="✅" title={t.consentQ} enhanced={enhanced}>
            <label className="flex cursor-pointer items-start gap-4 rounded-2xl border-2 border-zinc-200 bg-white p-4 text-lg transition-colors has-[:checked]:border-[#00504E] has-[:checked]:bg-[#E8F6F0] has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#32CF8A]/40">
              <input
                type="checkbox"
                name="consent"
                required
                checked={values.consent}
                onChange={(e) => set("consent", e.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border-2 border-zinc-300 bg-white text-base font-bold text-transparent peer-checked:border-[#00504E] peer-checked:bg-[#00504E] peer-checked:text-white"
              >
                ✓
              </span>
              <span>{t.consent}</span>
            </label>
            <a
              href={`/inscription/confidentialite${query(lang)}`}
              target="_blank"
              rel="noopener"
              className="inline-block text-lg font-medium text-[#00504E] underline underline-offset-4"
            >
              ℹ️ {t.more}
            </a>
          </Question>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-lg font-medium text-red-800">
            <span aria-hidden>⚠️</span>
            <span>{t.errors[error]}</span>
          </p>
        )}

        {(!enhanced || step !== "intro") && (
          <div className="flex gap-3">
            {enhanced && (
              <button
                type="button"
                onClick={() => go(index - 1)}
                className="min-h-14 rounded-2xl border-2 border-zinc-200 bg-white px-5 text-lg font-semibold text-zinc-800 transition-colors hover:border-[#00504E]"
              >
                <span aria-hidden>{backward}</span> {t.back}
              </button>
            )}
            {enhanced && step !== "consent" ? (
              <PrimaryButton onClick={next} grow>
                {t.next} <span aria-hidden>{forward}</span>
              </PrimaryButton>
            ) : (
              <button type="submit" disabled={pending} className={cn(primaryClass, "flex-1 disabled:opacity-60")}>
                {pending ? t.sending : `📨 ${t.submit}`}
              </button>
            )}
          </div>
        )}
      </form>
    </Shell>
  );
}

const inputClass =
  "block h-14 w-full rounded-2xl border-2 border-zinc-200 bg-white px-4 text-xl text-zinc-950 outline-none transition-colors focus:border-[#00504E] focus:ring-4 focus:ring-[#32CF8A]/30";

const primaryClass =
  "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#00504E] px-6 text-xl font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,80,78,0.8)] transition hover:bg-[#003D3B] active:scale-[0.99]";

function Bubble({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#E8F6F0] text-2xl">
      {children}
    </span>
  );
}

function Question({
  n,
  t,
  icon,
  title,
  hint,
  enhanced,
  children,
}: {
  n: number;
  t: (typeof SIGNUP_TEXTS)[SignupLocale];
  icon: string;
  title: string;
  hint?: string;
  enhanced: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-5">
      {enhanced && (
        <div className="space-y-2">
          <p className="text-sm font-semibold tracking-wide text-[#00504E]">{stepLabel(t, n, QUESTION_COUNT)}</p>
          <div className="h-2 overflow-hidden rounded-full bg-[#E8F6F0]" aria-hidden>
            <div className="h-full rounded-full bg-[#32CF8A] transition-[width] duration-300" style={{ width: `${(n / QUESTION_COUNT) * 100}%` }} />
          </div>
        </div>
      )}
      <legend className="sr-only">{title}</legend>
      <div className="flex items-center gap-3" aria-hidden>
        <Bubble>{icon}</Bubble>
        <h2 className="text-[1.6rem] leading-snug font-bold text-zinc-950 [font-family:var(--font-signup-title),inherit]">{title}</h2>
      </div>
      {hint && <p className="text-lg text-zinc-600">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="block text-lg font-semibold text-zinc-900">{label}</span>
      {children}
      {hint && <span className="block text-base text-zinc-600">{hint}</span>}
    </label>
  );
}

// Choix unique en grosse carte : pictogramme, libellé, rond coché au bout de la ligne
// (à gauche en arabe, la page étant en RTL).
function Choice({
  name,
  value,
  checked,
  onChange,
  emoji,
  label,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  emoji: string;
  label: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-16 cursor-pointer items-center gap-4 rounded-2xl border-2 bg-white px-4 py-3 text-xl transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#32CF8A]/40",
        checked ? "border-[#00504E] bg-[#E8F6F0] font-semibold text-[#00504E]" : "border-zinc-200 text-zinc-900 hover:border-zinc-300",
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      <Bubble>{emoji}</Bubble>
      <span className="flex-1">{label}</span>
      <span
        aria-hidden
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full border-2 text-base font-bold",
          checked ? "border-[#00504E] bg-[#00504E] text-white" : "border-zinc-300 text-transparent",
        )}
      >
        ✓
      </span>
    </label>
  );
}

function PrimaryButton({ children, onClick, grow = false }: { children: ReactNode; onClick: () => void; grow?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn(primaryClass, grow ? "flex-1" : "w-full")}>
      {children}
    </button>
  );
}
