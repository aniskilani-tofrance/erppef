-- 0040 · Admission : statut « Liste d'attente » (évalué, place proposée refusée ou
-- aucun groupe compatible — à reproposer dès qu'une place se libère).
alter table public.learners drop constraint if exists learners_admission_status_check;
alter table public.learners add constraint learners_admission_status_check
  check (admission_status in ('nouveau', 'injoignable', 'contacte', 'convoque', 'evalue', 'liste_attente', 'inscrit', 'sans_suite'));

-- Résultat de contact « Place refusée — liste d'attente » (fait passer la fiche en liste d'attente).
alter table public.learner_contacts drop constraint if exists learner_contacts_outcome_check;
alter table public.learner_contacts add constraint learner_contacts_outcome_check
  check (outcome in ('message_envoye', 'joint', 'sans_reponse', 'convoque', 'place_refusee', 'refus', 'autre'));
