import { requireSession } from "@/lib/auth";
import { FAQ, HELP_SECTIONS } from "@/lib/help-content";
import { PrintButton } from "@/components/aide/print-button";

export const metadata = { title: "Manuel — ERP PEF" };

// Manuel complet à plat, pensé pour l'impression (Ctrl/Cmd+P → PDF).
// Contrairement à la page Aide, il montre TOUT : c'est le document de formation
// à remettre à un nouvel arrivant, quel que soit son rôle.
export default async function ManuelPage() {
  await requireSession();

  return (
    <div className="mx-auto max-w-3xl space-y-8 print:max-w-none">
      <div className="flex items-center gap-3 print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">Manuel d&apos;utilisation</h1>
        <PrintButton />
      </div>

      <header className="hidden print:block">
        {/* eslint-disable-next-line @next/next/no-img-element -- asset statique */}
        <img src="/logo-pef.png" alt="" className="h-16 w-auto" />
        <h1 className="mt-2 text-2xl font-bold">ERP ParlerEmploi Formation — Manuel d&apos;utilisation</h1>
        <p className="text-sm text-muted-foreground">https://pef-erp.vercel.app</p>
      </header>

      {HELP_SECTIONS.map((section, si) => (
        <section key={section.id} className="space-y-4 break-inside-avoid-page">
          <h2 className="border-b pb-1 text-lg font-semibold">
            {si + 1}. {section.title}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({section.roles.length === 4 ? "tout le monde" : section.roles.includes("trainer") ? "formateurs et coordination" : "coordination"})
            </span>
          </h2>
          {section.articles.map((a) => (
            <div key={a.title} className="break-inside-avoid">
              <h3 className="text-sm font-semibold">{a.title}</h3>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {a.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      ))}

      <section className="space-y-4">
        <h2 className="border-b pb-1 text-lg font-semibold">{HELP_SECTIONS.length + 1}. Questions fréquentes</h2>
        {FAQ.map((f) => (
          <div key={f.q} className="break-inside-avoid">
            <h3 className="text-sm font-semibold">{f.q}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.a}</p>
          </div>
        ))}
      </section>

      <p className="text-xs text-muted-foreground">
        ParlerEmploi Formation — manuel généré depuis l&apos;ERP (page Aide → Manuel imprimable).
      </p>
    </div>
  );
}
