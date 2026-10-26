-- 0056 · Inscription en ligne à une réunion d'information collective (test oral individuel inclus).
-- À appliquer APRÈS 0023 (info_meetings, info_meeting_invitations). Additive et idempotente.
--
-- Chaque réunion reçoit un lien secret (signup_token) : /inscription/reunion/<jeton>.
-- La personne remplit le formulaire d'inscription rapide et est inscrite d'office à la réunion
-- tant que l'inscription est ouverte, que la réunion n'a pas commencé et qu'il reste des places.
--
--   info_meetings.signup_token        jeton du lien (généré, unique, jamais deviné)
--   info_meetings.signup_open         inscription par lien ouverte (fermée par défaut)
--   info_meetings.oral_test_included  la réunion comprend un test oral individuel (dit à la personne)
--   info_meetings.capacity            nombre MAXIMUM d'apprenants ; obligatoire pour ouvrir le lien
--   info_meeting_invitations.signed_up_online  la personne s'est inscrite elle-même par le lien
--   info_meeting_invitations.convocation_at    heure de convocation PROPRE à la personne
--                                              (null = l'heure de la réunion) : test oral échelonné
--   info_meetings.series_token        jeton COMMUN à plusieurs créneaux d'une même réunion : un seul lien,
--                                     la personne choisit son jour et son heure (chaque créneau est une
--                                     réunion à part entière : date, places maximum, convoqués, présence)
--
-- signup_for_info_meeting(jeton, apprenant) : inscription ATOMIQUE. La ligne de la réunion est
-- verrouillée le temps du comptage, donc deux personnes qui prennent la dernière place au même
-- instant ne la prennent pas toutes les deux. Appelée uniquement côté serveur (service_role).

alter table public.info_meetings
  add column if not exists signup_token text not null default replace(gen_random_uuid()::text, '-', ''),
  add column if not exists signup_open boolean not null default false,
  add column if not exists oral_test_included boolean not null default true;

create unique index if not exists info_meetings_signup_token_key on public.info_meetings (signup_token);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'info_meetings_signup_needs_capacity'
      and conrelid = 'public.info_meetings'::regclass
  ) then
    alter table public.info_meetings
      add constraint info_meetings_signup_needs_capacity check (not signup_open or capacity is not null);
  end if;
end $$;

alter table public.info_meeting_invitations
  add column if not exists signed_up_online boolean not null default false,
  add column if not exists convocation_at timestamptz;

alter table public.info_meetings
  add column if not exists series_token text;

create index if not exists info_meetings_series_token_idx
  on public.info_meetings (series_token) where series_token is not null;

create or replace function public.signup_for_info_meeting(p_token text, p_learner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.info_meetings%rowtype;
  learner_org uuid;
  existing public.info_meeting_invitations%rowtype;
  taken integer;
begin
  -- Verrou de la réunion : les inscriptions simultanées passent l'une après l'autre.
  select * into m from public.info_meetings where signup_token = p_token for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  select org_id into learner_org from public.learners where id = p_learner_id;
  if learner_org is distinct from m.org_id then
    return jsonb_build_object('result', 'not_found');
  end if;

  select * into existing
    from public.info_meeting_invitations
    where meeting_id = m.id and learner_id = p_learner_id;

  -- Déjà convoquée (par l'équipe) ou déjà inscrite : c'est confirmé, la place est déjà comptée.
  if found and existing.status in ('a_envoyer', 'envoyee', 'confirmee', 'presente') then
    if existing.status in ('a_envoyer', 'envoyee') then
      update public.info_meeting_invitations set status = 'confirmee' where id = existing.id;
    end if;
    return jsonb_build_object('result', 'already', 'capacity', m.capacity);
  end if;

  if not m.signup_open or m.starts_at <= now() then
    return jsonb_build_object('result', 'closed');
  end if;

  select count(*) into taken
    from public.info_meeting_invitations
    where meeting_id = m.id and status not in ('excusee', 'absente');

  if m.capacity is not null and taken >= m.capacity then
    return jsonb_build_object('result', 'full', 'taken', taken, 'capacity', m.capacity);
  end if;

  if existing.id is not null then
    -- Excusée ou absente d'une réunion à venir qui se réinscrit : la même ligne repart à zéro.
    update public.info_meeting_invitations
      set status = 'confirmee', signed_up_online = true
      where id = existing.id;
  else
    insert into public.info_meeting_invitations (org_id, meeting_id, learner_id, status, signed_up_online)
      values (m.org_id, m.id, p_learner_id, 'confirmee', true);
  end if;

  return jsonb_build_object('result', 'registered', 'taken', taken + 1, 'capacity', m.capacity);
end;
$$;

revoke all on function public.signup_for_info_meeting(text, uuid) from public, anon, authenticated;
grant execute on function public.signup_for_info_meeting(text, uuid) to service_role;

select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'info_meetings'
       and column_name in ('signup_token', 'signup_open', 'oral_test_included')) as colonnes_reunion_ok,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'info_meetings'
       and column_name = 'series_token') as colonne_creneaux_ok,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'info_meeting_invitations'
       and column_name in ('signed_up_online', 'convocation_at')) as colonnes_invitation_ok,
  (select count(*) from public.info_meetings where signup_token is null) as reunions_sans_jeton,
  to_regprocedure('public.signup_for_info_meeting(text, uuid)') is not null as fonction_ok;
