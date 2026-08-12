# ERP ParlerEmploi Formation

Application de pilotage d'organisme de formation FLE : planification intelligente des groupes (formateur + salle + créneaux au coût minimal), planning drag & drop, gestion RH des formateurs, émargement numérique, suivi Qualiopi.

**Production** : https://pef-erp.vercel.app

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack) — `proxy.ts` remplace `middleware.ts`
- **Supabase** : Postgres (RLS multi-tenant, contraintes d'exclusion anti-conflit), Auth (hook JWT `custom_access_token_hook` injectant `org_id` + `app_role`), Storage
- **UI** : Tailwind + shadcn/ui, FullCalendar 6 (planning), Recharts (graphiques), TanStack React Query
- **Emails** : SMTP Hostinger (`contact@parleremploi.com`) pour les invitations/resets Supabase ; Resend pour les alertes du cron

## Architecture

- `src/lib/engine/` — moteur d'affectation **pur** (testable sans base) : génération des séances en heure locale Europe/Paris (fériés + vacances zone C sautés, DST géré), filtres durs (dispos, absences, plafonds hebdo, conflits), scoring salarié → coût horaire → priorité manuelle.
- `supabase/migrations/` — schéma complet. Les conflits de planning sont tranchés par Postgres (`EXCLUDE USING gist` sur les séances) : l'UI affiche, la base garantit.
- Séances **matérialisées** (pas de RRULE) : une exception = un simple UPDATE.
- Mutations = Server Actions (`actions.ts` par module), chaque écriture commence par `requireRole()`.
- Multi-tenant dès l'origine : `organizations` + `org_id` + RLS par memberships.

## Développement

```bash
npm install
cp .env.local.example .env.local   # compléter avec les clés du projet Supabase
npm run dev
npm test                            # tests du moteur (Vitest, sans base)
```

## Déploiement

Auto-déploiement Vercel sur push `main`. En secours (si les builds distants restent en file d'attente) :

```bash
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod --yes
```

⚠️ Les variables `NEXT_PUBLIC_*` doivent être **non-sensitives** sur Vercel (sinon le build ne peut pas les lire et le proxy renvoie 500).

## Scripts d'administration (`scripts/`)

| Script | Usage |
|---|---|
| `run-sql.mjs` | `PGURL=... node scripts/run-sql.mjs fichier.sql` — exécuter du SQL sur la base distante |
| `list-users.mjs` | Lister les comptes auth (création, confirmation, dernière connexion) |
| `set-password.mjs` | `node scripts/set-password.mjs email 'mdp'` — poser un mot de passe sans email |
| `create-admin.mjs` | Créer le compte admin initial + membership |
| `test-login.mjs` | Vérifier une connexion et les claims JWT (`org_id`, `app_role`) |
| `test-smtp.mjs` | Envoyer un email de test via le SMTP configuré dans Supabase |

## Feuille de route

- **V1** ✅ planning intelligent, groupes, formateurs, salles, dashboard
- **V2** finance (coûts, marges, CA par groupe)
- **V3** apprenants (inscriptions, présences, évaluations) — partiellement livré (émargement, groupes d'apprenants)
- **V4** signature électronique, synchronisation Google Calendar, conventions automatiques
