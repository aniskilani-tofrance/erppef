-- Correction demandée par Anis (04/09) : Sabrina AMRI n'est pas vacataire mais
-- freelance → type de contrat « prestataire » (sous-traitance, Qualiopi ind. 27).
-- À exécuter APRÈS la migration 0022 (la valeur d'enum doit être committée).
update public.trainers
set contract_type = 'prestataire'
where org_id = (select id from public.organizations where slug = 'pef')
  and upper(last_name) = 'AMRI';
