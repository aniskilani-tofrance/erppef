# Pont lemlist ↔ ERP — prospection sortante (SASU, pilote POEI restauration)

Branche `claude/pont-lemlist`. Rien n'est actif tant que les variables ci-dessous ne sont pas posées
sur Vercel et que le webhook n'est pas créé dans lemlist (feu vert d'Anis).

## Ce que fait le pont

| Événement lemlist | Prospection (ERP) | Leads (ERP) | lemlist |
|---|---|---|---|
| Réponse humaine (`emailsReplied`, `linkedinReplied`, `smsReplied`, `whatsappReplied`) | lien vers le lead, statut inchangé | lead créé s'il n'existe pas : **source « prospection »**, campagne `LEMLIST_CAMPAGNE` (par défaut `poei_sortante_2026-11`), « Contacté », prochaine action « Classer la réponse le jour même » ; texte de la réponse au journal | — |
| Marqué intéressé (`emailsInterested`, `interested`, `linkedinInterested`, `manualInterested`…) | « Intéressé » | idem, prochaine action « Calendly + appel sous 24 h » | — |
| Stop écrit dans une réponse, ou désinscription (`emailsUnsubscribed`, `entityUnsubscribed`, `variableUnsubscribed`) | **« Ne plus appeler »** ; si la fiche n'existe pas, elle est créée dans la liste « Oppositions lemlist — ne jamais réimporter » | **« Perdu »**, raison « Opposition — ne plus contacter (date, canal) » ; aucun lead créé s'il n'y en avait pas | e-mail, téléphone et LinkedIn mis en **liste de blocage** |
| Rebond (`emailsBounced`) | « Injoignable » s'il n'y a pas de téléphone ; note sinon | note | — |
| Message d'absence | note | note | — |
| Tout le reste (envois, ouvertures, clics…) | ignoré | ignoré | — |

Le classement fin d'une réponse (pas maintenant, question, mauvais contact) reste humain : grille
du 02/11 (`tri-des-reponses.md`). La détection du stop est volontairement large (« en cas de doute : cas 5 »).

Dans l'autre sens, un **« Ne plus appeler »** posé à l'écran d'appel, ou un lead passé **« Perdu »** avec la
raison « Opposition — ne plus contacter », met aussi l'e-mail et le téléphone dans la liste de blocage lemlist.
Une liste de Prospection qui contient une opposition ne peut plus être supprimée.

Garde-fous : la source « prospection » coupe tout e-mail et SMS automatique de l'ERP
(`MANUAL_ONLY_SOURCES`) ; toutes les écritures sont filtrées par `LEMLIST_ORG_ID` ; chaque activité
porte un repère `[lemlist act_…]` au journal, si bien qu'un nouvel essai de lemlist ne crée jamais de doublon.

## Variables d'environnement (Vercel, production)

| Variable | Rôle |
|---|---|
| `LEMLIST_WEBHOOK_SECRET` | secret partagé (au moins 16 caractères), le même que celui donné à la création du webhook |
| `LEMLIST_ORG_ID` | organisation de la SASU : `a0000000-0000-4000-8000-000000000001` |
| `LEMLIST_API_KEY` | clé API lemlist (Réglages → Intégrations), pour la liste de blocage |
| `LEMLIST_CAMPAGNE` | facultatif, campagne écrite sur les leads (défaut `poei_sortante_2026-11`) |

## Création du webhook (une fois, après le déploiement)

```sh
curl -X POST https://api.lemlist.com/api/hooks --user ":$LEMLIST_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"targetUrl\":\"https://pef-erp.vercel.app/api/prospection/lemlist\",\"secret\":\"$LEMLIST_WEBHOOK_SECRET\"}"
```

Sans `type`, lemlist envoie tous les événements ; le pont ne garde que ceux du tableau. Le secret ne
peut plus être changé ensuite (supprimer et recréer le webhook pour le changer). Contrôle :
`GET https://pef-erp.vercel.app/api/prospection/lemlist` → `{"ok":true}` quand la configuration est complète.

## Import des listes dans lemlist

Le CSV du collecteur (`signaux-poei-AAAA-MM-JJ.csv`) porte une colonne `siret` : la garder comme
variable personnalisée dans lemlist. Le pont retrouve la fiche Prospection par SIRET, puis par e-mail.

## Points à vérifier sur le compte réel

- le nom du champ qui porte le texte d'une réponse dans le webhook (le pont lit `text`, `message`,
  `body`, `snippet`, `messagePreview` ou `html`) : faire un essai avec une réponse de test ;
- que les variables personnalisées (`siret`) remontent bien dans le corps du webhook.
