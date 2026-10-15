-- Reprise ponctuelle (après la migration 0049) : les 27 restaurants importés le 16/10/2026
-- dans les leads (campagne « prospection_ouvertures_2026 ») passent dans une liste de
-- prospection. Seules les fiches jamais appelées (0 tentative, statut « À rappeler »)
-- sont déplacées ; celles que le setter a déjà travaillées restent des leads.
-- Idempotent : ne fait rien si la liste existe déjà.
-- Usage : SUPABASE_ACCESS_TOKEN=sbp_... node scripts/run-sql-mgmt.mjs scripts/sql/prospection-reprise-ouvertures-2026.sql

do $$
declare
  v_org uuid := 'a0000000-0000-4000-8000-000000000001';
  v_list uuid;
begin
  if exists (select 1 from public.prospect_lists where org_id = v_org and name = 'Ouvertures 2026 — sélection du 16/10') then
    raise notice 'Liste déjà reprise : rien à faire.';
    return;
  end if;

  insert into public.prospect_lists (org_id, name, description)
  values (v_org, 'Ouvertures 2026 — sélection du 16/10', 'Restaurants ouverts en 2026 (SIRENE) avec contacts trouvés sur internet, repris des leads.')
  returning id into v_list;

  insert into public.prospects (
    org_id, list_id, company, segment, siret, address, postal_code, city, department, opened_on,
    phone, email, website, contact_source, notes, created_by
  )
  select
    l.org_id, v_list, l.company, l.segment,
    substring(l.notes from 'SIRET : (\d{14})'),
    substring(l.notes from 'Adresse : ([^\n]*?), \d{5} '),
    l.postal_code, l.city, left(l.postal_code, 2),
    to_date(substring(l.notes from 'ouvert le (\d{2}/\d{2}/\d{4})'), 'DD/MM/YYYY'),
    l.phone, l.email,
    substring(l.notes from 'Site : ([^\n]*)'),
    'OpenStreetMap / site du restaurant (non vérifié)',
    nullif(array_to_string(array(
      select line from regexp_split_to_table(l.notes, '\n') as line
      where line ~ '^(E-mail|Enseigne de chaîne)'
    ), E'\n'), ''),
    l.created_by
  from public.employer_leads l
  where l.org_id = v_org
    and l.campaign = 'prospection_ouvertures_2026'
    and l.attempts = 0
    and l.status = 'a_rappeler'
  on conflict do nothing;

  delete from public.employer_leads l
  where l.org_id = v_org
    and l.campaign = 'prospection_ouvertures_2026'
    and l.attempts = 0
    and l.status = 'a_rappeler'
    and exists (
      select 1 from public.prospects p
      where p.list_id = v_list and p.siret = substring(l.notes from 'SIRET : (\d{14})')
    );
end $$;

select
  (select count(*) from public.prospects p join public.prospect_lists pl on pl.id = p.list_id
    where pl.name = 'Ouvertures 2026 — sélection du 16/10') as prospects_repris,
  (select count(*) from public.employer_leads where campaign = 'prospection_ouvertures_2026') as leads_restants;
