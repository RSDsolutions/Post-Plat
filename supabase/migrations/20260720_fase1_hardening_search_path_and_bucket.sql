-- Fase 1 de hardening (AUDITORIA_SISTEMA.md §1.2, §1.3):
--   1. SET search_path en las 2 funciones SECURITY DEFINER que no lo tenían.
--   2. Revoca EXECUTE de rls_auto_enable() para anon/authenticated (función
--      interna de infraestructura, dispara con un event trigger de
--      CREATE TABLE - no hace nada útil invocada manualmente, pero no había
--      razón para dejarla expuesta).
--   3. Acota el bucket público company-logos: hoy permite LISTAR todos los
--      objetos (no solo obtenerlos por URL conocida). El bucket ya está
--      marcado public=true en storage.buckets, así que getPublicUrl() sigue
--      funcionando exactamente igual sin ninguna política de SELECT - esa
--      política solo habilitaba además el listado vía la API
--      (confirmado: el código de la app solo usa .upload()/.getPublicUrl()
--      para este bucket, nunca .list()).

-- 1. search_path fijo (mismo patrón que current_company_id/current_role/etc,
-- ya migradas). verify_admin_password llama crypt() (pgcrypto) - necesita
-- "extensions" en el path, igual que get_cert_password/set_cert_password.
create or replace function public.admin_set_user_active(p_admin_id uuid, p_company_id uuid, p_user_id uuid, p_is_active boolean)
returns table(id uuid, name character varying, role user_role, is_active boolean)
language plpgsql security definer
set search_path = public, pg_temp
as $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_admin_id AND u.role = 'admin' AND u.is_active = true) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  UPDATE users
  SET is_active = p_is_active
  WHERE users.id = p_user_id AND users.company_id = p_company_id AND users.role <> 'admin'
  RETURNING users.id, users.name, users.role, users.is_active;
END;
$function$;

create or replace function public.verify_admin_password(p_email character varying, p_password character varying)
returns table(id uuid, email character varying, name character varying, role character varying)
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $function$
BEGIN
  RETURN QUERY
  SELECT
    admin_users.id,
    admin_users.email,
    admin_users.name,
    admin_users.role
  FROM admin_users
  WHERE admin_users.email = p_email
    AND admin_users.is_active = true
    AND admin_users.password_hash = crypt(p_password, admin_users.password_hash);
END;
$function$;

-- 2. rls_auto_enable(): sin razón para exponerla a anon/authenticated. El
-- grant real vivía en el rol implícito PUBLIC (que anon/authenticated heredan
-- automáticamente) - revocar solo de anon/authenticated no alcanza,
-- confirmado con information_schema.role_routine_grants tras el primer
-- intento: PUBLIC seguía apareciendo con EXECUTE.
revoke execute on function public.rls_auto_enable() from anon, authenticated;
revoke execute on function public.rls_auto_enable() from public;

-- 3. company-logos: quita la política de SELECT amplia. El bucket ya es
-- public=true, así que getPublicUrl() no depende de RLS para nada - esto
-- solo cierra el listado vía API, sin afectar cómo se muestran los logos
-- hoy en la UI/RIDE.
drop policy if exists company_logos_read on storage.objects;
