-- Dossier administratif de l'apprenant : pièces scannées ou déposées (pièce d'identité
-- recto/verso, justificatif de domicile, autres). Données sensibles : bucket PRIVÉ dédié
-- « dossiers », accès réservé aux rôles admin/coordinator de l'organisme (table ET stockage),
-- lecture par lien signé temporaire, suppression avec la fiche (cascade + nettoyage applicatif).
-- Idempotent.

do $$ begin
  create type public.learner_document_kind as enum ('identite_recto', 'identite_verso', 'justificatif_domicile', 'autre');
exception when duplicate_object then null; end $$;

create table if not exists public.learner_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  kind public.learner_document_kind not null default 'autre',
  label text not null,
  file_path text not null,            -- chemin dans le bucket privé « dossiers »
  mime_type text,
  size_bytes integer,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists learner_documents_learner_idx on public.learner_documents(learner_id);
-- Une seule pièce par emplacement (recto, verso, justificatif) ; « autre » illimité.
create unique index if not exists learner_documents_slot_idx
  on public.learner_documents(learner_id, kind) where kind <> 'autre';

alter table public.learner_documents enable row level security;
drop policy if exists learner_documents_select on public.learner_documents;
create policy learner_documents_select on public.learner_documents for select
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));
drop policy if exists learner_documents_write on public.learner_documents;
create policy learner_documents_write on public.learner_documents for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));
drop policy if exists learner_documents_no_setter on public.learner_documents;
create policy learner_documents_no_setter on public.learner_documents as restrictive for select
  using (private.jwt_role() is distinct from 'setter');

-- Bucket PRIVÉ « dossiers » : jamais d'URL publique. Politiques de stockage limitées au rôle
-- ET au préfixe de l'organisme (<org_id>/apprenants/<learner_id>/…).
insert into storage.buckets (id, name, public)
values ('dossiers', 'dossiers', false)
on conflict (id) do nothing;

drop policy if exists dossiers_select on storage.objects;
create policy dossiers_select on storage.objects for select to authenticated
  using (
    bucket_id = 'dossiers'
    and private.jwt_role() in ('admin', 'coordinator')
    and (storage.foldername(name))[1] = private.jwt_org_id()::text
  );
drop policy if exists dossiers_insert on storage.objects;
create policy dossiers_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dossiers'
    and private.jwt_role() in ('admin', 'coordinator')
    and (storage.foldername(name))[1] = private.jwt_org_id()::text
  );
drop policy if exists dossiers_update on storage.objects;
create policy dossiers_update on storage.objects for update to authenticated
  using (
    bucket_id = 'dossiers'
    and private.jwt_role() in ('admin', 'coordinator')
    and (storage.foldername(name))[1] = private.jwt_org_id()::text
  );
drop policy if exists dossiers_delete on storage.objects;
create policy dossiers_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'dossiers'
    and private.jwt_role() in ('admin', 'coordinator')
    and (storage.foldername(name))[1] = private.jwt_org_id()::text
  );

-- Vérification
select
  to_regclass('public.learner_documents') is not null as table_ok,
  exists(select 1 from storage.buckets where id = 'dossiers') as bucket_ok,
  (select count(*) from pg_policies where tablename = 'learner_documents') as table_policies,
  (select count(*) from pg_policies where tablename = 'objects' and policyname like 'dossiers_%') as storage_policies;
