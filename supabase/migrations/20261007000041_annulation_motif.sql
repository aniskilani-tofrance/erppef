-- 0041 · Motif d'annulation des séances + trace du décalage des kits.
-- Une séance annulée dit désormais POURQUOI (absence imprévue du formateur, fermeture
-- du lieu, effectif insuffisant, autre) : preuve pour le financeur et Qualiopi.
-- Quand la séance n'a pas eu lieu, son kit (et ceux des séances suivantes) glisse
-- d'une séance : on garde la trace de la séance d'origine sur le kit.
-- Additif uniquement : aucune donnée existante touchée (les 2 séances déjà annulées
-- restent sans motif).

alter table public.sessions
  add column if not exists cancel_reason text
    check (cancel_reason in ('absence_formateur', 'fermeture_lieu', 'effectif_insuffisant', 'autre')),
  add column if not exists cancel_note text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;

alter table public.session_kits
  add column if not exists shifted_from_session_id uuid references public.sessions(id) on delete set null,
  add column if not exists shifted_at timestamptz;

-- Contrôle : colonnes présentes, séances annulées par organisation.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'sessions'
      and column_name in ('cancel_reason', 'cancel_note', 'cancelled_at', 'cancelled_by')) = 4 as sessions_ok,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'session_kits'
      and column_name in ('shifted_from_session_id', 'shifted_at')) = 2 as kits_ok,
  (select string_agg(o.name || ' : ' || n, ' · ')
     from (select org_id, count(*) n from public.sessions where status = 'annulee' group by org_id) s
     join public.organizations o on o.id = s.org_id) as seances_annulees;
