# Pont lemlist ↔ ERP — prospection sortante (SASU, pilote POEI restauration)

Adresse à donner à lemlist : `https://pef-erp.vercel.app/api/leads/lemlist-webhook?secret=…`
(l'ancienne adresse `/api/prospection/lemlist` fait la même chose). Rien n'est actif tant que
`LEMLIST_WEBHOOK_SECRET` n'est pas posé sur Vercel et que le webhook n'est pas créé dans lemlist.
Organisation : toujours la production (`a0000000-0000-4000-8000-000000000001`), jamais le bac à sable
ni une valeur reçue dans la requête.

## Ce que fait le pont

| Événement lemlist | Prospection (ERP) | Leads (ERP) | lemlist |
|---|---|---|---|
| Réponse humaine (`emailsReplied`, `linkedinReplied`, `smsReplied`, `whatsappReplied`) | lien vers le lead, statut inchangé | lead créé s'il n'existe pas : **source « prospection »**, campagne `LEMLIST_CAMPAGNE` (par défaut `poei_sortante_2026-11`), « Contacté », prochaine action « Classer la réponse le jour même » ; texte de la réponse au journal | — |
| Marqué intéressé (`emailsInterested`, `interested`, `linkedinInterested`, `manualInterested`…) | « Intéressé » | idem, prochaine action « Calendly + appel sous 24 h » | — |
| Stop écrit dans une réponse, ou désinscription (`emailsUnsubscribed`, `entityUnsubscribed`, `variableUnsubscribed`, `apiUnsubscribed`) | **« Ne plus appeler »** ; si la fiche n'existe pas, elle est créée dans la liste « Oppositions lemlist — ne jamais réimporter » | **« Perdu »**, raison « Opposition — ne plus contacter (date, canal) » ; aucun lead créé s'il n'y en avait pas | e-mail, téléphone et LinkedIn mis en **liste de blocage** |
| Pas intéressé (`emailsNotInterested`, `linkedinNotInterested`, `manualNotInterested`, `aircallNotInterested`, `apiNotInterested`) | « Pas de besoin » (sauf « Intéressé » ou « Ne plus appeler ») | **« Perdu »**, raison « Pas intéressé — lemlist (date, canal) » ; un lead en « RDV pris » ou plus loin n'est pas touché (note « à vérifier ») ; aucun lead créé | — (pas d'opposition : pas de liste de blocage) |
| RDV pris par lemcal (`meetingBooked`) | « Intéressé » | lead créé s'il n'existe pas ; **« RDV pris »**, `rdv_at` = `meetingDate`, journal « RDV posé » | — |
| Rebond (`emailsBounced`) | « Injoignable » s'il n'y a pas de téléphone ; note sinon | note | — |
| Message d'absence | note | note | — |
| Tout le reste (envois, ouvertures, clics…) | ignoré | ignoré | — |

Le classement fin d'une réponse (pas maintenant, question, mauvais contact) reste humain : grille
du 02/11 (`tri-des-reponses.md`). La détection du stop est volontairement large (« en cas de doute : cas 5 »).

Dans l'autre sens, un **« Ne plus appeler »** posé à l'écran d'appel, ou un lead passé **« Perdu »** avec la
raison « Opposition — ne plus contacter », met aussi l'e-mail et le téléphone dans la liste de blocage lemlist.
Une liste de Prospection qui contient une opposition ne peut plus être supprimée.

Garde-fous : la source « prospection » coupe tout e-mail et SMS automatique de l'ERP
(`MANUAL_ONLY_SOURCES`) ; toutes les écritures sont filtrées par l'organisation de production ; chaque activité
porte un repère `[lemlist act_…]` au journal, si bien qu'un nouvel essai de lemlist ne crée jamais de doublon.

## Variables d'environnement (Vercel, production)

| Variable | Rôle |
|---|---|
| `LEMLIST_WEBHOOK_SECRET` | secret partagé (au moins 16 caractères), le même que celui donné à la création du webhook |
| `LEMLIST_API_KEY` | clé API lemlist (Réglages → Intégrations), pour la liste de blocage |
| `LEMLIST_CAMPAGNE` | facultatif, campagne écrite sur les leads (défaut `poei_sortante_2026-11`) |

## Création du webhook (une fois par campagne, après le déploiement)

Le connecteur lemlist de Claude (outil `create_webhook`) ne transmet pas de secret dans le corps :
le secret est donc dans l'adresse, en paramètre `?secret=`. Un webhook par campagne suivie
(FLE OPCO `cam_9G3TiajjZTissYLnT`, POEI `cam_DJYcsdR7uyTdu6tjn`), sans `type` : lemlist envoie
tous les événements, le pont ne garde que ceux du tableau.

```text
targetUrl  = https://pef-erp.vercel.app/api/leads/lemlist-webhook?secret=<LEMLIST_WEBHOOK_SECRET>
campaignId = cam_…
```

Pour changer le secret : changer la variable Vercel, redéployer, supprimer puis recréer les webhooks.
Contrôle : `GET https://pef-erp.vercel.app/api/leads/lemlist-webhook` → `{"ok":true}` quand le secret est posé.

## Retrouver la fiche

Le pont cherche dans cet ordre : SIRET exact, SIREN (variable personnalisée `siren` des listes de
restaurants, début du SIRET, ou « SIREN 123456789 » dans les notes), e-mail, puis téléphone
(`phone`/`leadPhone`, mis au format +33…). Les restaurants POEI n'ont presque jamais d'e-mail fiable :
garder les variables `siren` et `phone` dans lemlist.

## Points à vérifier sur le compte réel

- le nom du champ qui porte le texte d'une réponse dans le webhook (le pont lit `text`, `message`,
  `body`, `snippet`, `messagePreview` ou `html`) : faire un essai avec une réponse de test ;
- que les variables personnalisées (`siren`, `siret`) remontent bien dans le corps du webhook.
