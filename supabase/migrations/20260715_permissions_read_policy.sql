-- permissions/role_permissions tenían RLS activado sin ninguna política
-- (bloqueo total, mismo defecto que plans/activity_log antes del 09/07).
-- El catálogo no es sensible por fila (son solo claves de permiso), así que
-- SELECT abierto a cualquier usuario autenticado es razonable - can() en el
-- frontend necesita leerlo para construir el set de permisos del rol.
create policy permissions_select on public.permissions for select
  using (auth.uid() is not null);
create policy role_permissions_select on public.role_permissions for select
  using (auth.uid() is not null);
