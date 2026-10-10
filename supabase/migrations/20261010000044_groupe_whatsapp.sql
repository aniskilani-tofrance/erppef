-- Groupe WhatsApp de la classe : lien d'invitation par groupe + consentement de chaque
-- apprenant à y être ajouté (null = pas encore demandé). La date de consentement est
-- posée par trigger quand la valeur change (preuve RGPD), jamais réécrite à chaque sauvegarde.

alter table public.groups add column if not exists whatsapp_group_url text;
comment on column public.groups.whatsapp_group_url is 'Lien d''invitation du groupe WhatsApp de la classe (https://chat.whatsapp.com/…), créé depuis le téléphone de l''organisme';

alter table public.learners add column if not exists whatsapp_group_consent boolean;
alter table public.learners add column if not exists whatsapp_group_consent_at timestamptz;
comment on column public.learners.whatsapp_group_consent is 'Accepte d''être ajouté(e) au groupe WhatsApp de sa classe (null = pas encore demandé)';

create or replace function public.set_whatsapp_group_consent_at() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.whatsapp_group_consent is distinct from old.whatsapp_group_consent then
    new.whatsapp_group_consent_at := case when new.whatsapp_group_consent is null then null else now() end;
  end if;
  return new;
end $$;

drop trigger if exists trg_learners_whatsapp_group_consent on public.learners;
create trigger trg_learners_whatsapp_group_consent
  before insert or update of whatsapp_group_consent on public.learners
  for each row execute function public.set_whatsapp_group_consent_at();

select
  exists(select 1 from information_schema.columns where table_name = 'groups' and column_name = 'whatsapp_group_url') as groups_ok,
  exists(select 1 from information_schema.columns where table_name = 'learners' and column_name = 'whatsapp_group_consent_at') as learners_ok,
  exists(select 1 from pg_trigger where tgname = 'trg_learners_whatsapp_group_consent') as trigger_ok;
