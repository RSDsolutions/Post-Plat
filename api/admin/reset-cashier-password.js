import { getAuthenticatedUser } from '../_authHelpers.js';

// ---------------------------------------------------------------------------
// Reemplaza la RPC reset_company_user_password, que el gerente llamaba
// DIRECTO desde el navegador con la anon key. Eso dejó de ser posible: resetear
// una contraseña de Auth requiere auth.admin.updateUserById, que solo corre
// con service role - nunca disponible en el navegador. Mismo patrón de
// autorización que ya tenía la RPC (gerente de esa empresa, target de la
// misma empresa), ahora verificado acá antes de tocar Auth. Target incluye
// contador desde la Fase 5 (antes solo operario/vendedor) - el gerente
// también gestiona esa cuenta, no solo admin.
//
// Quién llama: admin o gerente de companyId, verificado con JWT real
// (api/_authHelpers.js), no con un callerId que el body simplemente afirmaba
// (Fase 1 de hardening).
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { companyId, userId, newPassword } = req.body || {};
  if (!companyId || !userId || !newPassword) {
    return res.status(400).json({ error: 'companyId, userId y newPassword son requeridos' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  try {
    const { supabase, user, error: authError, status: authStatus } = await getAuthenticatedUser(req);
    if (authError) return res.status(authStatus).json({ error: authError });
    const isAuthorized = user.role === 'admin' || (user.role === 'gerente' && user.company_id === companyId);
    if (!isAuthorized) {
      return res.status(403).json({ error: 'No autorizado para resetear esta contraseña' });
    }

    const { data: target, error: targetError } = await supabase
      .from('users')
      .select('id, email, name, role')
      .eq('id', userId)
      .eq('company_id', companyId)
      .in('role', ['operario', 'vendedor', 'contador'])
      .maybeSingle();
    if (targetError || !target) {
      return res.status(400).json({ error: 'Usuario no encontrado en esta empresa' });
    }

    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(userId, { password: newPassword });
    if (updateAuthError) {
      return res.status(400).json({ error: `No se pudo actualizar la contraseña: ${updateAuthError.message}` });
    }

    await supabase
      .from('users')
      .update({ last_password_change: new Date().toISOString(), failed_login_attempts: 0, locked_until: null })
      .eq('id', userId);

    return res.status(200).json({ ok: true, user: target });
  } catch (error) {
    console.error('reset-cashier-password error:', error);
    return res.status(500).json({ error: error.message || 'Error al resetear la contraseña' });
  }
}
