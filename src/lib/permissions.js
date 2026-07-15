import { supabase } from './supabase.js';

// Catálogo de permisos por rol (modulo.accion), activado en la migración
// 20260715_seed_permissions_catalog.sql. Antes del rol contador, el control
// de acceso de cada pantalla era `role === 'gerente'` a mano; esto lo
// reemplaza por un set de permisos cargado una vez por sesión.
//
// El rol admin (panel SaaS) no tiene fila en role_permissions - ese panel
// nunca usa can(), es una interfaz aparte con su propio Layout.
export async function fetchRolePermissions(role) {
  if (!role) return new Set();

  const { data, error } = await supabase
    .from('role_permissions')
    .select('permissions(name)')
    .eq('role', role);

  if (error) {
    console.error('Error loading role permissions:', error);
    return new Set();
  }

  return new Set(data.map(row => row.permissions?.name).filter(Boolean));
}

// Fallback seguro: sin permisos cargados (Set vacío, null, o el permiso no
// está en el set), deniega. Nunca "todo permitido por defecto".
export function can(permissionsSet, key) {
  return !!permissionsSet && permissionsSet.has(key);
}
