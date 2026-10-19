-- Rendez-vous « Diagnostic partagé ToFrance » : ouverts à tous les apprenants (inscrits
-- compris), sans effet sur le statut d'admission. Même table et même agenda Google
-- que les RDV d'admission.
alter table public.admission_appointments drop constraint if exists admission_appointments_kind_check;
alter table public.admission_appointments
  add constraint admission_appointments_kind_check
  check (kind in ('entretien', 'test_oral', 'diagnostic_tofrance', 'autre'));
