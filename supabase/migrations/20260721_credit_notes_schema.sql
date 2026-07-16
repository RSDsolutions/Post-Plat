-- Fase 2: Nota de crédito (anulación fiscal real).
--
-- 1. document_sequentials: el secuencial SRI es independiente POR TIPO DE
-- DOCUMENTO (01=factura, 04=nota_credito...) - point_of_sales.sequential_current
-- es (y sigue siendo) solo el de facturas. Se crea un mecanismo general,
-- nuevo, para cualquier tipo de documento que no sea factura, con
-- incremento atómico vía UPSERT (INSERT ... ON CONFLICT DO UPDATE
-- ... RETURNING es atómico por construcción en Postgres, sin necesidad de
-- SELECT ... FOR UPDATE explícito).
--
-- Decisión (autorizada por la spec: "migra el secuencial de facturas al
-- mismo mecanismo solo si puedes hacerlo sin riesgo; si no, déjalo y
-- documenta la asimetría"): NO se migra el secuencial de facturas a este
-- mecanismo en esta fase. Migrarlo requeriría (a) sembrar document_sequentials
-- con el valor actual de sequential_current de cada punto de venta ya en uso
-- por clientes reales (FARMACIA CRUZ AZUL incluida) sin desalinear la
-- numeración ante el SRI, y (b) tocar getNextPosSequential(), que corre en
-- el flujo de venta del POS en vivo - el mismo código que ya está en
-- producción. El riesgo de romper ventas reales para ganar atomicidad en un
-- código que hoy funciona no se justifica dentro de esta fase. Las notas de
-- crédito nacen directamente con el mecanismo atómico nuevo, sin ese riesgo
-- (es secuencial nuevo, sin historial que migrar).
create table if not exists public.document_sequentials (
  point_of_sale_id uuid not null references public.point_of_sales(id) on delete cascade,
  doc_type text not null check (doc_type in ('nota_credito', 'nota_debito', 'comprobante_retencion')),
  current_sequential integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (point_of_sale_id, doc_type)
);

alter table public.document_sequentials enable row level security;

create policy document_sequentials_select on public.document_sequentials
  for select using (
    exists (
      select 1 from point_of_sales pos
      where pos.id = document_sequentials.point_of_sale_id
        and pos.company_id = current_company_id()
    ) or is_platform_admin()
  );

create or replace function public.get_next_document_sequential(p_point_of_sale_id uuid, p_doc_type text)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $function$
DECLARE
  v_next integer;
BEGIN
  -- Solo gerente/admin emiten estos documentos (ver credit_notes.create más
  -- abajo) - el punto de venta debe existir y pertenecer a la empresa del
  -- caller, igual que valida submit-credit-note.js antes de llegar acá.
  IF NOT EXISTS (
    SELECT 1 FROM point_of_sales pos
    WHERE pos.id = p_point_of_sale_id AND pos.company_id = current_company_id()
  ) THEN
    RAISE EXCEPTION 'Punto de venta no encontrado en esta empresa';
  END IF;

  INSERT INTO document_sequentials (point_of_sale_id, doc_type, current_sequential)
  VALUES (p_point_of_sale_id, p_doc_type, 1)
  ON CONFLICT (point_of_sale_id, doc_type)
  DO UPDATE SET current_sequential = document_sequentials.current_sequential + 1, updated_at = now()
  RETURNING current_sequential INTO v_next;

  RETURN v_next;
END;
$function$;

revoke all on function public.get_next_document_sequential(uuid, text) from public;
grant execute on function public.get_next_document_sequential(uuid, text) to authenticated;

-- 2. Nota de crédito vive en invoices con invoice_type='nota_credito' (el
-- enum ya lo contempla) - modified_invoice_id apunta a la factura que anula/
-- corrige, credit_note_reason es el motivo obligatorio de la UI.
alter table public.invoices
  add column if not exists modified_invoice_id uuid references public.invoices(id),
  add column if not exists credit_note_reason text;

create index if not exists idx_invoices_modified_invoice_id on public.invoices(modified_invoice_id) where modified_invoice_id is not null;

-- 3. Permiso nuevo, solo gerente (mismo patrón que invoices.approve/void -
-- ver 20260715_add_invoice_approve_void_permissions.sql).
insert into public.permissions (name, description)
values ('credit_notes.create', 'Emitir una nota de crédito sobre una factura autorizada')
on conflict (name) do nothing;

insert into public.role_permissions (role, permission_id)
select 'gerente'::user_role, id from public.permissions where name = 'credit_notes.create'
on conflict do nothing;
