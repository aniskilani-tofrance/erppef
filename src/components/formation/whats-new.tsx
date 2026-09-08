import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { AppRole } from "@/lib/auth";
import { formatUpdateDate, updatesForRole } from "@/lib/updates-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// « Quoi de neuf » : les dernières mises à jour qui concernent ce rôle, avec le lien
// vers la leçon de la Formation où c'est expliqué. Même contenu que l'email du matin.
export function WhatsNew({ role, limit = 4 }: { role: AppRole; limit?: number }) {
  const updates = updatesForRole(role).slice(0, limit);
  if (!updates.length) return null;
  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Quoi de neuf dans l&apos;outil
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          À chaque mise à jour, vous recevez un email et la leçon concernée est enrichie.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {updates.map((u) => (
            <li key={u.id}>
              <p className="text-sm font-medium">
                {u.title}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{formatUpdateDate(u.date)}</span>
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                {u.items.map((i, k) => (
                  <li key={k}>{i.text}</li>
                ))}
              </ul>
              {u.training.length > 0 && (
                <p className="mt-1 text-xs">
                  Pour l&apos;apprendre :{" "}
                  {u.training.map((t, k) => (
                    <span key={t.moduleId + t.lessonId}>
                      {k > 0 && " · "}
                      <Link href={`/formation/${t.moduleId}`} className="text-primary underline-offset-2 hover:underline">
                        {t.label}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
