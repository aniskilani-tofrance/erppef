import { createAdminClient } from "@/lib/supabase/admin";
import { buildAttendancePdf, loadAttendanceSheetData, sheetFileName } from "@/lib/emargement/pdf";
import { mailerConfigured, sendMail } from "@/lib/mailer";
import { textToHtml } from "@/lib/admission/messages";

// Envoi hebdomadaire des feuilles d'émargement au financeur (ex. cours municipaux →
// Ville de Saint-Ouen). Réglé par groupe (fiche groupe : actif, destinataires, copies) et
// déclenché le vendredi après-midi par le cron /api/cron/emargements, ou à la main.
//
// Règles :
//  • la fenêtre va du dernier envoi (ou 7 jours en arrière la première fois) à maintenant ;
//    une séance qui se termine après l'envoi (ex. samedi matin) part la semaine suivante ;
//  • seules les feuilles CLÔTURÉES partent ; les séances passées sans feuille clôturée sont
//    listées dans l'email et repartiront une fois clôturées ;
//  • si rien n'est clôturé mais que des séances ont eu lieu, on n'envoie rien au financeur
//    (« reporté ») et on prévient la coordination ;
//  • le mode « test » envoie à une seule adresse (la vôtre) sans toucher au dernier envoi.

const TZ = "Europe/Paris";
const ORG = { name: "ParlerEmploi Formation", email: "contact@parleremploi.com", phone: "06 52 67 53 93" };

export type DispatchMode = "auto" | "manuel" | "test";
export type DispatchStatus = "envoye" | "reporte" | "rien" | "erreur";

export type DispatchSession = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  attendance_closed_at: string | null;
};

export type SheetSummary = { sessionId: string; startsAt: string; endsAt: string; present: number; enrolled: number };

export type DispatchResult = {
  groupId: string;
  groupName: string;
  status: DispatchStatus;
  sent: number; // feuilles jointes
  missing: number; // séances passées sans feuille clôturée
  recipients: string[];
  message: string;
  error?: string;
};

// ───────────────────────── Helpers purs (testés) ─────────────────────────

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** « a@x.fr, B@y.fr ; c@z.fr » → adresses valides, en minuscules, sans doublon. */
export function parseEmails(raw: string | string[] | null | undefined): string[] {
  const parts = (Array.isArray(raw) ? raw : (raw ?? "").split(/[\s,;]+/)).map((s) => s.trim().toLowerCase()).filter(Boolean);
  return [...new Set(parts.filter((e) => EMAIL_RE.test(e)))];
}

/** Fenêtre d'envoi : du dernier envoi (ou 7 jours en arrière) à maintenant. */
export function dispatchWindow(now: Date, lastSentAt: string | null | undefined): { from: Date; to: Date } {
  const from = lastSentAt ? new Date(lastSentAt) : new Date(now.getTime() - 7 * 86_400_000);
  return { from, to: now };
}

/** Séances terminées dans la fenêtre : prêtes (feuille clôturée) ou manquantes. */
export function classifySessions(
  sessions: DispatchSession[],
  window: { from: Date; to: Date },
): { ready: DispatchSession[]; missing: DispatchSession[] } {
  const inWindow = sessions
    .filter((s) => s.status !== "annulee")
    .filter((s) => {
      const end = new Date(s.ends_at).getTime();
      return end > window.from.getTime() && end <= window.to.getTime();
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return {
    ready: inWindow.filter((s) => s.attendance_closed_at),
    missing: inWindow.filter((s) => !s.attendance_closed_at),
  };
}

export function fmtDay(iso: string | Date, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }): string {
  return new Date(iso).toLocaleDateString("fr-FR", { ...opts, timeZone: TZ });
}
export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).replace(":", "h");
}

export type DispatchEmailInput = {
  groupName: string;
  siteName: string | null;
  funderName: string | null;
  from: Date;
  to: Date;
  sheets: SheetSummary[];
  missing: { startsAt: string; endsAt: string }[];
  mode: DispatchMode;
  realRecipients?: string[]; // en mode test : qui aurait reçu
};

/** Objet et texte de l'email au financeur. */
export function buildDispatchEmail(input: DispatchEmailInput): { subject: string; text: string } {
  const period = `du ${fmtDay(input.from)} au ${fmtDay(input.to, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`;
  const site = input.siteName ? ` (site ${input.siteName})` : "";
  const subject = `${input.mode === "test" ? "[TEST] " : ""}Feuilles d'émargement — ${input.groupName} — semaine ${period}`;
  const lines: string[] = ["Bonjour,", ""];
  if (input.mode === "test") {
    lines.push(`Envoi de test : cet email ne part qu'à vous. Les destinataires réels seraient : ${input.realRecipients?.length ? input.realRecipients.join(", ") : "aucun (à renseigner sur la fiche du groupe)"}.`, "");
  }
  lines.push(
    `Veuillez trouver ci-joint les feuilles d'émargement signées du groupe « ${input.groupName} »${site} pour la période ${period}${input.funderName ? `, financé par ${input.funderName}` : ""}.`,
    "",
  );
  if (input.sheets.length) {
    lines.push(`Séances jointes (${input.sheets.length}) :`);
    for (const s of input.sheets) {
      lines.push(`- ${fmtDay(s.startsAt)}, ${fmtTime(s.startsAt)}-${fmtTime(s.endsAt)} : ${s.present} présent${s.present > 1 ? "s" : ""} sur ${s.enrolled} inscrit${s.enrolled > 1 ? "s" : ""}`);
    }
    lines.push("");
  } else {
    lines.push("Aucune feuille clôturée sur cette période.", "");
  }
  if (input.missing.length) {
    lines.push("Séances dont la feuille n'est pas encore clôturée (elle sera jointe à l'envoi suivant) :");
    for (const m of input.missing) lines.push(`- ${fmtDay(m.startsAt)}, ${fmtTime(m.startsAt)}-${fmtTime(m.endsAt)}`);
    lines.push("");
  }
  lines.push(
    "Chaque feuille est signée par les apprenants et contre-signée par la formatrice ; les heures réalisées sont récapitulées dans le bilan remis au financeur.",
    "",
    `Pour toute question : ${ORG.name}, ${ORG.email}, ${ORG.phone}.`,
    "",
    "Cordialement,",
    ORG.name,
  );
  return { subject, text: lines.join("\n") };
}

// ───────────────────────── Envoi ─────────────────────────

type GroupRow = {
  id: string;
  org_id: string;
  name: string;
  attendance_mail_enabled: boolean;
  attendance_mail_to: string[] | null;
  attendance_mail_cc: string[] | null;
  attendance_mail_last_sent_at: string | null;
  rooms: { name: string } | null;
  funders: { name: string } | null;
};

export async function dispatchGroupAttendance(
  groupId: string,
  opts: { mode: DispatchMode; orgId?: string; overrideTo?: string[]; triggeredBy?: string | null; window?: { from: Date; to: Date } },
): Promise<DispatchResult> {
  const supabase = createAdminClient();
  const { data: group } = await supabase
    .from("groups")
    .select("id, org_id, name, attendance_mail_enabled, attendance_mail_to, attendance_mail_cc, attendance_mail_last_sent_at, rooms:room_id(name), funders(name)")
    .eq("id", groupId)
    .single();
  const g = group as unknown as GroupRow | null;
  if (!g || (opts.orgId && g.org_id !== opts.orgId)) {
    return { groupId, groupName: "?", status: "erreur", sent: 0, missing: 0, recipients: [], message: "Groupe introuvable", error: "Groupe introuvable" };
  }

  const isTest = opts.mode === "test";
  const realTo = parseEmails(g.attendance_mail_to);
  const realCc = parseEmails(g.attendance_mail_cc);
  const to = isTest ? parseEmails(opts.overrideTo) : realTo;
  const cc = isTest ? [] : realCc;
  const bcc = isTest ? [] : parseEmails(process.env.ALERTS_EMAIL);
  const base = { groupId: g.id, groupName: g.name, recipients: to };

  if (to.length === 0) {
    return { ...base, status: "erreur", sent: 0, missing: 0, message: "Aucun destinataire : renseignez les adresses sur la fiche du groupe.", error: "Aucun destinataire" };
  }
  if (!mailerConfigured()) {
    return { ...base, status: "erreur", sent: 0, missing: 0, message: "Email non configuré (SMTP).", error: "SMTP non configuré" };
  }

  const now = new Date();
  const window = opts.window ?? dispatchWindow(now, g.attendance_mail_last_sent_at);
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, starts_at, ends_at, status, attendance_closed_at")
    .eq("group_id", g.id)
    .gte("ends_at", new Date(window.from.getTime() - 86_400_000).toISOString())
    .lte("ends_at", window.to.toISOString())
    .order("starts_at");
  const { ready, missing } = classifySessions((sessions ?? []) as DispatchSession[], window);

  const record = async (status: DispatchStatus, sent: string[], error?: string) => {
    if (opts.mode === "auto" && status === "rien") return; // pas de bruit dans l'historique pendant les vacances
    await supabase.from("attendance_dispatches").insert({
      org_id: g.org_id,
      group_id: g.id,
      period_from: window.from.toISOString(),
      period_to: window.to.toISOString(),
      mode: opts.mode,
      status,
      recipients: to,
      cc,
      session_ids: sent,
      missing_session_ids: missing.map((m) => m.id),
      error: error ?? null,
      triggered_by: opts.triggeredBy ?? null,
    });
  };

  if (ready.length === 0 && missing.length === 0) {
    await record("rien", []);
    return { ...base, status: "rien", sent: 0, missing: 0, message: `Aucune séance terminée depuis le ${fmtDay(window.from)} : rien à envoyer.` };
  }

  if (ready.length === 0) {
    // Des séances ont eu lieu mais aucune feuille n'est clôturée : on prévient la coordination, pas le financeur.
    await record("reporte", []);
    const alertTo = parseEmails(process.env.ALERTS_EMAIL);
    if (alertTo.length && !isTest) {
      await sendMail({
        to: alertTo,
        subject: `Feuilles d'émargement non clôturées — ${g.name}`,
        html: textToHtml(
          `L'envoi hebdomadaire au financeur pour « ${g.name} » a été reporté : ${missing.length} séance${missing.length > 1 ? "s" : ""} terminée${missing.length > 1 ? "s" : ""} sans feuille clôturée.\n\n${missing.map((m) => `- ${fmtDay(m.starts_at)}, ${fmtTime(m.starts_at)}-${fmtTime(m.ends_at)}`).join("\n")}\n\nClôturez les feuilles (fiche groupe → Séances → Feuille d'émargement) : elles partiront à l'envoi suivant, ou tout de suite avec « Envoyer maintenant ».`,
        ),
      });
    }
    return { ...base, status: "reporte", sent: 0, missing: missing.length, message: `Reporté : ${missing.length} séance${missing.length > 1 ? "s" : ""} sans feuille clôturée. Clôturez-les puis « Envoyer maintenant ».` };
  }

  // Pièces jointes : une feuille PDF par séance clôturée
  const attachments: { filename: string; content: Uint8Array; contentType: string }[] = [];
  const sheets: SheetSummary[] = [];
  for (const s of ready) {
    const data = await loadAttendanceSheetData(s.id, g.org_id);
    if (!data) continue;
    attachments.push({ filename: sheetFileName(data), content: await buildAttendancePdf(data), contentType: "application/pdf" });
    sheets.push({ sessionId: s.id, startsAt: s.starts_at, endsAt: s.ends_at, present: data.rows.filter((r) => r.status !== "absent").length, enrolled: data.rows.length });
  }

  const email = buildDispatchEmail({
    groupName: g.name,
    siteName: g.rooms?.name ?? null,
    funderName: g.funders?.name ?? null,
    from: window.from,
    to: window.to,
    sheets,
    missing: missing.map((m) => ({ startsAt: m.starts_at, endsAt: m.ends_at })),
    mode: opts.mode,
    realRecipients: isTest ? [...realTo, ...realCc.map((c) => `${c} (copie)`)] : undefined,
  });
  const ok = await sendMail({ to, cc, bcc, subject: email.subject, html: textToHtml(email.text), attachments });
  if (!ok) {
    await record("erreur", [], "Envoi SMTP refusé");
    return { ...base, status: "erreur", sent: 0, missing: missing.length, message: "L'envoi a échoué (SMTP). Réessayez ou vérifiez la configuration email.", error: "SMTP" };
  }
  await record("envoye", sheets.map((s) => s.sessionId));
  if (!isTest) {
    await supabase.from("groups").update({ attendance_mail_last_sent_at: window.to.toISOString() }).eq("id", g.id);
  }
  const who = isTest ? `à vous (${to.join(", ")})` : `à ${to.join(", ")}${cc.length ? ` (copie ${cc.join(", ")})` : ""}`;
  return {
    ...base,
    status: "envoye",
    sent: sheets.length,
    missing: missing.length,
    message: `${sheets.length} feuille${sheets.length > 1 ? "s" : ""} envoyée${sheets.length > 1 ? "s" : ""} ${who}${missing.length ? ` · ${missing.length} séance${missing.length > 1 ? "s" : ""} en attente de clôture` : ""}.`,
  };
}

/** Passe du vendredi : tous les groupes dont l'envoi hebdomadaire est actif (toutes organisations). */
export async function runWeeklyAttendanceDispatch(): Promise<{ groups: DispatchResult[] }> {
  const supabase = createAdminClient();
  const { data: groups } = await supabase
    .from("groups")
    .select("id")
    .eq("attendance_mail_enabled", true)
    .in("status", ["en_attente", "ouvert", "complet"]);
  const results: DispatchResult[] = [];
  for (const g of groups ?? []) {
    try {
      results.push(await dispatchGroupAttendance(g.id, { mode: "auto" }));
    } catch (e) {
      results.push({ groupId: g.id, groupName: "?", status: "erreur", sent: 0, missing: 0, recipients: [], message: "Erreur", error: e instanceof Error ? e.message : "erreur inconnue" });
    }
  }
  return { groups: results };
}
