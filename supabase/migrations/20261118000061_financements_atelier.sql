-- 0061 · Module « Financements », lot 2 (l'atelier d'écriture).
-- Rubriques d'un dossier (dans l'ordre du formulaire du financeur), versions gardées
-- d'une rubrique, bibliothèque de textes réutilisables. L'appel garde ses critères et la
-- liste de ses pièces.
--
-- Additive : 3 tables nouvelles, 1 colonne ajoutée à funding_applications, 2 à
-- funding_opportunities. Aucune donnée existante modifiée. Aucune donnée personnelle
-- d'apprenant : des textes de l'association, écrits pour des financeurs.
--
-- Accès : admin et coordinator seulement, comme le reste du module (migration 0060).

-- ── 1. Compléments sur l'existant ─────────────────────────────────────────────
-- Modèle de rubriques choisi pour le dossier (dauphin_pdv, cerfa_12156, region, fondation, libre).
alter table public.funding_applications
  add column if not exists template_key text;

-- Ce que l'appel demande : critères de sélection et pièces à joindre (texte libre).
alter table public.funding_opportunities
  add column if not exists criteria text,
  add column if not exists required_documents text;

-- ── 2. Rubriques du dossier ───────────────────────────────────────────────────
create table if not exists public.funding_application_sections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  application_id uuid not null references public.funding_applications(id) on delete cascade,
  position integer not null default 0,
  title text not null check (length(trim(title)) > 0),
  -- Ce que le financeur attend dans cette rubrique (rappel pour la personne et pour l'IA).
  guidance text,
  -- Limite du formulaire du financeur, en caractères, espaces comprises. Vide = pas de limite connue.
  max_chars integer check (max_chars is null or max_chars > 0),
  content text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists funding_application_sections_app_idx on public.funding_application_sections (application_id, position);
drop trigger if exists funding_application_sections_updated_at on public.funding_application_sections;
create trigger funding_application_sections_updated_at before update on public.funding_application_sections
  for each row execute function private.set_updated_at();

-- Versions gardées d'une rubrique : le texte d'avant un remplacement par l'IA, ou une
-- version que l'équipe choisit de garder. On peut toujours revenir en arrière.
create table if not exists public.funding_section_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  section_id uuid not null references public.funding_application_sections(id) on delete cascade,
  content text not null,
  -- D'où vient la version gardée : écrite à la main, ou proposée par l'IA puis acceptée.
  source text not null default 'manuel' check (source in ('manuel', 'ia')),
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists funding_section_versions_section_idx on public.funding_section_versions (section_id, created_at desc);

-- ── 3. Bibliothèque de textes réutilisables ───────────────────────────────────
create table if not exists public.funding_text_blocks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  category text not null default 'autre'
    check (category in ('presentation', 'action', 'public', 'equipe', 'partenaires', 'chiffres', 'reponse', 'autre')),
  title text not null check (length(trim(title)) > 0),
  content text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists funding_text_blocks_org_idx on public.funding_text_blocks (org_id, category, title);
drop trigger if exists funding_text_blocks_updated_at on public.funding_text_blocks;
create trigger funding_text_blocks_updated_at before update on public.funding_text_blocks
  for each row execute function private.set_updated_at();

-- ── 4. RLS : admin et coordinator de l'organisation, rien pour les autres ─────
alter table public.funding_application_sections enable row level security;
drop policy if exists funding_application_sections_team on public.funding_application_sections;
create policy funding_application_sections_team on public.funding_application_sections for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

-- Versions : lecture et ajout par l'équipe ; jamais modifiées (c'est un historique).
alter table public.funding_section_versions enable row level security;
drop policy if exists funding_section_versions_select on public.funding_section_versions;
create policy funding_section_versions_select on public.funding_section_versions for select
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));
drop policy if exists funding_section_versions_insert on public.funding_section_versions;
create policy funding_section_versions_insert on public.funding_section_versions for insert
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

alter table public.funding_text_blocks enable row level security;
drop policy if exists funding_text_blocks_team on public.funding_text_blocks;
create policy funding_text_blocks_team on public.funding_text_blocks for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));
