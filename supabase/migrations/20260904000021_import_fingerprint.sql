-- Synchronisation Drive → apprenants : empreinte de ligne pour n'importer que les
-- NOUVELLES lignes du fichier partagé (idempotence du cron quotidien).
alter table public.learners
  add column if not exists import_fingerprint text;
create index if not exists learners_fingerprint_idx
  on public.learners (org_id, import_fingerprint) where import_fingerprint is not null;
