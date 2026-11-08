# API Leads — ERP PEF (lemlist, agents Claude, imports)

Trois routes pour lire et créer des leads et des prospects sans passer par des fichiers.
Organisation : **toujours la production** « ParlerEmploi Formation » (`a0000000-0000-4000-8000-000000000001`).
L'appelant ne la choisit jamais ; si l'identifiant pointait un jour sur le bac à sable, l'API répond 503.

## Authentification

`Authorization: Bearer <PEF_LEADS_API_TOKEN>` (au moins 16 caractères, variable Vercel sensible).
Comparaison à temps constant, jamais journalisé. 401 = jeton faux ou absent, 503 = jeton non posé côté serveur.

Côté NucBox, le jeton est dans `~/.secrets/erp-leads-api.txt` (chmod 600), lu par l'outil
`~/agences/qg/bin/erp-leads` : les agents l'utilisent sans jamais voir le jeton ni la clé de service Supabase.

## `GET /api/leads`

| Paramètre | Rôle |
|---|---|
| `depuis` (obligatoire) | `AAAA-MM-JJ` (minuit, heure de Paris l'hiver) ou date ISO : fiches modifiées depuis |
| `cible` | `leads` (défaut) ou `prospection` |
| `limite`, `decalage` | pagination (1-500, défaut 200) |
| `evenements=1` | ajoute le journal (`evenements` pour les leads, `appels` pour les prospects) depuis la même date |

Réponse : `{ ok, cible, organisation, depuis, nombre, leads: [{ ref: "L-0042", id, company, status, phone, … }] }`
(ou `prospects`). Tri : les plus anciennes modifications d'abord.

## `POST /api/leads/import`

```json
{
  "cible": "prospection",
  "liste": "POEI resto — prospection sortante nov. 2026",
  "campagne": "poei-resto-sortant-2026-11",
  "simulation": true,
  "texte": "Restaurant\tContact\tFonction\tTéléphone\t…"
}
```

- `cible` : `leads` (défaut) ou `prospection` (liste d'appels, créée si elle n'existe pas ; `liste` obligatoire).
- Contenu : soit `texte` (même format que l'import par collage : en-têtes Restaurant, Contact, Fonction,
  Téléphone, E-mail, Ville, Secteur, Source, Campagne, Statut, Notes ; séparateur tabulation, `;` ou `,`),
  soit `lignes` : `[{ entreprise, contact, fonction, telephone, email, adresse, ville, code_postal, siren, siret, secteur, statut, campagne, notes }]` (500 au plus).
- **Source toujours « prospection »** : aucun e-mail ni SMS automatique ne part vers ces fiches (`MANUAL_ONLY_SOURCES`).
  Le corps ne peut porter ni source ni organisation (champ inconnu = 400).
- **Idempotent** : une ligne dont le SIREN (champ `siren`, début du `siret`, ou « SIREN 123456789 » dans les notes)
  ou le téléphone (format +33…) est déjà connu n'est pas recréée ; doublons internes au lot écartés aussi.
  Le SIREN est ajouté aux notes pour que les imports suivants le reconnaissent.
- Leads : numéro `L-0001` attribué par la base (comme l'import par collage), responsable = « à qui attribuer
  les nouveaux leads » des Réglages, journal « Importé par l'API Leads ».
- Prospects : statut « À appeler », contact (nom, fonction) et SIREN dans les notes, `contact_source` = `api`.
- `simulation: true` : rien n'est écrit, la réponse donne ce qui serait créé.

Réponse (201 si des fiches sont créées) :
`{ ok, cible, simulation, lignes, crees, doublons: [{ ligne, entreprise, raison: "siren"|"telephone", existant }], erreurs: [{ ligne, erreur }], fiches: [{ ligne, id, ref }], liste }`.
En cas d'erreur en cours de route (500), relancer le même import : les fiches déjà créées sont reconnues.

## `POST /api/leads/lemlist-webhook`

Webhook lemlist (secret `LEMLIST_WEBHOOK_SECRET`), décrit dans `lemlist-prospection.md`.

## Vérification

```sh
TOKEN=$(cat ~/.secrets/erp-leads-api.txt)
curl -s -H "Authorization: Bearer $TOKEN" "https://pef-erp.vercel.app/api/leads?depuis=2026-11-01&limite=5"
```
