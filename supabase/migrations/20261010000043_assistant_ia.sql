-- Assistant IA (Claude) : rappels datés extraits des notes et journal des appels au modèle.
--   reminders : « rappeler jeudi après 17h » → ligne datée dans « À faire aujourd'hui »
--   ai_calls  : qui a appelé quoi, combien de jetons (suivi du coût dans Paramètres)

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  learner_id uuid references public.learners(id) on delete cascade,
  text text not null,
  due_on date not null,
  due_time time,
  source text not null default 'manuel' check (source in ('manuel', 'note', 'assistant')),
  created_by uuid references public.profiles(id) on delete set null,
  done_at timestamptz,
  done_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists reminders_org_due_idx on public.reminders (org_id, due_on) where done_at is null;
alter table public.reminders enable row level security;
drop policy if exists reminders_select on public.reminders;
create policy reminders_select on public.reminders for select using (org_id = private.jwt_org_id());
drop policy if exists reminders_write on public.reminders;
create policy reminders_write on public.reminders for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

create table if not exists public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  feature text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ai_calls_org_created_idx on public.ai_calls (org_id, created_at desc);
alter table public.ai_calls enable row level security;
drop policy if exists ai_calls_select on public.ai_calls;
create policy ai_calls_select on public.ai_calls for select
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));
drop policy if exists ai_calls_insert on public.ai_calls;
create policy ai_calls_insert on public.ai_calls for insert
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

select to_regclass('public.reminders') is not null as reminders_ok, to_regclass('public.ai_calls') is not null as ai_calls_ok;
