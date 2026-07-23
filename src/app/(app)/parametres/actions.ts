"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";
import { gcalConfigured, syncTrainerCalendars, type GcalSyncStats } from "@/lib/gcal";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type GcalSyncResult = { ok: true; stats: GcalSyncStats } | { ok: false; error: string };

// Pousse toutes les séances futures vers les agendas Google des formateurs.
export async function syncGoogleCalendars(): Promise<GcalSyncResult> {
  const { orgId } = await requireRole(["admin"]);

  if (!gcalConfigured()) {
    return { ok: false, error: "Compte de service Google non configuré (variables GDRIVE_* manquantes)." };
  }

  try {
    const stats = await syncTrainerCalendars(orgId);
    return { ok: true, stats };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erreur inconnue";
    return { ok: false, error: `Synchronisation impossible : ${message}` };
  }
}

const programSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  totalHours: z.number().positive(),
  defaultWeeklyHours: z.number().positive().nullable(),
  defaultFunderId: z.string().uuid().nullable(),
  level: z.string().nullable(),
  modality: z.enum(["presentiel", "distanciel", "hybride"]),
  isActive: z.boolean(),
});

export async function upsertProgram(raw: z.infer<typeof programSchema>): Promise<ActionResult> {
  const parsed = programSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;

  const { orgId } = await requireRole(["admin"]);
  const supabase = await createClient();

  const row = {
    org_id: orgId,
    code: d.code,
    name: d.name,
    total_hours: d.totalHours,
    default_weekly_hours: d.defaultWeeklyHours,
    default_funder_id: d.defaultFunderId,
    level: d.level,
    modality: d.modality,
    is_active: d.isActive,
  };

  const { error } = d.id
    ? await supabase.from("programs").update(row).eq("id", d.id)
    : await supabase.from("programs").insert(row);

  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath("/parametres");
  return { ok: true };
}

const funderSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  code: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  isActive: z.boolean(),
});

export async function upsertFunder(raw: z.infer<typeof funderSchema>): Promise<ActionResult> {
  const parsed = funderSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;

  const { orgId } = await requireRole(["admin"]);
  const supabase = await createClient();

  const row = {
    org_id: orgId,
    name: d.name,
    code: d.code,
    color: d.color,
    is_active: d.isActive,
  };

  const { error } = d.id
    ? await supabase.from("funders").update(row).eq("id", d.id)
    : await supabase.from("funders").insert(row);

  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath("/parametres");
  revalidatePath("/planning");
  return { ok: true };
}

const closureSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Seules les fermetures propres à l'organisme sont éditables ;
// fériés et vacances scolaires sont des entrées globales (org_id NULL) gérées en central.
export async function upsertClosure(raw: z.infer<typeof closureSchema>): Promise<ActionResult> {
  const parsed = closureSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;
  if (d.endsOn < d.startsOn) return { ok: false, error: "La date de fin doit être après la date de début" };

  const { orgId } = await requireRole(["admin"]);
  const supabase = await createClient();

  const row = {
    org_id: orgId,
    kind: "fermeture_org" as const,
    zone: null,
    label: d.label,
    starts_on: d.startsOn,
    ends_on: d.endsOn,
  };

  const { error } = d.id
    ? await supabase.from("calendar_closures").update(row).eq("id", d.id)
    : await supabase.from("calendar_closures").insert(row);

  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath("/parametres");
  return { ok: true };
}

export async function deleteClosure(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Identifiant invalide" };

  const { orgId } = await requireRole(["admin"]);
  const supabase = await createClient();

  // Le filtre org_id + kind protège les entrées globales même si la RLS évoluait.
  const { error } = await supabase
    .from("calendar_closures")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId)
    .eq("kind", "fermeture_org");

  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath("/parametres");
  return { ok: true };
}
