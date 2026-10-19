import type { Metadata } from "next";
import Link from "next/link";
import { LOCALE_META, SIGNUP_TEXTS, toLocale } from "@/lib/inscription/i18n";

export const metadata: Metadata = {
  title: "Vos informations — ParlerEmploi",
  robots: { index: false, follow: false },
};

// Mention d'information RGPD du formulaire d'inscription rapide, dans la langue choisie.
export default async function ConfidentialitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const locale = toLocale(typeof sp.lang === "string" ? sp.lang : null);
  const t = SIGNUP_TEXTS[locale];
  const meta = LOCALE_META[locale];
  const back = new URLSearchParams();
  for (const k of ["lang", "o", "src"]) if (typeof sp[k] === "string" && sp[k]) back.set(k, sp[k] as string);
  const q = back.toString();

  return (
    <div lang={meta.htmlLang} dir={meta.dir} className="min-h-screen bg-zinc-50 text-zinc-950 [font-family:system-ui,-apple-system,'Segoe_UI',Roboto,'Noto_Sans_Arabic',Arial,sans-serif]">
      <main className="mx-auto max-w-md space-y-6 px-4 py-6 text-lg">
        {/* eslint-disable-next-line @next/next/no-img-element -- asset statique, page légère */}
        <img src="/logo-pef.png" alt="ParlerEmploi Formation" className="mx-auto h-12 w-auto" />
        <h1 className="text-3xl font-bold">ℹ️ {t.privacyTitle}</h1>
        {t.privacy.map((s) => (
          <section key={s.h} className="space-y-1">
            <h2 className="text-xl font-bold">{s.h}</h2>
            <p className="leading-relaxed">{s.p}</p>
          </section>
        ))}
        <Link href={`/inscription${q ? `?${q}` : ""}`} className="inline-block text-lg text-[#14532d] underline underline-offset-4">
          {meta.dir === "rtl" ? "→" : "←"} {t.privacyBack}
        </Link>
      </main>
    </div>
  );
}
