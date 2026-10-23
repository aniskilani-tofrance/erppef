import { MENTION_EQUIPE, type SynthesePositionnement } from "@/lib/positionnement/synthese";
import { cn } from "@/lib/utils";

// Détail du test de positionnement (version ToFrance) pour l'ÉQUIPE : niveau par compétence,
// profil, palier « lire et écrire », mention « à confirmer ». La personne, elle, ne voit aucun
// niveau. Sans état : utilisable dans la fiche (rendue par le serveur) et dans un popover.
export function PositionnementDetail({
  synthese: s,
  level,
  completedAt = null,
  className,
}: {
  synthese: SynthesePositionnement;
  /** Niveau rangé sur la fiche (Niveau évalué) au moment du test. */
  level: string | null;
  completedAt?: string | null;
  className?: string;
}) {
  const date = completedAt
    ? new Date(completedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })
    : null;
  return (
    <div className={cn("space-y-2 text-sm", className)}>
      <p className="font-medium">
        Test de positionnement{date ? ` du ${date}` : ""} : <span className="font-semibold">{s.global}</span>
      </p>
      {level && level !== s.global && (
        <p className="text-xs text-muted-foreground">Rangé sur la fiche (Niveau évalué) : {level}</p>
      )}
      {s.abandon ? (
        <p className="text-muted-foreground">
          Arrêté à l&apos;entraînement (toucher l&apos;écran) : ce n&apos;est pas un niveau de français. Refaire le test avec un accompagnant.
        </p>
      ) : (
        <>
          <table className="w-full border-collapse text-xs">
            <tbody>
              {s.competences.map((c) => (
                <tr key={c.code} className="border-t first:border-t-0">
                  <td className="py-1 pe-2 text-muted-foreground">{c.libelle}</td>
                  <td className="py-1 pe-2 font-semibold whitespace-nowrap">{c.niveau}</td>
                  <td className="py-1 text-muted-foreground">
                    {[c.confiance && `confiance ${c.confiance}`, c.correction].filter(Boolean).join(" · ")}
                  </td>
                </tr>
              ))}
              <tr className="border-t">
                <td className="py-1 pe-2 text-muted-foreground">Lire et écrire (entrée dans l&apos;écrit)</td>
                <td className="py-1 pe-2 font-semibold whitespace-nowrap">
                  {s.litteratie.palier === "Non évalué" ? "—" : s.litteratie.palier}
                </td>
                <td className="py-1 text-muted-foreground">{s.litteratie.scolarisation ?? ""}</td>
              </tr>
            </tbody>
          </table>
          <p>
            <span className="text-muted-foreground">Profil : </span>
            {s.profil}
          </p>
          {s.illettrisme && (
            <p className="rounded-md bg-amber-50 px-2 py-1 text-amber-950 ring-1 ring-amber-200">
              Illettrisme probable : scolarisé·e en français mais pas encore entré·e dans l&apos;écrit. Penser aux savoirs de base (ANLCI).
            </p>
          )}
          {s.explication && <p className="text-xs text-muted-foreground">{s.explication}</p>}
        </>
      )}
      {s.aConfirmer && <p className="text-xs font-medium text-amber-800">{MENTION_EQUIPE}</p>}
    </div>
  );
}
