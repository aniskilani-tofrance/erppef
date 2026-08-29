-- Lot 2 : adresse de l'apprenant (détection QPV à l'adresse — un QPV est un quartier,
-- pas une commune). Lot 3 : rappels automatiques de séances, activables par groupe.

alter table public.learners
  add column if not exists address text;

alter table public.groups
  add column if not exists reminders_enabled boolean not null default false;
