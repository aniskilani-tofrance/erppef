import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/auth";

// Invitation d'un utilisateur : compte auth Supabase (email d'invitation avec lien
// « définir mon mot de passe » → /auth/bienvenue) + membership qui porte le rôle.
// Le hook JWT custom_access_token lira le membership à la connexion.
// À appeler UNIQUEMENT après requireRole (client service_role).

export type InviteResult =
  | { ok: true; alreadyHadAccount: boolean }
  | { ok: false; error: string };

async function baseUrl(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${h.get("host")}`;
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const admin = createAdminClient();
  // Pas de recherche par email dans l'API admin : on parcourt (volumes très faibles ici).
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

export async function inviteUser(opts: {
  orgId: string;
  email: string;
  fullName: string;
  role: AppRole;
  trainerId?: string | null;
}): Promise<InviteResult> {
  const admin = createAdminClient();
  const email = opts.email.trim().toLowerCase();

  let userId: string | null = null;
  let alreadyHadAccount = false;

  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${await baseUrl()}/auth/bienvenue`,
    data: { full_name: opts.fullName },
  });

  if (invited?.user) {
    userId = invited.user.id;
  } else if (error) {
    // Compte déjà existant : on rattache simplement le membership.
    userId = await findUserIdByEmail(email);
    if (!userId) return { ok: false, error: `Invitation impossible : ${error.message}` };
    alreadyHadAccount = true;
  }

  const { error: membershipError } = await admin.from("memberships").upsert(
    {
      org_id: opts.orgId,
      user_id: userId!,
      role: opts.role,
      trainer_id: opts.trainerId ?? null,
    },
    { onConflict: "org_id,user_id" },
  );
  if (membershipError) return { ok: false, error: membershipError.message };

  return { ok: true, alreadyHadAccount };
}
