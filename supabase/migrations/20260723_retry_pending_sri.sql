-- Fase 3: Reintentos automáticos ante caídas del SRI.
--
-- 1. invoices.updated_at nunca se mantenía (ningún trigger, y submit-invoice.js
-- /reconcile-invoice.js/submit-credit-note.js no lo tocan en sus UPDATE) -
-- inservible para medir "hace cuánto fue el último intento". Se agrega un
-- trigger estándar. now() -> timestamp without time zone usa el timezone de
-- la SESIÓN (UTC en Supabase) - eso es exactamente lo que necesitamos acá,
-- porque la comparación de antigüedad para el cron también se hace en SQL
-- con now() (mismo marco de referencia en ambos lados, sin pasar por
-- new Date().toISOString() de JS - ver AUDITORIA_SISTEMA.md #10 sobre por
-- qué eso es una fuente real de corrupción de fecha en este esquema).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- 2. Candidatos a reintento: 'devuelta' con clave de acceso ya asignada
-- (recibida por el SRI en algún momento, o al menos con clave generada),
-- de más de 10 minutos desde el último intento, en TODAS las empresas.
-- SECURITY DEFINER porque cruza empresas (nadie con RLS normal puede ver
-- esto) - solo se otorga a service_role (implícito, no se lista abajo),
-- nunca a anon/authenticated.
create or replace function public.get_invoices_pending_retry(p_limit integer default 20)
returns table(
  id uuid,
  company_id uuid,
  invoice_type invoice_type,
  invoice_number character varying,
  status invoice_status,
  authorization_number character varying,
  sri_response_message text
)
language sql security definer stable
set search_path = public, pg_temp
as $function$
  SELECT i.id, i.company_id, i.invoice_type, i.invoice_number, i.status, i.authorization_number, i.sri_response_message
  FROM invoices i
  WHERE i.status = 'devuelta'
    AND i.authorization_number IS NOT NULL
    AND i.updated_at < now() - interval '10 minutes'
  ORDER BY i.updated_at ASC
  LIMIT p_limit;
$function$;

revoke all on function public.get_invoices_pending_retry(integer) from public, anon, authenticated;

-- 3. Última barrida del cron, por empresa - para que Conciliación SRI
-- muestre "última vez que el sistema intentó arreglar esto solo" sin
-- necesitar acceso de admin de plataforma a activity_log (esa tabla solo es
-- legible por is_platform_admin() - es el log de auditoría del panel
-- super-admin, no algo que un gerente/contador deba poder leer en general).
-- Esta función expone selectivamente SOLO las filas de este evento
-- puntual, ya filtradas a la empresa de quien llama - no amplía el acceso a
-- activity_log en general.
create or replace function public.get_last_sri_retry_sweep()
returns table(created_at timestamp without time zone, description text)
language sql security definer stable
set search_path = public, pg_temp
as $function$
  SELECT a.created_at, a.description
  FROM activity_log a
  WHERE a.action = 'sri_retry_sweep'
    AND a.company_id = current_company_id()
  ORDER BY a.created_at DESC
  LIMIT 1;
$function$;

revoke all on function public.get_last_sri_retry_sweep() from public;
grant execute on function public.get_last_sri_retry_sweep() to authenticated;
