-- 0055 · Absence excusée : 4e statut d'émargement « Excusé » (absence justifiée, prévenue).
-- La formatrice (ou la coordination) le pose sur la feuille, avec un motif facultatif
-- (rendez-vous médical, préfecture, enfant malade…). Une absence excusée :
--   • n'apparaît jamais dans « Absents à relancer » et n'allonge pas la série d'absences ;
--   • compte comme une absence pour les heures (heures non réalisées), montrée à part
--     dans les bilans (« dont X absences justifiées »).
-- Sur une feuille déjà clôturée, l'admin et la coordination peuvent passer une ligne
-- « Absent » en « Excusé » (et revenir) sans rouvrir la feuille : la trace dit qui et quand.
--
-- À appliquer AVANT le déploiement du code. Sans elle, le code reste sûr : les pages qui
-- lisent les émargements s'affichent comme avant et le bouton « Excusé » répond
-- « statut indisponible, contactez l'administrateur ».
-- Additive et idempotente : collable plusieurs fois dans le SQL Editor. Aucune donnée
-- existante touchée (pas de rattrapage des anciennes absences). RLS inchangée.
--
-- Une valeur d'enum ajoutée ne peut pas être utilisée dans la transaction qui la crée
-- (erreur 55P04) : rien ici ne s'en sert, le contrôle final lit le catalogue pg_enum.

alter type public.attendance_status add value if not exists 'excuse';

alter table public.attendances
  add column if not exists excuse_reason text,
  add column if not exists excused_by uuid references public.profiles(id) on delete set null,
  add column if not exists excused_at timestamptz;

-- Motif court : une ligne suffit (la limite est aussi contrôlée par l'ERP).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'attendances_excuse_reason_len' and conrelid = 'public.attendances'::regclass
  ) then
    alter table public.attendances
      add constraint attendances_excuse_reason_len
      check (excuse_reason is null or char_length(excuse_reason) <= 200);
  end if;
end $$;

comment on column public.attendances.excuse_reason is
  'Motif de l''absence excusée (facultatif, 200 caractères maximum). Jamais repris sur les documents envoyés au financeur.';
comment on column public.attendances.excused_by is
  'Qui a posé le statut « Excusé » (formatrice sur la feuille ouverte, coordination sur une feuille clôturée).';
comment on column public.attendances.excused_at is
  'Quand le statut « Excusé » a été posé.';

-- Contrôle : la valeur « excuse » existe, les trois colonnes sont là.
select
  (select string_agg(enumlabel, ', ' order by enumsortorder)
     from pg_enum where enumtypid = 'public.attendance_status'::regtype) as statuts,
  exists (select 1 from pg_enum
           where enumtypid = 'public.attendance_status'::regtype and enumlabel = 'excuse') as excuse_ok,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'attendances'
      and column_name in ('excuse_reason', 'excused_by', 'excused_at')) = 3 as colonnes_ok;
