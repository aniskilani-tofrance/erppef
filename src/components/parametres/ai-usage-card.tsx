import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type AiUsageRow = { feature: string; calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number };

const FEATURE_LABELS: Record<string, string> = {
  message_groupe: "Messages au groupe",
  relance_absence: "Relances d'absence",
  note_actions: "Note → actions",
  rappel_note: "Rappels extraits des notes",
  place_liberee: "Places libérées",
  brief: "Briefs avant appel",
};

// Carte Paramètres : l'assistant est-il configuré, et combien a-t-il été utilisé (30 jours).
export function AiUsageCard({ enabled, model, rows, estimatedUsd }: { enabled: boolean; model: string; rows: AiUsageRow[]; estimatedUsd: number }) {
  const calls = rows.reduce((n, r) => n + r.calls, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Assistant IA
          {enabled ? <Badge variant="secondary">actif · {model}</Badge> : <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">non configuré</Badge>}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {enabled
            ? "Rédige messages, relances et briefs, lit les notes de la coordinatrice. Il propose, l'équipe valide. Ne reçoit ni téléphone, ni adresse, ni donnée sensible."
            : "Posez la variable ANTHROPIC_API_KEY sur Vercel (production) puis redéployez : les boutons de l'assistant apparaîtront."}
        </p>
      </CardHeader>
      {enabled && (
        <CardContent>
          {calls === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun appel sur les 30 derniers jours.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <ul className="space-y-1">
                {rows.map((r) => (
                  <li key={r.feature} className="flex justify-between gap-2">
                    <span>{FEATURE_LABELS[r.feature] ?? r.feature}</span>
                    <span className="text-muted-foreground">{r.calls} appel{r.calls > 1 ? "s" : ""}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                30 derniers jours : {calls} appel{calls > 1 ? "s" : ""}, coût estimé ≈ {estimatedUsd < 0.01 ? "moins de 0,01" : estimatedUsd.toFixed(2)} $ (tarif public du modèle, hors facture réelle).
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
