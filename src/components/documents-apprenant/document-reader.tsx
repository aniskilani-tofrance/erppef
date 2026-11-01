import type { DocumentText } from "@/lib/documents-apprenant/textes";

// Un document à lire sur le téléphone : « L'essentiel » en tête (encadré menthe), puis le
// texte complet, section par section, en grands caractères. Même source que le PDF signé.
export function DocumentReader({ text, step, total }: { text: DocumentText; step?: number; total?: number }) {
  return (
    <article className="space-y-5" aria-labelledby={`doc-${text.kind}`}>
      <header className="space-y-2">
        {step && total ? (
          <p className="w-fit rounded-full bg-[#E8F6F0] px-3 py-1 text-base font-semibold text-[#00504E]">
            Document {step} sur {total}
          </p>
        ) : null}
        <h2 id={`doc-${text.kind}`} className="text-[1.6rem] leading-tight font-bold text-[#00504E] [font-family:var(--font-sign-title),inherit]">
          {text.title}
        </h2>
        <p className="text-base text-zinc-600">{text.subtitle}</p>
      </header>

      <section className="rounded-2xl border-l-4 border-[#32CF8A] bg-[#E8F6F0] p-4">
        <h3 className="mb-2 text-base font-bold tracking-wide text-[#00504E] uppercase">L&apos;essentiel</h3>
        <ul className="space-y-2">
          {text.essentials.map((e) => (
            <li key={e} className="flex gap-2 text-xl leading-snug font-medium">
              <span aria-hidden className="text-[#00504E]">✓</span>
              <span>{e}</span>
            </li>
          ))}
        </ul>
      </section>

      {text.sections.map((s) => (
        <section key={s.heading} className="space-y-2">
          <h3 className="text-xl font-bold text-[#00504E]">{s.heading}</h3>
          {(s.paragraphs ?? []).map((p) => (
            <p key={p} className="leading-relaxed">
              {p}
            </p>
          ))}
          {s.bullets?.length ? (
            <ul className="space-y-1.5">
              {s.bullets.map((b) => (
                <li key={b} className="flex gap-2 leading-relaxed">
                  <span aria-hidden className="mt-2.5 size-2 shrink-0 rounded-full bg-[#32CF8A]" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
      <p className="text-sm text-zinc-500">Version du texte : {text.version}</p>
    </article>
  );
}
