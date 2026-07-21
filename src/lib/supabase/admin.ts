import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Client service_role : contourne la RLS. Serveur UNIQUEMENT, et toujours après requireRole().
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
