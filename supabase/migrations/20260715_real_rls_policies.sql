-- Reemplaza las políticas USING(true)/WITH CHECK(true) (todas las tablas
-- operativas eran de lectura/escritura abierta para cualquiera con la anon
-- key) por políticas reales basadas en auth.uid(), ahora que existe una
-- sesión de verdad (ver 20260715_link_users_to_auth.sql y
-- 20260715_auth_helper_functions.sql).
--
-- Patrón: SELECT abierta a la propia empresa (o is_platform_admin() para
-- soporte); escritura restringida a la propia empresa Y a los roles que hoy
-- realmente la ejercen en la UI (gerente siempre; vendedor/operario donde el
-- POS efectivamente crea/edita datos). is_platform_admin() NO se agrega a las
-- políticas de escritura de tablas operativas de una empresa - el admin no
-- edita facturas/productos de un cliente hoy, no hay por qué dárselo a nivel
-- de datos. Esto es más estricto que el USING(true) anterior para todos:
-- endurecimiento intencional, no accidental.
--
-- Fase 1 (pendiente, fuera de esta migración) puede reemplazar los role IN
-- (...) hardcodeados de abajo por lookups contra permissions/role_permissions
-- una vez poblada esa tabla, sin cambiar el resto del diseño.

-- ============ companies ============
drop policy if exists companies_insert_access on companies;
drop policy if exists companies_update_access on companies;
drop policy if exists read_companies on companies;

create policy companies_select on companies for select
  using (id = (select public.current_company_id()) or public.is_platform_admin());
create policy companies_insert on companies for insert
  with check (public.is_platform_admin());
create policy companies_update on companies for update
  using (public.is_platform_admin());

-- ============ plans (catálogo público de precios, pero la escritura era true para cualquiera) ============
drop policy if exists plans_update_access on plans;
create policy plans_update on plans for update
  using (public.is_platform_admin());

-- ============ payment_methods (catálogo fijo, sembrado por migración) ============
drop policy if exists payment_methods_all_access on payment_methods;
create policy payment_methods_select on payment_methods for select using (true);

-- ============ payments (cobros SaaS a las empresas - no operacional, solo admin) ============
drop policy if exists payments_all_access on payments;
create policy payments_select on payments for select using (public.is_platform_admin());
create policy payments_insert on payments for insert with check (public.is_platform_admin());
create policy payments_update on payments for update using (public.is_platform_admin());
create policy payments_delete on payments for delete using (public.is_platform_admin());

-- ============ activity_log (feed del panel admin) ============
drop policy if exists activity_log_read_access on activity_log;
drop policy if exists activity_log_insert_access on activity_log;
create policy activity_log_select on activity_log for select using (public.is_platform_admin());
create policy activity_log_insert on activity_log for insert with check (public.is_platform_admin());

-- ============ company_feature_overrides (gestionado por admin) ============
drop policy if exists company_feature_overrides_all_access on company_feature_overrides;
create policy company_feature_overrides_select on company_feature_overrides for select using (public.is_platform_admin());
create policy company_feature_overrides_insert on company_feature_overrides for insert with check (public.is_platform_admin());
create policy company_feature_overrides_update on company_feature_overrides for update using (public.is_platform_admin());
create policy company_feature_overrides_delete on company_feature_overrides for delete using (public.is_platform_admin());

-- ============ users ============
drop policy if exists read_users on users;
create policy users_select on users for select
  using (company_id = (select public.current_company_id()) or id = auth.uid() or public.is_platform_admin());
-- Sin política de escritura directa: altas/bajas/reset pasan por RPCs
-- SECURITY DEFINER o por la Auth Admin API desde endpoints service_role.

-- ============ branches ============
drop policy if exists branches_all_access on branches;
create policy branches_select on branches for select
  using (company_id = (select public.current_company_id()) or public.is_platform_admin());
create policy branches_insert on branches for insert
  with check (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente');
create policy branches_update on branches for update
  using (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente');
create policy branches_delete on branches for delete
  using (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente');

-- ============ point_of_sales ============
drop policy if exists point_of_sales_all_access on point_of_sales;
create policy point_of_sales_select on point_of_sales for select
  using (company_id = (select public.current_company_id()) or public.is_platform_admin());
create policy point_of_sales_insert on point_of_sales for insert
  with check (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente');
create policy point_of_sales_update on point_of_sales for update
  using (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente');
create policy point_of_sales_delete on point_of_sales for delete
  using (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente');

-- ============ products ============
drop policy if exists read_products on products;
drop policy if exists products_insert_access on products;
drop policy if exists products_update_access on products;
drop policy if exists products_delete_access on products;
create policy products_select on products for select
  using (company_id = (select public.current_company_id()) or public.is_platform_admin());
create policy products_insert on products for insert
  with check (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente');
create policy products_update on products for update
  using (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente');
create policy products_delete on products for delete
  using (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente');

-- ============ product_stock (sin company_id directo, se escala vía branches) ============
drop policy if exists product_stock_all_access on product_stock;
create policy product_stock_select on product_stock for select
  using (exists (select 1 from branches b where b.id = product_stock.branch_id
    and (b.company_id = (select public.current_company_id()) or public.is_platform_admin())));
create policy product_stock_insert on product_stock for insert
  with check (exists (select 1 from branches b where b.id = product_stock.branch_id
    and b.company_id = (select public.current_company_id())
    and (select public.current_role()) in ('gerente','vendedor','operario')));
create policy product_stock_update on product_stock for update
  using (exists (select 1 from branches b where b.id = product_stock.branch_id
    and b.company_id = (select public.current_company_id())
    and (select public.current_role()) in ('gerente','vendedor','operario')));
create policy product_stock_delete on product_stock for delete
  using (exists (select 1 from branches b where b.id = product_stock.branch_id
    and b.company_id = (select public.current_company_id())
    and (select public.current_role()) = 'gerente'));

-- ============ customers ============
drop policy if exists customers_all_access on customers;
create policy customers_select on customers for select
  using (company_id = (select public.current_company_id()) or public.is_platform_admin());
create policy customers_insert on customers for insert
  with check (company_id = (select public.current_company_id()) and (select public.current_role()) in ('gerente','vendedor','operario'));
create policy customers_update on customers for update
  using (company_id = (select public.current_company_id()) and (select public.current_role()) in ('gerente','vendedor','operario'));
create policy customers_delete on customers for delete
  using (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente');

-- ============ invoices (sin DELETE: una factura se anula, no se borra) ============
drop policy if exists invoices_all_access on invoices;
drop policy if exists read_invoices on invoices;
create policy invoices_select on invoices for select
  using (company_id = (select public.current_company_id()) or public.is_platform_admin());
create policy invoices_insert on invoices for insert
  with check (company_id = (select public.current_company_id()) and (select public.current_role()) in ('gerente','vendedor','operario'));
create policy invoices_update on invoices for update
  using (company_id = (select public.current_company_id()) and (select public.current_role()) in ('gerente','vendedor','operario'));

-- ============ invoice_details (sin company_id, se escala vía invoices; sin DELETE) ============
drop policy if exists invoice_details_all_access on invoice_details;
create policy invoice_details_select on invoice_details for select
  using (exists (select 1 from invoices i where i.id = invoice_details.invoice_id
    and (i.company_id = (select public.current_company_id()) or public.is_platform_admin())));
create policy invoice_details_insert on invoice_details for insert
  with check (exists (select 1 from invoices i where i.id = invoice_details.invoice_id
    and i.company_id = (select public.current_company_id())
    and (select public.current_role()) in ('gerente','vendedor','operario')));
create policy invoice_details_update on invoice_details for update
  using (exists (select 1 from invoices i where i.id = invoice_details.invoice_id
    and i.company_id = (select public.current_company_id())
    and (select public.current_role()) in ('gerente','vendedor','operario')));

-- ============ billing_configs ============
drop policy if exists billing_configs_all_access on billing_configs;
create policy billing_configs_select on billing_configs for select
  using (company_id = (select public.current_company_id()) or public.is_platform_admin());
create policy billing_configs_insert on billing_configs for insert
  with check (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente');
create policy billing_configs_update on billing_configs for update
  using (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente');
