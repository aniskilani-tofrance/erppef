-- Cahier de séance : deux lignes écrites par la formatrice en fin de séance
-- (« ce qu'on a fait », « pour la prochaine fois »). Sert au co-animateur, au
-- remplaçant et à la coordination ; preuve Qualiopi (ind. 11-12) du déroulé réel.
-- Additif uniquement : aucune donnée existante touchée. L'écriture passe par une
-- Server Action (client service_role après contrôle du rôle et de la fiche formateur),
-- la lecture suit la RLS existante de `sessions`.
alter table public.sessions
  add column if not exists log_done text,
  add column if not exists log_next text,
  add column if not exists log_updated_at timestamptz,
  add column if not exists log_updated_by uuid references public.profiles(id) on delete set null;

-- Contrôle
select count(*) as seances, count(log_done) as cahiers_remplis from public.sessions;
