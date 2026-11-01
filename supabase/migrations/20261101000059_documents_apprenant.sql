-- 0059 · Documents de l'apprenant : bulletin d'adhésion à l'association (cotisation
-- annuelle), contrat de formation (articles L6353-3 à L6353-7 du Code du travail) et
-- règlement intérieur (L6352-3, R6352-1 et suivants), signés au doigt sur la tablette ou
-- par un lien personnel envoyé sur WhatsApp.
-- Concerne les cours PEF et les ateliers (groupes financés par l'association elle-même,
-- financeur de code « PEF »), jamais les cours municipaux.
--
--   learner_signature_links  : lien personnel à jeton (WhatsApp, 30 jours) ou session tablette (2 heures)
--   learner_signed_documents : un document signé = une ligne + un PDF horodaté dans le bucket
--                              PRIVÉ « dossiers » (version du texte, canal, IP, appareil, empreinte)
--   learner_memberships      : adhésion par année (1er septembre → 31 août) : montant, payé, date, mode, reçu
--
-- À appliquer AVANT le déploiement du code. Sans elle, le code reste sûr : les cartes de la
-- fiche et du groupe disent « migration 0059 à appliquer » et la page publique « signature
-- pas encore ouverte ». Additive et idempotente : collable plusieurs fois dans le SQL Editor.
-- Aucune donnée existante touchée. Le bucket « dossiers » (migration 0029) et ses politiques
-- sont réutilisés tels quels (admin et coordination de l'organisme seulement).

do $$ begin
  create type public.learner_signed_document_kind as enum ('adhesion', 'contrat_formation', 'reglement_interieur');
exception when duplicate_object then null; end $$;

-- ── Liens de signature ───────────────────────────────────────────────────────
create table if not exists public.learner_signature_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  channel text not null check (channel in ('sur_place', 'lien')),
  expires_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists learner_signature_links_learner_idx on public.learner_signature_links (learner_id, created_at desc);

comment on table public.learner_signature_links is
  'Lien personnel de signature des documents de l''apprenant (adhésion, contrat, règlement). Le jeton est le secret ; la page publique ne montre que la personne du lien.';
comment on column public.learner_signature_links.channel is
  'sur_place = tablette de l''association (2 h, délai de rétractation 10 jours) ; lien = envoyé sur WhatsApp (30 jours, signature à distance : 14 jours).';

-- ── Documents signés ─────────────────────────────────────────────────────────
create table if not exists public.learner_signed_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  kind public.learner_signed_document_kind not null,
  text_version text not null,
  membership_year smallint not null check (membership_year between 2020 and 2100),
  signed_at timestamptz not null default now(),
  signer_name text not null,
  channel text not null check (channel in ('sur_place', 'lien')),
  link_id uuid references public.learner_signature_links(id) on delete set null,
  ip text,
  user_agent text,
  file_path text not null,
  file_sha256 text,
  created_at timestamptz not null default now()
);
create index if not exists learner_signed_documents_learner_idx on public.learner_signed_documents (learner_id, kind);
create index if not exists learner_signed_documents_group_idx on public.learner_signed_documents (group_id);
-- Une seule signature par version du texte : adhésion et règlement par année d'adhésion,
-- contrat par groupe (un double appui sur « Je signe » ne crée pas deux documents).
create unique index if not exists learner_signed_documents_year_uniq
  on public.learner_signed_documents (learner_id, kind, membership_year, text_version)
  where kind <> 'contrat_formation';
create unique index if not exists learner_signed_documents_group_uniq
  on public.learner_signed_documents (learner_id, group_id, text_version)
  where kind = 'contrat_formation';

comment on table public.learner_signed_documents is
  'Documents signés par l''apprenant (adhésion, contrat de formation, règlement intérieur) : PDF horodaté dans le bucket privé « dossiers ». Jamais modifiés.';
comment on column public.learner_signed_documents.text_version is
  'Version du texte signé (constante DOCUMENT_TEXT_VERSIONS de l''ERP). Une nouvelle version est à re-signer.';
comment on column public.learner_signed_documents.membership_year is
  'Année d''adhésion de la signature : 2026 = du 1er septembre 2026 au 31 août 2027.';
comment on column public.learner_signed_documents.file_sha256 is
  'Empreinte SHA-256 du PDF signé : prouve que le fichier n''a pas changé.';

-- ── Adhésions (cotisation annuelle) ──────────────────────────────────────────
create table if not exists public.learner_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  membership_year smallint not null check (membership_year between 2020 and 2100),
  amount_cents integer not null default 4000 check (amount_cents between 0 and 100000),
  paid boolean not null default false,
  paid_on date,
  payment_method text check (payment_method in ('especes', 'cheque', 'virement', 'carte', 'helloasso')),
  receipt_no text,
  note text check (note is null or char_length(note) <= 300),
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (learner_id, membership_year),
  constraint learner_memberships_paid_complete check (not paid or (paid_on is not null and payment_method is not null))
);
create index if not exists learner_memberships_org_year_idx on public.learner_memberships (org_id, membership_year);
drop trigger if exists learner_memberships_updated_at on public.learner_memberships;
create trigger learner_memberships_updated_at before update on public.learner_memberships
  for each row execute function private.set_updated_at();

comment on table public.learner_memberships is
  'Adhésion annuelle de l''apprenant à l''association : cotisation (40 € par défaut), payée ou non, date, mode, n° de reçu.';

-- ── Sécurité (RLS) ───────────────────────────────────────────────────────────
-- Lecture : admin et coordination de l'organisme (comme le dossier administratif).
-- Écritures des liens et des documents signés : uniquement par l'ERP côté serveur
-- (service_role), après contrôle des droits ou du jeton — aucune écriture depuis le navigateur,
-- et un document signé ne se modifie jamais. Cotisations : admin et coordination.
alter table public.learner_signature_links enable row level security;
drop policy if exists learner_signature_links_select on public.learner_signature_links;
create policy learner_signature_links_select on public.learner_signature_links for select
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

alter table public.learner_signed_documents enable row level security;
drop policy if exists learner_signed_documents_select on public.learner_signed_documents;
create policy learner_signed_documents_select on public.learner_signed_documents for select
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

alter table public.learner_memberships enable row level security;
drop policy if exists learner_memberships_select on public.learner_memberships;
create policy learner_memberships_select on public.learner_memberships for select
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));
drop policy if exists learner_memberships_write on public.learner_memberships;
create policy learner_memberships_write on public.learner_memberships for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

-- Contrôle : trois tables, RLS active, politiques posées, bucket privé présent.
select
  to_regclass('public.learner_signature_links') is not null as liens_ok,
  to_regclass('public.learner_signed_documents') is not null as documents_ok,
  to_regclass('public.learner_memberships') is not null as adhesions_ok,
  (select count(*) from pg_policies
    where tablename in ('learner_signature_links', 'learner_signed_documents', 'learner_memberships')) as politiques,
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.learner_signature_links'::regclass, 'public.learner_signed_documents'::regclass, 'public.learner_memberships'::regclass)) as rls_ok,
  exists (select 1 from storage.buckets where id = 'dossiers' and not public) as bucket_prive_ok;
