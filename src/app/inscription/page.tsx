import type { Metadata } from "next";
import { SignupForm } from "@/components/inscription/signup-form";
import { SIGNUP_TEXTS, toLocale } from "@/lib/inscription/i18n";
import { isEmbedParam } from "@/lib/inscription/embed";
import { sanitizeSrc } from "@/lib/inscription/link";
import { signupOrgSlug } from "@/lib/inscription/org";
import { freshStamp } from "@/lib/inscription/signup";

export const metadata: Metadata = {
  title: "Inscription — ParlerEmploi",
  description: "Cours de français ParlerEmploi Formation : inscription rapide.",
  robots: { index: false, follow: false },
};

// Page PUBLIQUE d'inscription rapide, envoyée par WhatsApp (bouton « Lien d'inscription »
// de l'onglet Admission). Aucun compte, aucune lecture en base à l'affichage : la page
// reste légère sur un réseau mobile faible. Paramètres facultatifs :
//   ?lang=en|ar   langue d'affichage (français facile par défaut)
//   ?src=…        d'où vient le lien (maison de quartier…) → « précision » de la provenance
//   ?o=<slug>     organisation (ParlerEmploi par défaut ; jamais le bac à sable)
//   ?embed=1      intégré dans le site (iframe) : sans logo, hauteur transmise à la page
export default async function InscriptionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined)) ?? null;
  const locale = toLocale(one("lang"));
  const rawOrg = one("o");
  const orgOk = signupOrgSlug(rawOrg) !== null;

  if (!orgOk) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center text-lg">
        <p className="text-6xl" aria-hidden>⚠️</p>
        <h1 className="text-2xl font-bold">{SIGNUP_TEXTS[locale].errors.link}</h1>
      </main>
    );
  }

  return (
    <SignupForm
      locale={locale}
      orgSlug={rawOrg?.trim() ? rawOrg.trim().toLowerCase() : null}
      src={sanitizeSrc(one("src"))}
      stamp={freshStamp()}
      embed={isEmbedParam(one("embed"))}
    />
  );
}
