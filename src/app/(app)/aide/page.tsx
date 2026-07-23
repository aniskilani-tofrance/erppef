import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FAQ, HELP_SECTIONS } from "@/lib/help-content";
import { Printer } from "lucide-react";

// Module d'aide : manuel par tâche + FAQ, filtrés selon le rôle de la personne.
export default async function AidePage() {
  const { role } = await requireSession();

  const sections = HELP_SECTIONS.filter((s) => s.roles.includes(role));
  const faq = FAQ.filter((f) => f.roles.includes(role));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Aide</h1>
        <Link
          href="/aide/manuel"
          className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline"
        >
          <Printer className="h-4 w-4" />
          Manuel complet imprimable
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Cliquez sur une question pour dérouler la réponse. Ce guide s&apos;adapte à votre
        rôle : vous ne voyez que ce qui vous concerne.
      </p>

      {sections.map((section) => (
        <Card key={section.id}>
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {section.articles.map((a) => (
              <details key={a.title} className="group rounded-md border px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium marker:text-muted-foreground">
                  {a.title}
                </summary>
                <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                  {a.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </details>
            ))}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Questions fréquentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {faq.map((f) => (
            <details key={f.q} className="group rounded-md border px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium marker:text-muted-foreground">
                {f.q}
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Une question sans réponse ici ? Contactez votre coordinateur — et signalez-la pour
        qu&apos;elle rejoigne cette page.
      </p>
    </div>
  );
}
