-- Adresse des salles : reprise dans les plannings diffusés (PDF, .ics) et les messages
-- WhatsApp (convocation, inscription, planning). Nullable, saisie progressive.
alter table public.rooms add column if not exists address text;
select count(*) as rooms_ok from public.rooms;
