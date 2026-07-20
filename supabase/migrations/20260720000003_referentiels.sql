-- Référentiels RH & logistique : formateurs, disponibilités, absences, salles
create type public.contract_type as enum ('salarie', 'vacataire');
create type public.absence_kind as enum ('conge', 'maladie', 'formation', 'autre');

create table public.trainers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  photo_url text,
  contract_type public.contract_type not null,
  hourly_cost numeric(8,2) not null,               -- coût chargé €/h
  weekly_hours_max numeric(5,2) not null default 35,
  priority smallint not null default 100,          -- plus petit = prioritaire (tie-break manuel)
  skills text[] not null default '{}',
  languages text[] not null default '{}',
  color text,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- Aucun compteur d'heures stocké : tout est calculé par les vues
);
create trigger trainers_updated_at before update on public.trainers
  for each row execute function private.set_updated_at();
create index trainers_org_idx on public.trainers (org_id);

alter table public.memberships
  add constraint memberships_trainer_fk
  foreign key (trainer_id) references public.trainers(id) on delete set null;

-- Disponibilités récurrentes hebdo (heures LOCALES Europe/Paris)
create table public.trainer_availabilities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),  -- 1 = lundi (ISO)
  start_time time not null,
  end_time time not null,
  check (start_time < end_time)
);
create index trainer_availabilities_trainer_idx on public.trainer_availabilities (trainer_id);

-- Absences (vacances, maladie…) — plages de dates inclusives, sans chevauchement
create table public.trainer_absences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  kind public.absence_kind not null default 'conge',
  note text,
  created_at timestamptz not null default now(),
  check (starts_on <= ends_on),
  constraint no_absence_overlap exclude using gist (
    trainer_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  )
);
create index trainer_absences_trainer_idx on public.trainer_absences (trainer_id);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  capacity smallint not null,
  color text,
  equipment text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);
create trigger rooms_updated_at before update on public.rooms
  for each row execute function private.set_updated_at();

create table public.room_unavailabilities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  note text,
  check (starts_on <= ends_on),
  constraint no_room_unavailability_overlap exclude using gist (
    room_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  )
);
