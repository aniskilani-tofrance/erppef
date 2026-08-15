-- Typologie des publics (bilans financeurs) + parcours d'inscription traçable.
-- Tout est nullable : la typologie se complète progressivement, les bilans
-- affichent un compteur « Non renseigné » plutôt que d'exiger la saisie.

alter table public.learners
  add column if not exists gender text check (gender in ('femme', 'homme', 'autre')),
  add column if not exists city text,
  add column if not exists postal_code text,
  add column if not exists qpv boolean,                 -- réside en Quartier Prioritaire de la Ville
  add column if not exists activity_status text check (activity_status in
    ('demandeur_emploi', 'rsa', 'salarie', 'scolaire_etudiant', 'inactif_autre')),
  add column if not exists rqth boolean,                -- reconnaissance travailleur handicapé
  add column if not exists education_level text check (education_level in
    ('non_scolarise', 'primaire', 'secondaire', 'superieur')),
  add column if not exists prescriber text;             -- France Travail, mission locale, CCAS…

-- Parcours : une sortie (abandon/terminé) est un changement de statut daté,
-- jamais une suppression — les bilans financeurs comptent aussi les sorties.
alter table public.enrollments
  add column if not exists left_on date,
  add column if not exists leave_reason text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'enrollments_status_check'
  ) then
    alter table public.enrollments
      add constraint enrollments_status_check check (status in ('inscrit', 'abandon', 'termine'));
  end if;
end;
$$;

drop trigger if exists enrollments_updated_at on public.enrollments;
create trigger enrollments_updated_at before update on public.enrollments
  for each row execute function private.set_updated_at();
