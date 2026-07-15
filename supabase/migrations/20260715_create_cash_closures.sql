-- Cierre de caja / arqueo. Un cierre es un registro único e inmutable: se
-- calcula lo esperado (facturas del cajero/POS desde el último cierre) y se
-- guarda lo contado + la diferencia en el mismo insert - no hay un paso
-- "abrir caja" separado en esta fase (el estado siempre nace 'cerrado'), la
-- columna status queda igual por si a futuro se agrega un flujo de apertura.
create table public.cash_closures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  branch_id uuid not null references public.branches(id),
  point_of_sale_id uuid not null references public.point_of_sales(id),
  user_id uuid not null references public.users(id),
  opened_at timestamptz not null,
  closed_at timestamptz not null default now(),
  expected_totals jsonb not null,
  counted_totals jsonb not null,
  difference jsonb not null,
  notes text,
  status text not null default 'cerrado' check (status in ('abierto', 'cerrado')),
  created_at timestamptz not null default now()
);

create index idx_cash_closures_company on public.cash_closures(company_id);
create index idx_cash_closures_user on public.cash_closures(user_id);
create index idx_cash_closures_branch on public.cash_closures(branch_id);
create index idx_cash_closures_pos on public.cash_closures(point_of_sale_id);

alter table public.cash_closures enable row level security;

-- Cajero: inserta y lee SOLO los suyos.
create policy cash_closures_cashier_select on public.cash_closures for select
  using (user_id = auth.uid());
create policy cash_closures_cashier_insert on public.cash_closures for insert
  with check (
    user_id = auth.uid()
    and company_id = (select public.current_company_id())
    and (select public.current_role()) in ('vendedor', 'operario')
  );

-- Gerente: lee todos los de su empresa.
create policy cash_closures_manager_select on public.cash_closures for select
  using (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente');

-- Contador: SELECT únicamente, todos los de su empresa.
create policy cash_closures_accountant_select on public.cash_closures for select
  using (company_id = (select public.current_company_id()) and (select public.current_role()) = 'contador');

-- Admin (soporte): SELECT de cualquier empresa, igual que el resto de las
-- tablas operativas desde la Fase 0.
create policy cash_closures_admin_select on public.cash_closures for select
  using (public.is_platform_admin());

-- Sin política de UPDATE ni DELETE para ningún rol: un cierre registrado es
-- inmutable a propósito (criterio de aceptación de esta fase). Correcciones
-- se hacen como nota en un cierre nuevo, no editando el viejo.
