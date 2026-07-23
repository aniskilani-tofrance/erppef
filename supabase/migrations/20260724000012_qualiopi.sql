-- Qualiopi : registre des réclamations (ind. 31) + documents/qualifications formateurs (ind. 21-22).
-- Idempotente : collable plusieurs fois dans le SQL Editor.

-- Registre des réclamations
create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  source text not null default 'apprenant' check (source in ('apprenant', 'financeur', 'formateur', 'partenaire', 'autre')),
  author_name text,
  subject text not null,
  details text,
  received_on date not null default current_date,
  status text not null default 'ouverte' check (status in ('ouverte', 'en_cours', 'traitee')),
  resolution text,
  resolved_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists complaints_updated_at on public.complaints;
create trigger complaints_updated_at before update on public.complaints
  for each row execute function private.set_updated_at();

alter table public.complaints enable row level security;
drop policy if exists complaints_select on public.complaints;
create policy complaints_select on public.complaints for select
  using (org_id = private.jwt_org_id());
drop policy if exists complaints_write on public.complaints;
create policy complaints_write on public.complaints for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

-- Documents des formateurs (CV, diplômes, attestations de formation continue)
create table if not exists public.trainer_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  label text not null,
  file_path text not null,          -- chemin dans le bucket privé « documents »
  created_at timestamptz not null default now()
);
alter table public.trainer_documents enable row level security;
drop policy if exists trainer_documents_select on public.trainer_documents;
create policy trainer_documents_select on public.trainer_documents for select
  using (org_id = private.jwt_org_id());
drop policy if exists trainer_documents_write on public.trainer_documents;
create policy trainer_documents_write on public.trainer_documents for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

-- Bucket PRIVÉ « documents » (CV : jamais d'URL publique, accès par lien signé)
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists documents_select on storage.objects;
create policy documents_select on storage.objects for select to authenticated
  using (bucket_id = 'documents');
drop policy if exists documents_insert on storage.objects;
create policy documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents');
drop policy if exists documents_delete on storage.objects;
create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents');

-- Vérification : trois true attendus.
select
  to_regclass('public.complaints') is not null as complaints_ok,
  to_regclass('public.trainer_documents') is not null as documents_ok,
  exists(select 1 from storage.buckets where id = 'documents') as bucket_ok;
