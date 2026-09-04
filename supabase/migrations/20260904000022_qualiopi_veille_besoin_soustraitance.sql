-- Qualiopi — les 3 critères jusqu'ici « hors ERP » :
--   critère 6 (ind. 23-25)  : registre de veille (table watch_entries)
--   critère 2 (ind. 4)      : analyse du besoin à l'entrée (colonnes learners)
--   ind. 27                 : sous-traitance (valeur 'prestataire' du type de contrat)
-- NB : la nouvelle valeur d'enum n'est PAS utilisée dans ce fichier (PG l'interdit
-- dans la même transaction) — la bascule des fiches se fait dans un second temps.

alter type public.contract_type add value if not exists 'prestataire';

-- Registre de veille (une entrée = une lecture/source datée, catégorisée)
create table if not exists public.watch_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entry_date date not null default current_date,
  category text not null check (category in ('legale', 'metiers', 'pedagogique')),
  source text not null,           -- nom de la source (Centre Inffo, DGEFP, revue…)
  url text,
  summary text not null,          -- ce qu'on en retient, en 2 lignes
  shared_with_team boolean not null default false,  -- diffusé à l'équipe (preuve d'exploitation)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists watch_entries_org_idx on public.watch_entries (org_id, entry_date desc);
drop trigger if exists watch_entries_updated_at on public.watch_entries;
create trigger watch_entries_updated_at before update on public.watch_entries
  for each row execute function private.set_updated_at();

alter table public.watch_entries enable row level security;
drop policy if exists watch_entries_select on public.watch_entries;
create policy watch_entries_select on public.watch_entries for select
  using (org_id = private.jwt_org_id());
drop policy if exists watch_entries_write on public.watch_entries;
create policy watch_entries_write on public.watch_entries for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

-- Analyse du besoin à l'entrée (ind. 4) — saisie progressive, tout nullable
alter table public.learners
  add column if not exists entry_goal text,          -- code du référentiel (GOALS)
  add column if not exists entry_need text,          -- besoin exprimé, texte libre
  add column if not exists entry_interview_on date;  -- date de l'entretien d'entrée
