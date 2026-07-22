-- Choix par groupe : planifier ou non pendant les vacances scolaires.
-- Les jours fériés et fermetures de l'organisme restent toujours exclus.
alter table public.groups
  add column skip_school_holidays boolean not null default true;

-- RPC recréée pour porter le nouveau champ.
create or replace function public.create_group_with_sessions(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  g jsonb := payload -> 'group';
  s jsonb;
  gid uuid;
  v_org uuid := private.jwt_org_id();
begin
  if private.jwt_role() not in ('admin', 'coordinator') then
    raise exception 'Accès refusé : rôle insuffisant';
  end if;
  if (g ->> 'org_id')::uuid is distinct from v_org then
    raise exception 'Organisation invalide';
  end if;

  insert into public.groups (
    org_id, program_id, funder_id, name, starts_on, ends_on, total_hours,
    trainer_id, room_id, capacity, status, weekly_pattern, notes, skip_school_holidays
  ) values (
    v_org,
    (g ->> 'program_id')::uuid,
    (g ->> 'funder_id')::uuid,
    g ->> 'name',
    (g ->> 'starts_on')::date,
    (g ->> 'ends_on')::date,
    (g ->> 'total_hours')::numeric,
    (g ->> 'trainer_id')::uuid,
    (g ->> 'room_id')::uuid,
    (g ->> 'capacity')::smallint,
    coalesce((g ->> 'status')::public.group_status, 'ouvert'),
    g -> 'weekly_pattern',
    g ->> 'notes',
    coalesce((g ->> 'skip_school_holidays')::boolean, true)
  ) returning id into gid;

  for s in select * from jsonb_array_elements(payload -> 'sessions')
  loop
    insert into public.sessions (org_id, group_id, trainer_id, room_id, starts_at, ends_at, generated)
    values (
      v_org, gid,
      (s ->> 'trainer_id')::uuid,
      (s ->> 'room_id')::uuid,
      (s ->> 'starts_at')::timestamptz,
      (s ->> 'ends_at')::timestamptz,
      true
    );
  end loop;

  return gid;
end;
$$;
