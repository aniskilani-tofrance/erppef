-- Stagiaires (co-animation ou atelier propre) : nouvelle valeur du type de contrat.
-- Seule instruction du fichier : une valeur d'enum ne peut pas être lue dans la transaction
-- qui la crée (erreur 55P04), la vérification se fait dans la migration suivante.
alter type public.contract_type add value if not exists 'stagiaire';
