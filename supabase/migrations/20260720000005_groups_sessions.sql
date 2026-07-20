-- Cœur planning : groupes, séances matérialisées, calendrier de fermetures, apprenants (V3, vides)
create type public.group_status as enum ('en_attente', 'ouvert', 'complet', 'termine', 'annule');
create type public.session_status as enum ('planifiee', 'realisee', 'annulee');
create type public.closure_kind as enum ('jour_ferie', 'vacances_scolaires', 'fermeture_org');

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id),
  funder_id uuid references public.funders(id),
  name text not null,
  starts_on date not null,
  ends_on date,                                    -- recalculée après génération des séances
  total_hours numeric(6,1) not null,               -- copié du program, surchargeable
  trainer_id uuid references public.trainers(id),  -- formateur PAR DÉFAUT
  room_id uuid references public.rooms(id),        -- salle par défaut
  capacity smallint,
  enrolled_count smallint not null default 0,      -- V1 : saisi à la main ; V3 : dérivé de enrollments
  status public.group_status not null default 'en_attente',
  weekly_pattern jsonb,                            -- [{"weekday":1,"start":"09:00","end":"12:00"}, …]
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger groups_updated_at before update on public.groups
  for each row execute function private.set_updated_at();
create index groups_org_idx on public.groups (org_id, status);

-- Séances MATÉRIALISÉES (pas de RRULE) : une exception = un UPDATE d'une ligne
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  trainer_id uuid references public.trainers(id),  -- surchargeable séance par séance (remplacement)
  room_id uuid references public.rooms(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.session_status not null default 'planifiee',
  generated boolean not null default true,         -- true = créée par le moteur
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at),

  -- Verrous anti-conflit : Postgres tranche, l'UI affiche
  constraint no_trainer_overlap exclude using gist (
    trainer_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'annulee' and trainer_id is not null),

  constraint no_room_overlap exclude using gist (
    room_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'annulee' and room_id is not null)
);
create trigger sessions_updated_at before update on public.sessions
  for each row execute function private.set_updated_at();
create index sessions_org_start_idx on public.sessions (org_id, starts_at);
create index sessions_group_idx on public.sessions (group_id);
create index sessions_trainer_start_idx on public.sessions (trainer_id, starts_at);
create index sessions_room_start_idx on public.sessions (room_id, starts_at);

-- Fériés, vacances scolaires (zone), fermetures org. org_id NULL = entrée globale partagée.
create table public.calendar_closures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,  -- NULL = global
  kind public.closure_kind not null,
  zone text,                                       -- 'C' pour les vacances scolaires ; null sinon
  label text not null,
  starts_on date not null,
  ends_on date not null,
  check (starts_on <= ends_on)
);
create index calendar_closures_range_idx on public.calendar_closures (starts_on, ends_on);

-- V3 (créées vides dès maintenant pour que enrolled_count devienne une vue sans migration lourde)
create table public.learners (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  birth_date date,
  phone text,
  email text,
  nationality text,
  first_language text,
  level_assessed text,
  france_travail_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger learners_updated_at before update on public.learners
  for each row execute function private.set_updated_at();

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  status text not null default 'inscrit',          -- 'inscrit' | 'abandon' | 'termine'
  enrolled_on date not null default current_date,
  unique (group_id, learner_id)
);
