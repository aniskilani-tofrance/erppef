-- 0039 · Kits de séance : un PDF par séance (script formatrice + fiches apprenants),
-- déposé par la coordination, téléchargé par le formateur de la séance.
-- Réservé à l'équipe : les apprenants n'ont pas de compte et les pages publiques
-- (émargement, enquête, test) ne lisent jamais cette table.

create table if not exists public.session_kits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  file_path text not null,          -- chemin dans le bucket privé « kits »
  file_name text not null,          -- nom d'origine, proposé au téléchargement
  size_bytes integer,
  level text,                       -- lus dans le nom du fichier (kit_G3_…_A2_S1-1.pdf), facultatifs
  sequence_no smallint,
  seance_no smallint,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists session_kits_org_idx on public.session_kits(org_id);

alter table public.session_kits enable row level security;

-- Lecture : coordination, ou formateur titulaire / remplaçant / co-animateur DE CETTE séance.
drop policy if exists session_kits_select on public.session_kits;
create policy session_kits_select on public.session_kits for select
  using (
    org_id = private.jwt_org_id()
    and (
      private.jwt_role() in ('admin', 'coordinator')
      or (
        private.jwt_role() = 'trainer'
        and exists (
          select 1
          from public.sessions s
          join public.memberships m on m.user_id = auth.uid() and m.trainer_id is not null
          where s.id = session_kits.session_id
            and m.trainer_id in (s.trainer_id, s.co_trainer_id)
        )
      )
    )
  );

-- Écriture : coordination uniquement.
drop policy if exists session_kits_write on public.session_kits;
create policy session_kits_write on public.session_kits for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

-- Bucket PRIVÉ « kits » SANS policy sur storage.objects : aucun accès direct depuis un
-- navigateur. Dépôt par URL d'envoi signée et téléchargement par lien signé de 5 minutes,
-- tous deux créés par le serveur après vérification du rôle.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kits', 'kits', false, 31457280, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Vérification : trois true attendus.
select
  to_regclass('public.session_kits') is not null as kits_ok,
  exists (select 1 from storage.buckets where id = 'kits' and public = false) as bucket_prive_ok,
  not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and qual like '%kits%') as aucune_policy_storage_ok;
