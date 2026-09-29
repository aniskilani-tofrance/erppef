# Retours Brevo → ERP : déclarer le webhook transactionnel

Objectif : que la fiche d'un lead sache si nos e-mails automatiques lui arrivent (délivré),
rebondissent (bounce doux ou dur), ou s'il s'est désinscrit ou a signalé un message comme
indésirable. Un bounce dur, une désinscription ou une plainte arrêtent aussitôt la séquence
de relance de la fiche et empêchent tout nouvel envoi automatique.

## Adresse

`POST https://pef-erp.vercel.app/api/leads/brevo-webhook?token=<TOKEN>`

Le jeton est celui des réglages Leads (Leads → Réglages → « Leads qui arrivent tout seuls »),
le même que pour le point d'entrée des formulaires. Il ne doit figurer que dans la
configuration Brevo, jamais dans une page publique.

Vérification : ouvrir l'adresse dans un navigateur (GET) répond
`{"ok":true,"organisation":"ParlerEmploi Formation","message":"Point d'entrée des retours Brevo actif…"}`.

## Réglage dans Brevo (une fois, par la direction)

1. Brevo → **Transactionnel** → **Paramètres** → **Webhooks** → **Ajouter un webhook**.
2. URL : l'adresse ci-dessus, avec le jeton.
3. Événements à cocher : **Délivré**, **Soft bounce**, **Hard bounce**, **Bloqué**,
   **Adresse invalide**, **Désinscrit**, **Plainte (spam)**. Les autres (ouverture, clic,
   différé, envoyé) peuvent rester décochés : l'ERP les ignore.
4. Enregistrer. Brevo envoie alors un POST JSON par événement.

## Ce que l'ERP fait de chaque retour

| Événement Brevo | Fiche (`email_status`) | Journal | Séquence |
|---|---|---|---|
| `delivered` | `delivered` | « E-mail délivré » | continue |
| `soft_bounce` | `soft_bounce` | « bounce doux, Brevo réessaie » | continue |
| `hard_bounce`, `blocked`, `invalid_email` | `hard_bounce` | « adresse invalide, plus aucun e-mail automatique » | **arrêt** (bounce dur), rappels J-1/H-2 annulés |
| `unsubscribed` | `unsubscribed` | « désinscrit via le lien Brevo, opposition enregistrée » | **arrêt** (désinscription), `opt_out_at`, rappels annulés |
| `spam` | `complaint` | « signalé comme indésirable, opposition enregistrée » | **arrêt** (opposition), `opt_out_at`, rappels annulés |
| autres | — | — | — |

Tous les retours, retenus ou non, sont conservés bruts dans `employer_lead_email_events`
(`event`, `email`, `message_id`, `lead_event`, `reason`, `occurred_at`, `payload`). Un même
`message_id` + `event` n'est enregistré qu'une fois (Brevo peut renvoyer).

## Comment la fiche est retrouvée

1. L'en-tête personnalisé que l'ERP pose à l'envoi et que Brevo renvoie tel quel :
   `X-Mailin-custom: lead_ref:L-0042|event:poei_lead_relance_j3` → fiche L-0042.
2. À défaut, l'identifiant du message (`message-id`), que l'ERP a noté dans le journal à l'envoi.
3. À défaut, l'adresse e-mail (fiche la plus récente de l'organisation avec cette adresse).

Un retour sans fiche retrouvée est quand même conservé (`lead_id` vide).

## Réponses

- `200 {"ok":true,"traites":n,"details":[…]}` : toujours, dès que le jeton est bon (Brevo
  réessaie sur toute autre réponse, et un retour illisible n'a pas besoin d'être rejoué).
- `401 {"ok":false,"error":"Jeton invalide"}` : jeton absent ou faux.

## Test sans prospect réel

```bash
curl -X POST "https://pef-erp.vercel.app/api/leads/brevo-webhook?token=<TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"event":"delivered","email":"test@example.com","message-id":"<test@smtp-relay.mailin.fr>","ts_event":1790000000,"X-Mailin-custom":"lead_ref:L-9999|event:poei_lead_nouveau"}'
```

Attendu : `{"ok":true,"traites":1,"details":[{"event":"delivered","fiche":null,"retenu":true}]}`
(aucune fiche L-9999 : le retour est conservé sans fiche, rien d'autre ne bouge).
