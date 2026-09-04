-- Canal par lequel l'apprenant NOUS a contactés (bouche-à-oreille, France Travail,
-- réseaux sociaux, passage à l'accueil…) : distinct du prescripteur (qui l'oriente)
-- et du journal des contacts (nos prises de contact sortantes).
--   contact_source        : code du référentiel CONTACT_SOURCES (src/lib/referentiels.ts)
--   contact_source_detail : précision libre (nom du partenaire, page Facebook…)

alter table public.learners
  add column if not exists contact_source text,
  add column if not exists contact_source_detail text;

select count(*) as learners_ok from public.learners where contact_source is null or contact_source is not null;
