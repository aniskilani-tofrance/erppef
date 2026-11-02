"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLASS_SIGNING_ERRORS, loadClassSigning, startClassSigning } from "@/lib/documents-apprenant/serveur";
import { fetchSigningPage, type SigningPage } from "@/app/signer/[token]/actions";

// Page PUBLIQUE « Documents à signer » de la classe (/signer/classe/<jeton d'émargement>) :
// aucune session. Le jeton de la feuille d'émargement ouverte est le secret ; chaque action le
// revalide. La signature elle-même passe par la page personnelle (signDocuments).

export type ClassLearner = { id: string; name: string; photoUrl: string | null; pending: number };

export type ClassSheet =
  | { ok: false; error: string }
  | { ok: true; groupName: string; startsAt: string; endsAt: string; learners: ClassLearner[] };

export async function fetchClassSheet(token: string): Promise<ClassSheet> {
  const cls = await loadClassSigning(createAdminClient(), token);
  if (!cls.ok) return { ok: false, error: CLASS_SIGNING_ERRORS[cls.reason] };
  return {
    ok: true,
    groupName: cls.groupName,
    startsAt: cls.startsAt,
    endsAt: cls.endsAt,
    learners: cls.learners.map((l) => ({ id: l.learnerId, name: l.name, photoUrl: l.photoUrl, pending: l.pending.length })),
  };
}

const openSchema = z.object({ token: z.string().uuid(), learnerId: z.string().uuid() });

export type OpenLearnerResult = { ok: true; signingToken: string; page: Extract<SigningPage, { ok: true }> } | { ok: false; error: string };

/** Un nom touché : session tablette de la personne (2 heures, refermée à la signature) et ses textes. */
export async function openLearnerSigning(raw: z.infer<typeof openSchema>): Promise<OpenLearnerResult> {
  const parsed = openSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Lien invalide." };
  const started = await startClassSigning(createAdminClient(), parsed.data.token, parsed.data.learnerId);
  if (!started.ok) return started;
  const page = await fetchSigningPage(started.token);
  if (!page.ok) return { ok: false, error: page.error };
  return { ok: true, signingToken: started.token, page };
}
