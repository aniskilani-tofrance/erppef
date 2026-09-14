-- Envoi hebdomadaire des feuilles d'émargement au financeur (ex. cours municipaux → Ville
-- de Saint-Ouen) : réglage par groupe (actif, destinataires, copies) + journal des envois.
-- Idempotent.

alter table public.groups
  add column if not exists attendance_mail_enabled boolean not null default false,
  add column if not exists attendance_mail_to text[] not null default '{}',
  add column if not exists attendance_mail_cc text[] not null default '{}',
  add column if not exists attendance_mail_last_sent_at timestamptz;

create table if not exists public.attendance_dispatches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  sent_at timestamptz not null default now(),
  period_from timestamptz not null,
  period_to timestamptz not null,
  mode text not null default 'auto',            -- auto (vendredi) | manuel | test
  status text not null default 'envoye',        -- envoye | reporte (rien de clôturé) | rien (aucune séance) | erreur
  recipients text[] not null default '{}',
  cc text[] not null default '{}',
  session_ids uuid[] not null default '{}',     -- feuilles jointes
  missing_session_ids uuid[] not null default '{}', -- séances passées sans feuille clôturée
  error text,
  triggered_by uuid references auth.users(id) on delete set null
);
create index if not exists attendance_dispatches_group_idx on public.attendance_dispatches(group_id, sent_at desc);

alter table public.attendance_dispatches enable row level security;
drop policy if exists attendance_dispatches_select on public.attendance_dispatches;
create policy attendance_dispatches_select on public.attendance_dispatches for select
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));
-- Écriture : uniquement par le serveur (service_role), jamais depuis le navigateur.
drop policy if exists attendance_dispatches_no_setter on public.attendance_dispatches;
create policy attendance_dispatches_no_setter on public.attendance_dispatches as restrictive for select
  using (private.jwt_role() is distinct from 'setter');

-- Pré-remplissage PEF : cours municipaux (Ville de Saint-Ouen via BOP104), un envoi par site.
update public.groups set attendance_mail_enabled = true,
  attendance_mail_to = array['mba@mairie-saint-ouen.fr'],
  attendance_mail_cc = array['gfenzi@mairie-saint-ouen.fr', 'nchahbani@mairie-saint-ouen.fr']
  where id = '079f51c5-6623-45e1-8a19-49d4ecfc02c7' and attendance_mail_to = '{}';   -- Cordon (A1)
update public.groups set attendance_mail_enabled = true,
  attendance_mail_to = array['miscache@mairie-saint-ouen.fr'],
  attendance_mail_cc = array['gfenzi@mairie-saint-ouen.fr', 'nchahbani@mairie-saint-ouen.fr']
  where id = '2975c572-344e-4eb5-a48a-a998597da2ad' and attendance_mail_to = '{}';   -- Landy (A2)
update public.groups set attendance_mail_enabled = true,
  attendance_mail_to = array['gfenzi@mairie-saint-ouen.fr', 'nchahbani@mairie-saint-ouen.fr'],
  attendance_mail_cc = '{}'
  where id = '52d1c95f-c50f-4f53-b539-e8650eb66b6d' and attendance_mail_to = '{}';   -- Berthoud (B1)

-- Vérification
select
  (select count(*) from information_schema.columns where table_name = 'groups' and column_name like 'attendance_mail_%') as colonnes_groups,
  to_regclass('public.attendance_dispatches') is not null as table_ok,
  (select count(*) from public.groups where attendance_mail_enabled) as groupes_actifs;
