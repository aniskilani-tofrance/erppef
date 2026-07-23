"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Copy, MessageSquarePlus, Square } from "lucide-react";
import { closeSurvey, openSurvey } from "@/app/(app)/groupes/actions";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export type SurveyStats = {
  count: number;
  averages: { label: string; value: number | null }[];
  comments: string[];
};

// Pilotage de l'enquête de satisfaction du groupe (preuve Qualiopi ind. 30-32).
export function SurveyManager({
  groupId,
  isOpen,
  publicUrl,
  qrDataUrl,
  stats,
}: {
  groupId: string;
  isOpen: boolean;
  publicUrl: string | null;
  qrDataUrl: string | null;
  stats: SurveyStats;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {stats.count > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {stats.count} réponse{stats.count > 1 ? "s" : ""} (anonymes)
          </p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {stats.averages.map(
              (a) =>
                a.value !== null && (
                  <li key={a.label} className="flex items-center justify-between rounded-md border px-3 py-1.5">
                    <span>{a.label}</span>
                    <span className="font-medium">{a.value.toFixed(1).replace(".", ",")} / 5</span>
                  </li>
                ),
            )}
          </ul>
          {stats.comments.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                {stats.comments.length} commentaire{stats.comments.length > 1 ? "s" : ""}
              </summary>
              <ul className="mt-2 space-y-1">
                {stats.comments.map((c, i) => (
                  <li key={i} className="rounded-md bg-muted px-3 py-2">{c}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {isOpen && publicUrl ? (
        <div className="flex flex-wrap items-center gap-4">
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- data URL locale
            <img src={qrDataUrl} alt="QR code de l'enquête" className="h-28 w-28 rounded-md border" />
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <p className="break-all font-mono text-xs text-muted-foreground">{publicUrl}</p>
            <div className="flex gap-2">
              <Button
                variant="outline" size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(publicUrl);
                  toast.success("Lien copié.");
                }}
              >
                <Copy className="mr-2 h-3.5 w-3.5" />
                Copier le lien
              </Button>
              <Button
                variant="ghost" size="sm" disabled={pending}
                onClick={() => run(() => closeSurvey(groupId), "Enquête clôturée.")}
              >
                <Square className="mr-2 h-3.5 w-3.5" />
                Clôturer
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Faites scanner le QR code en fin de séance ou envoyez le lien : les réponses
              sont anonymes.
            </p>
          </div>
        </div>
      ) : (
        <Button size="sm" disabled={pending} onClick={() => run(() => openSurvey(groupId), "Enquête ouverte : partagez le lien ou le QR code.")}>
          <MessageSquarePlus className="mr-2 h-4 w-4" />
          {stats.count > 0 ? "Rouvrir l'enquête" : "Ouvrir l'enquête"}
        </Button>
      )}
    </div>
  );
}
