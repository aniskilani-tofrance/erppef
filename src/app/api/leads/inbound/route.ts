import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/mailer";
import { normalizeInbound, type InboundCalendly, type InboundLead } from "@/lib/leads/inbound";
import { toWhatsAppNumber } from "@/lib/admission/phone";
import { resolveLeadSettings, type LeadSettings } from "@/lib/leads/templates";
import { leadRef, sourceLabel } from "@/lib/leads/status";
import {
  BREVO_LEAD_EVENTS,
  cancelBrevoScheduledEmail,
  dispatchBrevoLeadEvent,
  scheduleBrevoAppointmentReminders,
  type AppointmentReminderKind,
  type LeadForBrevo,
} from "@/lib/leads/brevo";
import { dispatchTwilioLeadSms } from "@/lib/leads/twilio";

// Point d'entrée des leads : POST /api/leads/inbound?token=<jeton de l'organisation>
// Accepte JSON ou formulaire (Brevo, Make/Meta, landing Manus, Calendly). Le jeton
// (Leads → Réglages) identifie l'organisation ; il n'y a pas de session utilisateur.
// Doublon (même email ou même téléphone sous 30 jours) : on note l'événement, on ne
// recrée pas la fiche. Chaque nouveau lead : fiche « Nouveau », attribuée au setter par
// défaut, email de notification « à rappeler sous 24 h ».

export const dynamic = "force-dynamic";

const BASE_URL = "https://pef-erp.vercel.app";

function tokenOf(req: NextRequest): string | null {
  const q = req.nextUrl.searchParams.get("token");
  if (q) return q;
  const h = req.headers.get("x-leads-token");
  if (h) return h;
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

type Org = { id: string; name: string; settings: unknown };

async function findOrg(token: string | null): Promise<Org | null> {
  if (!token || token.length < 16) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("organizations").select("id, name, settings").eq("settings->leads->>inboundToken", token).maybeSingle();
  return (data as Org | null) ?? null;
}

async function parseBody(req: NextRequest): Promise<unknown> {
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) return await req.json();
    if (ct.includes("form")) {
      const fd = await req.formData();
      const out: Record<string, unknown> = {};
      fd.forEach((v, k) => {
        out[k] = typeof v === "string" ? v : v.name;
      });
      return out;
    }
    const text = await req.text();
    try {
      return JSON.parse(text);
    } catch {
      return Object.fromEntries(new URLSearchParams(text));
    }
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const org = await findOrg(tokenOf(req));
  if (!org) return NextResponse.json({ ok: false, error: "Jeton invalide" }, { status: 401 });
  return NextResponse.json({ ok: true, organisation: org.name, message: "Point d'entrée actif : envoyez un POST (JSON ou formulaire) avec les champs du lead." });
}

export async function POST(req: NextRequest) {
  const org = await findOrg(tokenOf(req));
  if (!org) return NextResponse.json({ ok: false, error: "Jeton invalide" }, { status: 401 });
  const body = await parseBody(req);
  const inbound = normalizeInbound(body);
  if (!inbound) return NextResponse.json({ ok: false, error: "Aucun champ reconnu : il faut au moins un restaurant, un téléphone ou un email." }, { status: 400 });

  const settings = resolveLeadSettings(org.settings);
  const admin = createAdminClient();
  const ownerId = settings.defaultOwnerUserId || null;

  try {
    if (inbound.kind === "calendly") return NextResponse.json(await handleCalendly(admin, org, inbound, ownerId, settings.notifyEmail, settings));
    return NextResponse.json(await handleLead(admin, org, inbound, ownerId, settings.notifyEmail, settings));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}

type Admin = ReturnType<typeof createAdminClient>;

async function loadLeadForBrevo(admin: Admin, leadId: string): Promise<LeadForBrevo | null> {
  const { data } = await admin.from("employer_leads").select("*").eq("id", leadId).maybeSingle();
  return (data as LeadForBrevo | null) ?? null;
}

async function findExisting(admin: Admin, orgId: string, email: string | null, phone: string | null, days: number | null) {
  const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  if (email?.includes("@")) {
    let q = admin.from("employer_leads").select("id, lead_no, status, campaign, qualification_at, qualification_reminder_j1_batch_id, qualification_reminder_h2_batch_id, rdv_at, rdv_reminder_j1_batch_id, rdv_reminder_h2_batch_id").eq("org_id", orgId).ilike("email", email.trim()).order("received_at", { ascending: false }).limit(1);
    if (since) q = q.gte("received_at", since);
    const { data } = await q;
    if (data?.[0]) return data[0];
  }
  const digits = toWhatsAppNumber(phone);
  if (digits) {
    let q = admin.from("employer_leads").select("id, lead_no, status, campaign, phone, qualification_at, qualification_reminder_j1_batch_id, qualification_reminder_h2_batch_id, rdv_at, rdv_reminder_j1_batch_id, rdv_reminder_h2_batch_id").eq("org_id", orgId).not("phone", "is", null).order("received_at", { ascending: false }).limit(500);
    if (since) q = q.gte("received_at", since);
    const { data } = await q;
    return data?.find((l) => toWhatsAppNumber(l.phone) === digits) ?? null;
  }
  return null;
}

type ReminderBatchOwner = Pick<LeadForBrevo,
  | "qualification_reminder_j1_batch_id"
  | "qualification_reminder_h2_batch_id"
  | "rdv_reminder_j1_batch_id"
  | "rdv_reminder_h2_batch_id"
>;

async function cancelLeadReminderBatches(lead: ReminderBatchOwner, kind: AppointmentReminderKind) {
  // Les colonnes *_batch_id conservent l'identifiant renvoyé par Brevo à la programmation.
  const cancelIds = kind === "qualification"
    ? [lead.qualification_reminder_j1_batch_id, lead.qualification_reminder_h2_batch_id]
    : [lead.rdv_reminder_j1_batch_id, lead.rdv_reminder_h2_batch_id];
  await Promise.all(cancelIds.filter(Boolean).map((cancelId) => cancelBrevoScheduledEmail(cancelId)));
}

async function queueAppointmentReminders(
  admin: Admin,
  orgId: string,
  leadId: string,
  kind: AppointmentReminderKind,
  appointmentAt: string | null,
  settings: LeadSettings,
) {
  if (!appointmentAt) return;
  const lead = await loadLeadForBrevo(admin, leadId);
  if (!lead) return;
  const result = await scheduleBrevoAppointmentReminders(admin, {
    orgId,
    lead,
    settings,
    kind,
    appointmentAt,
  });
  if (Object.keys(result.patch).length) {
    await admin.from("employer_leads").update(result.patch).eq("id", leadId).eq("org_id", orgId);
  }
}

async function handleLead(admin: Admin, org: Org, lead: InboundLead, ownerId: string | null, notifyEmail: string, settings: LeadSettings) {
  const existing = await findExisting(admin, org.id, lead.email, lead.phone, 30);
  if (existing) {
    await admin.from("employer_lead_events").insert({
      org_id: org.id, lead_id: existing.id, kind: "import", outcome: null,
      note: `Nouveau formulaire reçu (${sourceLabel(lead.source)}${lead.campaign ? ` — ${lead.campaign}` : ""}) : doublon, fiche existante conservée.${lead.message ? ` Message : ${lead.message}` : ""}`,
    });
    if (!existing.campaign && lead.campaign) await admin.from("employer_leads").update({ campaign: lead.campaign }).eq("id", existing.id);
    return { ok: true, duplicate: true, leadId: existing.id, ref: leadRef(existing.lead_no) };
  }

  const { data, error } = await admin
    .from("employer_leads")
    .insert({
      org_id: org.id,
      company: lead.company.slice(0, 200),
      segment: lead.segment ?? "inconnu",
      source: lead.source,
      campaign: lead.campaign,
      contact_name: lead.contactName,
      phone: lead.phone,
      email: lead.email,
      city: lead.city,
      postal_code: lead.postalCode,
      positions: lead.positions,
      positions_count: lead.positionsCount ?? 1,
      notes: lead.message,
      owner_user_id: ownerId,
      status: "nouveau",
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Création impossible");

  await admin.from("employer_lead_events").insert({
    org_id: org.id, lead_id: data.id, kind: "import", outcome: null,
    note: `Formulaire reçu — ${sourceLabel(lead.source)}${lead.campaign ? ` (${lead.campaign})` : ""}`,
  });

  // Ni e-mail ni SMS ici, volontairement. Le formulaire de la landing renvoie sur une
  // page qui porte le Calendly de qualification : dans la grande majorité des cas, le
  // restaurateur réserve son créneau dans la minute qui suit. Un accusé de réception
  // immédiat l'inviterait à choisir un créneau qu'il vient de choisir, ce qui donne
  // l'impression que nous ne savons pas ce qu'il a fait, et l'expose à réserver deux
  // fois. L'invitation part donc en différé, par /api/cron/leads-sms, et seulement
  // pour ceux qui n'ont rien réservé — voir sendPendingLeadIntro.

  if (notifyEmail) {
    const url = `${BASE_URL}/leads/${data.id}`;
    await sendMail({
      to: notifyEmail,
      subject: `Nouveau lead restaurateur : ${lead.company} — à rappeler sous 24 h`,
      html: `<p>Un restaurateur vient de laisser ses coordonnées (${escapeHtml(sourceLabel(lead.source))}${lead.campaign ? `, ${escapeHtml(lead.campaign)}` : ""}).</p>
<ul>
<li><b>Restaurant :</b> ${escapeHtml(lead.company)}</li>
<li><b>Contact :</b> ${escapeHtml(lead.contactName ?? "—")}</li>
<li><b>Téléphone :</b> ${escapeHtml(lead.phone ?? "—")}</li>
<li><b>Email :</b> ${escapeHtml(lead.email ?? "—")}</li>
<li><b>Ville :</b> ${escapeHtml([lead.city, lead.postalCode].filter(Boolean).join(" ") || "—")}</li>
<li><b>Postes :</b> ${escapeHtml(lead.positions ?? "—")}${lead.positionsCount ? ` × ${lead.positionsCount}` : ""}</li>
${lead.message ? `<li><b>Message :</b> ${escapeHtml(lead.message)}</li>` : ""}
</ul>
<p><a href="${url}">Ouvrir la fiche ${leadRef(data.lead_no)}</a> — rappel sous 24 h, jamais pendant le service (9h30-11h30, 14h30-17h30).</p>`,
    }).catch(() => false);
  }

  return { ok: true, duplicate: false, leadId: data.id, ref: leadRef(data.lead_no) };
}

const FINAL = ["gagne", "perdu", "hors_cible"];

// Deux Calendly possibles : celui du setter (appel de qualification → « À rappeler », créneau
// convenu) et celui de la direction (RDV de 30 min → « RDV pris »). On les distingue par l'email
// de l'hôte du créneau (= l'email de notification du setter) ou par le nom du créneau.
function isSetterCall(c: InboundCalendly, notifyEmail: string): boolean {
  if (c.hostEmail && notifyEmail && c.hostEmail.toLowerCase() === notifyEmail.toLowerCase()) return true;
  return /appel|d[ée]couverte|qualification|rappel|setter/i.test(c.eventName ?? "");
}

function fmtWhen(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }) : "";
}

async function handleSetterCall(admin: Admin, org: Org, c: InboundCalendly, ownerId: string | null, notifyEmail: string, settings: LeadSettings) {
  const existing = await findExisting(admin, org.id, c.email, c.phone, null);
  const when = fmtWhen(c.startsAt);
  if (c.action === "canceled") {
    if (!existing) return { ok: true, ignored: true, reason: "Annulation Calendly sans fiche correspondante" };
    await cancelLeadReminderBatches(existing, "qualification");
    await admin.from("employer_leads").update({
      qualification_at: null,
      qualification_reminder_j1_batch_id: null,
      qualification_reminder_h2_batch_id: null,
      next_action: "Créneau d'appel Calendly annulé : rappeler",
      next_action_on: today(),
    }).eq("id", existing.id);
    await admin.from("employer_lead_events").insert({ org_id: org.id, lead_id: existing.id, kind: "note", outcome: "autre", note: `Créneau d'appel Calendly annulé${c.cancelReason ? ` — ${c.cancelReason}` : ""}` });
    return { ok: true, leadId: existing.id, ref: leadRef(existing.lead_no), canceled: true };
  }
  const patch = {
    qualification_at: c.startsAt,
    qualification_reminder_j1_batch_id: null,
    qualification_reminder_h2_batch_id: null,
    next_action: `Appel de qualification réservé via Calendly${when ? ` — ${when}` : ""}`,
    next_action_on: c.startsAt ? new Date(c.startsAt).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) : today(),
  };
  let leadId: string;
  let leadNo: number | null;
  if (existing) {
    await cancelLeadReminderBatches(existing, "qualification");
    await admin.from("employer_leads").update({ ...patch, ...(existing.status === "nouveau" ? { status: "a_rappeler" } : {}) }).eq("id", existing.id);
    leadId = existing.id;
    leadNo = existing.lead_no;
  } else {
    const { data, error } = await admin
      .from("employer_leads")
      .insert({
        org_id: org.id,
        company: c.name ? `Restaurant de ${c.name}` : (c.email ?? "Lead Calendly"),
        contact_name: c.name,
        email: c.email,
        phone: c.phone,
        source: "site",
        campaign: "calendly",
        notes: c.answers,
        owner_user_id: ownerId,
        status: "a_rappeler",
        ...patch,
      })
      .select("id, lead_no")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Création impossible");
    leadId = data.id;
    leadNo = data.lead_no;
  }
  await admin.from("employer_lead_events").insert({
    org_id: org.id, lead_id: leadId, kind: "note", outcome: "rappel_convenu",
    note: `Créneau d'appel réservé via Calendly${when ? ` — ${when}` : ""}${c.eventName ? ` (${c.eventName})` : ""}${c.answers ? ` · ${c.answers}` : ""}`,
  });
  const leadForSms = await loadLeadForBrevo(admin, leadId);
  if (leadForSms) {
    await dispatchTwilioLeadSms(admin, {
      orgId: org.id,
      lead: leadForSms,
      settings,
      code: "qualification_reservee",
      automatic: true,
    });
  }
  await queueAppointmentReminders(admin, org.id, leadId, "qualification", c.startsAt, settings);
  if (notifyEmail) {
    await sendMail({
      to: notifyEmail,
      subject: `Appel réservé sur votre Calendly : ${c.name ?? c.email ?? "restaurateur"}${when ? ` — ${when}` : ""}`,
      html: `<p>Un restaurateur a réservé un créneau d'appel sur votre Calendly.</p><p><a href="${BASE_URL}/leads/${leadId}">Ouvrir la fiche ${leadRef(leadNo)}</a> — préparez les 7 questions, rappelez à l'heure dite (à la minute).</p>`,
    }).catch(() => false);
  }
  return { ok: true, leadId, ref: leadRef(leadNo), setterCall: true, at: c.startsAt };
}

async function handleCalendly(admin: Admin, org: Org, c: InboundCalendly, ownerId: string | null, notifyEmail: string, settings: LeadSettings) {
  if (isSetterCall(c, notifyEmail)) return handleSetterCall(admin, org, c, ownerId, notifyEmail, settings);
  const existing = await findExisting(admin, org.id, c.email, c.phone, null);
  if (c.action === "canceled") {
    if (!existing) return { ok: true, ignored: true, reason: "Annulation Calendly sans fiche correspondante" };
    await cancelLeadReminderBatches(existing, "rdv");
    await admin.from("employer_leads").update({
      rdv_outcome: "reporte",
      rdv_reminder_j1_batch_id: null,
      rdv_reminder_h2_batch_id: null,
      ...(existing.status === "rdv_pris" ? { status: "qualifie", next_action: "Reposer deux créneaux hors service", next_action_on: today() } : {}),
    }).eq("id", existing.id);
    await admin.from("employer_lead_events").insert({ org_id: org.id, lead_id: existing.id, kind: "rdv", outcome: "autre", note: `RDV annulé via Calendly${c.cancelReason ? ` — ${c.cancelReason}` : ""}` });
    return { ok: true, leadId: existing.id, ref: leadRef(existing.lead_no), canceled: true };
  }

  const rdvPatch = {
    rdv_at: c.startsAt,
    rdv_mode: c.locationKind ?? "telephone",
    rdv_outcome: "a_venir",
    rdv_reminder_sent_at: null,
    rdv_reminder_j1_batch_id: null,
    rdv_reminder_h2_batch_id: null,
    qualification_at: null,
    qualification_reminder_j1_batch_id: null,
    qualification_reminder_h2_batch_id: null,
    next_action: "SMS de rappel la veille du RDV (SMS n°3)",
    next_action_on: c.startsAt ? addDays(c.startsAt.slice(0, 10), -1) : today(),
  };
  let leadId: string;
  let leadNo: number | null;
  if (existing) {
    await cancelLeadReminderBatches(existing, "qualification");
    await cancelLeadReminderBatches(existing, "rdv");
    await admin.from("employer_leads").update({ ...rdvPatch, ...(FINAL.includes(existing.status) ? {} : { status: "rdv_pris" }) }).eq("id", existing.id);
    leadId = existing.id;
    leadNo = existing.lead_no;
  } else {
    const { data, error } = await admin
      .from("employer_leads")
      .insert({
        org_id: org.id,
        company: c.name ? `Restaurant de ${c.name}` : (c.email ?? "Lead Calendly"),
        contact_name: c.name,
        email: c.email,
        phone: c.phone,
        source: "site",
        campaign: "calendly",
        notes: c.answers,
        owner_user_id: ownerId,
        status: "rdv_pris",
        ...rdvPatch,
      })
      .select("id, lead_no")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Création impossible");
    leadId = data.id;
    leadNo = data.lead_no;
  }
  await admin.from("employer_lead_events").insert({
    org_id: org.id, lead_id: leadId, kind: "rdv", outcome: "rdv_pose",
    note: `RDV pris via Calendly${c.startsAt ? ` — ${new Date(c.startsAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" })}` : ""}${c.answers ? ` · ${c.answers}` : ""}`,
  });
  const leadForBrevo = await loadLeadForBrevo(admin, leadId);
  if (leadForBrevo?.status === "rdv_pris") {
    await dispatchBrevoLeadEvent(admin, {
      orgId: org.id,
      lead: leadForBrevo,
      settings,
      eventName: BREVO_LEAD_EVENTS.rdvPris,
    });
    await dispatchTwilioLeadSms(admin, {
      orgId: org.id,
      lead: leadForBrevo,
      settings,
      code: "confirmation_rdv",
      automatic: true,
    });
  }
  await queueAppointmentReminders(admin, org.id, leadId, "rdv", c.startsAt, settings);
  if (notifyEmail) {
    await sendMail({
      to: notifyEmail,
      subject: `RDV Calendly : ${c.name ?? c.email ?? "restaurateur"}${c.startsAt ? ` — ${new Date(c.startsAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" })}` : ""}`,
      html: `<p>Un rendez-vous vient d'être pris sur Calendly.</p><p><a href="${BASE_URL}/leads/${leadId}">Ouvrir la fiche ${leadRef(leadNo)}</a> — email de confirmation (n°1) et SMS de rappel la veille (n°3) à envoyer.</p>`,
    }).catch(() => false);
  }
  return { ok: true, leadId, ref: leadRef(leadNo), rdv: c.startsAt };
}

function today(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}
