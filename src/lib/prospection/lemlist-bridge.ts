import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLeadSettings } from "@/lib/leads/templates";
import {
  OPPOSITION_LIST_NAME,
  actionFor,
  activityMarker,
  blocklistValues,
  bridgeCampaign,
  channelOf,
  frDate,
  oppositionReason,
  type LemlistAction,
  type LemlistEvent,
  type UnsubscribeResult,
} from "@/lib/prospection/lemlist";

// Application d'un événement lemlist à l'ERP. Toutes les lectures et écritures passent par
// LemlistStore, filtrées par org_id : la version Supabase est en bas, les tests en ont une en mémoire.

export type ProspectRow = { id: string; list_id: string; company: string; status: string; phone: string | null; email: string | null; lead_id: string | null; city: string | null; postal_code: string | null };
export type LeadRow = { id: string; status: string; source: string };

export interface LemlistStore {
  alreadySeen(orgId: string, marker: string): Promise<boolean>;
  findProspect(orgId: string, by: { email: string | null; siret: string | null }): Promise<ProspectRow | null>;
  findLead(orgId: string, by: { id: string | null; email: string | null }): Promise<LeadRow | null>;
  defaultOwner(orgId: string): Promise<string | null>;
  insertLead(row: Record<string, unknown>): Promise<string>;
  updateLead(orgId: string, id: string, patch: Record<string, unknown>): Promise<void>;
  insertLeadEvent(row: Record<string, unknown>): Promise<void>;
  updateProspect(orgId: string, id: string, patch: Record<string, unknown>): Promise<void>;
  insertProspectNote(orgId: string, prospectId: string, note: string): Promise<void>;
  oppositionListId(orgId: string): Promise<string>;
  insertProspect(row: Record<string, unknown>): Promise<string>;
}

export type BridgeDeps = {
  unsubscribe: (values: string[]) => Promise<UnsubscribeResult>;
  now?: Date;
  campaign?: string;
};

export type BridgeResult = {
  action: LemlistAction | "duplicate";
  leadId?: string | null;
  prospectId?: string | null;
  createdLead?: boolean;
  blocklist?: UnsubscribeResult;
};

const FINAL = ["gagne", "perdu", "hors_cible"];

function parisDay(now: Date): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

function excerpt(text: string | null): string {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 500 ? `${t.slice(0, 500)}…` : t;
}

export async function applyLemlistEvent(store: LemlistStore, orgId: string, e: LemlistEvent, deps: BridgeDeps): Promise<BridgeResult> {
  const action = actionFor(e);
  if (action === "ignore") return { action };
  const marker = activityMarker(e.activityId);
  if (marker && (await store.alreadySeen(orgId, marker))) return { action: "duplicate" };

  const now = deps.now ?? new Date();
  const today = parisDay(now);
  const channel = channelOf(e.type);
  const tag = marker ? ` ${marker}` : "";
  const prospect = await store.findProspect(orgId, { email: e.email, siret: e.siret });
  const lead = await store.findLead(orgId, { id: prospect?.lead_id ?? null, email: e.email });

  // ── Stop / désinscription : définitif, sur tous les canaux ──
  if (action === "opposition") {
    const reason = oppositionReason(e, now);
    const note = `Opposition reçue par ${channel.label} via lemlist le ${frDate(e.at, now)}${e.text ? ` : « ${excerpt(e.text)} »` : ""}.${tag}`;
    let prospectId = prospect?.id ?? null;
    if (prospect) {
      await store.updateProspect(orgId, prospect.id, { status: "ne_plus_appeler", callback_on: null });
      await store.insertProspectNote(orgId, prospect.id, note);
    } else {
      // Pas encore dans Prospection : on l'y inscrit « Ne plus appeler » pour qu'aucune liste
      // future (collecteur, import) ne le reprenne.
      prospectId = await store.insertProspect({
        org_id: orgId,
        list_id: await store.oppositionListId(orgId),
        company: e.companyName ?? e.email?.split("@")[1] ?? "Inconnu (lemlist)",
        siret: e.siret,
        email: e.email,
        phone: e.phone,
        city: e.city,
        postal_code: e.postalCode,
        contact_source: "lemlist",
        status: "ne_plus_appeler",
        notes: note,
      });
    }
    if (lead) {
      if (lead.status !== "gagne") {
        await store.updateLead(orgId, lead.id, { status: "perdu", lost_reason: reason, next_action: null, next_action_on: null });
      }
      await store.insertLeadEvent({ org_id: orgId, lead_id: lead.id, kind: "statut", outcome: "refus", note: `Statut → perdu (${reason}). ${note}` });
    }
    const blocklist = await deps.unsubscribe(blocklistValues({ email: e.email ?? prospect?.email, phone: e.phone ?? prospect?.phone, linkedinUrl: e.linkedinUrl }));
    return { action, leadId: lead?.id ?? null, prospectId, blocklist };
  }

  // ── Rebond : adresse invalide ──
  if (action === "bounce") {
    if (prospect) {
      if (!prospect.phone && !["ne_plus_appeler", "interesse"].includes(prospect.status)) {
        await store.updateProspect(orgId, prospect.id, { status: "injoignable", callback_on: null });
      }
      await store.insertProspectNote(orgId, prospect.id, `E-mail en rebond (adresse invalide) : ${e.email ?? "?"}.${tag}`);
    }
    if (lead) await store.insertLeadEvent({ org_id: orgId, lead_id: lead.id, kind: "email", outcome: "autre", note: `E-mail lemlist en rebond : ${e.email ?? "?"}.${tag}` });
    return { action, leadId: lead?.id ?? null, prospectId: prospect?.id ?? null };
  }

  // ── Message d'absence : pas une réponse, aucun statut ──
  if (action === "absence") {
    const note = `Message d'absence reçu (${channel.label}) : décaler la séquence lemlist à son retour. « ${excerpt(e.text)} »${tag}`;
    if (prospect) await store.insertProspectNote(orgId, prospect.id, note);
    if (lead) await store.insertLeadEvent({ org_id: orgId, lead_id: lead.id, kind: "note", outcome: "autre", note });
    return { action, leadId: lead?.id ?? null, prospectId: prospect?.id ?? null };
  }

  // ── Réponse humaine ou « intéressé » : un lead à suivre, classé le jour même ──
  const nextAction = action === "interested"
    ? "Intéressé (lemlist) : envoyer le lien Calendly, appel de Shahzad sous 24 h"
    : "Classer la réponse lemlist le jour même (grille du 02/11) et préparer la réponse";
  const what = action === "interested" ? `Marqué intéressé dans lemlist (${channel.label})` : `Réponse reçue par ${channel.label} via lemlist`;
  const note = `${what}${e.campaignName ? ` — campagne lemlist « ${e.campaignName} »` : ""}${e.text ? ` : « ${excerpt(e.text)} »` : "."}${tag}`;

  let leadId: string;
  let createdLead = false;
  if (lead) {
    leadId = lead.id;
    const patch: Record<string, unknown> = { next_action: nextAction, next_action_on: today };
    if (lead.status === "nouveau") patch.status = "contacte";
    if (!FINAL.includes(lead.status)) await store.updateLead(orgId, lead.id, patch);
  } else {
    const campaign = deps.campaign ?? bridgeCampaign();
    const contactName = [e.firstName, e.lastName].filter(Boolean).join(" ") || null;
    leadId = await store.insertLead({
      org_id: orgId,
      source: "prospection", // OBLIGATOIRE : aucun e-mail ni SMS automatique de l'ERP
      campaign,
      offer: /^poei/i.test(campaign) ? "poei" : null,
      company: (e.companyName ?? prospect?.company ?? e.email ?? "Contact lemlist").slice(0, 200),
      contact_name: contactName,
      email: e.email ?? prospect?.email ?? null,
      phone: e.phone ?? prospect?.phone ?? null,
      city: e.city ?? prospect?.city ?? null,
      postal_code: e.postalCode ?? prospect?.postal_code ?? null,
      status: "contacte",
      owner_user_id: await store.defaultOwner(orgId),
      next_action: nextAction,
      next_action_on: today,
      notes: `Issu de la prospection sortante (lemlist)${e.siret ? `. SIRET : ${e.siret}` : ""}.`,
    });
    createdLead = true;
  }
  await store.insertLeadEvent({ org_id: orgId, lead_id: leadId, kind: channel.kind, outcome: null, note });

  if (prospect) {
    const patch: Record<string, unknown> = { lead_id: leadId };
    if (action === "interested" && prospect.status !== "ne_plus_appeler") {
      patch.status = "interesse";
      patch.callback_on = null;
    }
    await store.updateProspect(orgId, prospect.id, patch);
  }
  return { action, leadId, prospectId: prospect?.id ?? null, createdLead };
}

// ── Version Supabase (client service_role, org_id toujours filtré) ───────────

type Admin = SupabaseClient;

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what} : ${r.error.message}`);
  return r.data as T;
}

export function supabaseLemlistStore(admin: Admin): LemlistStore {
  const PROSPECT_COLS = "id, list_id, company, status, phone, email, lead_id, city, postal_code";
  return {
    async alreadySeen(orgId, marker) {
      const like = `%${marker}%`;
      const [a, b, c] = await Promise.all([
        admin.from("employer_lead_events").select("id", { count: "exact", head: true }).eq("org_id", orgId).like("note", like),
        admin.from("prospect_calls").select("id", { count: "exact", head: true }).eq("org_id", orgId).like("note", like),
        admin.from("prospects").select("id", { count: "exact", head: true }).eq("org_id", orgId).like("notes", like),
      ]);
      return Boolean((a.count ?? 0) + (b.count ?? 0) + (c.count ?? 0));
    },
    async findProspect(orgId, by) {
      if (by.siret) {
        const r = await admin.from("prospects").select(PROSPECT_COLS).eq("org_id", orgId).eq("siret", by.siret).maybeSingle();
        if (r.data) return r.data as ProspectRow;
      }
      if (by.email) {
        const r = await admin.from("prospects").select(PROSPECT_COLS).eq("org_id", orgId).ilike("email", by.email).order("created_at", { ascending: false }).limit(1);
        if (r.data?.[0]) return r.data[0] as ProspectRow;
      }
      return null;
    },
    async findLead(orgId, by) {
      if (by.id) {
        const r = await admin.from("employer_leads").select("id, status, source").eq("org_id", orgId).eq("id", by.id).maybeSingle();
        if (r.data) return r.data as LeadRow;
      }
      if (by.email) {
        const r = await admin.from("employer_leads").select("id, status, source").eq("org_id", orgId).ilike("email", by.email).order("received_at", { ascending: false }).limit(1);
        if (r.data?.[0]) return r.data[0] as LeadRow;
      }
      return null;
    },
    async defaultOwner(orgId) {
      const r = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
      return resolveLeadSettings(r.data?.settings).defaultOwnerUserId || null;
    },
    async insertLead(row) {
      return must(await admin.from("employer_leads").insert(row).select("id").single(), "Création du lead").id as string;
    },
    async updateLead(orgId, id, patch) {
      must(await admin.from("employer_leads").update(patch).eq("id", id).eq("org_id", orgId), "Mise à jour du lead");
    },
    async insertLeadEvent(row) {
      must(await admin.from("employer_lead_events").insert(row), "Journal du lead");
    },
    async updateProspect(orgId, id, patch) {
      must(await admin.from("prospects").update(patch).eq("id", id).eq("org_id", orgId), "Mise à jour du prospect");
    },
    async insertProspectNote(orgId, prospectId, note) {
      // « note » ne compte pas comme une tentative d'appel (trigger bump_prospect_call).
      must(await admin.from("prospect_calls").insert({ org_id: orgId, prospect_id: prospectId, outcome: "note", note }), "Note du prospect");
    },
    async oppositionListId(orgId) {
      const r = await admin.from("prospect_lists").select("id").eq("org_id", orgId).eq("name", OPPOSITION_LIST_NAME).limit(1);
      if (r.data?.[0]) return r.data[0].id as string;
      return must(
        await admin.from("prospect_lists").insert({ org_id: orgId, name: OPPOSITION_LIST_NAME, description: "Créée par le pont lemlist : oppositions reçues hors listes d'appel. À ne jamais supprimer." }).select("id").single(),
        "Liste des oppositions",
      ).id as string;
    },
    async insertProspect(row) {
      return must(await admin.from("prospects").insert(row).select("id").single(), "Création du prospect").id as string;
    },
  };
}
