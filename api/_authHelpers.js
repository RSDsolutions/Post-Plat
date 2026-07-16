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
    .select('id, company_id, role, is_active')
    .eq('id', authData.user.id)
    .single();
  if (profileError || !profile || !profile.is_active) {
    return { error: 'Usuario no encontrado o desactivado', status: 403 };
  }

  return { supabase, user: profile };
}
