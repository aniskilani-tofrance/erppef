import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ProgramFormDialog } from "@/components/parametres/program-form-dialog";
import { FunderFormDialog } from "@/components/parametres/funder-form-dialog";
import { ClosureManager } from "@/components/parametres/closure-manager";
import { GcalSyncCard } from "@/components/parametres/gcal-sync-card";
import { UsersManager } from "@/components/parametres/users-manager";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function ParametresPage() {
  const { orgId, userId } = await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: org }, { data: funders }, { data: programs }, { data: members }, { data: closures }] =
    await Promise.all([
      supabase.from("organizations").select("*").single(),
      supabase.from("funders").select("*").order("name"),
      supabase.from("programs").select("*, funders(name)").order("name"),
      supabase.from("memberships").select("id, user_id, role, trainer_id, profiles(full_name)"),
      supabase
        .from("calendar_closures")
        .select("id, label, starts_on, ends_on")
        .eq("org_id", orgId)
        .eq("kind", "fermeture_org")
        .order("starts_on"),
    ]);

  // Les emails vivent dans auth.users : accessibles via l'API admin uniquement (page admin).
  const { data: authUsers } = await createAdminClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? null]));

  const memberRows = (members ?? [])
    .map((m) => ({
      membershipId: m.id,
      name: (m.profiles as unknown as { full_name: string } | null)?.full_name ?? "—",
      email: emailById.get(m.user_id) ?? null,
      role: m.role as "admin" | "coordinator" | "trainer" | "viewer",
      isSelf: m.user_id === userId,
      trainerLinked: Boolean(m.trainer_id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const funderOptions = (funders ?? []).map((f) => ({ id: f.id, name: f.name }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organisation</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Info label="Nom" value={org?.name ?? "—"} />
          <Info label="Fuseau horaire" value={org?.timezone ?? "—"} />
          <Info label="Zone de vacances scolaires" value={org?.school_holiday_zone ?? "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Financeurs et couleurs du planning</CardTitle>
          <FunderFormDialog />
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {(funders ?? []).map((f) => (
              <li key={f.id} className="flex items-center gap-2">
                <Badge style={{ backgroundColor: f.color, color: "white" }}>{f.name}</Badge>
                <span className="text-xs text-muted-foreground">{f.code}</span>
                {!f.is_active && <Badge variant="outline">Inactif</Badge>}
                <FunderFormDialog
                  initial={{ id: f.id, name: f.name, code: f.code, color: f.color, isActive: f.is_active }}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Catalogue des dispositifs</CardTitle>
          <ProgramFormDialog funders={funderOptions} />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dispositif</TableHead>
                <TableHead>Volume</TableHead>
                <TableHead>Rythme</TableHead>
                <TableHead>Niveau</TableHead>
                <TableHead>Financeur par défaut</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(programs ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.name}
                    {!p.is_active && (
                      <Badge variant="outline" className="ml-2">Inactif</Badge>
                    )}
                  </TableCell>
                  <TableCell>{Number(p.total_hours)} h</TableCell>
                  <TableCell>{p.default_weekly_hours ? `${Number(p.default_weekly_hours)} h/sem` : "—"}</TableCell>
                  <TableCell>{p.level ?? "—"}</TableCell>
                  <TableCell>{(p.funders as unknown as { name: string } | null)?.name ?? "—"}</TableCell>
                  <TableCell>
                    <ProgramFormDialog
                      funders={funderOptions}
                      initial={{
                        id: p.id,
                        code: p.code,
                        name: p.name,
                        totalHours: String(Number(p.total_hours)),
                        defaultWeeklyHours: p.default_weekly_hours ? String(Number(p.default_weekly_hours)) : "",
                        defaultFunderId: p.default_funder_id ?? "none",
                        level: p.level ?? "none",
                        modality: p.modality,
                        isActive: p.is_active,
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fermetures de l&apos;organisme</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ClosureManager
            closures={(closures ?? []).map((c) => ({
              id: c.id,
              label: c.label,
              startsOn: c.starts_on,
              endsOn: c.ends_on,
            }))}
          />
          <p className="text-xs text-muted-foreground">
            Les jours fériés et vacances scolaires (zone {org?.school_holiday_zone ?? "C"}) sont fournis
            automatiquement et déjà pris en compte par le moteur de planification.
          </p>
        </CardContent>
      </Card>

      <GcalSyncCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Utilisateurs et rôles</CardTitle>
        </CardHeader>
        <CardContent>
          <UsersManager members={memberRows} />
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
