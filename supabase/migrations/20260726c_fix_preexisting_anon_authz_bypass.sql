-- Hallazgo de seguridad pre-existente (fuera del alcance de Fase 6, pero
-- encontrado al verificar con has_function_privilege() por el mismo motivo
-- que obligó a corregir adjust_product_stock/transfer_stock: "revoke all
-- ... from public" NO alcanza a anon/authenticated, que Supabase concede
-- EXECUTE por defecto a nivel de schema en cada función nueva - un gap que
-- venía de fases anteriores de este mismo proyecto, no solo de Fase 6.

-- admin_reset_user_password: su único llamador real (api/admin/users.js)
-- usa el service_role client después de validar el JWT con
-- getAuthenticatedUser() - auth.uid() es NULL en ese contexto, así que la
-- función no puede (ni debe) validar p_admin_id contra auth.uid(). Debe ser
-- alcanzable SOLO por service_role - se revoca explícitamente de anon Y
-- authenticated (antes solo estaba revocada de "public", que no los
-- cubre), igual que ya estaba correctamente hecho en admin_set_user_active.
revoke all on function public.admin_reset_user_password(uuid,uuid,uuid) from public, anon, authenticated;

-- update_user_branch: a diferencia de la anterior, ESTA sí se llama directo
-- desde el navegador con la sesión real del gerente (UserManagement.jsx ->
-- updateUserBranch() en supabaseHelpers.js), así que authenticated debe
-- conservar EXECUTE. Pero p_caller_id era un parámetro que el propio
-- llamador simplemente afirmaba, sin verificar contra auth.uid() - un
-- usuario autenticado cualquiera podía pasar el UUID de un gerente ajeno y
-- reasignar la sucursal de cualquier cajero. Se agrega el chequeo
-- (equivalente al que ya tiene set_company_ui_settings) y se revoca anon,
-- que nunca tuvo caso de uso legítimo acá.
create or replace function public.update_user_branch(
  p_company_id uuid,
  p_user_id uuid,
  p_branch_id uuid,
  p_caller_id uuid
)
returns table(id uuid, name character varying, branch_id uuid)
language plpgsql security definer
set search_path = public, pg_temp
as $function$
BEGIN
  IF p_caller_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado para reasignar usuarios de esta empresa';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users c WHERE c.id = p_caller_id AND c.is_active = true
      AND (c.role = 'admin' OR (c.role = 'gerente' AND c.company_id = p_company_id))
  ) THEN
    RAISE EXCEPTION 'No autorizado para reasignar usuarios de esta empresa';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = p_branch_id AND b.company_id = p_company_id) THEN
    RAISE EXCEPTION 'La sucursal indicada no pertenece a esta empresa';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = p_user_id AND u.company_id = p_company_id AND u.role IN ('operario', 'vendedor')
  ) THEN
    RAISE EXCEPTION 'Usuario no encontrado en esta empresa';
  END IF;

  RETURN QUERY
  UPDATE users
  SET branch_id = p_branch_id
  WHERE users.id = p_user_id AND users.company_id = p_company_id
  RETURNING users.id, users.name, users.branch_id;
END;
$function$;

revoke all on function public.update_user_branch(uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.update_user_branch(uuid,uuid,uuid,uuid) to authenticated;

-- verify_admin_password: función muerta confirmada (cero referencias en
-- src/ ni api/, y ninguna otra función la invoca internamente - el login
-- real usa supabase.auth.signInWithPassword desde la migración de la Fase
-- 0, admin_users nunca se conectó a Supabase Auth). Viva y alcanzable por
-- anon era un oráculo de fuerza bruta de contraseñas sin ningún rate-limit
-- (a diferencia del login real, que sí pasa por Auth). Se elimina la
-- función; la tabla admin_users se deja intacta, igual que decidió la Fase
-- 0 - no es parte de este cambio.
drop function if exists public.verify_admin_password(character varying, character varying);
