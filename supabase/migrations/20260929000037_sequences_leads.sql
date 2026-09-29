-- Séquences automatiques du tunnel POEI restauration, pilotées par les statuts et
-- les échéances de l'ERP (jamais par Brevo ni Twilio) :
--
--   statut « nurturing »        : le besoin est décalé, l'ERP entretient le contact à J+30, J+60, J+90
--   employer_leads.sequence_*   : la séquence en cours sur la fiche (laquelle, quelle étape, prochaine
--                                 échéance, dernier envoi, arrêt et son motif)
--   employer_leads.email_status : dernier retour Brevo sur l'adresse (délivré, bounce, désinscription, plainte)
--   employer_leads.phone_status : numéro refusé par Twilio
--   employer_leads.opt_out_at   : opposition du prospect → plus aucun message automatique, jamais
--   employer_lead_email_events  : le journal brut des retours Brevo (webhook transactionnel)

-- ── Statut « En veille (nurturing) » ─────────────────────────────────────────
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.employer_leads'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%''hors_cible''%'
  loop
    execute format('alter table public.employer_leads drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.employer_leads
  add constraint employer_leads_status_check
  check (status in ('nouveau', 'a_rappeler', 'contacte', 'qualifie', 'rdv_pris', 'rdv_tenu', 'proposition', 'nurturing', 'gagne', 'perdu', 'hors_cible'));

-- ── Séquence en cours, retours des canaux, opposition ────────────────────────
alter table public.employer_leads
  add column if not exists sequence_kind text
    check (sequence_kind is null or sequence_kind in ('injoignable', 'no_show', 'proposition', 'nurturing')),
  add column if not exists sequence_step text,
  add column if not exists sequence_started_at timestamptz,
  add column if not exists sequence_next_at timestamptz,
  add column if not exists sequence_last_sent_at timestamptz,
  add column if not exists sequence_stopped_at timestamptz,
  add column if not exists sequence_stop_reason text,
  add column if not exists email_status text
    check (email_status is null or email_status in ('delivered', 'soft_bounce', 'hard_bounce', 'unsubscribed', 'complaint')),
  add column if not exists email_status_at timestamptz,
  add column if not exists phone_status text
    check (phone_status is null or phone_status in ('invalide')),
  add column if not exists opt_out_at timestamptz;

comment on column public.employer_leads.sequence_kind is 'Séquence automatique sur la fiche : injoignable, no_show, proposition ou nurturing (null = aucune).';
comment on column public.employer_leads.sequence_step is 'Dernière étape exécutée (j1, j3, j6, j10, j30…) ; null = aucune étape encore partie.';
comment on column public.employer_leads.sequence_started_at is 'T0 de la séquence : toutes les étapes sont datées depuis ce point.';
comment on column public.employer_leads.sequence_next_at is 'Prochaine échéance ; null = séquence arrêtée ou terminée. Sert aussi de verrou optimiste au cron.';
comment on column public.employer_leads.sequence_last_sent_at is 'Dernier message automatique parti dans le cadre de la séquence.';
comment on column public.employer_leads.sequence_stop_reason is 'reponse, reservation, rdv_tenu, besoin_clos, opposition, desinscription, bounce_dur, numero_invalide, terminee, remplacee, manuel.';
comment on column public.employer_leads.email_status is 'Dernier retour Brevo : delivered, soft_bounce, hard_bounce, unsubscribed, complaint. Un bounce dur, une désinscription ou une plainte bloque tout e-mail automatique.';
comment on column public.employer_leads.phone_status is 'invalide = numéro refusé par Twilio : plus aucun SMS automatique.';
comment on column public.employer_leads.opt_out_at is 'Opposition du prospect (bouton de la fiche, désinscription ou plainte Brevo) : plus aucun message automatique, sur aucun canal.';

create index if not exists employer_leads_sequence_due_idx
  on public.employer_leads (sequence_next_at)
  where sequence_next_at is not null;

-- ── Retours Brevo (webhook transactionnel) ───────────────────────────────────
create table if not exists public.employer_lead_email_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.employer_leads(id) on delete set null,
  event text not null,
  email text,
  message_id text,
  lead_event text,
  reason text,
  occurred_at timestamptz not null default now(),
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists employer_lead_email_events_org_idx on public.employer_lead_email_events (org_id, occurred_at desc);
create index if not exists employer_lead_email_events_lead_idx on public.employer_lead_email_events (lead_id, occurred_at desc);
create index if not exists employer_lead_email_events_message_idx on public.employer_lead_email_events (org_id, message_id, event) where message_id is not null;

alter table public.employer_lead_email_events enable row level security;
drop policy if exists employer_lead_email_events_select on public.employer_lead_email_events;
create policy employer_lead_email_events_select on public.employer_lead_email_events for select
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator', 'setter'));
-- Aucune politique d'écriture : seul le webhook (clé service) alimente cette table.

select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'employer_leads' and column_name = 'sequence_next_at') as sequence_ok,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'employer_leads' and column_name = 'opt_out_at') as opt_out_ok,
  to_regclass('public.employer_lead_email_events') is not null as email_events_ok,
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'employer_leads_status_check') like '%nurturing%' as nurturing_ok;
