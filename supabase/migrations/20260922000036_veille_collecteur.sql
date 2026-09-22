-- Veille Qualiopi automatisée : le collecteur (Manus) dépose chaque semaine des fiches
-- dans le registre de veille de l'ERP, qui reste la source de vérité.
--
--   watch_entries           : colonnes strictes du collecteur (dates, indicateur, titre,
--                             impact, exploitation, alerte, statut, dedupe_key, run_id)
--   veille_runs             : journal des exécutions (compteurs, CSV de secours, message)
--   veille_monthly_notes    : notes mensuelles de synthèse
--   veille_ingest_batch()   : insertion transactionnelle d'un lot (tout ou rien),
--                             idempotente par dedupe_key, journalisée par run_id
--
-- Aucune donnée personnelle dans ces tables : des sources publiques, des résumés,
-- des compteurs. Le jeton d'API n'est jamais stocké en base.

alter table public.watch_entries
  add column if not exists title text,
  add column if not exists published_on date,
  add column if not exists collected_on date,
  add column if not exists indicator smallint,
  add column if not exists impact text,
  add column if not exists exploitation text,
  add column if not exists alert boolean not null default false,
  add column if not exists status text not null default 'validee',
  add column if not exists origin text not null default 'manuel',
  add column if not exists dedupe_key text,
  add column if not exists run_id text;

alter table public.watch_entries drop constraint if exists watch_entries_category_check;
alter table public.watch_entries add constraint watch_entries_category_check
  check (category in ('legale', 'metiers', 'pedagogique', 'handicap'));
alter table public.watch_entries drop constraint if exists watch_entries_indicator_check;
alter table public.watch_entries add constraint watch_entries_indicator_check
  check (indicator is null or indicator in (23, 24, 25, 26));
alter table public.watch_entries drop constraint if exists watch_entries_status_check;
alter table public.watch_entries add constraint watch_entries_status_check
  check (status in ('a_valider', 'validee', 'ecartee'));
alter table public.watch_entries drop constraint if exists watch_entries_origin_check;
alter table public.watch_entries add constraint watch_entries_origin_check
  check (origin in ('manuel', 'collecteur'));

-- Unicité de la clé de déduplication par organisation (les entrées manuelles n'en ont pas).
create unique index if not exists watch_entries_dedupe_key_uniq
  on public.watch_entries (org_id, dedupe_key) where dedupe_key is not null;
create index if not exists watch_entries_run_idx on public.watch_entries (org_id, run_id);
create index if not exists watch_entries_status_idx on public.watch_entries (org_id, status);

-- Journal des exécutions du collecteur
create table if not exists public.veille_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  run_id text not null,
  status text not null default 'en_cours' check (status in ('en_cours', 'succes', 'partiel', 'echec')),
  started_at timestamptz,
  finished_at timestamptz,
  received integer not null default 0,   -- fiches reçues dans le dernier lot
  created integer not null default 0,    -- fiches créées (cumul sur le run)
  ignored integer not null default 0,    -- doublons ignorés dans le dernier lot
  rejected integer not null default 0,   -- fiches rejetées (lot refusé) dans la dernière tentative
  replays integer not null default 0,    -- nombre de rejeux du même run_id
  batch_at timestamptz,                  -- dernier lot reçu
  csv_url text,                          -- lien vers un éventuel CSV de secours
  csv_name text,
  message text,                          -- compte rendu libre, sans donnée personnelle
  stats jsonb not null default '{}'::jsonb,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, run_id)
);
create index if not exists veille_runs_org_idx on public.veille_runs (org_id, created_at desc);
drop trigger if exists veille_runs_updated_at on public.veille_runs;
create trigger veille_runs_updated_at before update on public.veille_runs
  for each row execute function private.set_updated_at();

alter table public.veille_runs enable row level security;
drop policy if exists veille_runs_select on public.veille_runs;
create policy veille_runs_select on public.veille_runs for select
  using (org_id = private.jwt_org_id());
drop policy if exists veille_runs_write on public.veille_runs;
create policy veille_runs_write on public.veille_runs for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

-- Notes mensuelles de veille (une par mois et par organisation)
create table if not exists public.veille_monthly_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  title text not null,
  content text not null,
  run_id text,
  entries_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, month)
);
create index if not exists veille_monthly_notes_org_idx on public.veille_monthly_notes (org_id, month desc);
drop trigger if exists veille_monthly_notes_updated_at on public.veille_monthly_notes;
create trigger veille_monthly_notes_updated_at before update on public.veille_monthly_notes
  for each row execute function private.set_updated_at();

alter table public.veille_monthly_notes enable row level security;
drop policy if exists veille_monthly_notes_select on public.veille_monthly_notes;
create policy veille_monthly_notes_select on public.veille_monthly_notes for select
  using (org_id = private.jwt_org_id());
drop policy if exists veille_monthly_notes_write on public.veille_monthly_notes;
create policy veille_monthly_notes_write on public.veille_monthly_notes for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

-- Insertion transactionnelle d'un lot de fiches validées côté serveur (Next.js).
-- Tout ou rien : une erreur sur une fiche annule l'ensemble. Une fiche dont la
-- dedupe_key existe déjà est ignorée (doublon), jamais modifiée. Le run est journalisé
-- dans la même transaction. Réservée au rôle service (jamais appelée depuis le navigateur).
create or replace function public.veille_ingest_batch(p_org uuid, p_run_id text, p_entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e jsonb;
  v_id uuid;
  v_key text;
  v_created jsonb := '[]'::jsonb;
  v_ignored jsonb := '[]'::jsonb;
  v_n integer := 0;
  v_c integer := 0;
  v_i integer := 0;
  v_replay boolean := false;
begin
  if p_org is null or p_run_id is null or p_run_id = '' or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'veille_ingest_batch : paramètres invalides';
  end if;

  select exists (
    select 1 from public.veille_runs r where r.org_id = p_org and r.run_id = p_run_id and r.batch_at is not null
  ) into v_replay;

  for e in select * from jsonb_array_elements(p_entries) loop
    v_n := v_n + 1;
    v_id := null;
    v_key := e ->> 'dedupe_key';
    insert into public.watch_entries (
      org_id, entry_date, published_on, collected_on, indicator, category, title, source, url,
      summary, impact, exploitation, alert, status, origin, dedupe_key, run_id, shared_with_team
    ) values (
      p_org,
      (e ->> 'collected_on')::date,
      (e ->> 'published_on')::date,
      (e ->> 'collected_on')::date,
      (e ->> 'indicator')::smallint,
      e ->> 'category',
      e ->> 'title',
      e ->> 'source',
      e ->> 'url',
      e ->> 'summary',
      nullif(e ->> 'impact', ''),
      nullif(e ->> 'exploitation', ''),
      coalesce((e ->> 'alert')::boolean, false),
      'a_valider',
      'collecteur',
      v_key,
      p_run_id,
      false
    )
    on conflict (org_id, dedupe_key) where dedupe_key is not null do nothing
    returning id into v_id;

    if v_id is null then
      v_i := v_i + 1;
      v_ignored := v_ignored || jsonb_build_object('dedupe_key', v_key, 'motif', 'doublon');
    else
      v_c := v_c + 1;
      v_created := v_created || jsonb_build_object('dedupe_key', v_key, 'id', v_id);
    end if;
  end loop;

  insert into public.veille_runs (org_id, run_id, status, received, created, ignored, rejected, batch_at, started_at)
  values (p_org, p_run_id, 'en_cours', v_n, v_c, v_i, 0, now(), now())
  on conflict (org_id, run_id) do update set
    received = excluded.received,
    created = public.veille_runs.created + excluded.created,
    ignored = excluded.ignored,
    rejected = 0,
    batch_at = now(),
    replays = public.veille_runs.replays + (case when public.veille_runs.batch_at is not null then 1 else 0 end);

  return jsonb_build_object('recues', v_n, 'creees', v_created, 'ignorees', v_ignored, 'rejeu', v_replay);
end;
$$;

revoke all on function public.veille_ingest_batch(uuid, text, jsonb) from public;
revoke all on function public.veille_ingest_batch(uuid, text, jsonb) from anon, authenticated;
grant execute on function public.veille_ingest_batch(uuid, text, jsonb) to service_role;

select
  to_regclass('public.veille_runs') is not null as runs_ok,
  to_regclass('public.veille_monthly_notes') is not null as notes_ok,
  to_regprocedure('public.veille_ingest_batch(uuid, text, jsonb)') is not null as rpc_ok;
