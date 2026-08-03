-- Horaires d'ouverture par salle (les salles ne sont pas disponibles 24h/24).
-- Aucune ligne pour une salle = ouverte sur les horaires de l'organisme (9h-12h/13h-20h).
-- Idempotente.

create table if not exists public.room_availabilities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  check (start_time < end_time)
);
create index if not exists room_availabilities_room_idx on public.room_availabilities (room_id);

alter table public.room_availabilities enable row level security;
drop policy if exists room_availabilities_select on public.room_availabilities;
create policy room_availabilities_select on public.room_availabilities for select
  using (org_id = private.jwt_org_id());
drop policy if exists room_availabilities_write on public.room_availabilities;
create policy room_availabilities_write on public.room_availabilities for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

select to_regclass('public.room_availabilities') is not null as room_availabilities_ok;
