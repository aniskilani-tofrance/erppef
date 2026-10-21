import { createAdminClient } from "@/lib/supabase/admin";
import { toWhatsAppNumber } from "@/lib/admission/phone";
import { buildSignupNote, firstLanguageOf, type SignupData } from "@/lib/inscription/signup";

// Enregistrement d'une inscription rapide, commun au formulaire /inscription (Server
// Action) et à l'API publique /api/inscription (formulaire du site). Serveur uniquement :
// écrit avec le client service_role, toujours filtré par org_id.
//
//   • afflux anormal (FLOOD_MAX en FLOOD_WINDOW_MS) → on n'écrit plus rien ;
//   • même téléphone déjà connu dans l'organisme → pas de doublon, une ligne au journal
//     (et un dossier « sans suite » reprend le parcours) ;
//   • sinon → fiche « nouveau » dans Admission (« À contacter »), note au journal,
//     test de positionnement prêt à envoyer.

export const FLOOD_WINDOW_MS = 10 * 60_000;
export const FLOOD_MAX = 30;
export const NOTE_PREFIX = "Inscription formulaire";

export type SignupProvenance = { contact_source: string; contact_source_detail: string | null };

export type RegisterResult =
  | { ok: true; learnerId: string; reinscription: boolean }
  | { ok: false; error: "flood" | "server" };

type Admin = ReturnType<typeof createAdminClient>;

// Colonnes ajoutées par la migration 0051 : si elle n'est pas encore appliquée, on
// enregistre quand même la fiche (la note du journal garde tout).
export const isMissingColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist|schema cache/i.test(e.message ?? ""));

export async function registerSignup(
  admin: Admin,
  orgId: string,
  d: SignupData,
  opts: { src: string | null; provenance: SignupProvenance },
): Promise<RegisterResult> {
  // Afflux anormal : on n'écrit plus rien (l'équipe garde la main).
  const since = new Date(Date.now() - FLOOD_WINDOW_MS).toISOString();
  const { count } = await admin
    .from("learner_contacts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("contacted_at", since)
    .like("note", `${NOTE_PREFIX}%`);
  if ((count ?? 0) >= FLOOD_MAX) {
    console.warn(`[inscription] afflux suspendu (${count} en 10 min)`);
    return { ok: false, error: "flood" };
  }

  // Même téléphone déjà connu dans l'organisme : pas de doublon, une ligne au journal.
  const { data: known, error: knownError } = await admin
    .from("learners")
    .select("id, phone, admission_status, created_at")
    .eq("org_id", orgId)
    .not("phone", "is", null)
    .order("created_at", { ascending: false });
  if (knownError) return { ok: false, error: "server" };
  const existing = (known ?? []).find((l) => toWhatsAppNumber(l.phone as string) === d.phoneDigits);

  if (existing) {
    const { error } = await admin.from("learner_contacts").insert({
      org_id: orgId,
      learner_id: existing.id,
      channel: "whatsapp",
      outcome: "autre",
      note: buildSignupNote(d, { reinscription: true, src: opts.src }),
    });
    if (error) return { ok: false, error: "server" };
    // Dossier clos qui revient de lui-même : il reprend le parcours (« À contacter »).
    if (existing.admission_status === "sans_suite") {
      await admin.from("learners").update({ admission_status: "nouveau" }).eq("id", existing.id).eq("org_id", orgId);
    }
    return { ok: true, learnerId: existing.id as string, reinscription: true };
  }

  const base = {
    org_id: orgId,
    first_name: d.firstName,
    last_name: d.lastName,
    phone: d.phone,
    city: d.city,
    first_language: firstLanguageOf(d.languages),
    admission_status: "nouveau",
    contact_source: opts.provenance.contact_source,
    contact_source_detail: opts.provenance.contact_source_detail,
  };
  const declared = {
    spoken_languages: d.languages,
    french_self_level: d.french,
    availability: d.availability,
    data_consent_at: new Date().toISOString(),
  };

  let { data: created, error } = await admin.from("learners").insert({ ...base, ...declared }).select("id").single();
  if (isMissingColumn(error)) {
    console.warn("[inscription] migration 0051 absente : fiche créée sans les colonnes déclaratives");
    ({ data: created, error } = await admin.from("learners").insert(base).select("id").single());
  }
  if (error || !created) {
    console.error(`[inscription] création impossible : ${error?.message}`);
    return { ok: false, error: "server" };
  }

  await admin.from("learner_contacts").insert({
    org_id: orgId,
    learner_id: created.id,
    channel: "whatsapp",
    outcome: "autre",
    note: buildSignupNote(d, { src: opts.src }),
  });
  // Pas de niveau connu → test de positionnement prêt à envoyer (comme une fiche créée à la main).
  await admin
    .from("placement_tests")
    .insert({ org_id: orgId, learner_id: created.id })
    .then(() => undefined, () => undefined);

  return { ok: true, learnerId: created.id as string, reinscription: false };
}
