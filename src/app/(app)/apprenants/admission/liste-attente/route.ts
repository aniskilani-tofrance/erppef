import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildWaitlistCsv, waitlistFileName, type WaitlistContact, type WaitlistLearner } from "@/lib/admission/waitlist-export";

// Liste d'attente en tableur (Admission → carte « Liste d'attente » → « Exporter (tableur) »).
// Admin et coordination ; seulement l'organisme de la personne connectée.
export async function GET() {
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { data: learners, error } = await supabase
    .from("learners")
    .select("id, first_name, last_name, learner_no, phone, email, level_assessed, created_at, contact_source, contact_source_detail, prescriber")
    .eq("org_id", orgId)
    .eq("admission_status", "liste_attente")
    .order("created_at", { ascending: true });
  if (error) return new Response("Export impossible, réessayez.", { status: 500 });
  const ids = (learners ?? []).map((l) => l.id as string);
  const { data: contacts } = ids.length
    ? await supabase.from("learner_contacts").select("learner_id, contacted_at, reason").eq("org_id", orgId).in("learner_id", ids)
    : { data: [] };
  const csv = buildWaitlistCsv((learners ?? []) as WaitlistLearner[], (contacts ?? []) as WaitlistContact[]);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${waitlistFileName()}"`,
      "Cache-Control": "no-store",
    },
  });
}
