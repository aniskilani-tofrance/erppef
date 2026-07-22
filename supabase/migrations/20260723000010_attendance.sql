-- Émargement par séance : signatures des apprenants (tablette qui circule, plus tard SMS)
-- + contre-signature du formateur à la clôture.

create type public.attendance_status as enum ('present', 'retard', 'absent');

-- État d'émargement porté par la séance. attendance_token non nul = feuille ouverte,
-- accessible publiquement via /emargement/<token> (le token EST le secret, pas de compte).
alter table public.sessions
  add column attendance_token uuid,
  add column attendance_opened_at timestamptz,
  add column attendance_closed_at timestamptz,
  add column trainer_signature text;

create index sessions_attendance_token_idx
  on public.sessions (attendance_token) where attendance_token is not null;

create table public.attendances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  status public.attendance_status not null default 'present',
  signature text,                -- data URL PNG du tracé (null si statut posé par le formateur)
  signed_at timestamptz,
  method text not null default 'tablette' check (method in ('tablette', 'sms', 'manuel')),
  device text,                   -- user-agent au moment de la signature
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, learner_id)
);
create trigger attendances_updated_at before update on public.attendances
  for each row execute function private.set_updated_at();

-- Lecture = membres de l'org ; écriture = admin/coordinator/trainer (la page publique
-- de signature passe par le client service_role après validation du token, hors RLS).
alter table public.attendances enable row level security;
create policy attendances_select on public.attendances for select
  using (org_id = private.jwt_org_id());
create policy attendances_write on public.attendances for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator', 'trainer'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator', 'trainer'));
