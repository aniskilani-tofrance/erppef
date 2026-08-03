-- Formateur à privilégier par dispositif (cadrage des calendriers type).
-- Idempotente.
alter table public.programs
  add column if not exists preferred_trainer_id uuid references public.trainers(id) on delete set null;

select exists(
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'programs' and column_name = 'preferred_trainer_id'
) as preferred_trainer_ok;
