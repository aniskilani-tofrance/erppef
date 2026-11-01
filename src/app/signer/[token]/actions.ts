"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { SIGNED_DOCUMENT_KINDS, retractationDeadline, type SignedDocumentKind, type SigningChannel } from "@/lib/documents-apprenant/regles";
import { LINK_ERRORS, completeSignature, loadSigningContext, textsFor } from "@/lib/documents-apprenant/serveur";
import type { DocumentText } from "@/lib/documents-apprenant/textes";

// Page PUBLIQUE de signature (/signer/<jeton>) : aucune session. Le jeton est le secret ;
// chaque action le revalide avant de toucher la base (client service_role). La page ne
// renvoie que la personne du lien : son prénom et son nom, son groupe, les textes à signer.

export type SigningPage =
  | { ok: false; error: string }
  | {
      ok: true;
      firstName: string;
      fullName: string;
      groupName: string;
      channel: SigningChannel;
      texts: DocumentText[]; // documents encore à signer
      signedKinds: SignedDocumentKind[]; // déjà signés (copie téléchargeable)
      retractationUntil: string | null; // si le contrat est à signer aujourd'hui
    };

export async function fetchSigningPage(token: string): Promise<SigningPage> {
  const lookup = await loadSigningContext(createAdminClient(), token);
  if (!lookup.ok) return { ok: false, error: LINK_ERRORS[lookup.reason] };
  const { ctx } = lookup;
  return {
    ok: true,
    firstName: ctx.learner.firstName === "?" ? "" : ctx.learner.firstName,
    fullName: ctx.learnerName,
    groupName: ctx.group.name,
    channel: ctx.channel,
    texts: textsFor(ctx, ctx.pending),
    signedKinds: SIGNED_DOCUMENT_KINDS.filter((k) => ctx.states[k].state === "signe"),
    retractationUntil: ctx.pending.includes("contrat_formation") ? retractationDeadline(new Date().toISOString(), ctx.channel) : null,
  };
}

const signSchema = z.object({
  token: z.string().uuid(),
  accepted: z.array(z.enum(SIGNED_DOCUMENT_KINDS)).min(1).max(3),
  signature: z.string().startsWith("data:image/png;base64,").max(300_000),
});

export type SignDocumentsResult = { ok: true; signed: SignedDocumentKind[] } | { ok: false; error: string };

export async function signDocuments(raw: z.infer<typeof signSchema>): Promise<SignDocumentsResult> {
  const parsed = signSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Signature invalide. Signez de nouveau dans le cadre." };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return completeSignature(createAdminClient(), {
    token: parsed.data.token,
    accepted: parsed.data.accepted,
    signature: parsed.data.signature,
    ip: ip?.slice(0, 64) ?? null,
    userAgent: h.get("user-agent")?.slice(0, 255) ?? null,
  });
}
