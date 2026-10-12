-- 0047 · Contacts d'un groupe au format vCard : journal des imports.
-- Chaque téléchargement du fichier .vcf est tracé (qui, quel groupe, quels apprenants) :
--   - « Nouveaux depuis mon dernier import » = inscrits absents de mes imports précédents ;
--   - « À retirer de vos contacts » = importés par moi, qui ne sont plus inscrits ;
--   - traçabilité RGPD : on sait sur quels téléphones les numéros sont partis.
-- Lien « sur le téléphone » (QR code) : jeton à usage unique, valable 15 minutes.
-- Écritures par le serveur uniquement (client service_role). Idempotente.

create table if not exists public.group_contact_exports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('tout', 'nouveaux')),
  learner_ids uuid[] not null default '{}',
  token text unique,
  token_expires_at timestamptz,
  downloaded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists group_contact_exports_lookup_idx
  on public.group_contact_exports (group_id, user_id) where downloaded_at is not null;
create index if not exists group_contact_exports_org_idx on public.group_contact_exports (org_id, created_at desc);

alter table public.group_contact_exports enable row level security;
drop policy if exists group_contact_exports_select on public.group_contact_exports;
create policy group_contact_exports_select on public.group_contact_exports for select
  using (
    org_id = private.jwt_org_id()
    and (private.jwt_role() in ('admin', 'coordinator') or user_id = auth.uid())
  );
-- Pas de politique d'écriture : seul le serveur (service_role) écrit dans ce journal.
