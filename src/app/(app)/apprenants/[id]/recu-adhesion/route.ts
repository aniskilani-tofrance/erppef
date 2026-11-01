import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAssociationSignature } from "@/lib/signature-association";
import { buildMembershipReceiptPdf, receiptFileName } from "@/lib/documents-apprenant/pdf";
import { receiptNumber, type PaymentMethod } from "@/lib/documents-apprenant/regles";
import { isUuid, learnerForText } from "@/lib/documents-apprenant/serveur";
import { learnerFullName, learnerIdentityLines } from "@/lib/documents-apprenant/textes";

// Reçu de cotisation (PDF) d'une année d'adhésion payée : ?annee=2026. Admin et coordination.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const year = Number(new URL(request.url).searchParams.get("annee"));
  if (!isUuid(id) || !Number.isInteger(year) || year < 2020 || year > 2100) return new Response("Paramètres invalides", { status: 400 });
  const supabase = await createClient();
  const [{ data: learner }, { data: m, error }] = await Promise.all([
    supabase
      .from("learners")
      .select("id, org_id, first_name, last_name, birth_date, gender, address, postal_code, city, phone, email, learner_no")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase
      .from("learner_memberships")
      .select("amount_cents, paid, paid_on, payment_method, receipt_no")
      .eq("learner_id", id)
      .eq("org_id", orgId)
      .eq("membership_year", year)
      .maybeSingle(),
  ]);
  if (error) return new Response("Fonction pas encore activée : migration 0059 à appliquer.", { status: 503 });
  if (!learner) return new Response("Apprenant introuvable", { status: 404 });
  if (!m?.paid || !m.paid_on) return new Response("Cotisation non payée pour cette année : pas de reçu.", { status: 400 });

  const lt = learnerForText(learner as Parameters<typeof learnerForText>[0]);
  const receiptNo = (m.receipt_no as string | null) ?? receiptNumber(year, learner.learner_no as number | null, id);
  const pdf = await buildMembershipReceiptPdf({
    receiptNo,
    learnerName: learnerFullName(lt),
    identity: learnerIdentityLines(lt),
    year,
    amountCents: Number(m.amount_cents),
    paidOn: m.paid_on as string,
    method: m.payment_method as PaymentMethod | null,
    associationSignature: await loadAssociationSignature(createAdminClient(), orgId),
  });
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${receiptFileName(receiptNo, learnerFullName(lt))}"`,
    },
  });
}
