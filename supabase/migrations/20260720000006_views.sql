-- Vues de calcul : aucun agrégat n'est jamais stocké.
-- ATTENTION timezone : la semaine ISO se calcule en heure LOCALE Europe/Paris.

create view public.v_trainer_hours
with (security_invoker = on) as
select
  s.trainer_id,
  s.org_id,
  coalesce(sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600)
    filter (where s.status = 'realisee' or (s.status = 'planifiee' and s.ends_at < now())), 0) as hours_done,
  coalesce(sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600)
    filter (where s.status = 'planifiee' and s.ends_at >= now()), 0) as hours_upcoming,
  coalesce(sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600)
    filter (where s.status <> 'annulee'), 0) as hours_total
from public.sessions s
where s.trainer_id is not null and s.status <> 'annulee'
group by s.trainer_id, s.org_id;

-- Charge hebdo par formateur (base du plafond weekly_hours_max et du taux d'occupation)
create view public.v_trainer_week_load
with (security_invoker = on) as
select
  s.trainer_id,
  s.org_id,
  (date_trunc('week', s.starts_at at time zone 'Europe/Paris'))::date as week_start,
  sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600) as hours_planned
from public.sessions s
where s.trainer_id is not null and s.status <> 'annulee'
group by s.trainer_id, s.org_id, week_start;

create view public.v_room_week_load
with (security_invoker = on) as
select
  s.room_id,
  s.org_id,
  (date_trunc('week', s.starts_at at time zone 'Europe/Paris'))::date as week_start,
  sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600) as hours_booked
from public.sessions s
where s.room_id is not null and s.status <> 'annulee'
group by s.room_id, s.org_id, week_start;

-- Avancement d'un groupe (jauge de la fiche groupe)
create view public.v_group_hours
with (security_invoker = on) as
select
  g.id as group_id,
  g.org_id,
  g.total_hours,
  coalesce(sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600)
    filter (where s.status <> 'annulee'), 0) as hours_scheduled,
  coalesce(sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600)
    filter (where s.status = 'realisee' or (s.status = 'planifiee' and s.ends_at < now())), 0) as hours_done
from public.groups g
left join public.sessions s on s.group_id = g.id
group by g.id, g.org_id, g.total_hours;

-- Vue "publique" des formateurs SANS coût horaire, pour les rôles trainer/viewer.
-- SECURITY DEFINER assumé : le filtre org est explicite dans la vue.
create view public.v_trainers_public as
select id, org_id, first_name, last_name, email, phone, photo_url,
       contract_type, weekly_hours_max, skills, languages, color, is_active
from public.trainers
where org_id = private.jwt_org_id();
