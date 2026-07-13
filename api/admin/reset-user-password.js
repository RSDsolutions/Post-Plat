import { getSupabaseAdmin, sendEmail } from '../emails/_lib.js';
import { passwordResetEmail } from '../emails/_templates.js';

// ---------------------------------------------------------------------------
// Admin-side password reset for ANY company user (gerente incluido) - la RPC
// reset_company_user_password (usada por el propio gerente para sus cajeros)
// sólo acepta roles operario/vendedor, así que este endpoint llama en su lugar
// a admin_reset_user_password, cuyo EXECUTE está revocado para anon/authenticated
// (ver migración lock_down_admin_user_management_rpcs) - sólo el service role
// de este endpoint puede invocarla. Mismo patrón que api/admin/create-gerente.js.
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { adminId, companyId, userId, newPassword } = req.body || {};
  if (!adminId || !companyId || !userId || !newPassword) {
    return res.status(400).json({ error: 'adminId, companyId, userId y newPassword son requeridos' });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: admin, error: adminError } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', adminId)
      .single();
    if (adminError || !admin || admin.role !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { data, error } = await supabase.rpc('admin_reset_user_password', {
      p_admin_id: adminId,
      p_company_id: companyId,
      p_user_id: userId,
      p_new_password: newPassword
    });
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const target = data?.[0];
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
