import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/auth";
import { sendMail } from "@/lib/mailer";
import { APP_UPDATES, formatUpdateDate, updatesForRole } from "@/lib/updates-content";

// Envoi de l'email « Quoi de neuf » à l'équipe pour chaque mise à jour pas encore
// annoncée. Appelé par le cron du matin (et par le bouton « Envoyer maintenant » des
// Paramètres). L'état « déjà envoyée » vit dans organizations.settings.updates_announced.
// Serveur uniquement, client service_role.

const BASE_URL = "https://pef-erp.vercel.app";
const ROLE_RANK: Record<AppRole, number> = { admin: 3, coordinator: 2, trainer: 1, viewer: 0 };

type Recipient = { email: string; firstName: string; role: AppRole };

export type AnnounceResult = { updates: number; recipients: number; sent: number; skipped: string[] };

async function recipientsOf(admin: SupabaseClient, orgId: string): Promise<Recipient[]> {
  const [{ data: members }, { data: trainers }, { data: users }] = await Promise.all([
    admin.from("memberships").select("user_id, role, profiles(full_name)").eq("org_id", orgId),
    admin.from("trainers").select("first_name, email").eq("org_id", orgId).eq("is_active", true).not("email", "is", null),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const emailById = new Map((users?.users ?? []).map((u) => [u.id, u.email ?? null]));
  const byEmail = new Map<string, Recipient>();
  const add = (r: Recipient) => {
    const key = r.email.toLowerCase();
    if (key.endsWith(".invalid")) return; // comptes fictifs (bac à sable)
    const cur = byEmail.get(key);
    if (!cur || ROLE_RANK[r.role] > ROLE_RANK[cur.role]) byEmail.set(key, { ...r, email: key });
  };
  for (const m of members ?? []) {
    const email = emailById.get(m.user_id);
    const role = m.role as AppRole;
    if (!email || role === "viewer") continue;
    const name = (m.profiles as unknown as { full_name: string | null } | null)?.full_name?.trim().split(/\s+/)[0] ?? "";
    add({ email, firstName: name, role });
  }
  // Formatrices sans compte : elles reçoivent quand même les nouveautés qui les concernent.
  for (const t of trainers ?? []) if (t.email) add({ email: t.email, firstName: t.first_name, role: "trainer" });
  return [...byEmail.values()];
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function emailFor(r: Recipient, updateIds: Set<string>): { subject: string; html: string } | null {
  const updates = updatesForRole(r.role).filter((u) => updateIds.has(u.id));
  if (!updates.length) return null;
  const blocks = updates.map((u) => {
    const items = u.items.map((i) => `<li>${escape(i.text)}</li>`).join("");
    const training = u.training
      .map((t) => `<a href="${BASE_URL}/formation/${t.moduleId}">${escape(t.label)}</a>`)
      .join(" · ");
    return `<h3 style="margin:18px 0 4px">${escape(u.title)} <span style="font-weight:normal;color:#666">— ${formatUpdateDate(u.date)}</span></h3>
<p style="margin:0 0 6px;color:#444">${escape(u.summary)}</p>
<ul style="margin:0 0 6px">${items}</ul>
${training ? `<p style="margin:0;font-size:13px">Pour l'apprendre en 5 minutes : ${training}</p>` : ""}`;
  });
  const subject = updates.length === 1 ? `ERP PEF — nouveauté : ${updates[0].title}` : `ERP PEF — ${updates.length} nouveautés pour vous`;
  const html = `<p>Bonjour${r.firstName ? ` ${escape(r.firstName)}` : ""},</p>
<p>L'outil a évolué. Voici ce qui change pour vous :</p>
${blocks.join("\n")}
<p style="margin-top:18px">Tout est expliqué dans <a href="${BASE_URL}/formation">Formation</a> (module à refaire en 5 minutes) et dans <a href="${BASE_URL}/aide">Aide</a>. Une question, une idée : répondez à cet email.</p>
<p>Bonne journée,<br/>Anis — ParlerEmploi Formation</p>`;
  return { subject, html };
}

// Annonce les mises à jour non encore envoyées pour une organisation.
export async function announceUpdates(admin: SupabaseClient, orgId: string): Promise<AnnounceResult> {
  const { data: org } = await admin.from("organizations").select("settings").eq("id", orgId).single();
  const settings = ((org?.settings as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const announced = (settings.updates_announced as Record<string, unknown> | undefined) ?? {};
  const pending = APP_UPDATES.filter((u) => !announced[u.id]);
  if (!pending.length) return { updates: 0, recipients: 0, sent: 0, skipped: [] };

  const ids = new Set(pending.map((u) => u.id));
  const recipients = await recipientsOf(admin, orgId);
  let sent = 0;
  const skipped: string[] = [];
  for (const r of recipients) {
    const mail = emailFor(r, ids);
    if (!mail) continue;
    const ok = await sendMail({ to: r.email, subject: mail.subject, html: mail.html });
    if (ok) sent += 1;
    else skipped.push(r.email);
  }

  const now = new Date().toISOString();
  const next = { ...announced };
  for (const u of pending) next[u.id] = { sent_at: now, recipients: sent };
  await admin.from("organizations").update({ settings: { ...settings, updates_announced: next } }).eq("id", orgId);
  return { updates: pending.length, recipients: recipients.length, sent, skipped };
}

// Toutes les organisations réelles (le bac à sable de démo est ignoré).
export async function announceUpdatesEverywhere(admin: SupabaseClient): Promise<Record<string, AnnounceResult>> {
  const { data: orgs } = await admin.from("organizations").select("id, slug").neq("slug", "bac-a-sable");
  const out: Record<string, AnnounceResult> = {};
  for (const o of orgs ?? []) out[o.slug] = await announceUpdates(admin, o.id);
  return out;
}
