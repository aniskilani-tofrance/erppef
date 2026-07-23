import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordChangeForm } from "@/components/compte/password-change-form";

export default async function ComptePage() {
  const { userId, role } = await requireSession();
  const supabase = await createClient();

  const [{ data: profile }, { data: { user } }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.auth.getUser(),
  ]);

  const roleLabel = {
    admin: "Administrateur",
    coordinator: "Coordinateur pédagogique",
    trainer: "Formateur",
    viewer: "Lecture seule",
  }[role];

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Mon compte</h1>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Nom</p>
            <p className="mt-1 font-medium">{profile?.full_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Rôle</p>
            <p className="mt-1 font-medium">{roleLabel}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
            <p className="mt-1 font-medium">{user?.email ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Changer mon mot de passe</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordChangeForm email={user?.email ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
