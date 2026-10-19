-- Inscription rapide (/inscription) : formulaire public envoyé par WhatsApp, pensé pour
-- des adultes niveau A1. La personne arrive dans l'onglet Admission (« À contacter »,
-- statut « nouveau ») avec ce qu'elle a déclaré. Colonnes NULLABLES, rien n'est cassé :
-- les fiches existantes et la saisie à la main ne changent pas.
--
--   learners.spoken_languages   : langues parlées déclarées (codes du formulaire : arabe, anglais, dari_pachto…)
--   learners.french_self_level  : « Je parle français » déclaré (indication, PAS un niveau officiel)
--   learners.availability       : disponibilités déclarées (matin, apres_midi, soir)
--   learners.data_consent_at    : date du consentement RGPD donné sur le formulaire (preuve)
--
-- La ville ou le quartier va dans learners.city (colonne existante), la première langue
-- dans learners.first_language. Le canal « formulaire_whatsapp » (Formulaire en ligne)
-- est un code du référentiel CONTACT_SOURCES : contact_source n'a pas de contrainte.

alter table public.learners
  add column if not exists spoken_languages text[],
  add column if not exists french_self_level text,
  add column if not exists availability text[],
  add column if not exists data_consent_at timestamptz;

alter table public.learners drop constraint if exists learners_french_self_level_check;
alter table public.learners add constraint learners_french_self_level_check
  check (french_self_level is null or french_self_level in ('pas_du_tout', 'un_peu', 'bien'));

comment on column public.learners.spoken_languages is 'Langues parlées déclarées sur le formulaire d''inscription rapide';
comment on column public.learners.french_self_level is 'Français déclaré par la personne (pas_du_tout / un_peu / bien) : indication, pas un niveau officiel';
comment on column public.learners.availability is 'Disponibilités déclarées (matin, apres_midi, soir)';
comment on column public.learners.data_consent_at is 'Consentement RGPD donné sur le formulaire d''inscription rapide';

select count(*) as learners_ok from public.learners where spoken_languages is null or spoken_languages is not null;
