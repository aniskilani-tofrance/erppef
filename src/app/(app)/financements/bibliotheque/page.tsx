import { createClient } from "@/lib/supabase/server";
import { requireFinancements } from "@/lib/financements/acces";
import { BLOCK_CATEGORIES, BLOCK_CATEGORY_LABELS, countChars, type BlockCategory } from "@/lib/financements/atelier";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BlockFormDialog, DeleteBlockButton } from "@/components/financements/block-form-dialog";
import { CopyButton } from "@/components/financements/petits-boutons";

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
}

// Bibliothèque de textes (lot 2) : ce qui se réécrit à chaque dossier, saisi une fois —
// présentation de l'association, description des actions, réponses déjà acceptées.
export default async function BibliothequePage() {
  const { orgId } = await requireFinancements();
  const supabase = await createClient();
  const { data } = await supabase
    .from("funding_text_blocks")
    .select("id, title, category, content, updated_at")
    .eq("org_id", orgId)
    .order("title");
  const blocks = (data ?? []).map((b) => ({ ...b, category: b.category as BlockCategory }));
  const groups = BLOCK_CATEGORIES.map((c) => ({ category: c, items: blocks.filter((b) => b.category === c) })).filter((g) => g.items.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Bibliothèque de textes</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Les textes qui reviennent dans chaque dossier, saisis une seule fois. Dans l&apos;atelier d&apos;un dossier, « Insérer » les place dans une rubrique, et l&apos;IA s&apos;appuie sur ceux que vous cochez.
          </p>
        </div>
        <BlockFormDialog />
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 pt-4 text-sm">
            <p className="font-medium">La bibliothèque est vide.</p>
            <p className="text-muted-foreground">
              Commencez par trois textes : la présentation de l&apos;association en dix lignes, la description de votre action principale, et une réponse qu&apos;un financeur a déjà acceptée. Copiez-les depuis vos derniers dossiers Word.
            </p>
            <p className="text-muted-foreground">Aucun nom d&apos;apprenant, aucune donnée de santé ou de séjour : ces textes partent chez des financeurs.</p>
          </CardContent>
        </Card>
      ) : (
        groups.map((g) => (
          <Card key={g.category}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{BLOCK_CATEGORY_LABELS[g.category]}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {g.items.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium">{b.title}</p>
                      <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{b.content}</p>
                      <p className="text-xs text-muted-foreground">
                        {countChars(b.content).toLocaleString("fr-FR")} caractères · mis à jour le {fmtDay(b.updated_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <CopyButton value={b.content} />
                      <BlockFormDialog initial={{ id: b.id, title: b.title, category: b.category, content: b.content }} />
                      <DeleteBlockButton id={b.id} title={b.title} />
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
