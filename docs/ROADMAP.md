# Feuille de route — améliorations ERP (validée le 29/08/2026)

Principe directeur : **chaque amélioration retire des clics ou de la saisie, jamais elle n'en ajoute.**
(Refusés au nom de la simplicité : messagerie interne, GED généraliste, dashboards configurables, champs personnalisés.)

## Lot 1 — Confort quotidien (~1 jour)

- **Recherche globale ⌘K** : apprenants, groupes, formateurs, salles depuis n'importe quelle page.
- **Vue « À faire aujourd'hui »** sur le Dashboard coordinateur : feuilles d'émargement non clôturées,
  apprenants en décrochage, groupes qui démarrent sans salle/formateur, conflits résiduels.
- **Duplication de trimestre** : « reconduire ce groupe » → re-matérialisation du planning
  via `src/lib/engine/recurrence.ts` en sautant les nouvelles vacances (promesse V1 à solder).

## Lot 2 — Bilans sans saisie (~1 jour)

- **QPV automatique** : à la saisie commune + code postal, interroger l'API officielle des
  quartiers prioritaires (sig.ville.gouv.fr / apicarto IGN — vérifier l'API vivante au moment de l'implémentation)
  et cocher `learners.qpv` automatiquement (surchargeable à la main).
- **Import CSV enrichi** : colonnes optionnelles typologie (Naissance;Sexe;Commune;CP;Situation;QPV;RQTH;Scolarisation;Prescripteur)
  dans `learner-import-dialog.tsx` — les rentrées de cohortes alimentent les bilans financeurs sans ressaisie.

## Lot 3 — Assiduité (~1-2 jours + coût SMS)

- **Rappels automatiques la veille des séances** (« Demain 9h, salle 12 ») : email via Resend
  d'abord, SMS ensuite (fournisseur à choisir — Brevo déjà utilisé côté ToFrance fait aussi le SMS).
  Réglage on/off par groupe, cron quotidien existant réutilisé. Levier n°1 de l'assiduité,
  donc des heures facturables aux financeurs.
- **Relance ciblée des feuilles non clôturées** au formateur concerné (l'alerte n'arrive
  aujourd'hui qu'à l'admin).

## Lot 3 bis — Qualiopi « 100 % dans l'ERP » (livré le 04/09/2026)

- **Analyse du besoin à l'entrée (ind. 4)** : bloc sur la fiche apprenant (objectif visé, besoin
  exprimé, date d'entretien) + « dossier d'entrée » PDF individuel ; colonnes Objectif/Besoin
  dans le modèle Excel et la synchro Drive.
- **Registre de veille (critère 6, ind. 23-25)** : page Qualité, entrées datées et catégorisées
  (légale / métiers / pédagogique), case « diffusée à l'équipe » ; rappel dans l'email d'alertes
  du 1er du mois si le mois écoulé est vide.
- **Sous-traitance (ind. 27)** : type de contrat « Prestataire » sur la fiche formateur + carte
  Qualité listant les prestataires et l'état de leur dossier documentaire.
- Résultat : plus aucun indicateur « hors ERP » dans le tableau des preuves.

## Lot 3 ter — Parcours d'admission, WhatsApp d'abord (livré le 05/09/2026)

- **Prise de contact** : statut d'admission sur chaque apprenant (nouveau → contacté/injoignable →
  convoqué → évalué → inscrit, ou sans suite), journal des contacts (canal, résultat, note, auteur),
  bouton WhatsApp « clic pour écrire » avec message pré-rempli (lien wa.me, zéro API, zéro coût),
  liste « À contacter » dans l'onglet Admission de la page Apprenants (une seule entrée de menu), filtre par statut.
- **Réunions d'information** : création (date, salle/lieu, capacité), convoqués par cases à cocher,
  convocation WhatsApp en un clic par personne (email en second), statut envoyée/confirmée/présente,
  rappel WhatsApp la veille + rappel email automatique, alertes Dashboard et cron du matin.
- **Canal de premier contact** (comment la personne nous a contactés) : référentiel CONTACT_SOURCES,
  champ « Nous a contactés par » + précision sur la fiche, colonnes 20-21 du modèle Excel/Drive,
  carte « D'où viennent les demandes » (onglet Admission), distribution dans le bilan financeur (page + PDF),
  ligne dans le dossier d'entrée PDF.
- **Test oral** : saisie en 20 s depuis la réunion ou la fiche (date, niveau, évaluateur,
  commentaire), recopié dans le niveau évalué ; dossier d'entrée PDF complété (test oral, réunion suivie).
- Reste hors lot : SMS automatique (fournisseur à ouvrir, ~0,05 €/SMS) et WhatsApp Business API
  (validation Meta) — le clic WhatsApp couvre le besoin sans compte ni coût.

## Lot 4 — BPF (~2 jours, à livrer en décembre pour la saison de janvier)

- **Bilan Pédagogique et Financier pré-rempli** depuis les données (heures, apprenants,
  financements par catégorie de financeur) — cadres C/F du Cerfa. La corvée annuelle de tous
  les OF, et l'argument commercial n°1 de la niche associative avec le module Rapports.

## Rappels transverses

- Règle projet : toute nouveauté documentée dans `src/lib/help-content.ts`, même commit.
- Déploiement : `vercel build --prod` + `vercel deploy --prebuilt --prod --yes` (jamais de build distant).
- Reste hors lots (chantiers niche) : multi-sites, rôle direction, valorisation du bénévolat,
  onboarding self-service organisme.
