-- ============================================================================
-- Compras Fase 1 — Modelo de datos: proveedores, catálogo de retenciones,
-- compras + detalle + retenciones, cuentas por pagar + pagos.
--
-- Espejo del lado de Ventas: mismo patrón de RLS (SELECT por empresa vía
-- current_company_id()/is_platform_admin(), escritura restringida por rol
-- vía current_role()), mismos helpers reutilizados sin duplicar (ver notas
-- puntuales abajo).
--
-- Desviaciones deliberadas respecto al pedido original, justificadas:
--
-- 1. purchase_retentions gana 3 columnas no listadas en el pedido:
--    point_of_sale_id, signed_xml, sri_response_message. La Fase 4 pide
--    reutilizar get_next_document_sequential(p_point_of_sale_id, p_doc_type)
--    para numerar el comprobante de retención - esa función exige un punto
--    de emisión, y purchases no tiene uno (solo branch_id, nullable). El
--    punto de emisión de la retención se resuelve al momento de emitirla
--    (Fase 4), no al registrar la compra - vive en purchase_retentions, no
--    en purchases. signed_xml y sri_response_message espejan exactamente
--    invoices.signed_xml/sri_response_message - la Fase 4 los necesita para
--    el RIDE y para mostrar el motivo si el SRI rechaza, y agregarlos ahora
--    es gratis comparado con un ALTER TABLE después.
--
-- 2. UNIQUE(company_id, supplier_id, supplier_document_number) en purchases:
--    no pedido explícitamente, pero previene el error real más común de
--    este tipo de registro manual (cargar el mismo comprobante del
--    proveedor dos veces). Mismo espíritu que el fix de unicidad de
--    invoice_number en la Fase 2 de Ventas.
--
-- 3. accounts_payable.status NO incluye 'vencida' como valor almacenado.
--    Guardar un cuarto estado que depende de now() (no de un evento real)
--    es exactamente el patrón que ya causó un bug real en este proyecto
--    (companies.monthly_comprobantes, Fase 4 de Ventas - un contador que se
--    desincroniza porque nada dispara su actualización cuando el tiempo
--    pasa solo). "Vencida" se calcula en la consulta (status IN
--    ('pendiente','parcial') AND due_date < CURRENT_DATE), nunca se
--    almacena - así nunca puede quedar desincronizado. El status
--    ALMACENADO (pendiente/parcial/pagada) sí es un evento real: lo
--    actualiza el trigger de abajo cada vez que se inserta un pago.
--
-- 4. document_date/due_date son `date`, no `timestamp without time zone`.
--    Son conceptos de fecha calendario, no de instante - usar `date`
--    evita por completo la clase de bug de timezone documentada en
--    AUDITORIA_SISTEMA.md #10 (no hay hora que interpretar mal).
--
-- 5. retention_concepts es un catálogo GLOBAL (sin company_id), no por
--    empresa - el porcentaje de retención lo define la ley ecuatoriana
--    (Tabla de porcentajes del SRI), no cada empresa; "editable por
--    gerente" se resuelve dejando que cualquier gerente actualice el
--    catálogo compartido cuando el SRI emite una resolución nueva, igual
--    de simple que payment_methods/feature_flags pero con escritura
--    habilitada en vez de solo lectura.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. suppliers
-- ----------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  ruc varchar(13) not null,
  razon_social varchar not null,
  nombre_comercial varchar,
  direccion text,
  telefono varchar,
  email varchar,
  tipo_contribuyente text not null check (tipo_contribuyente in ('persona_natural','sociedad','rimpe')),
  is_active boolean not null default true,
  created_at timestamp without time zone default CURRENT_TIMESTAMP,
  updated_at timestamp without time zone default CURRENT_TIMESTAMP,
  unique (company_id, ruc)
);

create index idx_suppliers_company on public.suppliers(company_id);

create trigger suppliers_set_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();

alter table public.suppliers enable row level security;

create policy suppliers_select on public.suppliers for select
  using (company_id = (select public.current_company_id()) or public.is_platform_admin());

create policy suppliers_insert on public.suppliers for insert
  with check (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente');

create policy suppliers_update on public.suppliers for update
  using (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente');

-- ----------------------------------------------------------------------------
-- 2. retention_concepts — catálogo global (ver nota 5 arriba)
-- ----------------------------------------------------------------------------
create table public.retention_concepts (
  id uuid primary key default gen_random_uuid(),
  codigo_sri varchar not null unique,
  descripcion text not null,
  porcentaje_renta_sugerido numeric not null default 0,
  aplica_iva boolean not null default false,
  porcentaje_iva_sugerido numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamp without time zone default CURRENT_TIMESTAMP,
  updated_at timestamp without time zone default CURRENT_TIMESTAMP
);

create trigger retention_concepts_set_updated_at before update on public.retention_concepts
  for each row execute function public.set_updated_at();

alter table public.retention_concepts enable row level security;

create policy retention_concepts_select on public.retention_concepts for select using (true);

create policy retention_concepts_insert on public.retention_concepts for insert
  with check ((select public.current_role()) = 'gerente');

create policy retention_concepts_update on public.retention_concepts for update
  using ((select public.current_role()) = 'gerente');

-- ----------------------------------------------------------------------------
-- 3. purchases
-- ----------------------------------------------------------------------------
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  branch_id uuid references public.branches(id),
  supplier_id uuid not null references public.suppliers(id),
  purchase_doc_type text not null check (purchase_doc_type in ('factura_compra','liquidacion_compra','nota_venta')),
  supplier_document_number varchar not null,
  supplier_access_key varchar(49),
  document_date date not null,
  subtotal_0 numeric not null default 0,
  subtotal_iva numeric not null default 0,
  iva_amount numeric not null default 0,
  total numeric not null,
  status text not null default 'registrada' check (status in ('registrada','anulada')),
  source text not null default 'manual' check (source in ('manual','xml_import')),
  xml_file_path text,
  created_by uuid not null references public.users(id),
  created_at timestamp without time zone default CURRENT_TIMESTAMP,
  updated_at timestamp without time zone default CURRENT_TIMESTAMP,
  unique (company_id, supplier_id, supplier_document_number)
);

create index idx_purchases_company on public.purchases(company_id);
create index idx_purchases_supplier on public.purchases(supplier_id);

create trigger purchases_set_updated_at before update on public.purchases
  for each row execute function public.set_updated_at();

alter table public.purchases enable row level security;

create policy purchases_select on public.purchases for select
  using (company_id = (select public.current_company_id()) or public.is_platform_admin());

create policy purchases_insert on public.purchases for insert
  with check (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente');

create policy purchases_update on public.purchases for update
  using (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente');

-- ----------------------------------------------------------------------------
-- 4. purchase_details
-- ----------------------------------------------------------------------------
create table public.purchase_details (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  description text not null,
  quantity numeric not null,
  unit_price numeric not null,
  discount numeric not null default 0,
  iva_rate numeric not null default 0,
  subtotal numeric not null,
  created_at timestamp without time zone default CURRENT_TIMESTAMP
);

create index idx_purchase_details_purchase on public.purchase_details(purchase_id);

alter table public.purchase_details enable row level security;

create policy purchase_details_select on public.purchase_details for select
  using (exists (
    select 1 from public.purchases p
    where p.id = purchase_details.purchase_id
      and (p.company_id = (select public.current_company_id()) or public.is_platform_admin())
  ));

create policy purchase_details_insert on public.purchase_details for insert
  with check (exists (
    select 1 from public.purchases p
    where p.id = purchase_details.purchase_id
      and p.company_id = (select public.current_company_id())
      and (select public.current_role()) = 'gerente'
  ));

create policy purchase_details_update on public.purchase_details for update
  using (exists (
    select 1 from public.purchases p
    where p.id = purchase_details.purchase_id
      and p.company_id = (select public.current_company_id())
      and (select public.current_role()) = 'gerente'
  ));

-- ----------------------------------------------------------------------------
-- 5. purchase_retentions (ver notas 1 arriba sobre las 3 columnas agregadas)
-- ----------------------------------------------------------------------------
create table public.purchase_retentions (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  retention_type text not null check (retention_type in ('iva','renta')),
  retention_concept_id uuid not null references public.retention_concepts(id),
  retention_percentage numeric not null,
  retention_base numeric not null,
  retention_amount numeric not null,
  retention_sri_status text not null default 'pendiente' check (retention_sri_status in ('pendiente','autorizada','devuelta')),
  retention_access_key varchar(49),
  retention_authorization_number varchar,
  point_of_sale_id uuid references public.point_of_sales(id),
  signed_xml text,
  sri_response_message text,
  created_at timestamp without time zone default CURRENT_TIMESTAMP,
  updated_at timestamp without time zone default CURRENT_TIMESTAMP
);

create index idx_purchase_retentions_purchase on public.purchase_retentions(purchase_id);

create trigger purchase_retentions_set_updated_at before update on public.purchase_retentions
  for each row execute function public.set_updated_at();

alter table public.purchase_retentions enable row level security;

create policy purchase_retentions_select on public.purchase_retentions for select
  using (exists (
    select 1 from public.purchases p
    where p.id = purchase_retentions.purchase_id
      and (p.company_id = (select public.current_company_id()) or public.is_platform_admin())
  ));

create policy purchase_retentions_insert on public.purchase_retentions for insert
  with check (exists (
    select 1 from public.purchases p
    where p.id = purchase_retentions.purchase_id
      and p.company_id = (select public.current_company_id())
      and (select public.current_role()) = 'gerente'
  ));

create policy purchase_retentions_update on public.purchase_retentions for update
  using (exists (
    select 1 from public.purchases p
    where p.id = purchase_retentions.purchase_id
      and p.company_id = (select public.current_company_id())
      and (select public.current_role()) = 'gerente'
  ));

-- ----------------------------------------------------------------------------
-- 6. accounts_payable — status solo lo toca el trigger de abajo, nunca un
--    UPDATE directo (por eso no hay política de UPDATE para ningún rol,
--    igual que inventory_movements con las RPCs de Fase 6 de Ventas).
-- ----------------------------------------------------------------------------
create table public.accounts_payable (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null unique references public.purchases(id),
  company_id uuid not null references public.companies(id),
  supplier_id uuid not null references public.suppliers(id),
  original_amount numeric not null,
  due_date date,
  status text not null default 'pendiente' check (status in ('pendiente','parcial','pagada')),
  created_at timestamp without time zone default CURRENT_TIMESTAMP
);

create index idx_accounts_payable_company on public.accounts_payable(company_id);
create index idx_accounts_payable_supplier on public.accounts_payable(supplier_id);

alter table public.accounts_payable enable row level security;

create policy accounts_payable_select on public.accounts_payable for select
  using (company_id = (select public.current_company_id()) or public.is_platform_admin());

create policy accounts_payable_insert on public.accounts_payable for insert
  with check (company_id = (select public.current_company_id()) and (select public.current_role()) = 'gerente');

-- ----------------------------------------------------------------------------
-- 7. accounts_payable_payments — inmutable (sin UPDATE/DELETE para nadie),
--    mismo patrón que cash_closures. Un pago negativo es una reversa
--    explícita, no un error.
-- ----------------------------------------------------------------------------
create table public.accounts_payable_payments (
  id uuid primary key default gen_random_uuid(),
  accounts_payable_id uuid not null references public.accounts_payable(id),
  amount numeric not null check (amount <> 0),
  payment_method_id uuid not null references public.payment_methods(id),
  payment_date date not null default CURRENT_DATE,
  notes text,
  created_by uuid not null references public.users(id),
  created_at timestamp without time zone default CURRENT_TIMESTAMP
);

create index idx_accounts_payable_payments_ap on public.accounts_payable_payments(accounts_payable_id);

alter table public.accounts_payable_payments enable row level security;

create policy accounts_payable_payments_select on public.accounts_payable_payments for select
  using (exists (
    select 1 from public.accounts_payable ap
    where ap.id = accounts_payable_payments.accounts_payable_id
      and (ap.company_id = (select public.current_company_id()) or public.is_platform_admin())
  ));

create policy accounts_payable_payments_insert on public.accounts_payable_payments for insert
  with check (exists (
    select 1 from public.accounts_payable ap
    where ap.id = accounts_payable_payments.accounts_payable_id
      and ap.company_id = (select public.current_company_id())
      and (select public.current_role()) = 'gerente'
  ));

-- Único camino para que accounts_payable.status cambie - recalcula desde la
-- suma real de pagos cada vez, nunca incrementa/decrementa a mano (mismo
-- principio que adjust_product_stock en Fase 6 de Ventas: recompute desde
-- la fuente de verdad, no arrastres un contador).
create or replace function public.update_accounts_payable_status()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $function$
DECLARE
  v_original numeric;
  v_total_paid numeric;
BEGIN
  SELECT original_amount INTO v_original FROM public.accounts_payable WHERE id = NEW.accounts_payable_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM public.accounts_payable_payments WHERE accounts_payable_id = NEW.accounts_payable_id;

  UPDATE public.accounts_payable
  SET status = CASE
    WHEN v_total_paid >= v_original THEN 'pagada'
    WHEN v_total_paid > 0 THEN 'parcial'
    ELSE 'pendiente'
  END
  WHERE id = NEW.accounts_payable_id;

  RETURN NEW;
END;
$function$;

create trigger trg_update_accounts_payable_status
  after insert on public.accounts_payable_payments
  for each row execute function public.update_accounts_payable_status();

-- Defensa en profundidad (lección de Fase 6 de Ventas, AUDITORIA_SISTEMA.md
-- hallazgo #12): revocar explícito de anon/authenticated - aunque esta
-- función de trigger no sea realmente explotable fuera de un trigger real
-- (NEW no existe en ese contexto), es más barato revocar que confiar en
-- que el runtime error sea siempre inofensivo. Verificado con
-- has_function_privilege('anon', ...) = false tras este revoke.
revoke all on function public.update_accounts_payable_status() from public, anon, authenticated;
