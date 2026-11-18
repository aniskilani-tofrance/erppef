-- 0062 · Modules retirés à une personne.
-- Les rôles disent ce qu'un type de compte peut faire ; ici, l'administration retire en
-- plus un module précis à UNE personne (ex. une coordinatrice pédagogique qui n'a pas à
-- voir les financements ni la prospection commerciale).
--
-- Additive : 1 colonne sur memberships, 1 fonction, des politiques RESTRICTIVES (elles
-- s'ajoutent aux politiques existantes, sans les remplacer). Aucune donnée modifiée :
-- par défaut, personne n'est concerné.
--
-- Même principe que les politiques « *_no_setter » : la base refuse les données même si
-- l'on contourne l'écran. Le compte de service (crons, API) n'est pas concerné.

alter table public.memberships
  add column if not exists denied_modules text[] not null default '{}';

alter table public.memberships drop constraint if exists memberships_denied_modules_check;
alter table public.memberships add constraint memberships_denied_modules_check
  check (denied_modules <@ array['financements', 'leads', 'prospection', 'candidats_poei']::text[]);

-- Vrai si la personne connectée garde l'accès au module dans son organisation.
create or replace function private.module_allowed(module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.org_id = private.jwt_org_id()
      and module = any (m.denied_modules)
  );
$$;

-- ── Financements ──────────────────────────────────────────────────────────────
drop policy if exists funding_opportunities_module on public.funding_opportunities;
create policy funding_opportunities_module on public.funding_opportunities as restrictive for all
  using ((select private.module_allowed('financements'))) with check ((select private.module_allowed('financements')));
drop policy if exists funding_applications_module on public.funding_applications;
create policy funding_applications_module on public.funding_applications as restrictive for all
  using ((select private.module_allowed('financements'))) with check ((select private.module_allowed('financements')));
drop policy if exists funding_application_events_module on public.funding_application_events;
create policy funding_application_events_module on public.funding_application_events as restrictive for all
  using ((select private.module_allowed('financements'))) with check ((select private.module_allowed('financements')));
drop policy if exists funding_deadlines_module on public.funding_deadlines;
create policy funding_deadlines_module on public.funding_deadlines as restrictive for all
  using ((select private.module_allowed('financements'))) with check ((select private.module_allowed('financements')));
drop policy if exists funding_application_sections_module on public.funding_application_sections;
create policy funding_application_sections_module on public.funding_application_sections as restrictive for all
  using ((select private.module_allowed('financements'))) with check ((select private.module_allowed('financements')));
drop policy if exists funding_section_versions_module on public.funding_section_versions;
create policy funding_section_versions_module on public.funding_section_versions as restrictive for all
  using ((select private.module_allowed('financements'))) with check ((select private.module_allowed('financements')));
drop policy if exists funding_text_blocks_module on public.funding_text_blocks;
create policy funding_text_blocks_module on public.funding_text_blocks as restrictive for all
  using ((select private.module_allowed('financements'))) with check ((select private.module_allowed('financements')));

-- ── Leads restaurateurs ───────────────────────────────────────────────────────
drop policy if exists employer_leads_module on public.employer_leads;
create policy employer_leads_module on public.employer_leads as restrictive for all
  using ((select private.module_allowed('leads'))) with check ((select private.module_allowed('leads')));
drop policy if exists employer_lead_events_module on public.employer_lead_events;
create policy employer_lead_events_module on public.employer_lead_events as restrictive for all
  using ((select private.module_allowed('leads'))) with check ((select private.module_allowed('leads')));

-- ── Prospection ───────────────────────────────────────────────────────────────
drop policy if exists prospect_lists_module on public.prospect_lists;
create policy prospect_lists_module on public.prospect_lists as restrictive for all
  using ((select private.module_allowed('prospection'))) with check ((select private.module_allowed('prospection')));
drop policy if exists prospects_module on public.prospects;
create policy prospects_module on public.prospects as restrictive for all
  using ((select private.module_allowed('prospection'))) with check ((select private.module_allowed('prospection')));
drop policy if exists prospect_calls_module on public.prospect_calls;
create policy prospect_calls_module on public.prospect_calls as restrictive for all
  using ((select private.module_allowed('prospection'))) with check ((select private.module_allowed('prospection')));

-- ── Candidats POEI ────────────────────────────────────────────────────────────
drop policy if exists poei_candidates_module on public.poei_candidates;
create policy poei_candidates_module on public.poei_candidates as restrictive for all
  using ((select private.module_allowed('candidats_poei'))) with check ((select private.module_allowed('candidats_poei')));
drop policy if exists poei_candidate_events_module on public.poei_candidate_events;
create policy poei_candidate_events_module on public.poei_candidate_events as restrictive for all
  using ((select private.module_allowed('candidats_poei'))) with check ((select private.module_allowed('candidats_poei')));
