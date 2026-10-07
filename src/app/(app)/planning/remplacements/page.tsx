import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadEngineData } from "@/lib/engine/loader";
import { rankReplacements } from "@/lib/engine/replacement";
import { REPLACEMENT_HORIZON_DAYS, loadSessionsToReplace, type SessionToReplace } from "@/lib/remplacements/load";
import { utcToLocalDate, utcToLocalTime } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReplacementAssignButton } from "@/components/planning/replacement-assign";

const CONTRACT_LABELS: Record<string, string> = {
  salarie: "salariée",
  vacataire: "vacataire",
  prestataire: "prestataire",
  stagiaire: "stagiaire",
  benevole: "bénévole",
};

const SECTIONS: { reason: SessionToReplace["reason"]; title: string; hint: string }[] = [
  { reason: "absence", title: "Formatrice absente (congé ou absence validés)", hint: "À confier en priorité : sans remplaçante, la séance n'aura pas lieu." },
  { reason: "absence_a_valider", title: "Demande de congé encore à valider", hint: "Validez ou refusez d'abord la demande (menu Congés) ; si vous la validez, confiez la séance ici." },
  { reason: "sans_formateur", title: "Séances sans formateur", hint: "Ateliers ou séances créées sans animatrice : confiez-les une par une." },
];

// Remplacements : chaque séance des 3 prochaines semaines qui n'a pas de formatrice
// disponible, avec les remplaçantes possibles classées par le moteur de planning.
export default async function RemplacementsPage() {
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const sessions = await loadSessionsToReplace(supabase);
  const data = sessions.length ? await loadEngineData(orgId, utcToLocalDate(new Date().toISOString())) : null;

  const rows = sessions.map((s) => {
    const ranked = data
      ? rankReplacements({ startsAt: s.startsAt, endsAt: s.endsAt, level: s.level, excludeTrainerId: s.trainerId }, data)
      : [];
    return { session: s, eligible: ranked.filter((r) => r.hardViolations.length === 0), ineligible: ranked.length };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Remplacements</h1>
        <Link href="/planning" className="ml-auto text-sm text-muted-foreground hover:underline">← Planning</Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Les séances des {REPLACEMENT_HORIZON_DAYS} prochains jours sans formatrice disponible. Pour chacune, les
        personnes libres sur le créneau (disponibilités, congés validés, plafond d&apos;heures, autres cours), classées
        comme le fait le moteur de planning : salariées d&apos;abord, stagiaires et bénévoles en dernier. « Confier à »
        change la formatrice de la séance et la prévient par email.
      </p>

      {rows.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">Rien à remplacer sur les {REPLACEMENT_HORIZON_DAYS} prochains jours. 🎉</CardContent>
        </Card>
      )}

      {SECTIONS.map((section) => {
        const list = rows.filter((r) => r.session.reason === section.reason);
        if (!list.length) return null;
        return (
          <Card key={section.reason} className={section.reason === "absence" ? "border-destructive/50" : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{section.title} ({list.length})</CardTitle>
              <p className="text-xs text-muted-foreground">{section.hint}</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {list.map(({ session: s, eligible }) => (
                  <li key={s.id} className="space-y-2 rounded-md border px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {new Date(s.startsAt).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Paris" })}{" "}
                        {utcToLocalTime(s.startsAt)}–{utcToLocalTime(s.endsAt)}
                      </span>
                      <span>{s.groupName}</span>
                      {s.roomName && <Badge variant="outline">{s.roomName}</Badge>}
                      {s.trainerName && <span className="text-muted-foreground">· prévue : {s.trainerName}</span>}
                    </div>
                    {eligible.length === 0 ? (
                      <p className="text-xs text-destructive">
                        Personne de libre sur ce créneau : déplacez la séance ou annulez-la depuis le{" "}
                        <Link href="/planning" className="underline">Planning</Link> (les heures manquantes se replanifient depuis la fiche du groupe).
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {eligible.slice(0, 3).map((c, i) => (
                          <span key={c.trainerId} className="inline-flex flex-wrap items-center gap-1.5">
                            <ReplacementAssignButton sessionId={s.id} trainerId={c.trainerId} label={c.name} primary={i === 0} />
                            <span className="text-xs text-muted-foreground">
                              {CONTRACT_LABELS[c.contractType] ?? c.contractType}
                              {c.softNotes.length ? ` · ${c.softNotes.join(" · ")}` : ""}
                            </span>
                          </span>
                        ))}
                        {eligible.length > 3 && <span className="text-xs text-muted-foreground">+ {eligible.length - 3} autre{eligible.length - 3 > 1 ? "s" : ""}</span>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
