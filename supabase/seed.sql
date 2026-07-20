-- Seed ParlerEmploi Formation.
-- ⚠️ PLACEHOLDER = valeur réaliste à confirmer par Anis (coûts horaires, plafonds, capacités, volumes).
-- Tout est modifiable ensuite dans Paramètres.

-- ── Organisation ──────────────────────────────────────────────────────────────
insert into public.organizations (id, name, slug, timezone, school_holiday_zone)
values ('a0000000-0000-4000-8000-000000000001', 'ParlerEmploi Formation', 'pef', 'Europe/Paris', 'C');

-- ── Financeurs (couleurs du planning) ─────────────────────────────────────────
insert into public.funders (id, org_id, name, code, color) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'ParlerEmploi Formation', 'PEF',   '#3b82f6'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Ville',                 'VILLE', '#22c55e'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'CPF',                   'CPF',   '#f97316'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'France Travail',        'FT',    '#8b5cf6');

-- ── Salles ────────────────────────────────────────────────────────────────────
insert into public.rooms (id, org_id, name, capacity) values
  ('c0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001', 'Salle 12', 12),  -- capacité PLACEHOLDER
  ('c0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', 'Salle 13', 15);  -- capacité PLACEHOLDER

-- ── Formateurs ────────────────────────────────────────────────────────────────
-- Priorité : 1 = Marie, 2 = Riim, 100 = vacataires. Le moteur trie salarié → coût → priorité.
insert into public.trainers (id, org_id, first_name, last_name, contract_type, hourly_cost, weekly_hours_max, priority, skills, languages, color) values
  -- Marie : salariée, plafond 24 h/sem (cf. alerte « Marie dépasse 24 h »). Coût chargé PLACEHOLDER.
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Marie', 'PLACEHOLDER-NOM', 'salarie', 26.00, 24, 1,
   array['FLE', 'alphabétisation', 'préparation examen'], array['fr', 'en'], '#0ea5e9'),
  -- Riim : salariée, plafond 9 h/sem (cf. « Riim 9/9 h »). Coût chargé PLACEHOLDER.
  ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Riim', 'PLACEHOLDER-NOM', 'salarie', 28.00, 9, 2,
   array['FLE'], array['fr', 'ar'], '#14b8a6'),
  -- Pool vacataire générique : dernier recours, coût PLACEHOLDER.
  ('d0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Vacataire', 'FLE', 'vacataire', 40.00, 20, 100,
   array['FLE'], array['fr'], '#a855f7');

-- Disponibilités récurrentes (heures locales Europe/Paris) — PLACEHOLDER à affiner
-- Marie : lundi → vendredi, 9h-12h30 et 13h30-17h
insert into public.trainer_availabilities (org_id, trainer_id, weekday, start_time, end_time)
select 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', d, t.s, t.e
from generate_series(1, 5) d,
     (values (time '09:00', time '12:30'), (time '13:30', time '17:00')) t(s, e);
-- Riim : mardi et jeudi 9h-12h, vendredi 9h-12h
insert into public.trainer_availabilities (org_id, trainer_id, weekday, start_time, end_time) values
  ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 2, '09:00', '12:00'),
  ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 4, '09:00', '12:00'),
  ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 5, '09:00', '12:00');
-- Vacataire : lundi → samedi, 9h-18h
insert into public.trainer_availabilities (org_id, trainer_id, weekday, start_time, end_time)
select 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', d, '09:00', '18:00'
from generate_series(1, 6) d;

-- ── Dispositifs (volumes PLACEHOLDER sauf prépa examen = 3 × 7 h du cahier des charges) ──
insert into public.programs (id, org_id, code, name, total_hours, default_weeks, default_funder_id, level, modality, default_weekly_hours, required_skills) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'PEF_A1',     'PEF A1',                 300, 20, 'b0000000-0000-4000-8000-000000000001', 'A1', 'presentiel', 15, array['FLE']),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'PEF_A2',     'PEF A2',                 300, 20, 'b0000000-0000-4000-8000-000000000001', 'A2', 'presentiel', 15, array['FLE']),
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'PREPA_EXAM', 'Préparation examen',      21,  3, 'b0000000-0000-4000-8000-000000000001', null, 'presentiel',  7, array['préparation examen']),
  ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'FLESTO',     'FLESTO (FLE à visée professionnelle)', 120, 10, 'b0000000-0000-4000-8000-000000000004', 'A2', 'presentiel', 12, array['FLE']),
  ('e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'RAN',        'Remise à niveau (RAN)',   70,  7, 'b0000000-0000-4000-8000-000000000002', null, 'presentiel', 10, array['FLE']);

-- ── Calendrier français : jours fériés 2025-2028 (globaux, org_id NULL) ───────
insert into public.calendar_closures (kind, label, starts_on, ends_on)
select 'jour_ferie', l, d, d from (values
  ('Jour de l''an',            date '2025-01-01'), ('Lundi de Pâques',   date '2025-04-21'),
  ('Fête du Travail',          date '2025-05-01'), ('Victoire 1945',     date '2025-05-08'),
  ('Ascension',                date '2025-05-29'), ('Lundi de Pentecôte', date '2025-06-09'),
  ('Fête nationale',           date '2025-07-14'), ('Assomption',        date '2025-08-15'),
  ('Toussaint',                date '2025-11-01'), ('Armistice 1918',    date '2025-11-11'),
  ('Noël',                     date '2025-12-25'),
  ('Jour de l''an',            date '2026-01-01'), ('Lundi de Pâques',   date '2026-04-06'),
  ('Fête du Travail',          date '2026-05-01'), ('Victoire 1945',     date '2026-05-08'),
  ('Ascension',                date '2026-05-14'), ('Lundi de Pentecôte', date '2026-05-25'),
  ('Fête nationale',           date '2026-07-14'), ('Assomption',        date '2026-08-15'),
  ('Toussaint',                date '2026-11-01'), ('Armistice 1918',    date '2026-11-11'),
  ('Noël',                     date '2026-12-25'),
  ('Jour de l''an',            date '2027-01-01'), ('Lundi de Pâques',   date '2027-03-29'),
  ('Fête du Travail',          date '2027-05-01'), ('Ascension',         date '2027-05-06'),
  ('Victoire 1945',            date '2027-05-08'), ('Lundi de Pentecôte', date '2027-05-17'),
  ('Fête nationale',           date '2027-07-14'), ('Assomption',        date '2027-08-15'),
  ('Toussaint',                date '2027-11-01'), ('Armistice 1918',    date '2027-11-11'),
  ('Noël',                     date '2027-12-25'),
  ('Jour de l''an',            date '2028-01-01'), ('Lundi de Pâques',   date '2028-04-17'),
  ('Fête du Travail',          date '2028-05-01'), ('Victoire 1945',     date '2028-05-08'),
  ('Ascension',                date '2028-05-25'), ('Lundi de Pentecôte', date '2028-06-05'),
  ('Fête nationale',           date '2028-07-14'), ('Assomption',        date '2028-08-15'),
  ('Toussaint',                date '2028-11-01'), ('Armistice 1918',    date '2028-11-11'),
  ('Noël',                     date '2028-12-25')
) f(l, d);

-- ── Vacances scolaires zone C (Paris/Créteil/Versailles) ──────────────────────
-- Années 2024-2025 et 2025-2026 : calendrier officiel education.gouv.fr.
-- ⚠️ 2026-2027 et suivantes : PRÉVISIONNEL — à vérifier à la publication officielle.
insert into public.calendar_closures (kind, zone, label, starts_on, ends_on)
values
  ('vacances_scolaires', 'C', 'Hiver 2025',                 '2025-02-15', '2025-03-02'),
  ('vacances_scolaires', 'C', 'Printemps 2025',             '2025-04-12', '2025-04-27'),
  ('vacances_scolaires', 'C', 'Été 2025',                   '2025-07-05', '2025-08-31'),
  ('vacances_scolaires', 'C', 'Toussaint 2025',             '2025-10-18', '2025-11-02'),
  ('vacances_scolaires', 'C', 'Noël 2025',                  '2025-12-20', '2026-01-04'),
  ('vacances_scolaires', 'C', 'Hiver 2026',                 '2026-02-14', '2026-03-01'),
  ('vacances_scolaires', 'C', 'Printemps 2026',             '2026-04-04', '2026-04-19'),
  ('vacances_scolaires', 'C', 'Été 2026',                   '2026-07-04', '2026-08-31'),
  ('vacances_scolaires', 'C', 'Toussaint 2026 (prévisionnel)', '2026-10-17', '2026-11-01'),
  ('vacances_scolaires', 'C', 'Noël 2026 (prévisionnel)',      '2026-12-19', '2027-01-03'),
  ('vacances_scolaires', 'C', 'Hiver 2027 (prévisionnel)',     '2027-02-20', '2027-03-07'),
  ('vacances_scolaires', 'C', 'Printemps 2027 (prévisionnel)', '2027-04-17', '2027-05-02'),
  ('vacances_scolaires', 'C', 'Été 2027 (prévisionnel)',       '2027-07-03', '2027-08-31');
