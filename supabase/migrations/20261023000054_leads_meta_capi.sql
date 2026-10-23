-- 0054 · Leads resto : consentement de recontact et identifiants publicitaires Meta.
-- La landing envoie la case « J'accepte d'être recontacté » (consentement_recontact) et,
-- quand elle les a, le cookie _fbc ou le fbclid du lien publicitaire et le cookie _fbp.
-- L'ERP les garde sur la fiche pour l'API Conversions de Meta : les signaux « Lead
-- qualifié » et « RDV pris » partent des jours après le formulaire, ils ont besoin du
-- consentement (sans lui, rien ne part) et des identifiants de clic pour être rattachés
-- à la bonne publicité.
--
-- À appliquer AVANT le déploiement du code qui les lit. Sans elle, le code reste sûr :
-- la fiche est créée normalement, l'écriture de ces trois champs échoue (journal serveur)
-- et aucun signal n'est envoyé à Meta, faute de consentement enregistré. Idempotente.

alter table public.employer_leads
  add column if not exists recontact_consent boolean,
  add column if not exists meta_fbc text,
  add column if not exists meta_fbp text;

comment on column public.employer_leads.recontact_consent is
  'Case « J''accepte d''être recontacté » du formulaire de la landing (null = non transmis : fiche saisie à la main, Calendly, Meta via Make).';
comment on column public.employer_leads.meta_fbc is
  'Identifiant de clic Meta (cookie _fbc, ou fb.1.<ms>.<fbclid> reconstruit à la réception) pour l''API Conversions. Non haché, ne nomme personne.';
comment on column public.employer_leads.meta_fbp is
  'Identifiant navigateur Meta (cookie _fbp) transmis par la landing, pour l''API Conversions. Non haché, ne nomme personne.';

select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'employer_leads' and column_name = 'recontact_consent') as consentement_ok,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'employer_leads' and column_name = 'meta_fbc') as fbc_ok,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'employer_leads' and column_name = 'meta_fbp') as fbp_ok;
