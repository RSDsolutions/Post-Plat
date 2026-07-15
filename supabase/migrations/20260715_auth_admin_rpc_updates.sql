-- Ajusta las RPCs de gestión de usuarios para el nuevo modelo Supabase Auth:
-- ninguna de ellas puede seguir tocando password_hash directamente (Auth es
-- ahora la fuente de verdad de credenciales) y update_user_branch pasa a
-- verificar quién llama de verdad (antes no lo hacía en absoluto).

-- admin_reset_user_password: ya no escribe la contraseña (eso lo hace el
-- endpoint vía auth.admin.updateUserById con service role); solo valida
-- autorización + existencia del target y limpia los contadores de bloqueo.
-- El DROP es necesario porque la firma cambia (ya no recibe p_new_password) -
-- CREATE OR REPLACE con una firma distinta crea un overload nuevo en vez de
-- reemplazar, dejando viva la versión insegura vieja.
drop function if exists public.admin_reset_user_password(uuid, uuid, uuid, character varying);

create or replace function public.admin_reset_user_password(p_admin_id uuid, p_company_id uuid, p_user_id uuid)
returns table(id uuid, email character varying, name character varying, role user_role)
language plpgsql security definer
set search_path = public, pg_temp
as $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_admin_id AND u.role = 'admin' AND u.is_active = true) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id AND u.company_id = p_company_id) THEN
    RAISE EXCEPTION 'Usuario no encontrado en esta empresa';
  END IF;

  RETURN QUERY
  UPDATE users
  SET last_password_change = now(), failed_login_attempts = 0, locked_until = NULL
  WHERE users.id = p_user_id AND users.company_id = p_company_id
  RETURNING users.id, users.email, users.name, users.role;
END;
$function$;

-- update_user_branch: agrega verificación real de quién llama (antes
-- cualquiera que supiera company_id+user_id+branch_id podía reasignar). Solo
-- gerente de esa empresa o admin. Mismo motivo de DROP que arriba: la firma
-- cambia (agrega p_caller_id).
drop function if exists public.update_user_branch(uuid, uuid, uuid);

create or replace function public.update_user_branch(p_company_id uuid, p_user_id uuid, p_branch_id uuid, p_caller_id uuid)
returns table(id uuid, name character varying, branch_id uuid)
language plpgsql security definer
set search_path = public, pg_temp
as $function$
BEGIN
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
