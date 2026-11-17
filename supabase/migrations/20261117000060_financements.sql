-- 0060 · Module « Financements », lot 1 (le socle).
-- Veille des appels (opportunités), dossiers de demande, échéances et rappels, fiche
-- enrichie des financeurs. Spécification : bureau Financements de l'Asso PEF, 17/11/2026.
--
-- Additive : 4 tables nouvelles, 7 colonnes ajoutées à funders (code et color intacts),
-- aucune donnée existante modifiée. Aucune donnée personnelle d'apprenant : des appels
-- publics, des dossiers de l'association, des contacts professionnels de financeurs.
--
-- Accès : admin et coordinator seulement (lecture et écriture). Les autres rôles
-- (trainer, viewer, setter, stagiaire) ne voient rien du module.
--
-- Les valeurs fermées sont des text + check (comme watch_entries) plutôt que des types
-- enum : on peut en ajouter une plus tard sans migration en deux temps.

-- ── 1. Financeurs : fiche enrichie ────────────────────────────────────────────
alter table public.funders
  add column if not exists kind text,
  add column if not exists website text,
  add column if not exists portal text,
  add column if not exists portal_account_ref text,
  add column if not exists contacts jsonb not null default '[]'::jsonb,
  add column if not exists usual_rules text,
  add column if not exists notes text;

alter table public.funders drop constraint if exists funders_kind_check;
alter table public.funders add constraint funders_kind_check
  check (kind is null or kind in ('etat', 'region', 'departement', 'commune', 'intercommunalite', 'europe', 'fondation', 'entreprise', 'autre'));
alter table public.funders drop constraint if exists funders_portal_check;
alter table public.funders add constraint funders_portal_check
  check (portal is null or portal in ('dauphin', 'compte_asso', 'sub_cd93', 'mesdemarches_idf', 'e_synergie', 'plateforme_fondation', 'courriel', 'autre'));
alter table public.funders drop constraint if exists funders_contacts_check;
alter table public.funders add constraint funders_contacts_check
  check (jsonb_typeof(contacts) = 'array');

-- La coordination peut créer et compléter une fiche financeur (jamais la supprimer :
-- un financeur porte aussi les couleurs du planning et les groupes).
drop policy if exists funders_coord_insert on public.funders;
create policy funders_coord_insert on public.funders for insert
  with check (org_id = private.jwt_org_id() and private.jwt_role() = 'coordinator');
drop policy if exists funders_coord_update on public.funders;
create policy funders_coord_update on public.funders for update
  using (org_id = private.jwt_org_id() and private.jwt_role() = 'coordinator')
  with check (org_id = private.jwt_org_id() and private.jwt_role() = 'coordinator');

-- ── 2. Opportunités repérées (la veille) ──────────────────────────────────────
create table if not exists public.funding_opportunities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  family text not null check (family in ('aap', 'appel_offres', 'mecenat')),
  title text not null check (length(trim(title)) > 0),
  funder_id uuid references public.funders(id) on delete set null,
  funder_name text,
  url text,
  opens_on date,
  deadline_at timestamptz,
  amount_min numeric(12,2) check (amount_min is null or amount_min >= 0),
  amount_max numeric(12,2) check (amount_max is null or amount_max >= 0),
  max_rate numeric(5,2) check (max_rate is null or (max_rate >= 0 and max_rate <= 100)),
  summary text not null default '',
  eligibility_notes text,
  watch_status text not null default 'nouveau'
    check (watch_status in ('nouveau', 'a_surveiller', 'a_evaluer', 'ecarte', 'retenu')),
  discard_reason text,
  source text not null default 'saisie' check (source in ('collecteur', 'saisie')),
  dedupe_key text,
  next_window_note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Écarter = dire pourquoi (une ligne suffit).
  constraint funding_opportunities_discard_reason_check
    check (watch_status <> 'ecarte' or length(trim(coalesce(discard_reason, ''))) > 0),
  constraint funding_opportunities_amounts_check
    check (amount_min is null or amount_max is null or amount_min <= amount_max),
  -- Contrainte (et non index partiel) : utilisable par « on conflict » côté API.
  -- Plusieurs saisies manuelles sans clé (null) restent possibles.
  constraint funding_opportunities_dedupe_key_uniq unique (org_id, dedupe_key)
);
create index if not exists funding_opportunities_org_status_idx on public.funding_opportunities (org_id, watch_status);
create index if not exists funding_opportunities_org_deadline_idx on public.funding_opportunities (org_id, deadline_at);
create index if not exists funding_opportunities_funder_idx on public.funding_opportunities (funder_id);
drop trigger if exists funding_opportunities_updated_at on public.funding_opportunities;
create trigger funding_opportunities_updated_at before update on public.funding_opportunities
  for each row execute function private.set_updated_at();

-- ── 3. Dossiers de demande ────────────────────────────────────────────────────
create table if not exists public.funding_applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid references public.funding_opportunities(id) on delete set null,
  funder_id uuid not null references public.funders(id) on delete restrict,
  title text not null check (length(trim(title)) > 0),
  stage text not null default 'on_y_va'
    check (stage in ('on_y_va', 'en_redaction', 'depose', 'accorde', 'refuse', 'bilan_rendu', 'abandonne')),
  owner_id uuid references public.profiles(id) on delete set null,
  next_step text,
  next_step_due date,
  -- Date limite de dépôt du dossier (reprise de l'opportunité à la création). Ajout par
  -- rapport à la spécification : un dossier sans opportunité (reconduction, subvention
  -- déjà accordée) a aussi besoin de sa date, et la carte du pipeline l'affiche.
  deadline_at timestamptz,
  amount_requested numeric(12,2) check (amount_requested is null or amount_requested >= 0),
  amount_granted numeric(12,2) check (amount_granted is null or amount_granted >= 0),
  -- Date de l'accord (compteurs « accordés cette année ») : posée au passage en « accordé ».
  granted_on date,
  portal text check (portal is null or portal in ('dauphin', 'compte_asso', 'sub_cd93', 'mesdemarches_idf', 'e_synergie', 'plateforme_fondation', 'courriel', 'autre')),
  portal_ref text,
  drive_url text,
  go_score smallint check (go_score is null or go_score between 0 and 10),  -- lot 2
  notes text,
  -- Clé de reprise (scripts/import-financements.ts) : rend l'import relançable.
  import_key text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funding_applications_import_key_uniq unique (org_id, import_key)
);
create index if not exists funding_applications_org_stage_idx on public.funding_applications (org_id, stage);
create index if not exists funding_applications_owner_idx on public.funding_applications (owner_id);
create index if not exists funding_applications_funder_idx on public.funding_applications (funder_id);
create index if not exists funding_applications_opportunity_idx on public.funding_applications (opportunity_id);
drop trigger if exists funding_applications_updated_at on public.funding_applications;
create trigger funding_applications_updated_at before update on public.funding_applications
  for each row execute function private.set_updated_at();

-- Historique des statuts (une ligne par changement, posée par trigger : aucun chemin
-- d'écriture — écran, glisser-déposer, import — ne peut l'oublier).
create table if not exists public.funding_application_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  application_id uuid not null references public.funding_applications(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  author_id uuid references public.profiles(id) on delete set null,
  comment text,
  created_at timestamptz not null default now()
);
create index if not exists funding_application_events_app_idx on public.funding_application_events (application_id, created_at desc);

-- ── 4. Échéances ──────────────────────────────────────────────────────────────
create table if not exists public.funding_deadlines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('depot', 'compte_rendu', 'versement', 'rendez_vous', 'piece', 'autre')),
  due_at timestamptz not null,
  title text not null check (length(trim(title)) > 0),
  application_id uuid references public.funding_applications(id) on delete cascade,
  opportunity_id uuid references public.funding_opportunities(id) on delete cascade,
  funder_id uuid references public.funders(id) on delete cascade,
  done_at timestamptz,
  reminder_days integer[] not null default '{30,15,3}',
  -- Échéance de dépôt tenue automatiquement à jour depuis l'opportunité ou le dossier.
  auto_origin text check (auto_origin is null or auto_origin in ('opportunity', 'application')),
  import_key text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funding_deadlines_link_check
    check (application_id is not null or opportunity_id is not null or funder_id is not null),
  constraint funding_deadlines_auto_check
    check (auto_origin is null
      or (auto_origin = 'opportunity' and opportunity_id is not null)
      or (auto_origin = 'application' and application_id is not null)),
  constraint funding_deadlines_import_key_uniq unique (org_id, import_key)
);
create index if not exists funding_deadlines_org_due_idx on public.funding_deadlines (org_id, due_at) where done_at is null;
create index if not exists funding_deadlines_application_idx on public.funding_deadlines (application_id);
create index if not exists funding_deadlines_opportunity_idx on public.funding_deadlines (opportunity_id);
create index if not exists funding_deadlines_funder_idx on public.funding_deadlines (funder_id);
-- Une seule échéance automatique par opportunité et par dossier.
create unique index if not exists funding_deadlines_auto_opp_uniq
  on public.funding_deadlines (opportunity_id) where auto_origin = 'opportunity';
create unique index if not exists funding_deadlines_auto_app_uniq
  on public.funding_deadlines (application_id) where auto_origin = 'application';
drop trigger if exists funding_deadlines_updated_at on public.funding_deadlines;
create trigger funding_deadlines_updated_at before update on public.funding_deadlines
  for each row execute function private.set_updated_at();

-- ── 5. Triggers : historique des statuts ──────────────────────────────────────
create or replace function private.funding_application_log_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into public.funding_application_events (org_id, application_id, from_stage, to_stage, author_id)
    values (new.org_id, new.id, case when tg_op = 'INSERT' then null else old.stage end, new.stage, auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists funding_applications_log_stage on public.funding_applications;
create trigger funding_applications_log_stage after insert or update of stage on public.funding_applications
  for each row execute function private.funding_application_log_stage();

-- ── 6. Triggers : échéance de dépôt automatique ──────────────────────────────
-- Opportunité avec date limite → une échéance « dépôt », mise à jour si la date change,
-- retirée si la date disparaît ou si l'opportunité est écartée. Dès qu'un dossier naît
-- de l'opportunité, c'est le dossier qui porte l'échéance (pas de doublon).
create or replace function private.funding_opportunity_sync_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.funding_applications a where a.opportunity_id = new.id) then
    return new;
  end if;
  if new.deadline_at is null or new.watch_status = 'ecarte' then
    delete from public.funding_deadlines
      where opportunity_id = new.id and auto_origin = 'opportunity' and done_at is null;
    return new;
  end if;
  insert into public.funding_deadlines (org_id, kind, due_at, title, opportunity_id, funder_id, auto_origin)
  values (new.org_id, 'depot', new.deadline_at, 'Dépôt — ' || new.title, new.id, new.funder_id, 'opportunity')
  on conflict (opportunity_id) where auto_origin = 'opportunity'
  do update set
    due_at = excluded.due_at,
    funder_id = excluded.funder_id,
    -- Le titre n'est réécrit que si la date change (un titre précisé à la main reste).
    title = case when public.funding_deadlines.due_at = excluded.due_at then public.funding_deadlines.title else excluded.title end;
  return new;
end;
$$;
drop trigger if exists funding_opportunities_sync_deadline on public.funding_opportunities;
create trigger funding_opportunities_sync_deadline
  after insert or update of deadline_at, watch_status, funder_id on public.funding_opportunities
  for each row execute function private.funding_opportunity_sync_deadline();

-- Dossier avec date limite → son échéance « dépôt ». Elle est cochée « faite » quand le
-- dossier est déposé (ou abandonné, accordé, refusé, bilan rendu).
create or replace function private.funding_application_sync_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.opportunity_id is not null then
    delete from public.funding_deadlines
      where opportunity_id = new.opportunity_id and auto_origin = 'opportunity' and done_at is null;
  end if;

  if new.deadline_at is null then
    delete from public.funding_deadlines
      where application_id = new.id and auto_origin = 'application' and done_at is null;
    return new;
  end if;

  -- Lien par le dossier seulement (pas d'opportunity_id) : supprimer l'opportunité plus
  -- tard ne doit pas emporter l'échéance du dossier (cascade).
  insert into public.funding_deadlines (org_id, kind, due_at, title, application_id, funder_id, auto_origin)
  values (new.org_id, 'depot', new.deadline_at, 'Dépôt — ' || new.title, new.id, new.funder_id, 'application')
  on conflict (application_id) where auto_origin = 'application'
  do update set
    due_at = excluded.due_at,
    funder_id = excluded.funder_id,
    title = case when public.funding_deadlines.due_at = excluded.due_at then public.funding_deadlines.title else excluded.title end;

  if new.stage in ('depose', 'accorde', 'refuse', 'bilan_rendu', 'abandonne') then
    update public.funding_deadlines set done_at = now()
      where application_id = new.id and auto_origin = 'application' and done_at is null;
  end if;
  return new;
end;
$$;
drop trigger if exists funding_applications_sync_deadline on public.funding_applications;
create trigger funding_applications_sync_deadline
  after insert or update of deadline_at, stage, funder_id, opportunity_id on public.funding_applications
  for each row execute function private.funding_application_sync_deadline();

revoke execute on function private.funding_application_log_stage() from public;
revoke execute on function private.funding_opportunity_sync_deadline() from public;
revoke execute on function private.funding_application_sync_deadline() from public;

-- ── 7. RLS : admin et coordinator de l'organisation, rien pour les autres ─────
alter table public.funding_opportunities enable row level security;
drop policy if exists funding_opportunities_team on public.funding_opportunities;
create policy funding_opportunities_team on public.funding_opportunities for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

alter table public.funding_applications enable row level security;
drop policy if exists funding_applications_team on public.funding_applications;
create policy funding_applications_team on public.funding_applications for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

-- Historique : lecture par l'équipe ; le commentaire d'un changement est complété par
-- son auteur juste après (update) ; pas de suppression à la main.
alter table public.funding_application_events enable row level security;
drop policy if exists funding_application_events_select on public.funding_application_events;
create policy funding_application_events_select on public.funding_application_events for select
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));
drop policy if exists funding_application_events_comment on public.funding_application_events;
create policy funding_application_events_comment on public.funding_application_events for update
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator') and author_id = auth.uid())
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator') and author_id = auth.uid());

alter table public.funding_deadlines enable row level security;
drop policy if exists funding_deadlines_team on public.funding_deadlines;
create policy funding_deadlines_team on public.funding_deadlines for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));
