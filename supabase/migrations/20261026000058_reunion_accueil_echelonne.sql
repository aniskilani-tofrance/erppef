-- 0058 · Réunion d'information : accueil échelonné (une arrivée toutes les N minutes, K personnes
-- accueillies en même temps). À appliquer APRÈS 0057. Additive et idempotente.
--
-- Exemple : une arrivée toutes les 10 minutes, 3 accueillants → 3 personnes à 17h00, 3 à 17h10…
-- soit 6 personnes par accueillant et 18 par heure ; 30 places = de 17h00 à 18h30.
--
--   info_meetings.stagger_minutes   minutes entre deux heures d'arrivée (null = tout le monde à l'heure de la réunion)
--   info_meetings.stagger_parallel  personnes accueillies en même temps (nombre d'accueillants ; 1 par défaut)
--
-- signup_for_info_meeting (règles de 0057 inchangées : premier inscrit, premier servi ; une place par
-- personne sur un même lien) donne en plus à chaque inscrit la PREMIÈRE heure qui a encore une place
-- (une personne excusée libère la sienne), et la renvoie : {"convocation_at": …}. La convocation, le
-- rappel et l'écran de fin donnent alors cette heure.

alter table public.info_meetings
  add column if not exists stagger_minutes smallint,
  add column if not exists stagger_parallel smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'info_meetings_stagger_ok'
      and conrelid = 'public.info_meetings'::regclass
  ) then
    alter table public.info_meetings
      add constraint info_meetings_stagger_ok check (
        (stagger_minutes is null or stagger_minutes between 5 and 120)
        and (stagger_parallel is null or stagger_parallel between 1 and 20)
      );
  end if;
end $$;

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
  other_token text;
  other_at timestamptz;
  taken integer;
  seat_at timestamptz;
begin
  -- Verrou du créneau : les inscriptions simultanées passent l'une après l'autre.
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

  -- Déjà confirmée (ou présente) à ce créneau : rien à faire.
  if found and existing.status in ('confirmee', 'presente') then
    return jsonb_build_object('result', 'already', 'token', m.signup_token, 'convocation_at', existing.convocation_at, 'capacity', m.capacity);
  end if;

  -- Déjà confirmée à un AUTRE créneau du même lien : une seule place par personne.
  if m.series_token is not null then
    select o.signup_token, i.convocation_at into other_token, other_at
      from public.info_meeting_invitations i
      join public.info_meetings o on o.id = i.meeting_id
      where i.learner_id = p_learner_id
        and o.series_token = m.series_token
        and o.id <> m.id
        and i.status in ('confirmee', 'presente')
      order by o.starts_at
      limit 1;
    if other_token is not null then
      return jsonb_build_object('result', 'already', 'token', other_token, 'convocation_at', other_at);
    end if;
  end if;

  if not m.signup_open or m.starts_at <= now() then
    return jsonb_build_object('result', 'closed');
  end if;

  -- Premier inscrit, premier servi : seules les personnes CONFIRMÉES occupent une place.
  select count(*) into taken
    from public.info_meeting_invitations
    where meeting_id = m.id and status in ('confirmee', 'presente');

  if m.capacity is not null and taken >= m.capacity then
    return jsonb_build_object('result', 'full', 'taken', taken, 'capacity', m.capacity);
  end if;

  -- Accueil échelonné : la première heure d'arrivée qui a encore une place (moins de
  -- stagger_parallel personnes confirmées à cette heure). Une personne excusée libère la sienne.
  if m.stagger_minutes is not null then
    select m.starts_at + make_interval(mins => g.j * m.stagger_minutes) into seat_at
      from generate_series(0, 1000) as g(j)
      where (
        select count(*)
          from public.info_meeting_invitations i
          where i.meeting_id = m.id
            and i.status in ('confirmee', 'presente')
            and i.convocation_at = m.starts_at + make_interval(mins => g.j * m.stagger_minutes)
      ) < coalesce(m.stagger_parallel, 1)
      order by g.j
      limit 1;
  end if;

  if existing.id is not null then
    -- Convoquée par l'équipe (à envoyer, envoyée) ou excusée qui revient : la même ligne passe confirmée.
    update public.info_meeting_invitations
      set status = 'confirmee', signed_up_online = true, convocation_at = coalesce(seat_at, convocation_at)
      where id = existing.id;
  else
    insert into public.info_meeting_invitations (org_id, meeting_id, learner_id, status, signed_up_online, convocation_at)
      values (m.org_id, m.id, p_learner_id, 'confirmee', true, seat_at);
  end if;

  -- Elle a choisi ce créneau : ses convocations en attente aux autres créneaux du lien disparaissent.
  if m.series_token is not null then
    delete from public.info_meeting_invitations i
      using public.info_meetings o
      where o.id = i.meeting_id
        and i.learner_id = p_learner_id
        and o.series_token = m.series_token
        and o.id <> m.id
        and i.status in ('a_envoyer', 'envoyee');
  end if;

  return jsonb_build_object(
    'result', 'registered',
    'token', m.signup_token,
    'convocation_at', coalesce(seat_at, existing.convocation_at),
    'taken', taken + 1,
    'capacity', m.capacity
  );
end;
$$;

revoke all on function public.signup_for_info_meeting(text, uuid) from public, anon, authenticated;
grant execute on function public.signup_for_info_meeting(text, uuid) to service_role;

select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'info_meetings'
       and column_name in ('stagger_minutes', 'stagger_parallel')) as colonnes_accueil_ok,
  position('accueil échelonné' in lower(pg_get_functiondef('public.signup_for_info_meeting(text, uuid)'::regprocedure))) > 0 as version_0058,
  has_function_privilege('anon', 'public.signup_for_info_meeting(text, uuid)', 'execute') as anon_peut,
  has_function_privilege('service_role', 'public.signup_for_info_meeting(text, uuid)', 'execute') as serveur_peut;
