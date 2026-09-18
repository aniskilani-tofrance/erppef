-- Rappels Brevo liés aux créneaux Calendly : les identifiants de batch permettent
-- d'annuler les emails J-1 / H-2 quand un restaurateur reporte ou annule son créneau.
-- Les appels de qualification restent distincts des rendez-vous de direction.

alter table public.employer_leads
  add column if not exists qualification_at timestamptz,
  add column if not exists qualification_reminder_j1_batch_id text,
  add column if not exists qualification_reminder_h2_batch_id text,
  add column if not exists rdv_reminder_j1_batch_id text,
  add column if not exists rdv_reminder_h2_batch_id text;

create index if not exists employer_leads_org_qualification_at_idx
  on public.employer_leads (org_id, qualification_at)
  where qualification_at is not null;

comment on column public.employer_leads.qualification_at is
  'Créneau Calendly de qualification ; utilisé uniquement pour les rappels transactionnels Brevo.';
comment on column public.employer_leads.qualification_reminder_j1_batch_id is
  'Batch Brevo du rappel J-1 de qualification, annulable en cas de report.';
comment on column public.employer_leads.qualification_reminder_h2_batch_id is
  'Batch Brevo du rappel H-2 de qualification, annulable en cas de report.';
comment on column public.employer_leads.rdv_reminder_j1_batch_id is
  'Batch Brevo du rappel J-1 de rendez-vous direction, annulable en cas de report.';
comment on column public.employer_leads.rdv_reminder_h2_batch_id is
  'Batch Brevo du rappel H-2 de rendez-vous direction, annulable en cas de report.';
