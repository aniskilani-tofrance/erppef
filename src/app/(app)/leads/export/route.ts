import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LEAD_COLUMNS, loadOwners, ownerName, todayParis, type LeadRow } from "@/lib/leads/queries";
import { leadsToCsv } from "@/lib/leads/csv";

// Export CSV aux colonnes du Google Sheet de suivi (puis les colonnes propres à l'ERP).
export async function GET() {
  const { orgId } = await requireRole(["admin", "coordinator", "setter"]);
  const supabase = await createClient();
  const [{ data }, owners] = await Promise.all([
    supabase.from("employer_leads").select(LEAD_COLUMNS).order("received_at", { ascending: false }).limit(5000),
    loadOwners(supabase, orgId),
  ]);
  const leads = (data ?? []) as unknown as LeadRow[];
  const csv = leadsToCsv(leads.map((l) => ({ ...l, owner_name: ownerName(owners, l.owner_user_id) })));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-restaurateurs-${todayParis()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
