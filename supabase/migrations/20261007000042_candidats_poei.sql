-- 0042 · Candidats POEI : le pont entre l'association (apprenants) et la POEI restauration.
-- Un candidat POEI est une PERSONNE qui cherche un emploi en restauration via la POEI —
-- à ne pas confondre avec un lead restaurateur (un EMPLOYEUR). Deux entrées :
--   · « Proposer en POEI » depuis l'admission (apprenant de l'association) ;
--   · « C'est un candidat » depuis un lead resto mal qualifié (une personne a rempli le
--     formulaire employeur) — le lead est alors classé hors cible.
-- RGPD : l'association et la SASU sont deux entités. Tant que le consentement à la
-- transmission n'est pas recueilli, la fiche d'un apprenant reste invisible du setter
-- (prestataire SASU) et le candidat ne peut pas dépasser « À qualifier ».
-- Script idempotent : peut être recollé sans dommage dans le SQL Editor.

create table if not exists public.poei_candidates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  candidate_no integer,
  source text not null default 'direct'
    check (source in ('asso_pef', 'lead_resto', 'direct', 'prescripteur', 'autre')),
  learner_id uuid references public.learners(id) on delete set null,
  from_lead_id uuid references public.employer_leads(id) on delete set null,
  placed_lead_id uuid references public.employer_leads(id) on delete set null,
  first_name text,
  last_name text not null,
  phone text,
  email text,
  city text,
  -- Qualification (les questions à poser avant de positionner)
  ft_status text not null default 'inconnu' check (ft_status in ('inscrit', 'non_inscrit', 'inconnu')),
  ft_id text,
  income text,
  french_level text,
  goal text,
  target_job text,
  experience text,
  availability text,
  mobility text,
  work_permit text not null default 'inconnu' check (work_permit in ('oui', 'non', 'a_verifier', 'inconnu')),
  constraints text,
  -- Consentement à la transmission (asso → SASU / employeur)
  consent_at timestamptz,
  consent_channel text check (consent_channel is null or consent_channel in ('telephone', 'sms', 'whatsapp', 'email', 'sur_place', 'formulaire')),
  consent_by uuid references public.profiles(id) on delete set null,
  status text not null default 'a_qualifier'
    check (status in ('a_qualifier', 'a_rappeler', 'qualifie', 'positionne', 'poei_signee', 'sans_suite')),
  lost_reason text,
  owner_user_id uuid references public.profiles(id) on delete set null,
  next_action text,
  next_action_on date,
  attempts integer not null default 0,
  last_contact_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Au-delà de « À qualifier », le consentement est obligatoire (garde-fou en base).
  constraint poei_candidates_consent_before_progress
    check (status in ('a_qualifier', 'a_rappeler', 'sans_suite') or consent_at is not null)
);
create index if not exists poei_candidates_org_status_idx on public.poei_candidates (org_id, status);
create index if not exists poei_candidates_placed_idx on public.poei_candidates (placed_lead_id);
create unique index if not exists poei_candidates_org_no_uidx on public.poei_candidates (org_id, candidate_no);
-- Un apprenant, un lead : une seule fiche candidat
create unique index if not exists poei_candidates_learner_uidx on public.poei_candidates (learner_id) where learner_id is not null;
create unique index if not exists poei_candidates_from_lead_uidx on public.poei_candidates (from_lead_id) where from_lead_id is not null;

drop trigger if exists poei_candidates_updated_at on public.poei_candidates;
create trigger poei_candidates_updated_at before update on public.poei_candidates
  for each row execute function private.set_updated_at();

-- Référence lisible C-0001 (même compteur par organisation que A-0001 / L-0001)
create or replace function private.set_poei_candidate_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.candidate_no is null then
    new.candidate_no := private.next_counter(new.org_id, 'poei_candidate');
  end if;
  return new;
end;
$$;
drop trigger if exists poei_candidates_set_no on public.poei_candidates;
create trigger poei_candidates_set_no before insert on public.poei_candidates
  for each row execute function private.set_poei_candidate_no();

alter table public.poei_candidates enable row level security;
-- Direction : tout. Setter : seulement les candidats qui ne viennent pas de l'association,
-- ou dont le consentement à la transmission est recueilli.
drop policy if exists poei_candidates_select on public.poei_candidates;
create policy poei_candidates_select on public.poei_candidates for select
  using (
    org_id = private.jwt_org_id()
    and (
      private.jwt_role() in ('admin', 'coordinator')
      or (private.jwt_role() = 'setter' and (source <> 'asso_pef' or consent_at is not null))
    )
  );
drop policy if exists poei_candidates_write on public.poei_candidates;
create policy poei_candidates_write on public.poei_candidates for all
  using (
    org_id = private.jwt_org_id()
    and (
      private.jwt_role() in ('admin', 'coordinator')
      or (private.jwt_role() = 'setter' and (source <> 'asso_pef' or consent_at is not null))
    )
  )
  with check (
    org_id = private.jwt_org_id()
    and (
      private.jwt_role() in ('admin', 'coordinator')
      or (private.jwt_role() = 'setter' and (source <> 'asso_pef' or consent_at is not null))
    )
  );

-- ── Journal ──────────────────────────────────────────────────────────────────
create table if not exists public.poei_candidate_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  candidate_id uuid not null references public.poei_candidates(id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('appel', 'sms', 'email', 'whatsapp', 'note', 'statut', 'consentement', 'creation')),
  outcome text check (outcome is null or outcome in ('joint', 'messagerie', 'rappel_convenu', 'envoye', 'refus', 'autre')),
  note text,
  by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists poei_candidate_events_candidate_idx on public.poei_candidate_events (candidate_id, at desc);

alter table public.poei_candidate_events enable row level security;
-- Le journal suit la visibilité de la fiche (sous-requête soumise à la RLS de poei_candidates).
drop policy if exists poei_candidate_events_select on public.poei_candidate_events;
create policy poei_candidate_events_select on public.poei_candidate_events for select
  using (
    org_id = private.jwt_org_id()
    and private.jwt_role() in ('admin', 'coordinator', 'setter')
    and exists (select 1 from public.poei_candidates c where c.id = candidate_id)
  );
drop policy if exists poei_candidate_events_write on public.poei_candidate_events;
create policy poei_candidate_events_write on public.poei_candidate_events for all
  using (
    org_id = private.jwt_org_id()
    and private.jwt_role() in ('admin', 'coordinator', 'setter')
    and exists (select 1 from public.poei_candidates c where c.id = candidate_id)
  )
  with check (
    org_id = private.jwt_org_id()
    and private.jwt_role() in ('admin', 'coordinator', 'setter')
    and exists (select 1 from public.poei_candidates c where c.id = candidate_id)
  );

-- Chaque tentative de contact compte (tentatives + dernier contact sur la fiche).
create or replace function private.bump_poei_candidate_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind in ('appel', 'sms', 'email', 'whatsapp') then
    update public.poei_candidates
      set attempts = attempts + 1,
          last_contact_at = greatest(coalesce(last_contact_at, new.at), new.at)
      where id = new.candidate_id;
  end if;
  return new;
end;
$$;
drop trigger if exists poei_candidate_events_bump on public.poei_candidate_events;
create trigger poei_candidate_events_bump after insert on public.poei_candidate_events
  for each row execute function private.bump_poei_candidate_contact();

select
  to_regclass('public.poei_candidates') is not null as candidats_ok,
  to_regclass('public.poei_candidate_events') is not null as journal_ok,
  (select count(*) from pg_policies where tablename in ('poei_candidates', 'poei_candidate_events')) as policies;
