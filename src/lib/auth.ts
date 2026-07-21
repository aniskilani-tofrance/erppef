import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "coordinator" | "trainer" | "viewer";

export type SessionContext = {
  userId: string;
  orgId: string;
  role: AppRole;
};

// Lit la session et les claims JWT (org_id + app_role injectés par le hook custom_access_token).
// Redirige vers /login si non connecté, /sans-organisation si aucun membership.
export async function requireSession(): Promise<SessionContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  const claims = token ? decodeJwtPayload(token) : null;
  const orgId = claims?.org_id as string | undefined;
  const role = claims?.app_role as AppRole | undefined;

  if (!orgId || !role) redirect("/sans-organisation");

  return { userId: user.id, orgId, role };
}

// Toute Server Action d'écriture commence par requireRole([...]).
export async function requireRole(allowed: AppRole[]): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!allowed.includes(ctx.role)) {
    throw new Error("Accès refusé : votre rôle ne permet pas cette action.");
  }
  return ctx;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
