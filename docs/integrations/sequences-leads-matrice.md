# Séquences automatiques du tunnel POEI Restauration — matrice événements / statuts

Livré le 29/09/2026 (branche `claude/sequences-leads-poei`). L'ERP est la seule horloge :
les séquences sont pilotées par les statuts et les échéances de la fiche, jamais par Brevo
ni par Twilio. Rien n'est programmé à l'avance chez les fournisseurs (à l'exception des
rappels J-1 / H-2 des créneaux, que Brevo programme lui-même à 72 h au plus).

Code : `src/lib/leads/sequences.ts` (définitions pures), `src/lib/leads/sequence-engine.ts`
(démarrage, arrêt, exécution), `src/app/api/cron/leads-sms/route.ts` (horloge, toutes les
15 minutes), `src/app/api/leads/brevo-webhook/route.ts` (retours Brevo).

## 1. Les quatre séquences

Toutes les étapes partent à **10 h, heure de Paris**. Une étape qui tombe un samedi ou un
dimanche est décalée au lundi. Une étape en retard part au prochain créneau d'envoi (le
lendemain 10 h, jour ouvré) : **jamais deux étapes le même jour** sur une même fiche.

| Séquence | Déclencheur (T0) | Étapes | Tâche de fin (la décision reste humaine) |
|---|---|---|---|
| **Injoignable** | Appel noté « Messagerie » ou « Barrage » sur un lead Nouveau, À rappeler ou Contacté | J+1 tâche « rappeler à un autre créneau » · J+3 e-mail n°3 (`relance_j3`) · J+6 tâche d'appel + SMS « dernière tentative » · J+10 e-mail n°4 (`rupture_j10`) | J+12 : « classer Perdu — injoignable » |
| **Rendez-vous manqué** | Bouton « No-show » (le message du jour même part déjà à ce moment-là) | J+1 e-mail n°7 (`no_show_j1`) · J+3 e-mail n°8 (`no_show_j3`) | J+5 : « mettre en veille ou classer perdu » |
| **Proposition envoyée** | Statut « Proposition envoyée » | J+2 **ouvré** e-mail n°11 (`post_rdv_j2`) · J+7 e-mail n°12 (`post_rdv_j7`) | J+9 : « appeler la direction, mettre en veille ou classer » |
| **En veille (nurturing)** | Statut « En veille (nurturing) » (nouveau statut) | J+30 e-mail n°13 (`nurturing_j30`) · J+60 e-mail n°14 (`nurturing_j60`) · J+90 e-mail n°15 (`nurturing_j90`) | J+92 : « réactiver par un appel ou classer perdu » |

Le SMS J0 « après appel manqué » et le SMS « dernière tentative » au 4e appel sur messagerie
(logique existante depuis le 18/09) restent en place : la marque de journal par modèle
garantit qu'un SMS déjà parti à la main ou au 4e appel n'est pas renvoyé à J+6.

## 2. Événements → effet sur la séquence

| Événement | Origine | Effet |
|---|---|---|
| Appel noté « Messagerie » ou « Barrage » | Fiche → Noter | Démarre **Injoignable** si aucune séquence ne tourne (sinon rien) |
| Appel noté « Joint » ou « Rappel convenu » | Fiche → Noter | **Arrêt** — le prospect a répondu |
| Résultat « RDV posé » / « Poser le RDV » | Fiche | **Arrêt** — créneau réservé |
| Résultat « RDV tenu » / bouton « RDV tenu » | Fiche | **Arrêt** — rendez-vous tenu |
| Résultat « Refus » | Fiche → Noter | **Arrêt** — besoin clos |
| Bouton « No-show » | Fiche | Démarre **Rendez-vous manqué** (remplace la séquence en cours) |
| Bouton « Reporté » | Fiche | **Arrêt** — le prospect a répondu (on repose deux créneaux à la main) |
| Statut → Contacté ou Qualifié | Fiche | **Arrêt** — le prospect a répondu |
| Statut → RDV pris | Fiche ou Calendly direction | **Arrêt** — créneau réservé |
| Statut → RDV tenu | Fiche | **Arrêt** — rendez-vous tenu |
| Statut → Proposition envoyée | Fiche | Démarre **Proposition** |
| Statut → En veille (nurturing) | Fiche | Démarre **Nurturing** |
| Statut → Gagné, Perdu, Hors cible | Fiche | **Arrêt** — besoin clos |
| Créneau Calendly réservé (qualification ou direction) | Webhook `/api/leads/inbound` | **Arrêt** — créneau réservé |
| Créneau Calendly annulé | Webhook `/api/leads/inbound` | Rappels J-1 / H-2 annulés, tâche « rappeler » (inchangé) ; pas de séquence démarrée |
| Retour Brevo `delivered` | Webhook `/api/leads/brevo-webhook` | Fiche : « e-mail délivré » ; journal ; rien d'autre |
| Retour Brevo `soft_bounce` | Webhook Brevo | Fiche : « bounce doux » ; journal ; la séquence continue |
| Retour Brevo `hard_bounce`, `blocked`, `invalid_email` | Webhook Brevo | Fiche : « adresse invalide » ; **arrêt** — bounce dur ; plus aucun e-mail automatique ; rappels J-1 / H-2 annulés |
| Retour Brevo `unsubscribed` | Webhook Brevo | **Arrêt** — désinscription ; opposition enregistrée (tous canaux) ; rappels annulés |
| Retour Brevo `spam` (plainte) | Webhook Brevo | **Arrêt** — opposition ; opposition enregistrée ; rappels annulés |
| Twilio refuse le numéro (21211, 21214, 21217, 21408, 21612, 21614) | Envoi SMS | Fiche : « numéro invalide » ; **arrêt** — numéro invalide ; plus aucun SMS automatique |
| Twilio 21610 (le destinataire a répondu STOP) | Envoi SMS | Opposition enregistrée ; **arrêt** — opposition |
| Bouton « Arrêter la séquence » | Fiche | **Arrêt** — arrêtée par l'équipe (une nouvelle séquence peut redémarrer plus tard) |
| Bouton « Opposition du prospect » | Fiche | **Arrêt** — opposition ; plus aucun message automatique, aucun canal ; rappels annulés |
| Bouton « Lever l'opposition » (direction) | Fiche | Retire l'opposition et le blocage du numéro ; les retours Brevo restent |
| Dernière étape partie | Cron | **Arrêt** — séquence terminée ; la tâche de fin est posée sur la fiche |

## 3. Statuts × séquences (revérification avant chaque étape)

Avant d'exécuter une étape, le cron revérifie que la séquence a encore un sens sur la fiche
telle qu'elle est **maintenant** (et non telle qu'elle était au démarrage).

| Statut de la fiche | Injoignable | Rendez-vous manqué | Proposition | Nurturing |
|---|---|---|---|---|
| Nouveau, À rappeler, Contacté | continue | continue (sauf `rdv_outcome = a_venir` → arrêt réservation) | arrêt — réponse | arrêt — réponse |
| Qualifié | arrêt — réponse | continue | arrêt — réponse | arrêt — réponse |
| RDV pris | arrêt — réservation | arrêt — réservation | arrêt — réservation | arrêt — réservation |
| RDV tenu | arrêt — RDV tenu | arrêt — RDV tenu | arrêt — réponse | arrêt — réponse |
| Proposition envoyée | arrêt — réponse | arrêt — réponse | continue | arrêt — réponse |
| En veille (nurturing) | arrêt — réponse | arrêt — réponse | arrêt — réponse | continue |
| Gagné, Perdu, Hors cible | arrêt — besoin clos | idem | idem | idem |

Quel que soit le statut : `opt_out_at` renseigné → arrêt opposition ; `email_status` =
`hard_bounce` → arrêt bounce dur ; `unsubscribed` → arrêt désinscription ; `complaint` →
arrêt opposition.

## 4. Motifs d'arrêt (`employer_leads.sequence_stop_reason`)

| Code | Libellé affiché | Bloque tout message automatique ? |
|---|---|---|
| `reponse` | Le prospect a répondu | non |
| `reservation` | Un créneau a été réservé | non |
| `rdv_tenu` | Le rendez-vous a eu lieu | non |
| `besoin_clos` | Besoin clos (gagné, perdu ou hors cible) | non |
| `opposition` | Opposition du prospect | **oui** (`opt_out_at`), rappels annulés |
| `desinscription` | Désinscription par le lien Brevo | **oui** (`opt_out_at`), rappels annulés |
| `bounce_dur` | Adresse e-mail invalide (bounce dur) | e-mails seulement (`email_status`), rappels annulés |
| `numero_invalide` | Numéro de téléphone invalide | SMS seulement (`phone_status`) |
| `terminee` | Séquence terminée | non |
| `remplacee` | Remplacée par une autre séquence | non |
| `manuel` | Arrêtée par l'équipe | non |

## 5. Ce qui est écrit sur la fiche

| Colonne | Sens |
|---|---|
| `sequence_kind` | la séquence (injoignable, no_show, proposition, nurturing) |
| `sequence_step` | dernière étape exécutée (null = aucune encore) |
| `sequence_started_at` | T0 |
| `sequence_next_at` | prochaine échéance ; **null = arrêtée ou terminée** ; sert de verrou au cron |
| `sequence_last_sent_at` | dernier message automatique parti |
| `sequence_stopped_at`, `sequence_stop_reason` | l'arrêt et son motif |
| `email_status`, `email_status_at` | dernier retour Brevo (delivered, soft_bounce, hard_bounce, unsubscribed, complaint) — ne redescend jamais en gravité |
| `phone_status` | `invalide` quand Twilio a refusé le numéro |
| `opt_out_at` | opposition (bouton, STOP, désinscription, plainte) |
| `next_action`, `next_action_on` | la prochaine étape, en clair, telle que le setter la voit |

Le journal (`employer_lead_events`, kind `note`) garde une ligne par démarrage
(`[seq:debut:…]`), par étape (`[seq:etape:…:…]`), par arrêt (`[seq:fin:…]`), par retour Brevo
(`[brevo-retour:…]`) et par refus Twilio (`[twilio-retour:…]`). L'écran masque la marque.
La table `employer_lead_email_events` garde tous les retours Brevo bruts.

## 6. Garanties

- **Idempotence des envois** : chaque e-mail et chaque SMS laisse une marque `[brevo:…]` /
  `[twilio:…]` par fiche et par message ; un rejeu ne renvoie rien.
- **Concurrence du cron** (Vercel toutes les 15 min + action GitHub toutes les 2 h) : une
  étape n'est exécutée qu'après une mise à jour conditionnelle `where sequence_next_at =
  <ancienne échéance>` ; un seul passage l'obtient, l'autre ne fait rien.
- **Interrupteur** `Leads → Réglages → Envois automatiques` à « off » : les étapes attendent
  (rien ne part, rien n'est perdu) ; à la réactivation, elles partent une par jour au plus.
- **Échec fournisseur** (Brevo/Twilio non configuré ou en panne) : l'étape est consommée,
  le journal le dit, et la fiche demande au conseiller de faire l'envoi à la main
  (« À faire à la main (échec de l'envoi automatique) : … »). La marque manquante permet
  toujours un envoi ultérieur.
- **Rappels J-1 / H-2 au-delà de 72 h** : `scheduleUpcomingAppointmentReminders`, appelé par
  le cron, programme chez Brevo les rappels des créneaux qui entrent dans la fenêtre
  (J-1 dès H-96, H-2 dès H-74). Les colonnes `*_batch_id` déjà remplies sont ignorées.
- **Rien n'est clos automatiquement** : au bout d'une séquence, la fiche propose la
  décision (perdu, veille, appel de la direction) ; l'équipe la prend.

## 7. Exploitation

- Cron : `GET /api/cron/leads-sms` (`Authorization: Bearer CRON_SECRET`), toutes les 15 min
  sur Vercel, doublé par `.github/workflows/leads-sms.yml`. Réponse : `invitations`,
  `rappelsRdv`, `reprises`, `sequences {executed, stopped, skipped, failed}`, `rappelsBrevo`.
- Webhook Brevo : `POST /api/leads/brevo-webhook?token=<jeton des réglages Leads>`
  (voir `docs/integrations/brevo-webhook.md`).
- Variables — noms uniquement : `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`,
  `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `CRON_SECRET`.
- Migration : `supabase/migrations/20260929000037_sequences_leads.sql` (additive : statut
  `nurturing`, colonnes `sequence_*`, `email_status*`, `phone_status`, `opt_out_at`, table
  `employer_lead_email_events`).
- Recette accélérée sans prospect réel : `npx tsx scripts/recette-sequences.mts` (fournisseurs
  simulés, horloge avancée jour par jour).
