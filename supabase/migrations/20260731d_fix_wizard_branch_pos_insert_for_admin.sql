-- Bug real encontrado investigando la Fase 8 de Mejoras Admin: CompanyWizard.jsx
-- crea la sucursal y el punto de venta ANTES de crear el gerente (con la
-- sesión del propio admin, que todavía no es 'gerente' de esa empresa) - las
-- políticas branches_insert/point_of_sales_insert exigían current_role() =
-- 'gerente' sin excepción, así que el alta de una empresa nueva se cortaba
-- ahí con "new row violates row-level security policy", dejando la fila de
-- companies ya creada pero sin sucursal/POS/gerente. Reproducido con datos
-- reales antes de este fix. Mismo patrón que companies_insert (is_platform_admin()
-- como alternativa al chequeo de rol de empresa).
drop policy branches_insert on public.branches;
create policy branches_insert on public.branches for insert
  with check (
    (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente')
    or public.is_platform_admin()
  );

drop policy point_of_sales_insert on public.point_of_sales;
create policy point_of_sales_insert on public.point_of_sales for insert
  with check (
    (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente')
    or public.is_platform_admin()
  );
