import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AbsenceRequestDialog } from "@/components/conges/absence-request-dialog";
import { CancelRequestButton, DecideAbsenceButtons } from "@/components/conges/absence-actions";
import { daysBetween, KIND_LABELS, needsApproval, STATUS_LABELS, type AbsenceKind, type AbsenceStatus, type ContractType } from "@/lib/conges/rules";

// Congés et absences.
//  - Formateur : ses demandes et absences, bouton pour en poser une.
//  - Admin / coordination : les demandes à valider (tous formateurs) + l'historique récent.

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

function statusClass(s: AbsenceStatus): string {
  return s === "en_attente" ? "border-amber-300 bg-amber-50 text-amber-800" : s === "refusee" ? "border-red-300 bg-red-50 text-red-700" : "border-emerald-300 bg-emerald-50 text-emerald-800";
}

export default async function CongesPage() {
  const { role, userId } = await requireSession();
  const supabase = await createClient();
  const team = role === "admin" || role === "coordinator";

  if (!team) {
    const { data: membership } = await supabase.from("memberships").select("trainer_id").eq("user_id", userId).maybeSingle();
    if (!membership?.trainer_id) {
      return (
        <div className="mx-auto max-w-3xl space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight">Congés</h1>
          <p className="text-sm text-muted-foreground">Votre compte n&apos;est pas encore relié à une fiche formateur : demandez à la coordination de vous (ré)inviter depuis votre fiche.</p>
        </div>
      );
    }
    const [{ data: trainer }, { data: absences }] = await Promise.all([
      supabase.from("v_trainers_public").select("contract_type").eq("id", membership.trainer_id).single(),
      supabase.from("trainer_absences").select("id, starts_on, ends_on, kind, note, status, decision_note, decided_at").eq("trainer_id", membership.trainer_id).order("starts_on", { ascending: false }),
    ]);
    const contract = (trainer?.contract_type ?? "vacataire") as ContractType;
    const today = new Date().toISOString().slice(0, 10);
    const rows = absences ?? [];
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Mes congés et absences</h1>
            <p className="text-sm text-muted-foreground">
              {needsApproval(contract)
                ? "Salarié(e) : vos demandes sont validées par la coordination, vous recevez la réponse par email."
                : "Vos absences sont enregistrées directement ; la coordination est prévenue et déplace vos séances."}
            </p>
          </div>
          <AbsenceRequestDialog contract={contract} />
        </div>
        <Card>
          <CardContent className="pt-6">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune absence enregistrée.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Période</TableHead>
                    <TableHead>Motif</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((a) => (
                    <TableRow key={a.id} className={a.ends_on < today ? "text-muted-foreground" : ""}>
                      <TableCell>
                        {a.starts_on === a.ends_on ? fmt(a.starts_on) : `${fmt(a.starts_on)} → ${fmt(a.ends_on)}`}
                        <span className="ml-2 text-xs text-muted-foreground">{daysBetween(a.starts_on, a.ends_on)} j</span>
                      </TableCell>
                      <TableCell>
                        {KIND_LABELS[a.kind as AbsenceKind]}
                        {a.note && <span className="block text-xs text-muted-foreground">{a.note}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusClass(a.status as AbsenceStatus)}>{STATUS_LABELS[a.status as AbsenceStatus]}</Badge>
                        {a.decision_note && <span className="block text-xs text-muted-foreground">{a.decision_note}</span>}
                      </TableCell>
                      <TableCell className="text-right">{a.status === "en_attente" && <CancelRequestButton id={a.id} />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Équipe : demandes à valider + absences récentes/à venir de tous les formateurs
  const { data: absences } = await supabase
    .from("trainer_absences")
    .select("id, trainer_id, starts_on, ends_on, kind, note, status, requested_by, decided_at, decision_note, created_at, trainers:trainer_id(first_name, last_name, contract_type)")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (absences ?? []).map((a) => ({
    ...a,
    trainer: a.trainers as unknown as { first_name: string; last_name: string; contract_type: string } | null,
  }));
  const pending = rows.filter((a) => a.status === "en_attente");
  const today = new Date().toISOString().slice(0, 10);
  const recent = rows.filter((a) => a.status !== "en_attente" && a.requested_by).slice(0, 40);
  const upcoming = rows.filter((a) => a.status === "approuvee" && a.ends_on >= today).sort((x, y) => x.starts_on.localeCompare(y.starts_on)).slice(0, 30);

  const name = (a: (typeof rows)[number]) => (a.trainer ? `${a.trainer.first_name} ${a.trainer.last_name}`.trim() : "—");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Congés et absences</h1>
        <p className="text-sm text-muted-foreground">Les salariés demandent, vous validez. Les vacataires et prestataires déclarent, vous êtes prévenus. Les absences validées sont respectées par le moteur de planning.</p>
      </div>

      <Card className={pending.length ? "border-amber-300 bg-amber-50/40" : undefined}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Demandes à valider ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune demande en attente.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Formateur</TableHead>
                  <TableHead>Période</TableHead>
                  <TableHead>Motif</TableHead>
                  <TableHead>Décision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium"><Link href={`/formateurs/${a.trainer_id}`} className="hover:underline">{name(a)}</Link></TableCell>
                    <TableCell>{a.starts_on === a.ends_on ? fmt(a.starts_on) : `${fmt(a.starts_on)} → ${fmt(a.ends_on)}`} <span className="text-xs text-muted-foreground">({daysBetween(a.starts_on, a.ends_on)} j)</span></TableCell>
                    <TableCell>{KIND_LABELS[a.kind as AbsenceKind]}{a.note && <span className="block text-xs text-muted-foreground">{a.note}</span>}</TableCell>
                    <TableCell><DecideAbsenceButtons id={a.id} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Absences à venir (validées)</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune absence à venir.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {upcoming.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <span className="w-44 text-muted-foreground">{a.starts_on === a.ends_on ? fmt(a.starts_on) : `${fmt(a.starts_on)} → ${fmt(a.ends_on)}`}</span>
                  <Link href={`/formateurs/${a.trainer_id}`} className="font-medium hover:underline">{name(a)}</Link>
                  <Badge variant="outline">{KIND_LABELS[a.kind as AbsenceKind]}</Badge>
                  {a.requested_by && <span className="text-xs text-muted-foreground">déclarée par le formateur</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {recent.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Demandes traitées récemment</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {recent.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <span className="w-44 text-muted-foreground">{a.starts_on === a.ends_on ? fmt(a.starts_on) : `${fmt(a.starts_on)} → ${fmt(a.ends_on)}`}</span>
                  <span className="font-medium">{name(a)}</span>
                  <Badge variant="outline" className={statusClass(a.status as AbsenceStatus)}>{STATUS_LABELS[a.status as AbsenceStatus]}</Badge>
                  {a.decision_note && <span className="text-xs text-muted-foreground">{a.decision_note}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
