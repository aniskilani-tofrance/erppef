-- Contrat « Bénévole » pour les formateurs : animateurs bénévoles d'ateliers (lecture-écriture,
-- conversation, alphabétisation…), sans rémunération (coût horaire 0).
-- ⚠️ `alter type … add value` doit rester SEUL dans son fichier (erreur 55P04 sinon).
alter type public.contract_type add value if not exists 'benevole';
