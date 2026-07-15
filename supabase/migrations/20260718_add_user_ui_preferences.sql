-- Fase 4 de personalización visual: modo claro/oscuro del panel (gerente y
-- contador), como preferencia PERSONAL guardada en la propia fila del
-- usuario - no depende del rol (a diferencia de companies.ui_settings, que
-- solo gerente puede tocar).
--
-- Se verificó ANTES de escribir esto que una política RLS directa de UPDATE
-- (using/with check: id = auth.uid()) NO alcanza para restringir a solo esta
-- columna: information_schema.role_table_grants confirma que "authenticated"
-- ya tiene UPDATE de TABLA COMPLETA otorgado sobre public.users (probablemente
-- del bootstrap original del schema), y hoy eso está inerte solo porque no
-- existe ninguna política de UPDATE. En cuanto se agregue una política de
-- UPDATE (sin importar cuán acotada esté su USING), ese grant amplio
-- permitiría reescribir CUALQUIER columna de la propia fila - incluida
-- "role". Se necesitaría revocar ese grant amplio y otorgar uno column-level
-- para hacerlo seguro con política directa; se prefiere la RPC angosta
-- (mismo patrón que set_company_ui_settings) por ser más simple de auditar y
-- consistente con el resto del proyecto.

alter table public.users
  add column ui_preferences jsonb not null default '{"panel_mode": "light"}'::jsonb;

-- Backfill: todos los usuarios existentes (cualquier rol) quedan en "dark"
-- para que su panel se vea idéntico a hoy - "light" es el default de fábrica
-- solo para usuarios creados de ahora en adelante.
update public.users
set ui_preferences = '{"panel_mode": "dark"}'::jsonb;

create or replace function public.set_ui_preferences(p_panel_mode text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_panel_mode NOT IN ('light', 'dark') THEN
    RAISE EXCEPTION 'Modo de panel no válido: %', p_panel_mode;
  END IF;

  UPDATE users
  SET ui_preferences = jsonb_build_object('panel_mode', p_panel_mode)
  WHERE id = auth.uid()
  RETURNING ui_preferences INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  RETURN v_result;
END;
$function$;

revoke all on function public.set_ui_preferences(text) from public;
grant execute on function public.set_ui_preferences(text) to authenticated;
