# API d'inscription FLE — formulaire du site

Formulaire de **parleremploiformation.pro/association** → fiche apprenant dans
**Admission → « À contacter »** (statut `nouveau`), comme le lien `/inscription`.
Code : `src/app/api/inscription/route.ts`, logique commune `src/lib/inscription/register.ts`.

## Appels

1. À l'affichage du formulaire : `GET https://pef-erp.vercel.app/api/inscription`

   ```json
   { "ok": true, "t": "1792600000000.xxxxxxxxxxxxxxxxxxxxxx", "minFillMs": 4000,
     "choices": { "languages": [{ "code": "arabe", "fr": "Arabe", "en": "Arabic", "ar": "العربية" }, …],
                  "french": […], "availability": […] } }
   ```

2. À l'envoi : `POST https://pef-erp.vercel.app/api/inscription` (`Content-Type: application/json`)

   | Champ | Type | Obligatoire | Valeurs |
   |---|---|---|---|
   | `firstName`, `lastName` | texte ≤ 60 | oui | |
   | `phone` | texte | oui | « 06 12 34 56 78 », « +33 6… », « +216 … » |
   | `languages` | liste | oui (≥ 1) | codes de `choices.languages` |
   | `french` | code | oui | `pas_du_tout`, `un_peu`, `bien` |
   | `availability` | liste | oui (≥ 1) | `matin`, `apres_midi`, `soir` |
   | `city` | texte ≤ 80 | non | ville ou quartier |
   | `consent` | `true` | oui | case RGPD cochée |
   | `t` | texte | oui | valeur reçue au GET, renvoyée telle quelle |
   | `website` | texte | oui, **vide** | champ piège caché |
   | `src` | texte ≤ 80 | non | précision de provenance (ex. `page association`, `MDQ Landy`) |

   Réponses : `200 {"ok":true}` · `400 {"ok":false,"error":"name|phone|languages|french|availability|consent"}`
   · `403` origine refusée · `429` afflux (plus de 30 inscriptions en 10 min) · `500` erreur serveur.

## Sécurité

- **Aucun jeton dans le navigateur** : l'organisation est fixée côté serveur (`SIGNUP_ORG_SLUG`, `pef` par défaut, jamais le bac à sable).
- **CORS** limité à `INSCRIPTION_ALLOWED_ORIGINS` (par défaut `https://parleremploiformation.pro,https://www.parleremploiformation.pro`). Pour tester depuis l'aperçu Lovable, ajouter temporairement son domaine.
- **Anti-robot** : champ piège, horodatage signé (HMAC, `SIGNUP_FORM_SECRET`) et 4 s minimum entre GET et POST ; un robot reçoit `{"ok":true}` sans que rien ne soit écrit.
- **Plafond d'afflux** commun avec `/inscription`.
- La réponse ne dit jamais si le numéro était déjà connu (pas d'énumération). Doublon = ligne « Réinscription » au journal.

## Variables d'environnement (Vercel)

| Variable | Rôle | Défaut |
|---|---|---|
| `INSCRIPTION_ALLOWED_ORIGINS` | origines autorisées | site ParlerEmploi |
| `SIGNUP_ORG_SLUG` | organisation qui reçoit les fiches | `pef` |
| `SIGNUP_FORM_SECRET` | signature de l'horodatage | dérivé de la clé serveur |
