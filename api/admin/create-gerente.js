import { getSupabaseAdmin, sendEmail } from '../emails/_lib.js';
import { tempPasswordEmail } from '../emails/_templates.js';

// ---------------------------------------------------------------------------
// Crea el primer login 'gerente' de una empresa recién dada de alta y le envía
// su contraseña temporal por correo — en un solo paso server-side.
//
// Además CIERRA la vulnerabilidad §1.1.1 de AUDITORIA_SISTEMA.md: la RPC
// create_company_gerente deja de ser invocable por anon/authenticated (ver la
// migración que hace REVOKE EXECUTE). Aquí verificamos, con service role, que
// quien llama es realmente un admin antes de invocarla. Mismo patrón de guardia
// server-side que api/sri/submit-invoice.js.
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { adminId, companyId, email, password, name } = req.body || {};
  if (!adminId || !companyId || !email || !password || !name) {
    return res.status(400).json({ error: 'adminId, companyId, email, password y name son requeridos' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Verifica que quien llama es admin del sistema.
    const { data: admin, error: adminError } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', adminId)
      .single();
    if (adminError || !admin || admin.role !== 'admin') {
      return res.status(403).json({ error: 'Sólo un administrador puede dar de alta empresas' });
    }

    // Crea el gerente vía la RPC (bcrypt corre dentro de Postgres). La RPC ya
    // verifica internamente que p_admin_id sea un admin activo (RAISE si no), así
    // que le pasamos el adminId; nuestro pre-chequeo de arriba es defensa extra.
    const { data, error } = await supabase.rpc('create_company_gerente', {
      p_company_id: companyId,
      p_email: email,
      p_password: password,
      p_name: name,
      p_admin_id: adminId
    });
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Nombre de la empresa para el correo.
    const { data: company } = await supabase
      .from('companies')
      .select('nombre_comercial, razon_social')
      .eq('id', companyId)
      .single();

    const { subject, html } = tempPasswordEmail({
      name,
      email,
      tempPassword: password,
      companyName: company?.nombre_comercial || company?.razon_social || 'tu empresa',
      loginUrl: process.env.EMAIL_APP_URL || null
    });

    // El correo no debe tumbar el alta: si Resend falla, el gerente igual quedó
    // creado y el admin puede reenviar/compartir la clave manualmente.
    let emailStatus = 'sent';
    try {
      await sendEmail({ to: email, subject, html });
    } catch (mailErr) {
      console.error('No se pudo enviar la contraseña temporal:', mailErr);
      emailStatus = 'failed';
    }

    return res.status(200).json({ ok: true, gerente: data?.[0] || null, emailStatus });
  } catch (error) {
    console.error('create-gerente error:', error);
    return res.status(500).json({ error: error.message || 'Error al crear el gerente' });
  }
}
