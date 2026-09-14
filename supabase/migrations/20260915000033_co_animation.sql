-- Stagiaires et co-animation : un second intervenant (stagiaire ou formateur) sur une séance
-- ou par défaut sur un groupe ; informations de stage sur la fiche formateur. Idempotent.

alter table public.trainers
  add column if not exists internship_school text,      -- établissement (INALCO, université…)
  add column if not exists internship_ends_on date;     -- fin de stage

alter table public.groups
  add column if not exists co_trainer_id uuid references public.trainers(id) on delete set null;

alter table public.sessions
  add column if not exists co_trainer_id uuid references public.trainers(id) on delete set null;
create index if not exists sessions_co_trainer_idx on public.sessions(co_trainer_id) where co_trainer_id is not null;

-- Un co-animateur ne peut pas être sur deux séances en même temps (même verrou que le formateur).
do $$ begin
  alter table public.sessions add constraint no_co_trainer_overlap exclude using gist (
    co_trainer_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'annulee' and co_trainer_id is not null);
exception when duplicate_object then null; end $$;

-- La vue publique des formateurs (rôles formateur / lecture) expose les infos de stage.
create or replace view public.v_trainers_public as
select id, org_id, first_name, last_name, email, phone, photo_url,
       contract_type, weekly_hours_max, skills, languages, color, is_active,
       internship_school, internship_ends_on
from public.trainers
where org_id = private.jwt_org_id();

select
  (select count(*) from information_schema.columns where table_name = 'sessions' and column_name = 'co_trainer_id') as sessions_ok,
  (select count(*) from information_schema.columns where table_name = 'groups' and column_name = 'co_trainer_id') as groups_ok,
  (select count(*) from information_schema.columns where table_name = 'trainers' and column_name like 'internship_%') as trainers_ok,
  (select count(*) from pg_constraint where conname = 'no_co_trainer_overlap') as contrainte_ok;
