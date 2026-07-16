import { sendEmail } from '../emails/_lib.js';
import { passwordResetEmail } from '../emails/_templates.js';
import { getAuthenticatedUser } from '../_authHelpers.js';

// ---------------------------------------------------------------------------
// Admin-side password reset for ANY company user (gerente incluido). Desde la
// migración a Supabase Auth, la contraseña ya no vive en users.password_hash:
// admin_reset_user_password sólo valida autorización + existencia del target
// (RPC, cuyo EXECUTE sigue revocado para anon/authenticated), y este endpoint
// hace el cambio real vía auth.admin.updateUserById con la service role, la
// única forma de tocar auth.users. Mismo patrón que api/admin/create-gerente.js.
//
// Quién llama: admin real, verificado con JWT (api/_authHelpers.js), no con
// un adminId que el body simplemente afirmaba (Fase 1 de hardening).
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { companyId, userId, newPassword } = req.body || {};
  if (!companyId || !userId || !newPassword) {
    return res.status(400).json({ error: 'companyId, userId y newPassword son requeridos' });
  }

  try {
    const { supabase, user, error: authError, status: authStatus } = await getAuthenticatedUser(req);
    if (authError) return res.status(authStatus).json({ error: authError });
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const { data, error } = await supabase.rpc('admin_reset_user_password', {
      p_admin_id: user.id,
      p_company_id: companyId,
      p_user_id: userId
    });
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const target = data?.[0];

    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(userId, { password: newPassword });
    if (updateAuthError) {
      return res.status(400).json({ error: `No se pudo actualizar la contraseña: ${updateAuthError.message}` });
    }
    const { data: company } = await supabase
      .from('companies')
      .select('nombre_comercial, razon_social')
      .eq('id', companyId)
      .single();

    const { subject, html } = passwordResetEmail({
      name: target?.name || '',
      email: target?.email || '',
      tempPassword: newPassword,
      companyName: company?.nombre_comercial || company?.razon_social || 'tu empresa',
      loginUrl: process.env.EMAIL_APP_URL || null
    });

    let emailStatus = 'sent';
    try {
      await sendEmail({ to: target?.email, subject, html });
    } catch (mailErr) {
      console.error('No se pudo enviar el correo de restablecimiento:', mailErr);
      emailStatus = 'failed';
    }

    return res.status(200).json({ ok: true, user: target || null, emailStatus });
  } catch (error) {
    console.error('reset-user-password error:', error);
    return res.status(500).json({ error: error.message || 'Error al restablecer la contraseña' });
  }
}
