-- 0050 · Rendez-vous d'admission individuels (entretien, test oral…).
-- Jusqu'ici l'ERP ne connaissait que les réunions d'information collectives
-- (info_meetings) : les rendez-vous individuels étaient notés sur un cahier.
-- Chaque rendez-vous est poussé vers l'agenda Google « Admissions PEF — Rendez-vous »
-- (agenda du compte de service, partagé en écriture avec la direction) ; les colonnes
-- gcal_* gardent l'état de cette synchronisation (pastille « dans Google Agenda »).
-- La trace côté parcours reste le journal learner_contacts (posé, déplacé, annulé,
-- honoré, absent). Additive et idempotente.

create table if not exists public.admission_appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind text not null default 'entretien' check (kind in ('entretien', 'test_oral', 'autre')),
  mode text not null default 'sur_site' check (mode in ('sur_site', 'telephone', 'visio')),
  location text,
  notes text,
  status text not null default 'prevu' check (status in ('prevu', 'honore', 'absent', 'annule')),
  gcal_event_id text,
  gcal_synced_at timestamptz,
  gcal_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admission_appointments_duree_check check (ends_at > starts_at)
);
create index if not exists admission_appointments_org_idx on public.admission_appointments (org_id, starts_at);
create index if not exists admission_appointments_learner_idx on public.admission_appointments (learner_id, starts_at desc);

drop trigger if exists admission_appointments_updated_at on public.admission_appointments;
create trigger admission_appointments_updated_at before update on public.admission_appointments
  for each row execute function private.set_updated_at();

alter table public.admission_appointments enable row level security;
drop policy if exists admission_appointments_select on public.admission_appointments;
create policy admission_appointments_select on public.admission_appointments for select
  using (org_id = private.jwt_org_id());
drop policy if exists admission_appointments_write on public.admission_appointments;
create policy admission_appointments_write on public.admission_appointments for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

select
  to_regclass('public.admission_appointments') is not null as appointments_ok,
  (select count(*) from pg_policies where tablename = 'admission_appointments') as policies,
  (select count(*) from pg_trigger where tgname = 'admission_appointments_updated_at') as trigger_ok;
