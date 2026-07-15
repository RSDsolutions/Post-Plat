-- Funciones helper para políticas RLS basadas en auth.uid() real.
-- SECURITY DEFINER + STABLE: evita recursión de RLS al leer public.users
-- desde dentro de una política sobre la propia tabla, y permite que Postgres
-- cachee el resultado una vez por query en vez de una vez por fila (ver
-- advisor 0003_auth_rls_initplan) cuando se llaman como (select fn()).
--
-- is_active = true en cada una: defensa en profundidad. Un JWT ya emitido
-- sigue siendo válido hasta que expira/refresca aunque se banee al usuario
-- en Auth (auth.admin.updateUserById ban_duration) - este chequeo cierra esa
-- ventana también a nivel de datos, no solo de login.

create or replace function public.current_company_id() returns uuid
language sql security definer stable
set search_path = public, pg_temp
as $$ select company_id from public.users where id = auth.uid() and is_active = true $$;

create or replace function public.current_role() returns public.user_role
language sql security definer stable
set search_path = public, pg_temp
as $$ select role from public.users where id = auth.uid() and is_active = true $$;

create or replace function public.is_platform_admin() returns boolean
language sql security definer stable
set search_path = public, pg_temp
as $$ select exists(select 1 from public.users where id = auth.uid() and role = 'admin' and is_active = true) $$;

revoke all on function public.current_company_id() from public;
revoke all on function public.current_role() from public;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.current_company_id() to anon, authenticated, service_role;
grant execute on function public.current_role() to anon, authenticated, service_role;
grant execute on function public.is_platform_admin() to anon, authenticated, service_role;

-- Reemplaza el UPDATE directo que hacía updateAdminLastLogin() desde el
-- navegador (ya no viable: users no tiene política de UPDATE abierta).
-- Solo permite tocar la propia fila.
create or replace function public.record_login(p_user_id uuid)
returns void
language sql security definer
set search_path = public, pg_temp
as $$
  update public.users set last_login = now() where id = p_user_id and id = auth.uid();
$$;

revoke all on function public.record_login(uuid) from public;
grant execute on function public.record_login(uuid) to authenticated;
