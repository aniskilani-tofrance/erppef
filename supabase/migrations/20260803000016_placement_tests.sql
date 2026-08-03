-- Test de positionnement français intégré : un lien personnel par apprenant,
-- résultat (test fait + niveau) rapatrié sur la fiche. Idempotente.

create table if not exists public.placement_tests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'en_attente' check (status in ('en_attente', 'fait')),
  score numeric(5,1),
  level text,
  answers jsonb,
  duration_seconds integer,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists placement_tests_learner_idx on public.placement_tests (learner_id);

-- Lecture = membres de l'org ; écriture = coordination. La page publique du test
-- passe par le serveur (service_role) après validation du token.
alter table public.placement_tests enable row level security;
drop policy if exists placement_tests_select on public.placement_tests;
create policy placement_tests_select on public.placement_tests for select
  using (org_id = private.jwt_org_id());
drop policy if exists placement_tests_write on public.placement_tests;
create policy placement_tests_write on public.placement_tests for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

select to_regclass('public.placement_tests') is not null as placement_tests_ok;
