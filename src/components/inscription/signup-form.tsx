"use client";

import { useActionState, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { submitSignup, type SignupState, type SignupValues } from "@/app/inscription/actions";
import {
  AVAILABILITIES,
  FRENCH_LEVELS,
  LOCALE_META,
  SIGNUP_LANGUAGES,
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

// Formulaire d'inscription rapide, pour un public A1 sur téléphone : une question par
// écran, gros boutons, pictogrammes, trois langues. Sans JavaScript, tous les écrans
// s'affichent l'un sous l'autre et le formulaire s'envoie quand même (action serveur).

const STEPS = ["intro", "name", "phone", "languages", "french", "availability", "city", "consent"] as const;
type Step = (typeof STEPS)[number];
const QUESTION_COUNT = STEPS.length - 1; // l'accueil n'est pas une question

const STEP_OF_ERROR: Record<SignupErrorCode, Step> = {
  name: "name",
  phone: "phone",
  languages: "languages",
  french: "french",
  availability: "availability",
  consent: "consent",
  server: "consent",
  link: "consent",
};

const EMPTY: SignupValues = {
  firstName: "",
  lastName: "",
  phone: "+33 ",
  languages: [],
  french: "",
  availability: [],
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
    case "languages":
      return v.languages.length ? null : "languages";
    case "french":
      return v.french ? null : "french";
    case "availability":
      return v.availability.length ? null : "availability";
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

  function set<K extends keyof SignupValues>(key: K, value: SignupValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setError(null);
  }
  function toggle(key: "languages" | "availability", code: string) {
    setValues((v) => ({ ...v, [key]: v[key].includes(code) ? v[key].filter((c) => c !== code) : [...v[key], code] }));
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

  if (state.status === "done") return <SignupBooking locale={lang} offer={state.booking ?? null} embed={embed} />;

  const switcher = (
    <nav aria-label="Langue / Language / اللغة" className="flex justify-center gap-2">
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
            "rounded-full border-2 px-3 py-2 text-base font-medium",
            l === lang ? "border-[#14532d] bg-[#14532d] text-white" : "border-zinc-300 bg-white text-zinc-900",
          )}
        >
          {LOCALE_META[l].label}
        </a>
      ))}
    </nav>
  );

  return (
    <Shell meta={meta} switcher={switcher} embed={embed}>
      <form action={formAction} onSubmit={onSubmit} noValidate={enhanced} className="space-y-8">
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

        {shown("intro") && (
          <section className="space-y-6 text-center">
            <p className="text-6xl" aria-hidden>🇫🇷 📚</p>
            <h1 className="text-3xl font-bold">{t.title}</h1>
            <p className="text-xl">⏱️ {t.intro}</p>
            {enhanced && (
              <BigButton onClick={() => go(1)} primary>
                {t.start} {meta.dir === "rtl" ? "←" : "→"}
              </BigButton>
            )}
          </section>
        )}

        {shown("name") && (
          <Question n={1} t={t} title={`👤 ${t.nameQ}`} enhanced={enhanced}>
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
          <Question n={2} t={t} title={`📱 ${t.phoneQ}`} enhanced={enhanced}>
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

        {shown("languages") && (
          <Question n={3} t={t} title={`🗣️ ${t.languagesQ}`} hint={t.severalChoices} enhanced={enhanced}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SIGNUP_LANGUAGES.map((l) => (
                <Choice
                  key={l.code}
                  type="checkbox"
                  name="languages"
                  value={l.code}
                  checked={values.languages.includes(l.code)}
                  onChange={() => toggle("languages", l.code)}
                  label={l[lang]}
                />
              ))}
            </div>
          </Question>
        )}

        {shown("french") && (
          <Question n={4} t={t} title={`🇫🇷 ${t.frenchQ}`} hint={t.frenchHint} enhanced={enhanced}>
            <div className="grid gap-3">
              {FRENCH_LEVELS.map((f) => (
                <Choice
                  key={f.code}
                  type="radio"
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

        {shown("availability") && (
          <Question n={5} t={t} title={`🕒 ${t.availabilityQ}`} hint={t.severalChoices} enhanced={enhanced}>
            <div className="grid gap-3">
              {AVAILABILITIES.map((a) => (
                <Choice
                  key={a.code}
                  type="checkbox"
                  name="availability"
                  value={a.code}
                  checked={values.availability.includes(a.code)}
                  onChange={() => toggle("availability", a.code)}
                  emoji={a.emoji}
                  label={a[lang]}
                />
              ))}
            </div>
          </Question>
        )}

        {shown("city") && (
          <Question n={6} t={t} title={`🏠 ${t.cityQ}`} enhanced={enhanced}>
            <Field label={t.cityLabel} hint={t.cityHint}>
              <input
                name="city"
                maxLength={80}
                autoComplete="address-level2"
                value={values.city}
                onChange={(e) => set("city", e.target.value)}
                className={inputClass}
              />
            </Field>
          </Question>
        )}

        {shown("consent") && (
          <Question n={7} t={t} title={`✅ ${t.consentQ}`} enhanced={enhanced}>
            <label className="flex cursor-pointer items-start gap-4 rounded-xl border-2 border-zinc-300 bg-white p-4 text-lg has-[:checked]:border-[#14532d] has-[:checked]:bg-emerald-50">
              <input
                type="checkbox"
                name="consent"
                required
                checked={values.consent}
                onChange={(e) => set("consent", e.target.checked)}
                className="mt-1 h-7 w-7 shrink-0 accent-[#14532d]"
              />
              <span>{t.consent}</span>
            </label>
            <a
              href={`/inscription/confidentialite${query(lang)}`}
              target="_blank"
              rel="noopener"
              className="inline-block text-lg text-[#14532d] underline underline-offset-4"
            >
              ℹ️ {t.more}
            </a>
          </Question>
        )}

        {error && (
          <p role="alert" className="rounded-xl border-2 border-red-700 bg-red-50 p-4 text-lg font-medium text-red-800">
            ⚠️ {t.errors[error]}
          </p>
        )}

        {(!enhanced || step !== "intro") && (
          <div className="flex gap-3">
            {enhanced && (
              <BigButton onClick={() => go(index - 1)}>
                {meta.dir === "rtl" ? "→" : "←"} {t.back}
              </BigButton>
            )}
            {enhanced && step !== "consent" ? (
              <BigButton onClick={next} primary grow>
                {t.next} {meta.dir === "rtl" ? "←" : "→"}
              </BigButton>
            ) : (
              <button
                type="submit"
                disabled={pending}
                className="min-h-14 flex-1 rounded-xl bg-[#14532d] px-6 text-xl font-bold text-white disabled:opacity-60"
              >
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
  "block h-14 w-full rounded-xl border-2 border-zinc-400 bg-white px-4 text-xl text-zinc-950 outline-none focus:border-[#14532d] focus:ring-4 focus:ring-emerald-200";

function Question({
  n,
  t,
  title,
  hint,
  enhanced,
  children,
}: {
  n: number;
  t: (typeof SIGNUP_TEXTS)[SignupLocale];
  title: string;
  hint?: string;
  enhanced: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-4">
      {enhanced && (
        <div className="space-y-2">
          <p className="text-base text-zinc-700">{stepLabel(t, n, QUESTION_COUNT)}</p>
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: QUESTION_COUNT }, (_, i) => (
              <span key={i} className={cn("h-2 flex-1 rounded-full", i < n ? "bg-[#14532d]" : "bg-zinc-300")} />
            ))}
          </div>
        </div>
      )}
      <legend className="sr-only">{title}</legend>
      <h2 className="text-2xl font-bold leading-snug" aria-hidden>
        {title}
      </h2>
      {hint && <p className="text-lg text-zinc-700">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="block text-lg font-semibold">{label}</span>
      {children}
      {hint && <span className="block text-base text-zinc-700">{hint}</span>}
    </label>
  );
}

function Choice({
  type,
  name,
  value,
  checked,
  onChange,
  emoji,
  label,
}: {
  type: "checkbox" | "radio";
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  emoji?: string;
  label: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 bg-white px-4 py-2 text-xl",
        checked ? "border-[#14532d] bg-emerald-50 font-semibold" : "border-zinc-300",
      )}
    >
      <input type={type} name={name} value={value} checked={checked} onChange={onChange} className="h-6 w-6 shrink-0 accent-[#14532d]" />
      {emoji && <span aria-hidden>{emoji}</span>}
      <span>{label}</span>
    </label>
  );
}

function BigButton({
  children,
  onClick,
  primary = false,
  grow = false,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  grow?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-14 rounded-xl px-6 text-xl font-bold",
        grow && "flex-1",
        primary ? "w-full bg-[#14532d] text-white" : "border-2 border-zinc-400 bg-white text-zinc-900",
      )}
    >
      {children}
    </button>
  );
}
