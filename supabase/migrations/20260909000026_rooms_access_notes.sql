-- Consignes pour trouver la salle (accès, étage, interphone, transports) : reprises dans
-- les plannings PDF, le calendrier .ics et les messages WhatsApp/email qui donnent un lieu.
alter table public.rooms add column if not exists access_notes text;
select count(*) as rooms_ok from public.rooms;
