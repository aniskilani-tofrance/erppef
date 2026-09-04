-- Parcours d'admission : prise de contact (WhatsApp d'abord), réunions d'information
-- et test oral — tout dans l'ERP, dans le même dossier que l'analyse du besoin (ind. 4).
--
--   learners.admission_status  : où en est la personne (nouveau → … → inscrit)
--   learner_contacts           : journal des prises de contact (canal, résultat, note)
--   info_meetings              : réunions d'information collectives
--   info_meeting_invitations   : convocations (statut d'envoi, confirmation, présence)
--   learners.oral_test_*       : test oral d'entrée (date, niveau, évaluateur, commentaire)

alter table public.learners
  add column if not exists admission_status text not null default 'nouveau'
    check (admission_status in ('nouveau', 'injoignable', 'contacte', 'convoque', 'evalue', 'inscrit', 'sans_suite')),
  add column if not exists oral_test_on date,
  add column if not exists oral_test_level text,
  add column if not exists oral_test_evaluator text,
  add column if not exists oral_test_comment text;
create index if not exists learners_admission_status_idx on public.learners (org_id, admission_status);

-- État initial cohérent : quiconque est (ou a été) inscrit dans un groupe est « inscrit ».
update public.learners l
  set admission_status = 'inscrit'
  where admission_status = 'nouveau'
    and exists (select 1 from public.enrollments e where e.learner_id = l.id);

-- Journal des contacts
create table if not exists public.learner_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  contacted_at timestamptz not null default now(),
  channel text not null check (channel in ('whatsapp', 'telephone', 'sms', 'email', 'presentiel')),
  outcome text not null check (outcome in ('message_envoye', 'joint', 'sans_reponse', 'convoque', 'refus', 'autre')),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists learner_contacts_learner_idx on public.learner_contacts (learner_id, contacted_at desc);
create index if not exists learner_contacts_org_idx on public.learner_contacts (org_id, contacted_at desc);

alter table public.learner_contacts enable row level security;
drop policy if exists learner_contacts_select on public.learner_contacts;
create policy learner_contacts_select on public.learner_contacts for select
  using (org_id = private.jwt_org_id());
drop policy if exists learner_contacts_write on public.learner_contacts;
create policy learner_contacts_write on public.learner_contacts for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

-- Réunions d'information
create table if not exists public.info_meetings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null default 'Réunion d''information',
  starts_at timestamptz not null,
  ends_at timestamptz,
  room_id uuid references public.rooms(id) on delete set null,
  location text,                 -- lieu en clair si pas de salle (adresse, autre site)
  capacity smallint,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists info_meetings_org_idx on public.info_meetings (org_id, starts_at desc);
drop trigger if exists info_meetings_updated_at on public.info_meetings;
create trigger info_meetings_updated_at before update on public.info_meetings
  for each row execute function private.set_updated_at();

alter table public.info_meetings enable row level security;
drop policy if exists info_meetings_select on public.info_meetings;
create policy info_meetings_select on public.info_meetings for select
  using (org_id = private.jwt_org_id());
drop policy if exists info_meetings_write on public.info_meetings;
create policy info_meetings_write on public.info_meetings for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

-- Convocations
create table if not exists public.info_meeting_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  meeting_id uuid not null references public.info_meetings(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  status text not null default 'a_envoyer'
    check (status in ('a_envoyer', 'envoyee', 'confirmee', 'presente', 'absente', 'excusee')),
  channel text check (channel in ('whatsapp', 'email', 'telephone', 'sms')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (meeting_id, learner_id)
);
create index if not exists info_meeting_invitations_learner_idx on public.info_meeting_invitations (learner_id);

alter table public.info_meeting_invitations enable row level security;
drop policy if exists info_meeting_invitations_select on public.info_meeting_invitations;
create policy info_meeting_invitations_select on public.info_meeting_invitations for select
  using (org_id = private.jwt_org_id());
drop policy if exists info_meeting_invitations_write on public.info_meeting_invitations;
create policy info_meeting_invitations_write on public.info_meeting_invitations for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

select
  to_regclass('public.learner_contacts') is not null as contacts_ok,
  to_regclass('public.info_meetings') is not null as meetings_ok,
  to_regclass('public.info_meeting_invitations') is not null as invitations_ok;
