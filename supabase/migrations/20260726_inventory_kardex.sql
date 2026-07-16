-- Fase 6: Movimientos de inventario / Kardex.
--
-- inventory_movements ya existía (la Fase 2 insertaba ahí el reingreso de
-- stock por nota de crédito) pero: (a) no tenía branch_id - imposible saber
-- DE QUÉ sucursal era un movimiento en una empresa multi-sucursal -, y (b)
-- tenía RLS habilitado sin ninguna política, es decir bloqueo total desde el
-- cliente (ni lectura). Confirmado 0 filas existentes antes de este cambio -
-- agregar branch_id NOT NULL no requiere backfill.
alter table public.inventory_movements
  add column if not exists branch_id uuid references public.branches(id);

alter table public.inventory_movements
  alter column branch_id set not null;

-- Vocabulario cerrado de tipos de movimiento - defensa en profundidad además
-- del chequeo que ya hace adjust_product_stock, por si alguna vez alguien
-- inserta directo con una llave elevada.
alter table public.inventory_movements
  add constraint inventory_movements_type_check
  check (movement_type in ('venta','nota_credito_reingreso','ajuste_manual','transferencia_salida','transferencia_entrada'));

create index if not exists idx_inventory_movements_product_branch
  on public.inventory_movements(product_id, branch_id, created_at);

create index if not exists idx_inventory_movements_company_date
  on public.inventory_movements(company_id, created_at desc);

-- Solo lectura desde el cliente, alcance de empresa (mismo criterio que ya
-- usa product_stock_select) - la escritura es exclusivamente vía las
-- funciones SECURITY DEFINER de abajo, nunca INSERT/UPDATE/DELETE directo
-- desde el navegador (por eso no hay política de escritura: deny-by-default).
create policy inventory_movements_select on public.inventory_movements
  for select using (
    company_id = (select public.current_company_id()) or public.is_platform_admin()
  );

-- Único camino para tocar product_stock.quantity a partir de esta migración
-- (reemplaza los upserts sueltos de decrementProductStock/restockProduct,
-- que dejaban el kardex desincronizado de la cantidad real porque nada
-- garantizaba que ambos pasos - mover el stock y loguear el movimiento -
-- ocurrieran juntos). Usa INSERT...ON CONFLICT DO NOTHING + SELECT...FOR
-- UPDATE para garantizar una fila bloqueable incluso en el primer movimiento
-- histórico de un producto/sucursal, evitando la carrera de "leo, calculo,
-- escribo" en dos pasos separados que tenía el código anterior.
--
-- Si el p_delta pedido haría bajar el stock de 0, se recorta (GREATEST) -
-- pero SIEMPRE se registra el delta REALMENTE aplicado, nunca el
-- solicitado, así la suma del kardex nunca diverge de product_stock.
--
-- p_acting_user_id: el reingreso de stock por nota de crédito corre con
-- service_role (sin JWT, auth.uid() IS NULL) pero necesita dejar registrado
-- QUIÉN disparó la acción - la función solo usa este override cuando no hay
-- sesión real (v_caller_id IS NULL); un usuario autenticado nunca puede
-- usarlo para hacerse pasar por otro, porque su propio auth.uid() real
-- siempre gana.
--
-- IMPORTANTE (lección aprendida durante esta misma fase): "revoke all ...
-- from public" NO le quita a anon/authenticated el EXECUTE que Supabase
-- concede por defecto a nivel de schema a esos dos roles directamente -
-- confirmado con has_function_privilege(). Por eso el revoke de abajo nombra
-- "anon" explícitamente, no solo "public".
create or replace function public.adjust_product_stock(
  p_product_id uuid,
  p_branch_id uuid,
  p_delta numeric,
  p_movement_type varchar,
  p_reference_id uuid default null,
  p_reference_type varchar default null,
  p_notes text default null,
  p_acting_user_id uuid default null
)
returns table(new_quantity integer, applied_delta numeric)
language plpgsql security definer
set search_path = public, pg_temp
as $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_movement_user_id uuid;
  v_caller_role public.user_role;
  v_caller_company_id uuid;
  v_product_company_id uuid;
  v_current integer;
  v_applied numeric;
  v_new integer;
BEGIN
  IF p_movement_type NOT IN ('venta','nota_credito_reingreso','ajuste_manual','transferencia_salida','transferencia_entrada') THEN
    RAISE EXCEPTION 'Tipo de movimiento inválido: %', p_movement_type;
  END IF;

  SELECT company_id INTO v_product_company_id FROM public.products WHERE id = p_product_id;
  IF v_product_company_id IS NULL THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND company_id = v_product_company_id) THEN
    RAISE EXCEPTION 'La sucursal no pertenece a la empresa del producto';
  END IF;

  IF v_caller_id IS NOT NULL THEN
    SELECT role, company_id INTO v_caller_role, v_caller_company_id
    FROM public.users WHERE id = v_caller_id AND is_active = true;

    IF v_caller_company_id IS DISTINCT FROM v_product_company_id THEN
      RAISE EXCEPTION 'No autorizado para modificar el inventario de otra empresa';
    END IF;

    IF p_movement_type = 'venta' THEN
      IF v_caller_role NOT IN ('gerente','vendedor','operario') THEN
        RAISE EXCEPTION 'No autorizado para registrar una venta de inventario';
      END IF;
    ELSE
      IF v_caller_role <> 'gerente' THEN
        RAISE EXCEPTION 'Solo un gerente puede realizar este tipo de movimiento de inventario';
      END IF;
    END IF;
  END IF;
  -- v_caller_id IS NULL: llamado con service_role (reingreso de stock por
  -- nota de crédito autorizada, ver api/sri/_creditNoteEffects.js) - el JWT
  -- del usuario que disparó la acción ya se validó del lado del endpoint
  -- antes de llegar acá; no hay auth.uid() real que chequear en ese contexto.

  v_movement_user_id := COALESCE(v_caller_id, p_acting_user_id);

  INSERT INTO public.product_stock (product_id, branch_id, quantity, min_stock)
  VALUES (p_product_id, p_branch_id, 0, 0)
  ON CONFLICT (product_id, branch_id) DO NOTHING;

  SELECT quantity INTO v_current FROM public.product_stock
  WHERE product_id = p_product_id AND branch_id = p_branch_id
  FOR UPDATE;

  v_applied := GREATEST(p_delta, -v_current);
  v_new := v_current + v_applied;

  UPDATE public.product_stock SET quantity = v_new, updated_at = now()
  WHERE product_id = p_product_id AND branch_id = p_branch_id;

  INSERT INTO public.inventory_movements
    (company_id, product_id, branch_id, movement_type, quantity, reference_id, reference_type, user_id, notes)
  VALUES
    (v_product_company_id, p_product_id, p_branch_id, p_movement_type, v_applied, p_reference_id, p_reference_type, v_movement_user_id, p_notes);

  RETURN QUERY SELECT v_new, v_applied;
END;
$function$;

revoke all on function public.adjust_product_stock(uuid,uuid,numeric,varchar,uuid,varchar,text,uuid) from public, anon;
grant execute on function public.adjust_product_stock(uuid,uuid,numeric,varchar,uuid,varchar,text,uuid) to authenticated;

-- Transferencia atómica entre sucursales: dos movimientos (salida/entrada)
-- comparten un mismo transfer_id como reference_id. Si la sucursal de
-- origen no tiene stock suficiente, adjust_product_stock recorta la salida
-- y esta función lo detecta y aborta - el ROLLBACK de la transacción
-- deshace también la salida ya aplicada, nunca queda una transferencia a
-- medias. gen_random_uuid() (no uuid_generate_v4(), que vive en el schema
-- "extensions" y no está en el search_path restringido de esta función) -
-- ya es el default de product_stock.id, es la convención más nueva del
-- proyecto y no depende de ninguna extensión externa.
create or replace function public.transfer_stock(
  p_product_id uuid,
  p_from_branch_id uuid,
  p_to_branch_id uuid,
  p_quantity numeric,
  p_notes text default null
)
returns table(transfer_id uuid, from_new_quantity integer, to_new_quantity integer)
language plpgsql security definer
set search_path = public, pg_temp
as $function$
DECLARE
  v_transfer_id uuid := gen_random_uuid();
  v_out record;
  v_in record;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'La cantidad a transferir debe ser mayor a 0';
  END IF;
  IF p_from_branch_id = p_to_branch_id THEN
    RAISE EXCEPTION 'La sucursal de origen y destino no pueden ser la misma';
  END IF;

  SELECT * INTO v_out FROM public.adjust_product_stock(
    p_product_id, p_from_branch_id, -p_quantity, 'transferencia_salida',
    v_transfer_id, 'transfer', p_notes
  );

  IF abs(v_out.applied_delta) < p_quantity THEN
    RAISE EXCEPTION 'Stock insuficiente en la sucursal de origen para transferir % unidades', p_quantity;
  END IF;

  SELECT * INTO v_in FROM public.adjust_product_stock(
    p_product_id, p_to_branch_id, p_quantity, 'transferencia_entrada',
    v_transfer_id, 'transfer', p_notes
  );

  RETURN QUERY SELECT v_transfer_id, v_out.new_quantity, v_in.new_quantity;
END;
$function$;

revoke all on function public.transfer_stock(uuid,uuid,uuid,numeric,text) from public, anon;
grant execute on function public.transfer_stock(uuid,uuid,uuid,numeric,text) to authenticated;

-- El contador ya podía leer productos (products.read); ahora también ve el
-- Kardex de inventario (solo lectura - inventory.write sigue siendo
-- exclusivo de gerente, así que la UI no le muestra ningún botón de
-- escritura a un contador aunque ahora entre a la página de Inventario).
insert into public.role_permissions (role, permission_id)
select 'contador'::user_role, id from public.permissions where name = 'inventory.read'
on conflict on constraint role_permissions_role_permission_id_key do nothing;
