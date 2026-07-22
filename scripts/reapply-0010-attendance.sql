-- Version idempotente de 20260723000010_attendance.sql : peut être collée dans le
-- SQL Editor autant de fois que nécessaire (utile après un « Failed to fetch » où l'on
-- ignore si la première tentative a partiellement abouti).

do $$ begin
  create type public.attendance_status as enum ('present', 'retard', 'absent');
exception when duplicate_object then null; end $$;

alter table public.sessions
  add column if not exists attendance_token uuid,
  add column if not exists attendance_opened_at timestamptz,
  add column if not exists attendance_closed_at timestamptz,
  add column if not exists trainer_signature text;

create index if not exists sessions_attendance_token_idx
  on public.sessions (attendance_token) where attendance_token is not null;

create table if not exists public.attendances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  status public.attendance_status not null default 'present',
  signature text,
  signed_at timestamptz,
  method text not null default 'tablette' check (method in ('tablette', 'sms', 'manuel')),
  device text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, learner_id)
);

drop trigger if exists attendances_updated_at on public.attendances;
create trigger attendances_updated_at before update on public.attendances
  for each row execute function private.set_updated_at();

alter table public.attendances enable row level security;

drop policy if exists attendances_select on public.attendances;
create policy attendances_select on public.attendances for select
  using (org_id = private.jwt_org_id());

drop policy if exists attendances_write on public.attendances;
create policy attendances_write on public.attendances for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator', 'trainer'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator', 'trainer'));

-- Vérification : doit retourner cols = 4 et table_ok = true.
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'sessions' and column_name like 'attendance%') as cols,
  to_regclass('public.attendances') is not null as table_ok;
