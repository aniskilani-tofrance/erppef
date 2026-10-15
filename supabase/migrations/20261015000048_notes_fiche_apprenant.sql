-- 0048 · Notes de la fiche apprenant et journal d'admission réunis.
-- Une seule source : le journal (learner_contacts). Une note interne (« préfère le matin »,
-- « dossier CAF en cours ») y entre avec le canal « note » : datée, signée, visible depuis
-- la fiche ET depuis le carnet d'admission. Elle ne compte jamais comme un contact
-- (ni relance, ni « dernier contact », ni statut d'admission).
-- Additive : contrainte élargie, vue nouvelle, aucune donnée modifiée.

alter table public.learner_contacts drop constraint if exists learner_contacts_channel_check;
alter table public.learner_contacts add constraint learner_contacts_channel_check
  check (channel in ('whatsapp', 'telephone', 'sms', 'email', 'presentiel', 'note'));

-- Les 5 dernières lignes du journal de CHAQUE apprenant + la date de son dernier vrai
-- contact. Remplace le « limit 500 » global des listes Apprenants et Admission, qui
-- laissait sans historique les personnes contactées il y a longtemps.
-- security_invoker : la vue applique les règles RLS de learner_contacts (org, stagiaire).
create or replace view public.learner_contacts_recent
with (security_invoker = true) as
select id, org_id, learner_id, contacted_at, channel, outcome, note, reason, by_name, last_contact_at
from (
  select
    c.id, c.org_id, c.learner_id, c.contacted_at, c.channel, c.outcome, c.note, c.reason,
    p.full_name as by_name,
    row_number() over (partition by c.learner_id order by c.contacted_at desc) as position,
    max(c.contacted_at) filter (where c.channel <> 'note') over (partition by c.learner_id) as last_contact_at
  from public.learner_contacts c
  left join public.profiles p on p.id = c.created_by
) t
where position <= 5;

grant select on public.learner_contacts_recent to authenticated;
