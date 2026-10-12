-- 0045 · Rôle « stagiaire » : une personne en stage dans l'organisme (pas un apprenant),
-- rattachée par la coordination à un ou plusieurs groupes. Elle voit UNIQUEMENT ces
-- groupes : fiche du groupe, apprenants inscrits, planning, émargement, kits de séance et
-- documents administratifs du groupe (attestations, assiduité, feuilles d'émargement).
-- Jamais : dossiers scannés (pièces d'identité), historique d'admission, tests,
-- évaluations, formateurs, leads, candidats POEI, qualité, veille.
--
-- Politiques RESTRICTIVES : elles s'ajoutent (en ET) aux politiques existantes, qui
-- restent inchangées pour les autres rôles (même méthode que le rôle setter, 0028).
-- Idempotente : collable plusieurs fois dans le SQL Editor.

alter type public.app_role add value if not exists 'stagiaire';

-- ── Rattachement stagiaire ↔ groupe ──────────────────────────────────────────
create table if not exists public.group_interns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index if not exists group_interns_user_idx on public.group_interns(user_id);
create index if not exists group_interns_org_idx on public.group_interns(org_id);

alter table public.group_interns enable row level security;
drop policy if exists group_interns_select on public.group_interns;
create policy group_interns_select on public.group_interns for select
  using (
    org_id = private.jwt_org_id()
    and (private.jwt_role() in ('admin', 'coordinator') or user_id = auth.uid())
  );
drop policy if exists group_interns_write on public.group_interns;
create policy group_interns_write on public.group_interns for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

-- Groupes du stagiaire connecté. SECURITY DEFINER : lu sans repasser par la RLS
-- (évite les boucles de politiques), toujours borné à son compte et à son organisme.
create or replace function private.intern_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select gi.group_id
  from public.group_interns gi
  where gi.user_id = auth.uid()
    and gi.org_id = private.jwt_org_id();
$$;
revoke all on function private.intern_group_ids() from public;
grant execute on function private.intern_group_ids() to authenticated;

-- ── Données du groupe : visibles seulement pour SES groupes ──────────────────
drop policy if exists groups_stagiaire_scope on public.groups;
create policy groups_stagiaire_scope on public.groups as restrictive for select
  using (private.jwt_role() is distinct from 'stagiaire' or id in (select private.intern_group_ids()));

drop policy if exists sessions_stagiaire_scope on public.sessions;
create policy sessions_stagiaire_scope on public.sessions as restrictive for select
  using (private.jwt_role() is distinct from 'stagiaire' or group_id in (select private.intern_group_ids()));

drop policy if exists enrollments_stagiaire_scope on public.enrollments;
create policy enrollments_stagiaire_scope on public.enrollments as restrictive for select
  using (private.jwt_role() is distinct from 'stagiaire' or group_id in (select private.intern_group_ids()));

drop policy if exists learners_stagiaire_scope on public.learners;
create policy learners_stagiaire_scope on public.learners as restrictive for select
  using (
    private.jwt_role() is distinct from 'stagiaire'
    or exists (
      select 1 from public.enrollments e
      where e.learner_id = learners.id
        and e.group_id in (select private.intern_group_ids())
    )
  );

drop policy if exists attendances_stagiaire_scope on public.attendances;
create policy attendances_stagiaire_scope on public.attendances as restrictive for select
  using (
    private.jwt_role() is distinct from 'stagiaire'
    or exists (
      select 1 from public.sessions s
      where s.id = attendances.session_id
        and s.group_id in (select private.intern_group_ids())
    )
  );

drop policy if exists attendance_dispatches_stagiaire_scope on public.attendance_dispatches;
create policy attendance_dispatches_stagiaire_scope on public.attendance_dispatches as restrictive for select
  using (private.jwt_role() is distinct from 'stagiaire' or group_id in (select private.intern_group_ids()));

-- Kits de séance : lecture ouverte au stagiaire pour les séances de ses groupes
-- (la politique de 0039 ne connaît que la coordination et le formateur de la séance).
drop policy if exists session_kits_select_stagiaire on public.session_kits;
create policy session_kits_select_stagiaire on public.session_kits for select
  using (
    org_id = private.jwt_org_id()
    and private.jwt_role() = 'stagiaire'
    and exists (
      select 1 from public.sessions s
      where s.id = session_kits.session_id
        and s.group_id in (select private.intern_group_ids())
    )
  );

-- ── Tout le reste : invisible pour le stagiaire ──────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'learner_contacts', 'learner_documents', 'placement_tests',
    'info_meetings', 'info_meeting_invitations',
    'evaluations', 'evaluation_reminders', 'reminders',
    'trainers', 'trainer_documents', 'trainer_absences', 'trainer_availabilities',
    'complaints', 'survey_responses',
    'employer_leads', 'employer_lead_events', 'poei_candidates', 'poei_candidate_events',
    'ai_calls', 'watch_entries', 'veille_runs', 'veille_monthly_notes'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', t || '_no_stagiaire', t);
      execute format(
        'create policy %I on public.%I as restrictive for select using (private.jwt_role() is distinct from ''stagiaire'')',
        t || '_no_stagiaire', t
      );
    end if;
  end loop;
end $$;

-- Fichiers : aucun accès direct au stockage (CV des formateurs, dossiers, photos).
-- Les kits passent par des liens signés créés par le serveur, hors RLS.
drop policy if exists storage_no_stagiaire on storage.objects;
create policy storage_no_stagiaire on storage.objects as restrictive for all to authenticated
  using (private.jwt_role() is distinct from 'stagiaire')
  with check (private.jwt_role() is distinct from 'stagiaire');

-- Vérification : 4 valeurs attendues (true, true, true, ≥ 20).
select
  exists (select 1 from pg_enum e join pg_type ty on ty.oid = e.enumtypid where ty.typname = 'app_role' and e.enumlabel = 'stagiaire') as role_stagiaire_ok,
  to_regclass('public.group_interns') is not null as group_interns_ok,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'intern_group_ids') as fonction_ok,
  (select count(*) from pg_policies where policyname like '%stagiaire%') as politiques_stagiaire;
