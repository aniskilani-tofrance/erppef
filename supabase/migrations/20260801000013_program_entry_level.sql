-- Dispositifs : niveau de base (entrée) en plus du niveau visé (colonne level existante).
-- Idempotente.
alter table public.programs add column if not exists entry_level text;

select exists(
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'programs' and column_name = 'entry_level'
) as entry_level_ok;
