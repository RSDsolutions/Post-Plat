import { getAuthenticatedUser } from '../_authHelpers.js';

// ---------------------------------------------------------------------------
// Admin-side activate/deactivate for any company user (gerente or cajero).
// Calls admin_set_user_active, whose EXECUTE is revoked for anon/authenticated
// (see migration lock_down_admin_user_management_rpcs) - only reachable here,
// via the service role, after verifying the caller is a real admin.
//
// Además banea/desbanea a nivel Auth (auth.admin.updateUserById ban_duration):
// is_active por sí solo ya no basta para bloquear el login, porque
// supabase.auth.signInWithPassword no lo conoce. current_role()/
// current_company_id() también revisan is_active como defensa en profundidad
// para sesiones ya emitidas antes del ban.
//
// Quién llama: admin real, verificado con JWT (api/_authHelpers.js), no con
// un adminId que el body simplemente afirmaba (Fase 1 de hardening).
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { companyId, userId, isActive } = req.body || {};
  if (!companyId || !userId || typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'companyId, userId e isActive son requeridos' });
  }

  try {
    const { supabase, user, error: authError, status: authStatus } = await getAuthenticatedUser(req);
    if (authError) return res.status(authStatus).json({ error: authError });
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { data, error } = await supabase.rpc('admin_set_user_active', {
      p_admin_id: user.id,
      p_company_id: companyId,
      p_user_id: userId,
      p_is_active: isActive
    });
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: isActive ? 'none' : '876000h'
    });
    if (updateAuthError) {
      return res.status(400).json({ error: `No se pudo ${isActive ? 'reactivar' : 'bloquear'} la sesión: ${updateAuthError.message}` });
    }

    return res.status(200).json({ ok: true, user: data?.[0] || null });
  } catch (error) {
    console.error('set-user-active error:', error);
    return res.status(500).json({ error: error.message || 'Error al actualizar el estado del usuario' });
  }
}
