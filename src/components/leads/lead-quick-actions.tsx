"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Copy, Mail, MessageCircle, MessageSquare, Phone } from "lucide-react";
import { logLeadEvent } from "@/app/(app)/leads/actions";
import { whatsappLink } from "@/lib/admission/phone";
import {
  EMAIL_TEMPLATES, SMS_TEMPLATES, leadVars, mailtoLink, renderEmail, renderSms, smsLink, telLink,
  type LeadSettings, type SmsTemplateCode, type EmailTemplateCode,
} from "@/lib/leads/templates";
import type { LeadRow } from "@/lib/leads/queries";
import { LeadEventDialog, type LeadEventContext } from "@/components/leads/lead-event-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// La barre d'action du setter, pensée pour le téléphone : appeler, SMS, WhatsApp, email —
// chaque message est pré-rempli avec le bon modèle du kit et tracé dans le journal.
export function LeadQuickActions({
  lead,
  settings,
  setterFirstName,
  ctx,
}: {
  lead: LeadRow;
  settings: LeadSettings;
  setterFirstName: string | null;
  ctx: LeadEventContext;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [callOpen, setCallOpen] = useState(false);
  const vars = leadVars(lead, settings, setterFirstName);
  const tel = telLink(lead.phone);

  function trace(kind: "sms" | "whatsapp" | "email", label: string) {
    startTransition(async () => {
      const r = await logLeadEvent({ leadId: lead.id, kind, outcome: "envoye", note: label, status: null });
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  }

  function call() {
    if (!tel) return;
    window.location.assign(tel);
    setCallOpen(true);
  }

  function sendSms(code: SmsTemplateCode, label: string) {
    const url = smsLink(lead.phone, renderSms(code, vars));
    if (!url) return;
    window.location.assign(url);
    trace("sms", label);
  }

  function sendWhatsApp(code: SmsTemplateCode, label: string) {
    const url = whatsappLink(lead.phone, renderSms(code, vars));
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
    trace("whatsapp", label.replace("SMS", "WhatsApp"));
  }

  function sendEmail(code: EmailTemplateCode, label: string) {
    const { subject, body } = renderEmail(code, vars);
    const url = mailtoLink(lead.email, subject, body);
    if (!url) return;
    window.location.assign(url);
    trace("email", label);
  }

  async function copyCalendly() {
    try {
      await navigator.clipboard.writeText(settings.calendlyUrl);
      toast.success("Lien Calendly copié.");
    } catch {
      toast.error("Copie impossible : " + settings.calendlyUrl);
    }
  }

  const noPhone = !tel;
  const noEmail = !lead.email?.includes("@");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={call} disabled={noPhone} title={noPhone ? "Pas de numéro exploitable" : "Appeler, puis noter le résultat"}>
        <Phone className="mr-2 h-4 w-4" />Appeler
      </Button>
      <LeadEventDialog ctx={ctx} defaultKind="appel" trigger={null} open={callOpen} onOpenChange={setCallOpen} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={noPhone || pending}><MessageSquare className="mr-2 h-4 w-4" />SMS</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          <DropdownMenuLabel>Modèle pré-rempli</DropdownMenuLabel>
          {SMS_TEMPLATES.map((t) => (
            <DropdownMenuItem key={t.code} onSelect={() => sendSms(t.code, t.label)} title={t.when}>
              {t.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={noPhone || pending} className="text-emerald-700"><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          <DropdownMenuLabel>Même texte que les SMS</DropdownMenuLabel>
          {SMS_TEMPLATES.map((t) => (
            <DropdownMenuItem key={t.code} onSelect={() => sendWhatsApp(t.code, t.label)} title={t.when}>
              {t.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={noEmail || pending} title={noEmail ? "Pas d'adresse email" : undefined}><Mail className="mr-2 h-4 w-4" />Email</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-96">
          <DropdownMenuLabel>Modèle pré-rempli (s&apos;ouvre dans votre messagerie)</DropdownMenuLabel>
          {EMAIL_TEMPLATES.map((t) => (
            <DropdownMenuItem key={t.code} onSelect={() => sendEmail(t.code, t.label)} title={t.when}>
              {t.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={copyCalendly}><Copy className="mr-2 h-3.5 w-3.5" />Copier le lien Calendly</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="sm" onClick={copyCalendly} title={settings.calendlyUrl}>
        <CalendarClock className="mr-2 h-4 w-4" />Calendly
      </Button>
    </div>
  );
}
