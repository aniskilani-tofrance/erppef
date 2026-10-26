-- 0057 · Inscription à une réunion d'information par lien : « premier inscrit, premier servi ».
-- À appliquer APRÈS 0056. Remplace uniquement la fonction signup_for_info_meeting ; idempotente.
--
-- Usage visé : un gros lot d'apprenants reçoit le lien et choisit entre plusieurs créneaux (par
-- exemple deux sessions de 30 places) ; tant pis pour les derniers, la page garde leur numéro.
--
--   1. Seule une inscription CONFIRMÉE prend une place (statut « confirmee » : par le lien, ou posé
--      par l'équipe quand la personne répond OUI ; « presente » le jour J). Une simple convocation
--      (« a_envoyer », « envoyee ») ne réserve rien : convoquer 95 personnes ne remplit plus 30 places.
--      Avant (0056), toute convocation comptait et une personne convoquée pouvait confirmer au-delà
--      du maximum.
--   2. Une seule place par personne sur un même lien (series_token) : déjà confirmée à un autre
--      créneau du lien → « already » avec le jeton de CE créneau (l'écran de fin le montre).
--   3. Inscrite à un créneau, la personne perd ses convocations EN ATTENTE (à envoyer, envoyée) aux
--      autres créneaux du même lien : elle a choisi, elle n'apparaît plus deux fois.
--
-- Réponse : {"result": "registered"|"already"|"full"|"closed"|"not_found", "token": <jeton du créneau
-- où la personne est inscrite>, "taken": n, "capacity": n}. Appelée côté serveur seulement.

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
  taken integer;
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
    return jsonb_build_object('result', 'already', 'token', m.signup_token, 'capacity', m.capacity);
  end if;

  -- Déjà confirmée à un AUTRE créneau du même lien : une seule place par personne.
  if m.series_token is not null then
    select o.signup_token into other_token
      from public.info_meeting_invitations i
      join public.info_meetings o on o.id = i.meeting_id
      where i.learner_id = p_learner_id
        and o.series_token = m.series_token
        and o.id <> m.id
        and i.status in ('confirmee', 'presente')
      order by o.starts_at
      limit 1;
    if other_token is not null then
      return jsonb_build_object('result', 'already', 'token', other_token);
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

  if existing.id is not null then
    -- Convoquée par l'équipe (à envoyer, envoyée) ou excusée qui revient : la même ligne passe confirmée.
    update public.info_meeting_invitations
      set status = 'confirmee', signed_up_online = true
      where id = existing.id;
  else
    insert into public.info_meeting_invitations (org_id, meeting_id, learner_id, status, signed_up_online)
      values (m.org_id, m.id, p_learner_id, 'confirmee', true);
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

  return jsonb_build_object('result', 'registered', 'token', m.signup_token, 'taken', taken + 1, 'capacity', m.capacity);
end;
$$;

revoke all on function public.signup_for_info_meeting(text, uuid) from public, anon, authenticated;
grant execute on function public.signup_for_info_meeting(text, uuid) to service_role;

select
  to_regprocedure('public.signup_for_info_meeting(text, uuid)') is not null as fonction_ok,
  position('premier inscrit' in lower(pg_get_functiondef('public.signup_for_info_meeting(text, uuid)'::regprocedure))) > 0 as version_0057,
  has_function_privilege('anon', 'public.signup_for_info_meeting(text, uuid)', 'execute') as anon_peut,
  has_function_privilege('service_role', 'public.signup_for_info_meeting(text, uuid)', 'execute') as serveur_peut;
