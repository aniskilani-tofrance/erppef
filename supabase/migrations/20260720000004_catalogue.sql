-- Catalogue : financeurs et dispositifs
create type public.modality as enum ('presentiel', 'distanciel', 'hybride');

-- Table (pas enum) : la palette de couleurs du planning vit ici
create table public.funders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  color text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);
create trigger funders_updated_at before update on public.funders
  for each row execute function private.set_updated_at();

-- Dispositifs : PEF A1, PEF A2, prépa examen, FLESTO, RAN…
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  total_hours numeric(6,1) not null,
  default_weeks smallint,
  default_funder_id uuid references public.funders(id) on delete set null,
  level text,                                -- 'A1.1' | 'A1' | 'A2' | 'B1' | 'B2' | null
  modality public.modality not null default 'presentiel',
  default_weekly_hours numeric(4,1),         -- rythme par défaut pour le moteur
  required_skills text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);
create trigger programs_updated_at before update on public.programs
  for each row execute function private.set_updated_at();
