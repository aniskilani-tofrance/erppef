-- 0053 · Réservation d'un créneau d'admission par l'apprenant (fin du formulaire /inscription).
-- À appliquer APRÈS 0050 (admission_appointments), 0051 et 0052.
--
-- 1. Verrou en base : deux rendez-vous « prévus » d'un même organisme ne peuvent plus se
--    chevaucher (contrainte d'exclusion gist sur tstzrange(starts_at, ends_at, '[)') :
--    deux créneaux qui se touchent, 10h00-10h30 puis 10h30-11h00, restent possibles).
--    C'est elle qui tranche si deux personnes touchent le même créneau au même instant
--    (formulaire public comme ERP) ; l'ERP traduit l'erreur en message clair (pg-errors).
--    Un RDV annulé, honoré ou absent ne bloque rien.
-- 2. booked_online : le RDV a été réservé par l'apprenant lui-même (mention « réservé en
--    ligne » dans l'onglet Admission et dans l'événement Google).
--
-- ends_at est NOT NULL depuis 0050 (avec ends_at > starts_at) : aucune reprise de lignes.
-- Si des RDV prévus se chevauchent déjà, la migration s'arrête en les listant : à régler
-- à la main (déplacer ou annuler) avant de la relancer. Additive et idempotente.

create extension if not exists btree_gist;

alter table public.admission_appointments alter column ends_at set not null;

alter table public.admission_appointments
  add column if not exists booked_online boolean not null default false;

do $$
declare
  conflits text;
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'admission_appointments_no_overlap'
      and conrelid = 'public.admission_appointments'::regclass
  ) then
    return;
  end if;

  select string_agg(format('%s ↔ %s (%s)', a.id, b.id, to_char(a.starts_at at time zone 'Europe/Paris', 'DD/MM HH24:MI')), ' ; ')
    into conflits
  from public.admission_appointments a
  join public.admission_appointments b
    on b.org_id = a.org_id
   and b.id > a.id
   and b.status = 'prevu'
   and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(b.starts_at, b.ends_at, '[)')
  where a.status = 'prevu';

  if conflits is not null then
    raise exception 'RDV d''admission prévus qui se chevauchent, à régler avant 0053 : %', conflits;
  end if;

  alter table public.admission_appointments
    add constraint admission_appointments_no_overlap exclude using gist (
      org_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    ) where (status = 'prevu');
end $$;

select
  (select count(*) from pg_constraint where conname = 'admission_appointments_no_overlap') as verrou_ok,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'admission_appointments' and column_name = 'booked_online') as booked_online_ok;
