-- Module congés côté formateur : les salariés PROPOSENT (validation admin/coordination),
-- les vacataires et prestataires DÉCLARENT (enregistré sans validation).
--   status        : en_attente | approuvee | refusee (les absences saisies par la coordination
--                   et l'historique restent « approuvee »)
--   requested_by  : compte à l'origine de la demande (null = saisie coordination)
--   decided_by/at : qui a tranché, quand ; decision_note = motif visible par le formateur
-- Seules les absences approuvées comptent pour le moteur et le planning.

alter table public.trainer_absences
  add column if not exists status text not null default 'approuvee'
    check (status in ('en_attente', 'approuvee', 'refusee')),
  add column if not exists requested_by uuid references public.profiles(id) on delete set null,
  add column if not exists decided_by uuid references public.profiles(id) on delete set null,
  add column if not exists decided_at timestamptz,
  add column if not exists decision_note text;
create index if not exists trainer_absences_status_idx on public.trainer_absences (org_id, status);

-- Une demande refusée ne doit pas bloquer une nouvelle demande sur les mêmes dates :
-- l'exclusion anti-chevauchement ne s'applique qu'aux absences non refusées.
alter table public.trainer_absences drop constraint if exists no_absence_overlap;
alter table public.trainer_absences add constraint no_absence_overlap exclude using gist (
  trainer_id with =,
  daterange(starts_on, ends_on, '[]') with &&
) where (status <> 'refusee');

-- Un formateur peut retirer sa propre demande tant qu'elle est en attente.
drop policy if exists trainer_absences_own_delete on public.trainer_absences;
create policy trainer_absences_own_delete on public.trainer_absences for delete
  using (
    org_id = private.jwt_org_id()
    and status = 'en_attente'
    and exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.trainer_id = trainer_absences.trainer_id)
  );
-- Et ne modifie que ses demandes en attente (pas une absence validée).
drop policy if exists trainer_absences_own_update on public.trainer_absences;
create policy trainer_absences_own_update on public.trainer_absences for update
  using (
    org_id = private.jwt_org_id()
    and (private.jwt_role() in ('admin', 'coordinator') or (status = 'en_attente'
      and exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.trainer_id = trainer_absences.trainer_id)))
  )
  with check (org_id = private.jwt_org_id());

select count(*) as absences_ok, count(*) filter (where status = 'approuvee') as approuvees from public.trainer_absences;
