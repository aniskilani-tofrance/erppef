import Link from "next/link";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CANDIDATE_COLUMNS, qualificationProgress, type CandidateRow } from "@/lib/poei-candidates/queries";
import {
  CANDIDATE_STATUSES, candidateDisplayName, candidateRef, candidateSourceLabel, candidateStatusBadgeClass, candidateStatusLabel,
  isFinalCandidateStatus,
} from "@/lib/poei-candidates/status";
import { leadRef } from "@/lib/leads/status";
import { todayParis } from "@/lib/leads/queries";
import { formatPhone } from "@/lib/admission/phone";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CandidateFormDialog } from "@/components/poei-candidates/candidate-controls";
import { cn } from "@/lib/utils";

export const metadata = { title: "Candidats POEI — ERP PEF" };

// Les personnes à placer en POEI restauration : apprenants de l'association proposés
// depuis l'admission, et leads resto qui étaient en réalité des candidats.
export default async function CandidatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(["admin", "coordinator", "setter"]);
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined)) ?? "";
  const statut = one("statut");
  const q = one("q").trim().toLowerCase();

  const supabase = await createClient();
  const [{ data }, { data: employers }] = await Promise.all([
    supabase.from("poei_candidates").select(CANDIDATE_COLUMNS).order("created_at", { ascending: false }).limit(1000),
    supabase.from("employer_leads").select("id, lead_no, company").limit(2000),
  ]);
  const candidates = (data ?? []) as unknown as CandidateRow[];
  const employerName = new Map((employers ?? []).map((e) => [e.id as string, `${e.company} (${leadRef(e.lead_no as number | null)})`]));
  const today = todayParis();

  const counts: Record<string, number> = {};
  for (const c of candidates) counts[c.status] = (counts[c.status] ?? 0) + 1;
  const filtered = candidates
    .filter((c) => (statut === "actifs" ? !isFinalCandidateStatus(c.status) : statut ? c.status === statut : true))
    .filter((c) =>
      q
        ? [c.first_name, c.last_name, c.phone, c.email, c.city, c.target_job, candidateRef(c.candidate_no)]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        : true,
    )
    // Actifs d'abord, actions en retard en tête, puis les plus récents
    .sort((a, b) => {
      const fa = isFinalCandidateStatus(a.status) ? 1 : 0;
      const fb = isFinalCandidateStatus(b.status) ? 1 : 0;
      if (fa !== fb) return fa - fb;
      return (a.next_action_on ?? "9999").localeCompare(b.next_action_on ?? "9999") || b.created_at.localeCompare(a.created_at);
    });
  const active = candidates.filter((c) => !isFinalCandidateStatus(c.status)).length;
  const withoutConsent = candidates.filter((c) => !isFinalCandidateStatus(c.status) && !c.consent_at).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Candidats POEI</h1>
          <p className="text-sm text-muted-foreground">
            Les personnes à placer chez un restaurateur. {active} candidat{active > 1 ? "s" : ""} en cours{withoutConsent ? `, dont ${withoutConsent} sans consentement` : ""}.
          </p>
        </div>
        <CandidateFormDialog />
      </div>

      <p className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Entrées : « POEI » sur la page Admission (apprenant de l&apos;association) ou « C&apos;est un candidat » sur un lead resto. Avant de qualifier ou de présenter quelqu&apos;un à un restaurateur, recueillez son consentement : l&apos;association et ParlerEmploi sont deux structures distinctes.
        </span>
      </p>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {CANDIDATE_STATUSES.map((s) => (
            <Link key={s.code} href={`/candidats-poei?statut=${s.code}`} title={`${s.hint} — voir la liste`}>
              <Badge variant="outline" className={cn(candidateStatusBadgeClass(s.code), statut === s.code && "ring-2 ring-primary/40")}>
                {s.label} · {counts[s.code] ?? 0}
              </Badge>
            </Link>
          ))}
          {(statut || q) && <Link href="/candidats-poei" className="text-xs text-muted-foreground underline">Tout afficher</Link>}
          <form className="ml-auto" action="/candidats-poei">
            {statut && <input type="hidden" name="statut" value={statut} />}
            <input
              name="q"
              defaultValue={q}
              placeholder="Rechercher (nom, téléphone, C-0001…)"
              className="h-8 w-64 rounded-md border bg-background px-2 text-sm"
            />
          </form>
        </div>

        {filtered.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            {candidates.length === 0 ? "Aucun candidat pour l'instant : proposez un apprenant depuis l'Admission, ou requalifiez un lead resto." : "Aucun candidat ne correspond."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidat</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead className="hidden md:table-cell">Qualification</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden md:table-cell">Restaurateur</TableHead>
                  <TableHead>Prochaine action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 300).map((c) => {
                  const overdue = c.next_action_on != null && c.next_action_on < today && !isFinalCandidateStatus(c.status);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="max-w-[260px]">
                        <Link href={`/candidats-poei/${c.id}`} className="font-medium hover:underline">{candidateDisplayName(c)}</Link>
                        <span className="block truncate text-xs text-muted-foreground">
                          <span className="font-mono">{candidateRef(c.candidate_no)}</span> · {candidateSourceLabel(c.source)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatPhone(c.phone)}</TableCell>
                      <TableCell className="hidden text-xs md:table-cell">
                        {qualificationProgress(c)}/10
                        <span className="ml-2 inline-flex items-center gap-1">
                          {c.consent_at ? (
                            <span className="text-emerald-700"><ShieldCheck className="inline h-3.5 w-3.5" /> consentement</span>
                          ) : (
                            <span className="text-amber-700">sans consentement</span>
                          )}
                        </span>
                        {c.target_job && <span className="block text-muted-foreground">{c.target_job}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={candidateStatusBadgeClass(c.status)}>{candidateStatusLabel(c.status)}</Badge>
                      </TableCell>
                      <TableCell className="hidden text-xs md:table-cell">{c.placed_lead_id ? employerName.get(c.placed_lead_id) ?? "—" : "—"}</TableCell>
                      <TableCell className="max-w-[240px] text-xs">
                        {c.next_action ? (
                          <>
                            <span className={cn(overdue && "font-semibold text-red-600")}>{c.next_action}</span>
                            {c.next_action_on && (
                              <span className="block text-muted-foreground">
                                {c.next_action_on.split("-").reverse().join("/")}{overdue ? " — en retard" : c.next_action_on === today ? " — aujourd'hui" : ""}
                              </span>
                            )}
                          </>
                        ) : c.status === "a_qualifier" && c.attempts === 0 ? (
                          <span className="font-medium text-red-600">Premier appel à faire</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
