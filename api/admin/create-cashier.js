import { getSupabaseAdmin, sendEmail } from '../emails/_lib.js';
import { welcomeCashierEmail } from '../emails/_templates.js';

// ---------------------------------------------------------------------------
// Crea un login de vendedor/operario y le envía un correo de bienvenida con su
// contraseña temporal — en un solo paso server-side.
//
// Desde la migración a Supabase Auth, el alta pasa por auth.admin.createUser()
// (service role) + un insert del perfil en public.users con el mismo id. La
// RPC create_company_user (bcrypt directo) se retiró; las validaciones que
// antes vivían ahí (rol permitido, sucursal válida, límite de plan, email
// duplicado) se movieron acá.
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
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  if (!branchId) {
    return res.status(400).json({ error: 'Debes asignar una sucursal al cajero' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Verifica que quien llama es el gerente de esa empresa, o un admin del
    // sistema (que no pertenece a ninguna empresa - company_id es null, por
    // eso no se le exige que coincida con companyId como al gerente).
    const { data: caller, error: callerError } = await supabase
      .from('users')
      .select('id, company_id, role')
      .eq('id', callerId)
      .single();
    const isAuthorized = caller && (
      caller.role === 'admin' ||
      (caller.role === 'gerente' && caller.company_id === companyId)
    );
    if (callerError || !isAuthorized) {
      return res.status(403).json({ error: 'No autorizado para crear usuarios en esta empresa' });
    }

    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('id')
      .eq('id', branchId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (branchError || !branch) {
      return res.status(400).json({ error: 'La sucursal indicada no pertenece a esta empresa' });
    }

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('company_id', companyId)
      .eq('email', email)
      .maybeSingle();
    if (existing) {
      return res.status(400).json({ error: 'Ya existe un usuario con ese correo en esta empresa' });
    }

    const { data: company } = await supabase
      .from('companies')
      .select('nombre_comercial, razon_social, plans(max_users)')
      .eq('id', companyId)
      .single();
    const maxUsers = company?.plans?.max_users;
    if (maxUsers != null) {
      const { count } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('is_active', true);
      if ((count || 0) >= maxUsers) {
        return res.status(400).json({ error: `Alcanzaste el límite de ${maxUsers} usuarios de tu plan` });
      }
    }

    // Paso 1: credenciales reales en Auth.
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // Paso 2: perfil de negocio, mismo id que Auth le asignó.
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert({
        id: authUser.user.id, company_id: companyId, email, name, role,
        phone: phone || null, is_active: true, branch_id: branchId
      })
      .select('id, email, name, role, phone, is_active, branch_id, created_at')
      .single();
    if (profileError) {
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return res.status(400).json({ error: profileError.message });
    }

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

    return res.status(200).json({ ok: true, user: profile, emailStatus });
  } catch (error) {
    console.error('create-cashier error:', error);
    return res.status(500).json({ error: error.message || 'Error al crear el usuario' });
  }
}
