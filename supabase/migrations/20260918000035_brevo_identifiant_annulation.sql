-- Brevo ignore le batchId fourni par l'appelant et ne renvoie qu'un messageId :
-- annuler avec le batchId répond 404, annuler avec le messageId répond 204
-- (vérifié sur le compte de production le 18/09/2026). Les colonnes gardent donc
-- l'identifiant RENVOYÉ par Brevo. Les noms de colonnes sont conservés pour ne pas
-- casser le code ; seuls les commentaires sont remis en accord avec la réalité.

comment on column public.employer_leads.qualification_reminder_j1_batch_id is
  'Identifiant Brevo du rappel J-1 de qualification (messageId renvoyé à la programmation), utilisé pour l''annuler en cas de report.';
comment on column public.employer_leads.qualification_reminder_h2_batch_id is
  'Identifiant Brevo du rappel H-2 de qualification (messageId renvoyé à la programmation), utilisé pour l''annuler en cas de report.';
comment on column public.employer_leads.rdv_reminder_j1_batch_id is
  'Identifiant Brevo du rappel J-1 de rendez-vous direction (messageId renvoyé à la programmation), utilisé pour l''annuler en cas de report.';
comment on column public.employer_leads.rdv_reminder_h2_batch_id is
  'Identifiant Brevo du rappel H-2 de rendez-vous direction (messageId renvoyé à la programmation), utilisé pour l''annuler en cas de report.';
