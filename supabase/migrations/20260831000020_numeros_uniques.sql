-- Numéros uniques lisibles par apprenant (A-0001) et par groupe (G-0001),
-- séquentiels PAR ORGANISATION (multi-tenant : chaque organisme a sa numérotation).
-- Attribution par trigger via une table de compteurs (verrou de ligne = pas de doublon
-- même en insertion concurrente). L'existant est numéroté dans l'ordre de création.

create table if not exists public.org_counters (
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity text not null,
  value integer not null default 0,
  primary key (org_id, entity)
);
alter table public.org_counters enable row level security;
-- Aucune policy : la table n'est touchée que par la fonction SECURITY DEFINER ci-dessous.

create or replace function private.next_counter(p_org uuid, p_entity text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.org_counters (org_id, entity, value)
  values (p_org, p_entity, 1)
  on conflict (org_id, entity)
  do update set value = org_counters.value + 1
  returning value;
$$;

alter table public.learners add column if not exists learner_no integer;
alter table public.groups add column if not exists group_no integer;

create or replace function private.set_learner_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.learner_no is null then
    new.learner_no := private.next_counter(new.org_id, 'learner');
  end if;
  return new;
end;
$$;

create or replace function private.set_group_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.group_no is null then
    new.group_no := private.next_counter(new.org_id, 'group');
  end if;
  return new;
end;
$$;

drop trigger if exists learners_set_no on public.learners;
create trigger learners_set_no before insert on public.learners
  for each row execute function private.set_learner_no();

drop trigger if exists groups_set_no on public.groups;
create trigger groups_set_no before insert on public.groups
  for each row execute function private.set_group_no();

-- Reprise de l'existant : numérotation dans l'ordre de création, par organisation
with numbered as (
  select id, row_number() over (partition by org_id order by created_at, id) as rn
  from public.learners
  where learner_no is null
)
update public.learners l set learner_no = n.rn from numbered n where l.id = n.id;

with numbered as (
  select id, row_number() over (partition by org_id order by created_at, id) as rn
  from public.groups
  where group_no is null
)
update public.groups g set group_no = n.rn from numbered n where g.id = n.id;

-- Compteurs alignés sur le maximum existant
insert into public.org_counters (org_id, entity, value)
select org_id, 'learner', max(learner_no) from public.learners group by org_id
on conflict (org_id, entity) do update set value = greatest(org_counters.value, excluded.value);

insert into public.org_counters (org_id, entity, value)
select org_id, 'group', max(group_no) from public.groups group by org_id
on conflict (org_id, entity) do update set value = greatest(org_counters.value, excluded.value);

-- Unicité garantie par organisation
create unique index if not exists learners_org_no_idx on public.learners (org_id, learner_no);
create unique index if not exists groups_org_no_idx on public.groups (org_id, group_no);
