import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { LearnerFormDialog } from "@/components/apprenants/learner-form-dialog";

export default async function ApprenantsPage() {
  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const [{ data: learners }, { data: enrollments }, { data: groups }] = await Promise.all([
    supabase.from("learners").select("*").order("last_name").order("first_name"),
    supabase.from("enrollments").select("id, learner_id, group_id, status, groups(name)"),
    supabase.from("groups").select("id, name").in("status", ["en_attente", "ouvert"]).order("starts_on", { ascending: false }),
  ]);

  const groupOptions = (groups ?? []).map((g) => ({ id: g.id, name: g.name }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Apprenants</h1>
        <LearnerFormDialog groups={groupOptions} />
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
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(learners ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Aucun apprenant. Créez le premier avec « Nouvel apprenant » — vous pourrez
                  l&apos;inscrire dans un groupe au passage.
                </TableCell>
              </TableRow>
            )}
            {(learners ?? []).map((l) => {
              const mine = (enrollments ?? []).filter((e) => e.learner_id === l.id && e.status === "inscrit");
              return (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">
                    {l.first_name} {l.last_name}
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
                    <LearnerFormDialog
                      initial={{
                        id: l.id,
                        firstName: l.first_name,
                        lastName: l.last_name,
                        phone: l.phone ?? "",
                        email: l.email ?? "",
                        firstLanguage: l.first_language ?? "",
                        levelAssessed: l.level_assessed ?? "",
                        franceTravailId: l.france_travail_id ?? "",
                        notes: l.notes ?? "",
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
