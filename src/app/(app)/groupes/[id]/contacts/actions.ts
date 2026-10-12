"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { requireSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { userCanExportContacts } from "@/lib/contacts/load";

export type PhoneLinkResult = { ok: true; url: string; expiresAt: string } | { ok: false; error: string };

// Lien à usage unique (15 min) pour télécharger le .vcf directement sur le téléphone
// en scannant un QR code : la personne n'a pas besoin d'être connectée à l'ERP sur son
// téléphone. Le contenu est calculé au moment où le lien est ouvert.
export async function createContactsPhoneLink(groupId: string, mode: "tout" | "nouveaux"): Promise<PhoneLinkResult> {
  const { orgId, userId } = await requireSession();
  const admin = createAdminClient();
  if (!(await userCanExportContacts(admin, orgId, groupId, userId))) return { ok: false, error: "Accès refusé." };
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const { error } = await admin.from("group_contact_exports").insert({
    org_id: orgId,
    group_id: groupId,
    user_id: userId,
    mode: mode === "nouveaux" ? "nouveaux" : "tout",
    token,
    token_expires_at: expiresAt,
  });
  if (error) return { ok: false, error: "Impossible de créer le lien, réessayez." };
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "pef-erp.vercel.app"}`;
  return { ok: true, url: `${origin}/vcf/${token}`, expiresAt };
}
