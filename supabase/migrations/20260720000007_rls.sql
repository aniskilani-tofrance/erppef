-- RLS multi-tenant.
-- Stratégie : le custom access token hook injecte org_id + app_role dans le JWT à la connexion
-- (à activer dans le dashboard Supabase : Auth > Hooks > Custom Access Token,
--  ou via supabase/config.toml [auth.hook.custom_access_token]).

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  m record;
begin
  select org_id, role into m
  from public.memberships
  where user_id = (event ->> 'user_id')::uuid
  limit 1;

  claims := coalesce(event -> 'claims', '{}'::jsonb);
  if m.org_id is not null then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(m.org_id::text));
    claims := jsonb_set(claims, '{app_role}', to_jsonb(m.role::text));
  end if;
  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
grant select on table public.memberships to supabase_auth_admin;

-- ── organizations ─────────────────────────────────────────────────────────────
alter table public.organizations enable row level security;
create policy org_select on public.organizations for select
  using (id = private.jwt_org_id());
create policy org_update on public.organizations for update
  using (id = private.jwt_org_id() and private.jwt_role() = 'admin');

-- ── profiles ──────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from public.memberships m
      where m.user_id = public.profiles.id and m.org_id = private.jwt_org_id()
    )
  );
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid());

-- ── memberships ───────────────────────────────────────────────────────────────
alter table public.memberships enable row level security;
create policy memberships_select on public.memberships for select
  using (org_id = private.jwt_org_id() or user_id = auth.uid());
create policy memberships_admin_write on public.memberships for all
  using (org_id = private.jwt_org_id() and private.jwt_role() = 'admin')
  with check (org_id = private.jwt_org_id() and private.jwt_role() = 'admin');
create policy memberships_auth_admin_read on public.memberships for select
  to supabase_auth_admin using (true);

-- ── Pattern standard : lecture = membre de l'org, écriture = admin + coordinator ──
do $$
declare
  t text;
begin
  foreach t in array array[
    'trainers', 'trainer_availabilities', 'trainer_absences',
    'rooms', 'room_unavailabilities',
    'groups', 'sessions', 'learners', 'enrollments'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select using (org_id = private.jwt_org_id())',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert with check
         (org_id = private.jwt_org_id() and private.jwt_role() in (''admin'', ''coordinator''))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update
         using (org_id = private.jwt_org_id() and private.jwt_role() in (''admin'', ''coordinator''))
         with check (org_id = private.jwt_org_id())',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete
         using (org_id = private.jwt_org_id() and private.jwt_role() in (''admin'', ''coordinator''))',
      t || '_delete', t);
  end loop;
end;
$$;

-- Exception : la lecture directe de trainers (avec hourly_cost) est réservée à admin/coordinator.
-- Les rôles trainer/viewer passent par v_trainers_public (sans coût horaire).
drop policy trainers_select on public.trainers;
create policy trainers_select on public.trainers for select
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

-- Exception : un formateur gère ses propres absences
create policy trainer_absences_own_insert on public.trainer_absences for insert
  with check (
    org_id = private.jwt_org_id()
    and exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.trainer_id = trainer_absences.trainer_id
    )
  );
create policy trainer_absences_own_update on public.trainer_absences for update
  using (
    org_id = private.jwt_org_id()
    and exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.trainer_id = trainer_absences.trainer_id
    )
  );

-- ── Catalogue : lecture pour tous les membres, écriture admin only ────────────
alter table public.funders enable row level security;
create policy funders_select on public.funders for select
  using (org_id = private.jwt_org_id());
create policy funders_admin_write on public.funders for all
  using (org_id = private.jwt_org_id() and private.jwt_role() = 'admin')
  with check (org_id = private.jwt_org_id() and private.jwt_role() = 'admin');

alter table public.programs enable row level security;
create policy programs_select on public.programs for select
  using (org_id = private.jwt_org_id());
create policy programs_admin_write on public.programs for all
  using (org_id = private.jwt_org_id() and private.jwt_role() = 'admin')
  with check (org_id = private.jwt_org_id() and private.jwt_role() = 'admin');

-- ── calendar_closures : les entrées globales (org_id NULL) sont lisibles par tous ──
alter table public.calendar_closures enable row level security;
create policy closures_select on public.calendar_closures for select
  using (org_id is null or org_id = private.jwt_org_id());
create policy closures_org_write on public.calendar_closures for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));
