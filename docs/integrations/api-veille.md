# API de veille Qualiopi — collecteur Manus → ERP PEF

L'ERP ParlerEmploi Formation est la source de vérité du registre de veille (Qualiopi critère 6,
indicateurs 23 à 26). Le collecteur (Manus) collecte, analyse, déduplique et rédige les fiches,
puis les dépose chaque semaine par cette API. L'ERP les stocke avec le statut « à valider »,
journalise chaque exécution et conserve les notes mensuelles. Aucune logique d'IA ni clé LLM
côté ERP.

- **URL de base (non secrète)** : `https://pef-erp.vercel.app`
- **Authentification** : `Authorization: Bearer <PEF_VEILLE_API_TOKEN>` sur toutes les routes
  sauf `GET /api/veille/health` (qui répond aussi sans jeton, sans aucune donnée).
- **Format** : JSON en entrée et en sortie (`Content-Type: application/json`), UTF-8, dates
  `AAAA-MM-JJ`, horodatages ISO 8601. Les noms de champs sont ceux du cahier des charges.
- **Version** : `1.0` (renvoyée par `/health`).

## Variables d'environnement (noms uniquement)

| Où | Variable | Rôle |
|---|---|---|
| ERP (Vercel) et connecteur Manus | `PEF_VEILLE_API_URL` | URL de base HTTPS, non secrète |
| ERP (Vercel) et connecteur Manus | `PEF_VEILLE_API_TOKEN` | jeton de service, portée limitée à `/api/veille/*` d'une seule organisation. Jamais journalisé, jamais stocké en base, jamais renvoyé |
| ERP (Vercel) | `PEF_VEILLE_NOTIFY_TO` | destinataire(s) du résumé hebdomadaire (virgules acceptées) |
| ERP (Vercel), facultatif | `PEF_VEILLE_ORG_SLUG` | organisation visée par le jeton (défaut `pef`) |

Le jeton se renseigne **uniquement** dans le connecteur sécurisé Manus. Rotation : changer la
valeur sur Vercel (`vercel env add PEF_VEILLE_API_TOKEN production`), redéployer, mettre à jour
le connecteur.

## Sécurité et données

- Jeton comparé sur empreintes SHA-256 à temps constant ; réponses `401` sans détail.
- Le jeton n'ouvre que les cinq routes ci-dessous, pour une seule organisation, via le rôle
  service côté serveur. Il ne permet ni lecture des apprenants, ni écriture ailleurs.
- Aucune donnée personnelle attendue ni stockée : sources publiques, résumés, compteurs. Les
  journaux serveur ne contiennent ni jeton ni corps de requête.
- Réponses toujours `Cache-Control: no-store`.

## Valeurs autorisées

| Champ | Valeurs |
|---|---|
| `indicateur` | `23`, `24`, `25`, `26` (entier, ou chaîne numérique) |
| `categorie` | `legale` (ind. 23), `metiers` (ind. 24), `pedagogique` (ind. 25), `handicap` (ind. 26). Casse et accents tolérés (« Légale » → `legale`) |
| `statut` (fiche) | uniquement `à valider` (ou `a_valider`) : le statut initial. La validation se fait dans l'ERP |
| `alerte` | booléen `true` / `false` |
| `dedupe_key` | 8 à 200 caractères : lettres, chiffres, `. _ : / # = -` ; unique par organisation |
| `run_id` | 3 à 120 caractères : lettres, chiffres, `. _ : -` (ex. `veille-2026-W39`) |
| `statut` (exécution) | `en_cours`, `succes`, `partiel`, `echec` (« Succès » accepté) |
| `url` | http(s), 2000 caractères maximum |

Longueurs : `titre` ≤ 300, `source` ≤ 200, `resume` ≤ 4000, `impact_parleremploi` et
`exploitation_proposee` ≤ 4000 (présents, éventuellement vides), `message` d'exécution ≤ 2000,
`contenu` de note ≤ 20 000. Lot : 1 à 200 fiches.

Cohérence : `date_publication` ≤ `date_collecte` ≤ aujourd'hui (+1 jour de tolérance).

## Routes

### `GET /api/veille/health`

Sans jeton : état du service seulement. Avec jeton : vérifie aussi le jeton et la base.

```json
{ "ok": true, "service": "pef-erp-veille", "version": "1.0", "horodatage": "2026-09-22T06:00:00.000Z",
  "base_url": "https://pef-erp.vercel.app", "auth": "ok", "base_de_donnees": "ok" }
```

`auth` ∈ `absent` | `ok` | `invalide` | `non_configuree`. Toujours `200`.

### `GET /api/veille/entries?from=AAAA-MM-JJ&fields=dedupe_key,titre,url&limit=500&offset=0`

Entrées du registre depuis `from` (défaut : 90 jours), du plus récent au plus ancien. Sert à la
déduplication côté collecteur. `fields` (défaut `dedupe_key,titre,url`) parmi : `id`,
`dedupe_key`, `titre`, `url`, `source`, `date_publication`, `date_collecte`, `indicateur`,
`categorie`, `statut`, `alerte`, `run_id`, `origine` (`manuel` | `collecteur`), `created_at`.
`limit` 1–1000, `offset` ≥ 0. Champ inconnu → `400`.

```json
{ "ok": true, "from": "2026-07-01", "champs": ["dedupe_key", "titre", "url"], "nombre": 2, "limite": 500, "decalage": 0,
  "entries": [ { "dedupe_key": "legifrance:JORFTEXT000…", "titre": "…", "url": "https://…" },
               { "dedupe_key": null, "titre": null, "url": "https://…" } ] }
```

Les saisies manuelles de l'équipe ont `dedupe_key` `null` (dédupliquer alors sur `url`).

### `POST /api/veille/entries/batch`

Dépôt d'un lot. **Tout ou rien** : chaque fiche est validée avant la moindre écriture ; une
seule invalide → `422` et rien n'est écrit. L'insertion est transactionnelle (fonction SQL).

Requête :

```json
{
  "run_id": "veille-2026-W39",
  "fiches": [
    {
      "date_publication": "2026-09-15",
      "date_collecte": "2026-09-21",
      "indicateur": 23,
      "categorie": "legale",
      "titre": "Arrêté du … relatif au référentiel national qualité",
      "source": "Légifrance",
      "url": "https://www.legifrance.gouv.fr/…",
      "resume": "Ce qui change, en deux ou trois phrases.",
      "impact_parleremploi": "Ce que cela implique pour l'organisme.",
      "exploitation_proposee": "Action proposée à l'équipe.",
      "alerte": false,
      "statut": "à valider",
      "dedupe_key": "legifrance:JORFTEXT000000000000"
    }
  ]
}
```

(`entries` est accepté comme alias de `fiches` ; `run_id` peut être répété dans chaque fiche,
il doit alors être identique à celui du lot.)

Réponse `200` :

```json
{ "ok": true, "run_id": "veille-2026-W39", "recues": 8,
  "creees": [ { "dedupe_key": "…", "id": "uuid" } ],
  "ignorees": [ { "dedupe_key": "…", "motif": "doublon" } ],
  "rejetees": [], "rejeu": false }
```

- `creees` : fiches insérées avec le statut « à valider », origine « collecteur ».
- `ignorees` : `dedupe_key` déjà connue (jamais modifiée). Rejouer le même lot ou le même
  `run_id` ne crée aucun doublon ; `rejeu` vaut `true` si un lot avait déjà été reçu pour ce
  `run_id`.
- `rejetees` : toujours vide en `200`.

Réponse `422` (aucune écriture) :

```json
{ "ok": false, "erreur": "Lot refusé : 1 fiche invalide sur 8, aucune écriture effectuée",
  "run_id": "veille-2026-W39", "recues": 8, "creees": [], "ignorees": [],
  "rejetees": [ { "index": 3, "dedupe_key": "…", "erreurs": [ { "champ": "indicateur", "message": "indicateur autorisé : 23, 24, 25 ou 26" } ] } ] }
```

Motifs de rejet : champ manquant ou hors valeurs autorisées, dates incohérentes, `dedupe_key`
en double dans le lot, `run_id` de fiche différent du lot. Autres codes : `400` (JSON ou
enveloppe invalide), `413` (plus de 200 fiches), `401`, `500` (rien n'est écrit).

Chaque lot met à jour le journal de l'exécution `run_id` (compteurs `recues`, `creees`
cumulées, `ignorees`, `rejeux`).

### `POST /api/veille/monthly-notes`

Une note par mois et par organisation ; renvoyer le même mois met la note à jour (idempotent).

```json
{ "mois": "2026-09", "titre": "Veille Qualiopi — septembre 2026", "contenu": "Synthèse en Markdown ou texte…",
  "run_id": "veille-2026-W39", "nb_fiches": 8 }
```

(`month`, `title`, `content`, `entries_count` acceptés comme alias.) Réponse `201` (création) ou
`200` (mise à jour) : `{ "ok": true, "action": "creee" | "mise_a_jour", "note": { "id", "mois", "titre", "contenu", "run_id", "nb_fiches", "created_at", "updated_at" } }`.
`GET /api/veille/monthly-notes?mois=2026-09` renvoie `{ "ok": true, "nombre": 1, "notes": [ … ] }`
(sans `mois` : les 24 dernières).

### `POST /api/veille/runs`

Journal d'une exécution, créé ou mis à jour par `run_id` (idempotent). Appel recommandé en fin
de passage, après le lot et la note.

```json
{ "run_id": "veille-2026-W39", "statut": "succes",
  "debut": "2026-09-21T05:00:00Z", "fin": "2026-09-21T05:14:00Z",
  "message": "14 sources consultées, 8 fiches retenues.",
  "stats": { "sources_consultees": 14, "fiches_analysees": 31 },
  "csv_secours": { "url": "https://…/veille-2026-W39.csv", "nom": "veille-2026-W39.csv" },
  "notifier": true }
```

(`status`, `started_at`, `finished_at`, `csv_fallback`, `notify` acceptés comme alias ; `stats`
n'accepte que des nombres, 30 clés maximum ; `csv_secours` peut être `null`.)

Réponse `201` ou `200` : `{ "ok": true, "action": "creee" | "mise_a_jour", "notification": "envoyee" | "non_envoyee" | "non_configuree" | "desactivee" | "deja_envoyee" | "sans_objet", "run": { "run_id", "statut", "recues", "creees", "ignorees", "rejetees", "rejeux", "debut", "fin", "dernier_lot", "csv_secours", "message", "stats", "notifie_le", … } }`.

`GET /api/veille/runs?limit=20` ou `?run_id=…` renvoie `{ "ok": true, "nombre", "runs": [ … ] }`.

## Résumé hebdomadaire par email

Mécanisme existant côté ERP, aucune route supplémentaire : quand `POST /api/veille/runs`
reçoit un statut final (`succes`, `partiel`, `echec`), l'ERP envoie un résumé à
`PEF_VEILLE_NOTIFY_TO` via sa messagerie (SMTP de l'organisme) : compteurs du run, alertes du
run (titre + lien), CSV de secours, lien vers le module Veille. Une seule fois par `run_id`
(`deja_envoyee` ensuite), sauf `"notifier": true` explicite ; `"notifier": false` désactive.
Sans `PEF_VEILLE_NOTIFY_TO` ou sans SMTP configuré : `non_configuree`, l'exécution est quand
même enregistrée.

## Ce que voit l'équipe dans l'ERP

Page **Qualité** → « Registre de veille » : les fiches du collecteur apparaissent avec le badge
« À valider », le filtre « À valider (n) », l'indicateur, la catégorie, l'alerte éventuelle et
l'origine « Collecteur ». L'équipe ouvre la fiche, lit résumé / impact / exploitation, passe le
statut en « Validée » ou « Écartée » et coche « Diffusée à l'équipe » quand l'information a été
partagée (preuve d'exploitation). Deux cartes suivent : « Exécutions du collecteur de veille »
(journal) et « Notes mensuelles de veille ».

## Séquence hebdomadaire recommandée

1. `GET /health` (jeton) → `auth: ok`.
2. `GET /entries?from=<J-120>&fields=dedupe_key,url` → déduplication locale.
3. `POST /entries/batch` avec `run_id` de la semaine.
4. Le dernier passage du mois : `POST /monthly-notes`.
5. `POST /runs` avec le statut final, le message, les stats, le CSV de secours éventuel.

En cas d'échec réseau au milieu : rejouer les mêmes appels avec le même `run_id` est sans
risque (aucun doublon, `rejeu: true`).

## Vérification

`node scripts/verif-veille-api.mjs [url]` (jeton via `PEF_VEILLE_API_TOKEN` ou `.env.local`)
rejoue les vérifications attendues : santé sans données, lot de 8 fiches accepté, rejeu sans
doublon, fiche connue ignorée, fiche invalide rejetée sans écriture partielle, note mensuelle
créée puis mise à jour et consultée, exécution journalisée avec CSV de secours. Le lot de
référence est `docs/integrations/veille-lot-test-8.json`. Les données de test sont préfixées
`test-` / `test:` (et mois `2000-01`) pour être purgées.

Exemples `curl` :

```bash
curl -s https://pef-erp.vercel.app/api/veille/health
curl -s -H "Authorization: Bearer $PEF_VEILLE_API_TOKEN" "https://pef-erp.vercel.app/api/veille/entries?from=2026-06-01"
curl -s -H "Authorization: Bearer $PEF_VEILLE_API_TOKEN" -H "Content-Type: application/json" \
  -d @docs/integrations/veille-lot-test-8.json https://pef-erp.vercel.app/api/veille/entries/batch
```
