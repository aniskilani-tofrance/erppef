"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSignupOrg } from "@/lib/inscription/org";
import { provenanceFromSignupSource } from "@/lib/admission/sources";
import { toWhatsAppNumber } from "@/lib/admission/phone";
import { sanitizeSrc } from "@/lib/inscription/link";
import type { SignupErrorCode } from "@/lib/inscription/i18n";
import {
  buildSignupNote,
  checkStamp,
  firstLanguageOf,
  parseSignup,
  readSignupForm,
  stampSecret,
} from "@/lib/inscription/signup";

// Inscription rapide PUBLIQUE (/inscription), sans compte : la personne remplit le
// formulaire reçu sur WhatsApp et arrive dans l'onglet Admission (« À contacter »,
// statut « nouveau »). Écriture côté serveur uniquement (client service_role) ;
// l'organisation est choisie par le serveur (jamais le bac à sable).

export type SignupValues = {
  firstName: string;
  lastName: string;
  phone: string;
  languages: string[];
  french: string;
  availability: string[];
  city: string;
  consent: boolean;
};

export type SignupState =
  | { status: "idle" }
  | { status: "done" }
  | { status: "error"; error: SignupErrorCode; values: SignupValues };

// Au-delà, on suspend (robot ou lien diffusé par erreur) : 30 inscriptions en 10 minutes.
const FLOOD_WINDOW_MS = 10 * 60_000;
const FLOOD_MAX = 30;
const NOTE_PREFIX = "Inscription formulaire";

function valuesOf(fd: FormData): SignupValues {
  const str = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v.slice(0, 120) : "";
  };
  return {
    firstName: str("firstName"),
    lastName: str("lastName"),
    phone: str("phone"),
    languages: fd.getAll("languages").filter((v): v is string => typeof v === "string"),
    french: str("french"),
    availability: fd.getAll("availability").filter((v): v is string => typeof v === "string"),
    city: str("city"),
    consent: fd.get("consent") === "on",
  };
}

// Colonnes ajoutées par la migration 0051 : si elle n'est pas encore appliquée, on
// enregistre quand même la fiche (la note du journal garde tout).
const isMissingColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist|schema cache/i.test(e.message ?? ""));

export async function submitSignup(_prev: SignupState, fd: FormData): Promise<SignupState> {
  // Champ piège invisible rempli, ou formulaire envoyé sans être affiché / trop vite :
  // un robot. On répond « merci » sans rien enregistrer (il ne doit pas apprendre).
  const honeypot = fd.get("website");
  if (typeof honeypot === "string" && honeypot.trim()) return { status: "done" };
  const stamp = checkStamp(fd.get("t"), Date.now(), stampSecret());
  if (stamp !== "ok") {
    console.warn(`[inscription] envoi ignoré (${stamp})`);
    return { status: "done" };
  }

  const parsed = parseSignup(readSignupForm(fd));
  if (!parsed.ok) return { status: "error", error: parsed.error, values: valuesOf(fd) };
  const d = parsed.data;

  const org = await resolveSignupOrg(typeof fd.get("o") === "string" ? (fd.get("o") as string) : null);
  if (!org) return { status: "error", error: "link", values: valuesOf(fd) };

  const src = sanitizeSrc(typeof fd.get("src") === "string" ? (fd.get("src") as string) : null);
  const admin = createAdminClient();

  // Afflux anormal : on n'écrit plus rien (l'équipe garde la main).
  const since = new Date(Date.now() - FLOOD_WINDOW_MS).toISOString();
  const { count } = await admin
    .from("learner_contacts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.id)
    .gte("contacted_at", since)
    .like("note", `${NOTE_PREFIX}%`);
  if ((count ?? 0) >= FLOOD_MAX) {
    console.warn(`[inscription] afflux suspendu (${count} en 10 min)`);
    return { status: "error", error: "server", values: valuesOf(fd) };
  }

  // Même téléphone déjà connu dans l'organisme : pas de doublon, une ligne au journal.
  const { data: known, error: knownError } = await admin
    .from("learners")
    .select("id, phone, admission_status, created_at")
    .eq("org_id", org.id)
    .not("phone", "is", null)
    .order("created_at", { ascending: false });
  if (knownError) return { status: "error", error: "server", values: valuesOf(fd) };
  const existing = (known ?? []).find((l) => toWhatsAppNumber(l.phone as string) === d.phoneDigits);

  if (existing) {
    const { error } = await admin.from("learner_contacts").insert({
      org_id: org.id,
      learner_id: existing.id,
      channel: "whatsapp",
      outcome: "autre",
      note: buildSignupNote(d, { reinscription: true, src }),
    });
    if (error) return { status: "error", error: "server", values: valuesOf(fd) };
    // Dossier clos qui revient de lui-même : il reprend le parcours (« À contacter »).
    if (existing.admission_status === "sans_suite") {
      await admin.from("learners").update({ admission_status: "nouveau" }).eq("id", existing.id);
    }
    revalidatePath("/apprenants", "layout");
    return { status: "done" };
  }

  const provenance = provenanceFromSignupSource(src);
  const base = {
    org_id: org.id,
    first_name: d.firstName,
    last_name: d.lastName,
    phone: d.phone,
    city: d.city,
    first_language: firstLanguageOf(d.languages),
    admission_status: "nouveau",
    contact_source: provenance.contact_source,
    contact_source_detail: provenance.contact_source_detail,
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
    return { status: "error", error: "server", values: valuesOf(fd) };
  }

  await admin.from("learner_contacts").insert({
    org_id: org.id,
    learner_id: created.id,
    channel: "whatsapp",
    outcome: "autre",
    note: buildSignupNote(d, { src }),
  });
  // Pas de niveau connu → test de positionnement prêt à envoyer (comme une fiche créée à la main).
  await admin
    .from("placement_tests")
    .insert({ org_id: org.id, learner_id: created.id })
    .then(() => undefined, () => undefined);

  revalidatePath("/apprenants", "layout");
  return { status: "done" };
}
