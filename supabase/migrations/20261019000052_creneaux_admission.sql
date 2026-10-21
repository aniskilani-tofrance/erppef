-- 0052 · Créneaux d'admission (prise de rendez-vous simple, façon Calendly).
-- À appliquer APRÈS 0050 (admission_appointments).
-- admission_slot_rules : plages hebdomadaires où l'organisme reçoit en rendez-vous
-- d'admission (jour ISO 1 = lundi … 7 = dimanche, heures de Paris, durée d'un créneau).
-- Tant qu'un organisme n'a aucune ligne, l'ERP applique le réglage par défaut
-- (mardi et jeudi, 10h-12h et 14h-16h, 30 min) : rien à insérer ici.
-- admission_slot_blocks : périodes bloquées (demi-journée, journée, plusieurs jours).
-- Les fériés et fermetures de l'organisme viennent de calendar_closures.
-- Les créneaux libres sont calculés côté serveur (src/lib/admission/slots.ts) en
-- retirant aussi les rendez-vous « prévus ». Additive et idempotente.

create table if not exists public.admission_slot_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  slot_minutes smallint not null default 30 check (slot_minutes between 5 and 240),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admission_slot_rules_heures_check check (end_time > start_time)
);
create index if not exists admission_slot_rules_org_idx on public.admission_slot_rules (org_id, weekday, start_time);

drop trigger if exists admission_slot_rules_updated_at on public.admission_slot_rules;
create trigger admission_slot_rules_updated_at before update on public.admission_slot_rules
  for each row execute function private.set_updated_at();

create table if not exists public.admission_slot_blocks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint admission_slot_blocks_duree_check check (ends_at > starts_at)
);
create index if not exists admission_slot_blocks_org_idx on public.admission_slot_blocks (org_id, ends_at);

alter table public.admission_slot_rules enable row level security;
drop policy if exists admission_slot_rules_select on public.admission_slot_rules;
create policy admission_slot_rules_select on public.admission_slot_rules for select
  using (org_id = private.jwt_org_id());
drop policy if exists admission_slot_rules_write on public.admission_slot_rules;
create policy admission_slot_rules_write on public.admission_slot_rules for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

alter table public.admission_slot_blocks enable row level security;
drop policy if exists admission_slot_blocks_select on public.admission_slot_blocks;
create policy admission_slot_blocks_select on public.admission_slot_blocks for select
  using (org_id = private.jwt_org_id());
drop policy if exists admission_slot_blocks_write on public.admission_slot_blocks;
create policy admission_slot_blocks_write on public.admission_slot_blocks for all
  using (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'))
  with check (org_id = private.jwt_org_id() and private.jwt_role() in ('admin', 'coordinator'));

select
  to_regclass('public.admission_slot_rules') is not null as rules_ok,
  to_regclass('public.admission_slot_blocks') is not null as blocks_ok,
  (select count(*) from pg_policies where tablename in ('admission_slot_rules', 'admission_slot_blocks')) as policies,
  (select count(*) from pg_trigger where tgname = 'admission_slot_rules_updated_at') as trigger_ok;
