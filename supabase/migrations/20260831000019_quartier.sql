-- Quartier de résidence (découpage Ville de Saint-Ouen) : demandé par le financeur
-- municipal dans ses bilans territorialisés. Texte libre (découpages propres à chaque
-- commune financeuse), UI = liste des 6 quartiers de Saint-Ouen.
alter table public.learners
  add column if not exists district text;
