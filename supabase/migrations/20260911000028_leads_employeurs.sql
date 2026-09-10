-- Mini-CRM « Leads restaurateurs » : les employeurs qui ont laissé leurs coordonnées
-- (campagne parlerresto, site, appels entrants) sont qualifiés par le setter (Shahzad)
-- et transformés en rendez-vous pour la direction (Anis) — puis en conventions POEI.
--
--   app_role 'setter'          : rôle à accès minimal (leads + formation + aide), rien
--                                sur les apprenants ni les formateurs (données personnelles)
--   employer_leads             : la fiche du lead (qualification restauration, pipeline, RDV)
--   employer_lead_events       : le journal (appel, SMS, email, WhatsApp, RDV, note, statut)
--   org_counters 'employer_lead' : référence lisible L-0001

-- ── Rôle setter ──────────────────────────────────────────────────────────────
alter type public.app_role add value if not exists 'setter';

-- ── Leads ────────────────────────────────────────────────────────────────────
create table if not exists public.employer_leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  lead_no integer,
  received_at timestamptz not null default now(),
  source text not null default 'formulaire_meta'
    check (source in ('formulaire_meta', 'site', 'appel_entrant', 'recommandation', 'terrain', 'autre')),
  campaign text,
  company text not null,
  segment text not null default 'inconnu'
    check (segment in ('rapide_franchise', 'traditionnel', 'collective', 'hotel_traiteur', 'snacking', 'hors_restauration', 'inconnu')),
  contact_name text,
  contact_role text,
  phone text,
  email text,
  city text,
  postal_code text,
  -- Qualification (les 7 questions du script)
  positions text,
  positions_count integer not null default 1 check (positions_count >= 0),
  contract_type text not null default 'inconnu'
    check (contract_type in ('cdi', 'cdd_6m', 'saisonnier_4m', 'cdii', 'interim', 'extras', 'cdd_court', 'autre', 'inconnu')),
  hours_per_week integer check (hours_per_week is null or (hours_per_week between 1 and 60)),
  hiring_horizon text not null default 'inconnu'
    check (hiring_horizon in ('lt_1m', '1_3m', '3_6m', 'gt_6m', 'inconnu')),
  hiring_deadline text,
  decision_maker boolean,
  haccp_status text not null default 'inconnu' check (haccp_status in ('oui', 'non', 'inconnu')),
  covers text,
  team_size integer check (team_size is null or team_size >= 0),
  pain text,
  -- Pipeline
  score text check (score is null or score in ('chaud', 'tiede', 'froid')),
  status text not null default 'nouveau'
    check (status in ('nouveau', 'a_rappeler', 'contacte', 'qualifie', 'rdv_pris', 'rdv_tenu', 'proposition', 'gagne', 'perdu', 'hors_cible')),
  lost_reason text,
  offer text check (offer is null or offer in ('poei', 'fle', 'akto', 'haccp')),
  owner_user_id uuid references public.profiles(id) on delete set null,
  first_contact_at timestamptz,
  last_contact_at timestamptz,
  attempts integer not null default 0,
  next_action text,
  next_action_on date,
  -- Rendez-vous avec la direction
  rdv_at timestamptz,
  rdv_mode text check (rdv_mode is null or rdv_mode in ('telephone', 'sur_site', 'visio')),
  rdv_outcome text check (rdv_outcome is null or rdv_outcome in ('a_venir', 'tenu', 'no_show', 'reporte')),
  rdv_reminder_sent_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employer_leads_org_status_idx on public.employer_leads (org_id, status);
create index if not exists employer_leads_org_received_idx on public.employer_leads (org_id, received_at desc);
create index if not exists employer_leads_org_next_action_idx on public.employer_leads (org_id, next_action_on);
create index if not exists employer_leads_org_rdv_idx on public.employer_leads (org_id, rdv_at);
create unique index if not exists employer_leads_org_no_uidx on public.employer_leads (org_id, lead_no);

drop trigger if exists employer_leads_updated_at on public.employer_leads;
create trigger employer_leads_updated_at before update on public.employer_leads
  for each row execute function private.set_updated_at();

-- Référence lisible L-0001 (compteur par organisation, même mécanique que A-0001 / G-0001)
create or replace function private.set_employer_lead_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_no is null then
    new.lead_no := private.next_counter(new.org_id, 'employer_lead');
  end if;
  return new;
end;
$$;
drop trigger if exists employer_leads_set_no on public.employer_leads;
create trigger employer_leads_set_no before insert on public.employer_leads
  for each row execute function private.set_employer_lead_no();

alter table public.employer_leads enable row level security;
drop policy if exists employer_leads_select on public.employer_leads;
create policy employer_leads_select on public.employer_leads for select
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator', 'setter'));
drop policy if exists employer_leads_write on public.employer_leads;
create policy employer_leads_write on public.employer_leads for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator', 'setter'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator', 'setter'));

-- ── Journal ──────────────────────────────────────────────────────────────────
create table if not exists public.employer_lead_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.employer_leads(id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('appel', 'sms', 'email', 'whatsapp', 'rdv', 'note', 'statut', 'import')),
  outcome text check (outcome is null or outcome in ('joint', 'messagerie', 'barrage', 'rappel_convenu', 'envoye', 'refus', 'rdv_pose', 'rdv_tenu', 'no_show', 'autre')),
  note text,
  by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists employer_lead_events_lead_idx on public.employer_lead_events (lead_id, at desc);
create index if not exists employer_lead_events_org_idx on public.employer_lead_events (org_id, at desc);

alter table public.employer_lead_events enable row level security;
drop policy if exists employer_lead_events_select on public.employer_lead_events;
create policy employer_lead_events_select on public.employer_lead_events for select
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator', 'setter'));
drop policy if exists employer_lead_events_write on public.employer_lead_events;
create policy employer_lead_events_write on public.employer_lead_events for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator', 'setter'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator', 'setter'));

-- Chaque tentative de contact (appel, SMS, email, WhatsApp) compte : nb de tentatives,
-- premier et dernier contact tenus à jour sur la fiche — c'est ce qui pilote la cadence
-- J0 / J1 / J3 / J6 / J10 et le KPI « rappelé sous 24 h ».
create or replace function private.bump_employer_lead_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind in ('appel', 'sms', 'email', 'whatsapp') then
    update public.employer_leads
      set attempts = attempts + 1,
          first_contact_at = least(coalesce(first_contact_at, new.at), new.at),
          last_contact_at = greatest(coalesce(last_contact_at, new.at), new.at)
      where id = new.lead_id;
  end if;
  return new;
end;
$$;
drop trigger if exists employer_lead_events_bump on public.employer_lead_events;
create trigger employer_lead_events_bump after insert on public.employer_lead_events
  for each row execute function private.bump_employer_lead_contact();

-- ── Cloisonnement du rôle setter ─────────────────────────────────────────────
-- Le setter est un prestataire commercial : il ne voit ni les apprenants ni les
-- formateurs (données personnelles). Politiques RESTRICTIVES : elles s'ajoutent
-- (en ET) aux politiques existantes, qui restent inchangées pour les autres rôles.
do $$
declare
  t text;
begin
  foreach t in array array[
    'learners', 'learner_contacts', 'enrollments', 'attendances', 'placement_tests',
    'info_meeting_invitations', 'trainers', 'trainer_documents', 'trainer_absences',
    'trainer_availabilities', 'complaints', 'survey_responses'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', t || '_no_setter', t);
      execute format(
        'create policy %I on public.%I as restrictive for select using (private.jwt_role() is distinct from ''setter'')',
        t || '_no_setter', t
      );
    end if;
  end loop;
end $$;

select
  to_regclass('public.employer_leads') is not null as leads_ok,
  to_regclass('public.employer_lead_events') is not null as events_ok,
  exists (select 1 from pg_enum e join pg_type ty on ty.oid = e.enumtypid where ty.typname = 'app_role' and e.enumlabel = 'setter') as setter_role_ok,
  (select count(*) from pg_policies where policyname like '%_no_setter') as restrictive_policies;
