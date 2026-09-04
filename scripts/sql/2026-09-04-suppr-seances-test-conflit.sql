-- Suppression demandée par Anis le 04/09 : les 5 séances TEST du groupe
-- « Cours municipaux A1 — Juillet 2026 » tombant sur les jours de fac de
-- Marie TREGARO (04-05/01, 11-12/01/2027 et 07/09/2027). Les émargements
-- éventuels suivent par FK on delete cascade (séances futures : aucun).
delete from sessions s
using groups g, trainers t, trainer_absences a
where g.id = s.group_id
  and t.id = s.trainer_id
  and a.trainer_id = s.trainer_id
  and (s.starts_at at time zone 'Europe/Paris')::date between a.starts_on and a.ends_on
  and s.org_id = (select id from organizations where slug = 'pef')
  and upper(t.last_name) = 'TREGARO'
  and g.name = 'Cours municipaux A1 — Juillet 2026'
  and s.starts_at >= now()
  and s.status <> 'annulee';
