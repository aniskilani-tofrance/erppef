-- 0049 · Prospection : listes d'appels à froid, séparées des leads.
-- Un lead est un restaurateur qui nous a sollicités (formulaire, appel entrant, terrain) ;
-- un prospect est un restaurant qu'on appelle sans qu'il ait rien demandé (ouvertures
-- SIRENE, listes achetées…). Les deux ne suivent ni la même cadence ni les mêmes messages :
--   prospect_lists   : une liste d'appels (« Ouvertures 2026 — priorité 1 — 93 »)
--   prospects        : un restaurant à appeler, avec son statut d'appel
--   prospect_calls   : le journal des appels (un résultat par appel)
-- Un prospect « intéressé » devient un lead (source 'prospection', aucun envoi automatique).
-- Aucun e-mail ni SMS ne part jamais d'un prospect. Idempotente.

-- ── Listes ───────────────────────────────────────────────────────────────────
create table if not exists public.prospect_lists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists prospect_lists_org_idx on public.prospect_lists (org_id, created_at desc);

-- ── Prospects ────────────────────────────────────────────────────────────────
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  list_id uuid not null references public.prospect_lists(id) on delete cascade,
  company text not null,
  legal_name text,
  segment text not null default 'inconnu'
    check (segment in ('rapide_franchise', 'traditionnel', 'collective', 'hotel_traiteur', 'snacking', 'hors_restauration', 'inconnu')),
  siret text,
  address text,
  postal_code text,
  city text,
  department text,
  opened_on date,
  phone text,
  email text,
  website text,
  contact_source text,
  status text not null default 'a_appeler'
    check (status in ('a_appeler', 'pas_joint', 'barrage', 'rappeler', 'interesse', 'pas_de_besoin', 'injoignable', 'ne_plus_appeler', 'hors_service')),
  attempts integer not null default 0,
  last_call_at timestamptz,
  callback_on date,
  callback_note text,
  lead_id uuid references public.employer_leads(id) on delete set null,
  notes text,
  owner_user_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prospects_list_status_idx on public.prospects (list_id, status);
create index if not exists prospects_org_callback_idx on public.prospects (org_id, callback_on);
-- Un établissement (SIRET) n'existe qu'une fois par organisation, toutes listes confondues :
-- un « Ne plus appeler » n'est jamais réimporté par une nouvelle liste.
create unique index if not exists prospects_org_siret_uidx on public.prospects (org_id, siret) where siret is not null;

drop trigger if exists prospects_updated_at on public.prospects;
create trigger prospects_updated_at before update on public.prospects
  for each row execute function private.set_updated_at();

-- ── Journal des appels ───────────────────────────────────────────────────────
create table if not exists public.prospect_calls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  at timestamptz not null default now(),
  outcome text not null
    check (outcome in ('pas_de_reponse', 'barrage', 'rappeler', 'interesse', 'pas_de_besoin', 'ne_plus_appeler', 'numero_faux', 'note')),
  note text,
  by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists prospect_calls_prospect_idx on public.prospect_calls (prospect_id, at desc);
create index if not exists prospect_calls_org_idx on public.prospect_calls (org_id, at desc);

-- Chaque appel (pas une simple note) compte une tentative et date le dernier appel.
create or replace function private.bump_prospect_call()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.outcome <> 'note' then
    update public.prospects
      set attempts = attempts + 1,
          last_call_at = greatest(coalesce(last_call_at, new.at), new.at)
      where id = new.prospect_id;
  end if;
  return new;
end;
$$;
drop trigger if exists prospect_calls_bump on public.prospect_calls;
create trigger prospect_calls_bump after insert on public.prospect_calls
  for each row execute function private.bump_prospect_call();

-- ── Droits : mêmes rôles que les leads (direction + setter) ─────────────────
do $$
declare
  t text;
begin
  foreach t in array array['prospect_lists', 'prospects', 'prospect_calls']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select using (org_id = private.jwt_org_id() and private.jwt_role() in (''admin'', ''coordinator'', ''setter''))',
      t || '_select', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all using (org_id = private.jwt_org_id() and private.jwt_role() in (''admin'', ''coordinator'', ''setter'')) with check (org_id = private.jwt_org_id() and private.jwt_role() in (''admin'', ''coordinator'', ''setter''))',
      t || '_write', t
    );
  end loop;
end $$;

-- ── Leads : nouvelle source « prospection » ─────────────────────────────────
do $$
declare
  c text;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.employer_leads'::regclass and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%source%formulaire_meta%'
  loop
    execute format('alter table public.employer_leads drop constraint %I', c);
  end loop;
end $$;
alter table public.employer_leads add constraint employer_leads_source_check
  check (source in ('formulaire_meta', 'site', 'appel_entrant', 'recommandation', 'terrain', 'prospection', 'autre'));

select
  to_regclass('public.prospect_lists') is not null as lists_ok,
  to_regclass('public.prospects') is not null as prospects_ok,
  to_regclass('public.prospect_calls') is not null as calls_ok,
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'employer_leads_source_check') as source_check;
