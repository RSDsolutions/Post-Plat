-- Fase 4: Enforcement de límites de plan a nivel de base de datos.
--
-- Hasta ahora, el único límite realmente aplicado era facturas (un `if` de
-- JS en api/sri/submit-invoice.js, contra companies.monthly_comprobantes, un
-- contador mutable que solo se incrementaba si el SRI autorizaba). Los otros
-- 4 (usuarios, sucursales, productos, puntos de venta) ya tenían un chequeo
-- en el cliente (src/lib/planLimits.js) pero NINGUNO a nivel de base de
-- datos - trivialmente evitable con un INSERT directo (dos pestañas, una
-- llamada a la API REST de Supabase, una carrera entre dos cajeros).
--
-- check_plan_limit(company_id, tipo) es el único punto de verdad para las 5:
-- cuenta filas EN VIVO (no un contador que se puede desincronizar) y lo
-- compara contra el límite del plan (NULL = sin límite). Facturas se cuenta
-- por date_trunc('month', issue_date) - no por monthly_comprobantes, que
-- queda retirado de la ruta de bloqueo (ver api/sri/submit-invoice.js) tras
-- esta migración; tampoco se cuenta al crear el borrador sino que ya se
-- cuenta TODO lo creado ese mes (borrador/devuelta/autorizada/anulada) igual
-- que se consume un secuencial real del SRI en el momento de creación, no
-- de autorización. Notas de crédito NO consumen este cupo (decisión ya
-- tomada en la Fase 2/3, se mantiene acá).
create or replace function public.check_plan_limit(p_company_id uuid, p_tipo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
DECLARE
  v_limit integer;
  v_count integer;
  v_label text;
BEGIN
  SELECT
    CASE p_tipo
      WHEN 'invoices' THEN p.max_invoices_monthly
      WHEN 'users' THEN p.max_users
      WHEN 'branches' THEN p.max_branches
      WHEN 'products' THEN p.max_products
      WHEN 'pos' THEN p.max_pos
      ELSE NULL
    END
  INTO v_limit
  FROM companies c
  JOIN plans p ON p.id = c.plan_id
  WHERE c.id = p_company_id;

  -- Sin plan asociado, o límite NULL en el plan: sin límite para este tipo.
  IF v_limit IS NULL THEN
    RETURN;
  END IF;

  IF p_tipo = 'invoices' THEN
    v_label := 'facturas este mes';
    SELECT count(*) INTO v_count FROM invoices
    WHERE company_id = p_company_id
      AND invoice_type = 'factura'
      AND date_trunc('month', issue_date) = date_trunc('month', now());
  ELSIF p_tipo = 'users' THEN
    v_label := 'usuarios';
    SELECT count(*) INTO v_count FROM users WHERE company_id = p_company_id AND is_active = true;
  ELSIF p_tipo = 'branches' THEN
    v_label := 'sucursales';
    SELECT count(*) INTO v_count FROM branches WHERE company_id = p_company_id;
  ELSIF p_tipo = 'products' THEN
    v_label := 'productos';
    SELECT count(*) INTO v_count FROM products WHERE company_id = p_company_id;
  ELSIF p_tipo = 'pos' THEN
    v_label := 'puntos de venta';
    SELECT count(*) INTO v_count FROM point_of_sales WHERE company_id = p_company_id;
  ELSE
    RAISE EXCEPTION 'check_plan_limit: tipo desconocido %', p_tipo;
  END IF;

  IF v_count >= v_limit THEN
    -- Prefijo PLAN_LIMIT: estable a propósito - el frontend lo detecta para
    -- mostrar un mensaje limpio en vez del texto crudo de Postgres (ver
    -- src/lib/supabaseHelpers.js).
    RAISE EXCEPTION 'PLAN_LIMIT: Alcanzaste el límite de % % de tu plan', v_limit, v_label;
  END IF;
END;
$function$;

revoke all on function public.check_plan_limit(uuid, text) from public, anon, authenticated;

-- Facturas y notas de crédito: además del cupo (solo factura), una empresa
-- que no está 'activa' (suspendida/vencida/cancelada) no puede emitir NINGÚN
-- comprobante - antes esto no se verificaba en ningún lado (ver
-- AUDITORIA_SISTEMA.md, hallazgo de la Fase 4).
create or replace function public.enforce_invoice_plan_limit()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $function$
DECLARE
  v_status subscription_status;
BEGIN
  SELECT subscription_status INTO v_status FROM companies WHERE id = NEW.company_id;
  IF v_status IS DISTINCT FROM 'activa' THEN
    RAISE EXCEPTION 'PLAN_LIMIT: Tu empresa no está activa (estado: %) - no se pueden emitir comprobantes. Contacta a soporte para regularizar tu cuenta.', v_status;
  END IF;

  IF NEW.invoice_type = 'factura' THEN
    PERFORM public.check_plan_limit(NEW.company_id, 'invoices');
  END IF;

  RETURN NEW;
END;
$function$;

drop trigger if exists invoices_check_plan_limit on public.invoices;
create trigger invoices_check_plan_limit
  before insert on public.invoices
  for each row execute function public.enforce_invoice_plan_limit();

create or replace function public.enforce_user_plan_limit()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $function$
BEGIN
  IF NEW.is_active THEN
    PERFORM public.check_plan_limit(NEW.company_id, 'users');
  END IF;
  RETURN NEW;
END;
$function$;

drop trigger if exists users_check_plan_limit on public.users;
create trigger users_check_plan_limit
  before insert on public.users
  for each row execute function public.enforce_user_plan_limit();

create or replace function public.enforce_branch_plan_limit()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $function$
BEGIN
  PERFORM public.check_plan_limit(NEW.company_id, 'branches');
  RETURN NEW;
END;
$function$;

drop trigger if exists branches_check_plan_limit on public.branches;
create trigger branches_check_plan_limit
  before insert on public.branches
  for each row execute function public.enforce_branch_plan_limit();

create or replace function public.enforce_product_plan_limit()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $function$
BEGIN
  PERFORM public.check_plan_limit(NEW.company_id, 'products');
  RETURN NEW;
END;
$function$;

drop trigger if exists products_check_plan_limit on public.products;
create trigger products_check_plan_limit
  before insert on public.products
  for each row execute function public.enforce_product_plan_limit();

create or replace function public.enforce_pos_plan_limit()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $function$
BEGIN
  PERFORM public.check_plan_limit(NEW.company_id, 'pos');
  RETURN NEW;
END;
$function$;

drop trigger if exists point_of_sales_check_plan_limit on public.point_of_sales;
create trigger point_of_sales_check_plan_limit
  before insert on public.point_of_sales
  for each row execute function public.enforce_pos_plan_limit();

-- Conteo mensual de facturas por empresa (mes actual y anterior), para que
-- el panel admin (alertas de consumo, pestaña "Consumo y Límites", columna
-- "Comprobantes/mes") muestre el mismo número que en verdad se está
-- aplicando arriba, en vez de companies.monthly_comprobantes/
-- prev_month_comprobantes, ya retirados de la ruta de bloqueo. Solo
-- is_platform_admin() - cruza todas las empresas.
create or replace function public.get_monthly_invoice_counts()
returns table(company_id uuid, invoice_count bigint, prev_month_count bigint)
language sql security definer stable
set search_path = public, pg_temp
as $function$
  SELECT
    i.company_id,
    count(*) FILTER (WHERE date_trunc('month', i.issue_date) = date_trunc('month', now())) as invoice_count,
    count(*) FILTER (WHERE date_trunc('month', i.issue_date) = date_trunc('month', now() - interval '1 month')) as prev_month_count
  FROM invoices i
  WHERE i.invoice_type = 'factura'
    AND date_trunc('month', i.issue_date) IN (date_trunc('month', now()), date_trunc('month', now() - interval '1 month'))
    AND public.is_platform_admin()
  GROUP BY i.company_id;
$function$;

revoke all on function public.get_monthly_invoice_counts() from public;
grant execute on function public.get_monthly_invoice_counts() to authenticated;
