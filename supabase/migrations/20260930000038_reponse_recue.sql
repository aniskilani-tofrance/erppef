-- Résultat d'événement « Réponse reçue » (e-mail sur contact@, SMS, WhatsApp).
-- L'ERP ne lit pas la boîte mail : quand un restaurateur écrit, le conseiller note
-- « Réponse reçue » et la séquence automatique s'arrête (motif « Le prospect a répondu »).
-- Élargissement de la contrainte existante, aucune donnée modifiée.

do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.employer_lead_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%''rappel_convenu''%'
  loop
    execute format('alter table public.employer_lead_events drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.employer_lead_events
  add constraint employer_lead_events_outcome_check
  check (outcome is null or outcome in ('joint', 'messagerie', 'barrage', 'rappel_convenu', 'reponse_recue', 'envoye', 'refus', 'rdv_pose', 'rdv_tenu', 'no_show', 'autre'));

-- Contrôle : doit renvoyer true.
select pg_get_constraintdef(oid) like '%reponse_recue%' as reponse_recue_acceptee
from pg_constraint
where conname = 'employer_lead_events_outcome_check';
