-- Évaluations de mi-parcours et finale (Qualiopi ind. 11) : grille formatrice par
-- compétence CECRL (3 crans), test automatisé optionnel (moteur du positionnement),
-- jalons automatiques par groupe (modifiables), rappels aux formateurs, attestation d'acquis.
-- Idempotent.

-- Le test de positionnement sert aussi aux tests de mi-parcours / finale.
alter table public.placement_tests
  add column if not exists purpose text not null default 'positionnement',  -- positionnement | mi_parcours | finale
  add column if not exists group_id uuid references public.groups(id) on delete set null,
  add column if not exists target_level text;                                -- niveau visé (A1, A2, B1, B2) : filtre des questions

-- Jalons : null = automatique (mi-parcours à la moitié des heures, finale = dernière séance).
alter table public.groups
  add column if not exists midterm_on date,
  add column if not exists final_on date;

create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  kind text not null check (kind in ('mi_parcours', 'finale')),
  co text check (co in ('non_acquis', 'en_cours', 'acquis')),   -- compréhension orale
  po text check (po in ('non_acquis', 'en_cours', 'acquis')),   -- production orale
  ce text check (ce in ('non_acquis', 'en_cours', 'acquis')),   -- compréhension écrite
  pe text check (pe in ('non_acquis', 'en_cours', 'acquis')),   -- production écrite
  level_reached text,                                            -- niveau CECRL atteint (A1.1, A1, A2, B1, B2)
  comment text,
  test_id uuid references public.placement_tests(id) on delete set null,
  evaluated_by uuid references auth.users(id) on delete set null,
  evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, learner_id, kind)
);
create index if not exists evaluations_group_idx on public.evaluations(group_id, kind);
create index if not exists evaluations_learner_idx on public.evaluations(learner_id);

alter table public.evaluations enable row level security;
drop policy if exists evaluations_select on public.evaluations;
create policy evaluations_select on public.evaluations for select
  using (org_id = private.jwt_org_id());
drop policy if exists evaluations_write on public.evaluations;
create policy evaluations_write on public.evaluations for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator', 'trainer'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator', 'trainer'));
drop policy if exists evaluations_no_setter on public.evaluations;
create policy evaluations_no_setter on public.evaluations as restrictive for select
  using (private.jwt_role() is distinct from 'setter');

-- Rappels envoyés aux formateurs (J-7, J-1) : une ligne par jalon et par palier, jamais deux fois.
create table if not exists public.evaluation_reminders (
  group_id uuid not null references public.groups(id) on delete cascade,
  kind text not null check (kind in ('mi_parcours', 'finale')),
  stage text not null check (stage in ('j7', 'j1')),
  sent_at timestamptz not null default now(),
  primary key (group_id, kind, stage)
);
alter table public.evaluation_reminders enable row level security;
-- Lecture/écriture serveur uniquement (cron, service_role) : aucune politique pour les rôles applicatifs.

-- Vérification
select
  to_regclass('public.evaluations') is not null as evaluations_ok,
  to_regclass('public.evaluation_reminders') is not null as reminders_ok,
  (select count(*) from information_schema.columns where table_name = 'placement_tests' and column_name in ('purpose', 'group_id', 'target_level')) as colonnes_tests,
  (select count(*) from information_schema.columns where table_name = 'groups' and column_name in ('midterm_on', 'final_on')) as colonnes_groups;
