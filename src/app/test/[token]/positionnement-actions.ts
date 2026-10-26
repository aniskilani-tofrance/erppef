"use server";

// Actions PUBLIQUES du test de positionnement (version ToFrance) : le jeton du lien est le
// secret, comme l'ancien test. Elles remplacent la fonction edge « positionnement » de ToFrance
// (ouvrir, répondre, terminer). Les tests de mi-parcours et finale passent par actions.ts.

import { z } from "zod";
import { depotSupabase } from "@/lib/positionnement/depot-supabase";
import { appelIAPositionnement } from "@/lib/positionnement/ia";
import {
  ouvrirTest, repondreTest, terminerTest, type Dependances, type EtapeTest, type ResultatTest,
} from "@/lib/positionnement/service";

function dependances(): Dependances {
  return { depot: depotSupabase(), appelIA: appelIAPositionnement() };
}

const token = z.string().uuid();
const reponses = z.record(z.string().regex(/^\d{1,4}$/), z.string().max(5000)).refine((r) => Object.keys(r).length <= 20);
const langue = z.string().max(5).optional();
const secondes = z.number().min(0).max(24 * 3600).optional();

/** État du test et prochaines questions (lecture seule). null : lien inconnu. */
export async function ouvrirPositionnement(raw: string): Promise<EtapeTest | null> {
  if (!token.safeParse(raw).success) return null;
  return ouvrirTest(dependances(), raw);
}

const repondreSchema = z.object({ token, reponses, secondes, langue });

export async function repondrePositionnement(raw: z.infer<typeof repondreSchema>): Promise<ResultatTest> {
  const p = repondreSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: "Réponses invalides." };
  try {
    return await repondreTest(dependances(), p.data.token, p.data.reponses, { secondes: p.data.secondes, langue: p.data.langue });
  } catch (e) {
    console.error(`[positionnement] réponse non enregistrée : ${e instanceof Error ? e.message : e}`);
    return { ok: false, error: "Enregistrement impossible, réessayez." };
  }
}

const terminerSchema = z.object({ token, secondes, langue, interfaceAbandon: z.boolean().optional() });

export async function terminerPositionnement(raw: z.infer<typeof terminerSchema>): Promise<ResultatTest> {
  const p = terminerSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: "Requête invalide." };
  try {
    return await terminerTest(dependances(), p.data.token, p.data);
  } catch (e) {
    console.error(`[positionnement] clôture non enregistrée : ${e instanceof Error ? e.message : e}`);
    return { ok: false, error: "Enregistrement impossible, réessayez." };
  }
}
