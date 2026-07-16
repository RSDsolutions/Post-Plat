import { sendEmail } from '../emails/_lib.js';
import { welcomeCashierEmail } from '../emails/_templates.js';
import { getAuthenticatedUser } from '../_authHelpers.js';

// ---------------------------------------------------------------------------
// Generaliza api/admin/create-cashier.js (que quedó retirado) a los tres
// roles que un gerente puede dar de alta dentro de su empresa: vendedor,
// operario y contador. vendedor/operario necesitan sucursal (facturan desde
// un punto de venta físico); contador es a nivel empresa, branch_id siempre
// null - forzado acá, no confiado al body, aunque el frontend no debería
// mandarlo para ese rol.
//
// welcomeCashierEmail ya era genérica (recibe roleLabel, no asume "cajero"
// en ningún lado del texto), así que se reutiliza tal cual para contador en
// vez de duplicar una plantilla nueva.
//
// Quién llama (antes callerId en el body, ahora JWT real vía
// api/_authHelpers.js - Fase 1 de hardening): admin (cualquier empresa) o
// gerente de la MISMA empresa que companyId.
// ---------------------------------------------------------------------------

const ROLE_LABELS = { vendedor: 'Vendedor', operario: 'Operario', contador: 'Contador' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { companyId, email, password, name, role, phone, branchId } = req.body || {};
  if (!companyId || !email || !password || !name || !role) {
    return res.status(400).json({ error: 'companyId, email, password, name y role son requeridos' });
  }
  if (!['vendedor', 'operario', 'contador'].includes(role)) {
    return res.status(400).json({ error: 'Rol no permitido para este endpoint' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  const needsBranch = role === 'vendedor' || role === 'operario';
  if (needsBranch && !branchId) {
    return res.status(400).json({ error: 'Debes asignar una sucursal a este usuario' });
  }

  try {
    const { supabase, user, error: authError, status: authStatus } = await getAuthenticatedUser(req);
    if (authError) return res.status(authStatus).json({ error: authError });
    const isAuthorized = user.role === 'admin' || (user.role === 'gerente' && user.company_id === companyId);
    if (!isAuthorized) {
      return res.status(403).json({ error: 'No autorizado para crear usuarios en esta empresa' });
    }

    if (needsBranch) {
      const { data: branch, error: branchError } = await supabase
        .from('branches')
        .select('id')
        .eq('id', branchId)
        .eq('company_id', companyId)
        .maybeSingle();
      if (branchError || !branch) {
        return res.status(400).json({ error: 'La sucursal indicada no pertenece a esta empresa' });
      }
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

    const { data: authUser, error: createAuthError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (createAuthError) {
      return res.status(400).json({ error: createAuthError.message });
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert({
        id: authUser.user.id, company_id: companyId, email, name, role,
        phone: phone || null, is_active: true, branch_id: needsBranch ? branchId : null
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
    console.error('create-user error:', error);
    return res.status(500).json({ error: error.message || 'Error al crear el usuario' });
  }
}
