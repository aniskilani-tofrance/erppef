# Brief d'intégration — pousser les leads de la landing vers l'ERP ParlerEmploi

Objectif : chaque soumission du formulaire de la landing (page VSL) crée une fiche dans le
mini-CRM de l'ERP PEF, en plus de l'inscription Brevo. Le setter est prévenu par email et
rappelle sous 24 h. Le jeton réel se trouve dans l'ERP : Leads resto → Réglages.

## Point d'entrée

- `POST https://pef-erp.vercel.app/api/leads/inbound?token=<TOKEN>`
- Le jeton peut aussi passer en en-tête : `X-Leads-Token: <TOKEN>` ou `Authorization: Bearer <TOKEN>`.
- `Content-Type` : `application/json` (préféré), `application/x-www-form-urlencoded` ou `multipart/form-data`.
- Test de santé : `GET` avec le jeton → `200 {"ok":true,"organisation":"ParlerEmploi Formation",...}`.

## Règle de sécurité (non négociable)

Le jeton est un secret. Il ne doit jamais apparaître dans le JavaScript du navigateur, dans
l'attribut `action` d'un `<form>`, ni dans une URL visible côté client. L'appel vers l'ERP part
**du serveur** : route API, server action ou fonction serverless de la landing. Si la landing est
purement statique (sans back-end), ne pas appeler l'ERP depuis le navigateur : utiliser Brevo
Automations (point d'entrée « Formulaire soumis » → action « Appeler un webhook », POST vers
l'adresse), qui fait l'appel côté serveur.

## Champs à envoyer

Clés acceptées en français ou en anglais, casse et accents indifférents. Tout champ inconnu est
ignoré sans erreur. Au moins un des trois champs marqués `*` est requis.

| Clé | Requis | Exemple | Remarque |
|---|---|---|---|
| `entreprise` (ou `restaurant`, `company`) | * | `Chez Karim` | nom de l'établissement |
| `prenom` | | `Karim` | |
| `nom` | | `Benali` | |
| `telephone` (ou `phone`, `sms`) | * | `06 12 34 56 78` | format libre, normalisé côté ERP |
| `email` | * | `karim@chezkarim.fr` | |
| `ville` | | `Saint-Denis 93200` | le code postal est extrait s'il est dedans |
| `code_postal` | | `93200` | |
| `postes` | | `commis, plongeur` | cuisine / salle |
| `nb_postes` | | `2` | entier |
| `type_etablissement` | | `restaurant traditionnel`, `fast-food`, `collective`, `hôtel`, `boulangerie` | devine le segment |
| `message` | | texte libre | va dans les notes de la fiche |
| `utm_source` | | `facebook`, `instagram`, `google` | facebook/instagram/meta → source « Formulaire Meta » |
| `utm_campaign` | | `V2 galère` | devient la campagne de la fiche |
| `utm_content` | | nom du visuel | utilisé si `utm_campaign` absent |
| `source` | | `site` (défaut), `formulaire_meta`, `appel_entrant`, `recommandation` | |

Les attributs Brevo (`attributes.PRENOM`, `NOM`, `SMS`, `ENTREPRISE`, `VILLE`…) sont lus tels quels.

## Réponses

| Code | Corps | À faire |
|---|---|---|
| 200 | `{"ok":true,"duplicate":false,"leadId":"…","ref":"L-0012"}` | succès, fiche créée |
| 200 | `{"ok":true,"duplicate":true,"leadId":"…","ref":"L-0012"}` | même téléphone ou email vu sous 30 jours : pas de nouvelle fiche, événement journalisé. Traiter comme un succès. |
| 400 | `{"ok":false,"error":"Aucun champ reconnu…"}` | aucun des trois champs clés : corriger le mapping |
| 401 | `{"ok":false,"error":"Jeton invalide"}` | jeton absent ou faux |
| 500 | `{"ok":false,"error":"…"}` | réessayer une fois après 2 s, puis journaliser |

## Comportement attendu côté landing

1. À la soumission : inscription Brevo (existant) **et** POST vers l'ERP côté serveur, en parallèle.
2. Ne jamais bloquer l'utilisateur sur la réponse de l'ERP : timeout 5 s, page de confirmation affichée quoi qu'il arrive, erreur journalisée côté serveur.
3. Capturer les UTM de l'URL de la landing (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`) dans des champs cachés et les renvoyer.
4. Téléphone obligatoire côté formulaire (un lead sans téléphone est quasi mort) ; format libre.
5. Champ caché honeypot anti-spam : s'il est rempli, ne rien envoyer à l'ERP.
6. Case de consentement RGPD + mention : les données sont traitées par ParlerEmploi Centre de Formation pour vous recontacter au sujet de votre demande de recrutement.
7. Calendly du setter intégré sur la page : rien à faire côté landing, le relais vers l'ERP est assuré par Make (Calendly → Watch events → HTTP).

## Exemples

Appel serveur en Node (fetch) :

```js
await fetch("https://pef-erp.vercel.app/api/leads/inbound", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Leads-Token": process.env.ERP_LEADS_TOKEN },
  body: JSON.stringify({
    entreprise: form.restaurant,
    prenom: form.prenom,
    nom: form.nom,
    telephone: form.telephone,
    email: form.email,
    ville: form.ville,
    postes: form.postes,
    nb_postes: form.nb_postes,
    message: form.message,
    utm_source: utm.source,
    utm_campaign: utm.campaign,
    utm_content: utm.content,
  }),
  signal: AbortSignal.timeout(5000),
});
```

curl de test :

```bash
curl -X POST "https://pef-erp.vercel.app/api/leads/inbound?token=<TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"entreprise":"TEST — à supprimer","prenom":"Karim","nom":"Test","telephone":"06 00 00 00 01","email":"test@example.com","ville":"Saint-Ouen 93400","postes":"plongeur","nb_postes":"1","utm_source":"facebook","utm_campaign":"test"}'
```

Formulaire classique (`application/x-www-form-urlencoded`) : mêmes clés, `entreprise=...&telephone=...&email=...`.

## Test d'acceptation

1. `GET` santé → 200.
2. `POST` de l'exemple → 200 avec une référence `L-xxxx` ; la fiche apparaît dans l'ERP et le setter reçoit l'email.
3. Le même `POST` renvoyé → `duplicate: true`.
4. Nommer toutes les fiches de test « TEST — à supprimer » dans `entreprise` ; elles seront supprimées depuis l'ERP.
