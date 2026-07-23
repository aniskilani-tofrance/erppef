-- Photos (formateurs + apprenants) et enquêtes de satisfaction à chaud (Qualiopi ind. 30-32).
-- Écrite idempotente : collable plusieurs fois dans le SQL Editor sans risque.

-- Photo des apprenants (trainers.photo_url existe déjà)
alter table public.learners add column if not exists photo_url text;

-- Bucket public « photos » : lecture ouverte (avatars), écriture réservée aux connectés.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists photos_select on storage.objects;
create policy photos_select on storage.objects for select
  using (bucket_id = 'photos');

drop policy if exists photos_insert on storage.objects;
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos');

drop policy if exists photos_update on storage.objects;
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos');

drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos');

-- Enquête de satisfaction à chaud, par groupe. survey_token non nul = enquête ouverte,
-- répondable anonymement via /enquete/<token> (même principe que l'émargement).
alter table public.groups add column if not exists survey_token uuid;

create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  overall smallint not null check (overall between 1 and 5),
  teaching smallint check (teaching between 1 and 5),      -- qualité pédagogique
  organization smallint check (organization between 1 and 5), -- organisation/planning
  premises smallint check (premises between 1 and 5),      -- locaux/matériel
  progress smallint check (progress between 1 and 5),      -- sentiment de progression
  comment text,
  created_at timestamptz not null default now()
);

-- Lecture = membres de l'org ; AUCUNE écriture par la RLS : les réponses passent
-- exclusivement par le serveur (service_role) après validation du token.
alter table public.survey_responses enable row level security;
drop policy if exists survey_responses_select on public.survey_responses;
create policy survey_responses_select on public.survey_responses for select
  using (org_id = private.jwt_org_id());

-- Vérification : doit retourner learners_photo = true, bucket_ok = true, table_ok = true.
select
  exists(select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'learners' and column_name = 'photo_url') as learners_photo,
  exists(select 1 from storage.buckets where id = 'photos') as bucket_ok,
  to_regclass('public.survey_responses') is not null as table_ok;
