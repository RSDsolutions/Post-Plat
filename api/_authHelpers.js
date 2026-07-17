import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.VITE_SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Configuración de servidor incompleta: falta URL o service key de Supabase');
  }
  return createClient(supabaseUrl, serviceKey);
}

// Verifica el JWT real de quien llama (header Authorization: Bearer <token>,
// tomado de supabase.auth.getSession() en el navegador) contra Auth, y
// resuelve su perfil de negocio (rol, company_id, is_active) desde
// public.users. Reemplaza el patrón viejo de confiar en un userId/adminId/
// callerId que el body del request simplemente afirmaba ser cierto - nada
// impedía antes invocar estos endpoints con el UUID de otra persona
// (AUDITORIA_SISTEMA.md, Fase 1 de hardening).
//
// Uso:
//   const { supabase, user, error, status } = await getAuthenticatedUser(req);
//   if (error) return res.status(status).json({ error });
//   // user.id, user.company_id, user.role ya están verificados con el JWT real
export async function getAuthenticatedUser(req) {
  const supabase = getSupabaseAdmin();
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return { error: 'No autenticado: falta el token de sesión', status: 401 };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) {
    return { error: 'Sesión inválida o expirada', status: 401 };
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, company_id, role, is_active, admin_level')
    .eq('id', authData.user.id)
    .single();
  if (profileError || !profile || !profile.is_active) {
    return { error: 'Usuario no encontrado o desactivado', status: 403 };
  }

  return { supabase, user: profile };
}

// Autoriza al cron de reintentos (api/sri/retry-pending.js) y a las llamadas
// que ese cron hace en nombre de una empresa a submit-invoice.js - un secreto
// compartido fijo (nunca un JWT de usuario, el cron no actúa como nadie en
// particular) guardado solo como variable de entorno de Vercel.
//
// Lee el mismo header Authorization: Bearer <...> que getAuthenticatedUser
// (no un header custom) porque así es como Vercel Cron invoca el endpoint:
// si existe una variable de entorno CRON_SECRET en el proyecto, Vercel
// agrega automáticamente Authorization: Bearer $CRON_SECRET a cada
// invocación programada - no hay que configurar nada del lado de Vercel más
// que esa variable de entorno. Comparación de longitud fija para no filtrar
// el secreto por temporización.
export function verifyCronSecret(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const expected = process.env.CRON_SECRET || '';
  if (!expected || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
