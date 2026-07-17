-- Mejoras Admin Fase 6: evita reenviar el aviso de trial por vencer en
-- cada corrida diaria del cron - server-only (nunca la escribe/lee JS de
-- cliente con new Date()/toISOString(), siempre SQL now() de un lado y del
-- otro), así que timestamp without time zone es seguro acá, mismo criterio
-- que created_at/updated_at.
alter table public.companies add column trial_warning_sent_at timestamp without time zone;
