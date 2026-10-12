-- 0046 · Admission : motif de « Liste d'attente » et de « Sans suite » sur le carnet de contact.
-- Liste d'attente = la personne veut venir, on reproposera ; Sans suite = dossier clos.
-- Additive : colonne nullable, les contacts existants restent sans motif.
alter table public.learner_contacts add column if not exists reason text;
alter table public.learner_contacts drop constraint if exists learner_contacts_reason_check;
alter table public.learner_contacts add constraint learner_contacts_reason_check
  check (reason is null or reason in (
    'horaire_incompatible', 'garde_enfant', 'groupe_complet', 'pas_de_groupe_niveau', 'indisponible_temporaire', 'attente_autre',
    'plus_interesse', 'injoignable_definitif', 'demenagement', 'emploi_ou_formation', 'hors_public', 'sans_suite_autre'
  ));
