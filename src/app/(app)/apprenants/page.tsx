import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { LearnerFormDialog } from "@/components/apprenants/learner-form-dialog";
import { learnerRef } from "@/lib/refs";
import { LearnerImportDialog } from "@/components/apprenants/learner-import-dialog";
import { PlacementTestCell, type PlacementInfo } from "@/components/apprenants/placement-test-cell";
import {
  ABSENCE_ALERT_THRESHOLD,
  computeLearnerStats,
  type AttendanceRecord,
} from "@/lib/attendance-stats";

export default async function ApprenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRole(["admin", "coordinator"]);
  const { q } = await searchParams;
  const supabase = await createClient();

  const [{ data: learners }, { data: enrollments }, { data: groups }, { data: attendanceRows }, { data: placementRows }] = await Promise.all([
    supabase.from("learners").select("*").order("last_name").order("first_name"),
    supabase.from("enrollments").select("id, learner_id, group_id, status, groups(name)"),
    supabase.from("groups").select("id, name").in("status", ["en_attente", "ouvert"]).order("starts_on", { ascending: false }),
    supabase
      .from("attendances")
      .select("learner_id, status, sessions!inner(starts_at, attendance_closed_at)")
      .not("sessions.attendance_closed_at", "is", null),
    // Tolérant tant que la migration placement_tests n'est pas appliquée (data null)
    supabase
      .from("placement_tests")
      .select("learner_id, status, token, level, score, created_at")
      .order("created_at", { ascending: false }),
  ]);

  // Dernier test par apprenant (le plus récent prime)
  const testByLearner = new Map<string, PlacementInfo>();
  for (const t of placementRows ?? []) {
    if (!testByLearner.has(t.learner_id)) {
      testByLearner.set(t.learner_id, {
        status: t.status as "en_attente" | "fait",
        token: t.token,
        level: t.level,
        score: t.score === null ? null : Number(t.score),
      });
    }
  }

  const stats = computeLearnerStats(
    (attendanceRows ?? []).map((a) => ({
      learnerId: a.learner_id,
      status: a.status as AttendanceRecord["status"],
      startsAt: (a.sessions as unknown as { starts_at: string }).starts_at,
    })),
  );

  const groupOptions = (groups ?? []).map((g) => ({ id: g.id, name: g.name }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Apprenants</h1>
        <div className="flex gap-2">
          <LearnerImportDialog groups={groupOptions} />
          <LearnerFormDialog groups={groupOptions} />
        </div>
      </div>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Langue</TableHead>
              <TableHead>Niveau</TableHead>
              <TableHead>Groupes</TableHead>
              <TableHead>Assiduité</TableHead>
              <TableHead>Test de positionnement</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(learners ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Aucun apprenant. Créez le premier avec « Nouvel apprenant » — vous pourrez
                  l&apos;inscrire dans un groupe au passage.
                </TableCell>
              </TableRow>
            )}
            {(learners ?? [])
              .filter((l) => {
                // Filtre ?q= (recherche globale ⌘K) : nom ou téléphone, sans accents
                if (!q) return true;
                const norm = (s: string) =>
                  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
                const hay = norm(`${l.first_name} ${l.last_name} ${l.phone ?? ""} ${learnerRef(l.learner_no)} a${l.learner_no ?? ""}`);
                return q.trim().split(/\s+/).every((word) => hay.includes(norm(word)));
              })
              .map((l) => {
              const mine = (enrollments ?? []).filter((e) => e.learner_id === l.id && e.status === "inscrit");
              const st = stats.get(l.id);
              return (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        {l.photo_url && <AvatarImage src={l.photo_url} alt="" className="object-cover" />}
                        <AvatarFallback className="text-xs">
                          {`${l.first_name[0] ?? ""}${l.last_name[0] ?? ""}`.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span>
                        {l.first_name} {l.last_name}
                        <span className="block font-mono text-[11px] font-normal text-muted-foreground">
                          {learnerRef(l.learner_no)}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[l.phone, l.email].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell>{l.first_language ?? "—"}</TableCell>
                  <TableCell>{l.level_assessed ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {mine.length === 0 && <span className="text-sm text-muted-foreground">—</span>}
                      {mine.map((e) => (
                        <Badge key={e.id} variant="outline" asChild>
                          <Link href={`/groupes/${e.group_id}`}>
                            {(e.groups as unknown as { name: string } | null)?.name ?? "Groupe"}
                          </Link>
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {st ? (
                      <span className="text-sm">
                        {st.rate} %
                        <span className="ml-1 text-xs text-muted-foreground">({st.total})</span>
                        {st.consecutiveAbsences >= ABSENCE_ALERT_THRESHOLD && (
                          <Badge variant="destructive" className="ml-2">
                            {st.consecutiveAbsences} abs. de suite
                          </Badge>
                        )}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <PlacementTestCell learnerId={l.id} test={testByLearner.get(l.id) ?? null} />
                  </TableCell>
                  <TableCell>
                    <LearnerFormDialog
                      initial={{
                        id: l.id,
                        photoUrl: l.photo_url ?? null,
                        firstName: l.first_name,
                        lastName: l.last_name,
                        phone: l.phone ?? "",
                        email: l.email ?? "",
                        firstLanguage: l.first_language ?? "",
                        levelAssessed: l.level_assessed ?? "",
                        franceTravailId: l.france_travail_id ?? "",
                        notes: l.notes ?? "",
                        birthDate: l.birth_date ?? "",
                        gender: l.gender ?? "nc",
                        nationality: l.nationality ?? "",
                        address: l.address ?? "",
                        city: l.city ?? "",
                        postalCode: l.postal_code ?? "",
                        district: l.district ?? "nc",
                        qpv: l.qpv == null ? "nc" : l.qpv ? "oui" : "non",
                        activityStatus: l.activity_status ?? "nc",
                        rqth: l.rqth == null ? "nc" : l.rqth ? "oui" : "non",
                        educationLevel: l.education_level ?? "nc",
                        prescriber: l.prescriber ?? "",
                      }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
