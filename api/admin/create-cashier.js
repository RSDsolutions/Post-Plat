import { getSupabaseAdmin, sendEmail } from '../emails/_lib.js';
import { welcomeCashierEmail } from '../emails/_templates.js';

// ---------------------------------------------------------------------------
// Crea un login de vendedor/operario y le envía un correo de bienvenida con su
// contraseña temporal — en un solo paso server-side.
//
// La RPC create_company_user ya valida server-side que el rol sea
// operario/vendedor y el scope de empresa; aquí además verificamos que quien
// llama es gerente/admin de esa empresa antes de invocarla, y aprovechamos que
// el endpoint conoce la contraseña en claro (sólo durante el request) para
// enviarla en el correo sin exponerla en el frontend.
// ---------------------------------------------------------------------------

const ROLE_LABELS = { vendedor: 'Vendedor', operario: 'Operario' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { callerId, companyId, email, password, name, role, phone, branchId } = req.body || {};
  if (!callerId || !companyId || !email || !password || !name || !role) {
    return res.status(400).json({ error: 'callerId, companyId, email, password, name y role son requeridos' });
  }
  if (!['vendedor', 'operario'].includes(role)) {
    return res.status(400).json({ error: 'Rol no permitido para este endpoint' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Verifica que quien llama es gerente/admin de esa empresa.
    const { data: caller, error: callerError } = await supabase
      .from('users')
      .select('id, company_id, role')
      .eq('id', callerId)
      .single();
    if (callerError || !caller || caller.company_id !== companyId || !['gerente', 'admin'].includes(caller.role)) {
      return res.status(403).json({ error: 'No autorizado para crear usuarios en esta empresa' });
    }

    const { data, error } = await supabase.rpc('create_company_user', {
      p_company_id: companyId,
      p_email: email,
      p_password: password,
      p_name: name,
      p_role: role,
      p_phone: phone || null,
      p_branch_id: branchId
    });
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const { data: company } = await supabase
      .from('companies')
      .select('nombre_comercial, razon_social')
      .eq('id', companyId)
      .single();

    const { subject, html } = welcomeCashierEmail({
      name,
      email,
      tempPassword: password,
      companyName: company?.nombre_comercial || company?.razon_social || 'tu empresa',
      roleLabel: ROLE_LABELS[role] || role,
      loginUrl: process.env.EMAIL_APP_URL || null
    });

    let emailStatus = 'sent';
    try {
      await sendEmail({ to: email, subject, html });
    } catch (mailErr) {
      console.error('No se pudo enviar la bienvenida:', mailErr);
      emailStatus = 'failed';
    }

    return res.status(200).json({ ok: true, user: data?.[0] || null, emailStatus });
  } catch (error) {
    console.error('create-cashier error:', error);
    return res.status(500).json({ error: error.message || 'Error al crear el usuario' });
  }
}
