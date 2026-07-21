import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/shell/query-provider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { role, orgId } = await requireSession();

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();

  return (
    <QueryProvider>
      <div className="flex min-h-screen">
        <AppSidebar role={role} orgName={org?.name ?? "Organisation"} />
        <main className="flex-1 overflow-x-hidden bg-muted/20 p-4 md:p-8">{children}</main>
      </div>
      <Toaster richColors position="top-right" />
    </QueryProvider>
  );
}
