import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function ParametresPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: org }, { data: funders }, { data: programs }, { data: members }] = await Promise.all([
    supabase.from("organizations").select("*").single(),
    supabase.from("funders").select("*").order("name"),
    supabase.from("programs").select("*, funders(name)").order("name"),
    supabase.from("memberships").select("role, profiles(full_name)"),
  ]);

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
        <CardHeader>
          <CardTitle className="text-base">Financeurs et couleurs du planning</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(funders ?? []).map((f) => (
            <Badge key={f.id} style={{ backgroundColor: f.color, color: "white" }}>
              {f.name}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catalogue des dispositifs</CardTitle>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {(programs ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{Number(p.total_hours)} h</TableCell>
                  <TableCell>{p.default_weekly_hours ? `${Number(p.default_weekly_hours)} h/sem` : "—"}</TableCell>
                  <TableCell>{p.level ?? "—"}</TableCell>
                  <TableCell>{(p.funders as unknown as { name: string } | null)?.name ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Utilisateurs</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {(members ?? []).map((m, i) => (
              <li key={i} className="flex items-center gap-2">
                <span>{(m.profiles as unknown as { full_name: string } | null)?.full_name ?? "—"}</span>
                <Badge variant="outline">{roleLabel(m.role)}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Les invitations par email arrivent avec la gestion des utilisateurs (prochaine itération).
          </p>
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

function roleLabel(role: string): string {
  return (
    {
      admin: "Administrateur",
      coordinator: "Coordinateur",
      trainer: "Formateur",
      viewer: "Lecture seule",
    }[role] ?? role
  );
}
