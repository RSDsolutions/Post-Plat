import { sendEmail } from '../emails/_lib.js';
import { tempPasswordEmail, welcomeCashierEmail, passwordResetEmail } from '../emails/_templates.js';
import { getAuthenticatedUser } from '../_authHelpers.js';

// ---------------------------------------------------------------------------
// Dispatcher que reemplaza 5 endpoints separados (create-gerente.js,
// create-user.js, reset-cashier-password.js, reset-user-password.js,
// set-user-active.js) para quedar dentro del límite de 12 funciones
// serverless de Vercel Hobby (la Fase 3 necesita un endpoint nuevo para el
// cron de reintentos y ya estábamos en 12/12 - ver AUDITORIA_SISTEMA.md).
// Un solo archivo, un solo `action` en el body decide qué hacer - cada rama
// es exactamente la lógica que tenía su archivo original, sin cambios de
// comportamiento (reverificado con la misma suite de pruebas de la Fase 1).
// ---------------------------------------------------------------------------

const ROLE_LABELS = { vendedor: 'Vendedor', operario: 'Operario', contador: 'Contador' };

async function handleCreateGerente({ supabase, user, body, res }) {
  const { companyId, email, password, name } = body;
  if (!companyId || !email || !password || !name) {
    return res.status(400).json({ error: 'companyId, email, password y name son requeridos' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Sólo un administrador puede dar de alta empresas' });
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

  const { data: authUser, error: createAuthError } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true
  });
  if (createAuthError) {
    return res.status(400).json({ error: createAuthError.message });
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .insert({ id: authUser.user.id, company_id: companyId, email, name, role: 'gerente', is_active: true })
    .select('id, email, name, role')
    .single();
  if (profileError) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    return res.status(400).json({ error: profileError.message });
  }

  const { data: company } = await supabase
    .from('companies')
    .select('nombre_comercial, razon_social')
    .eq('id', companyId)
    .single();

  const { subject, html } = tempPasswordEmail({
    name, email, tempPassword: password,
    companyName: company?.nombre_comercial || company?.razon_social || 'tu empresa',
    loginUrl: process.env.EMAIL_APP_URL || null
  });

  let emailStatus = 'sent';
  try {
    await sendEmail({ to: email, subject, html });
  } catch (mailErr) {
    console.error('No se pudo enviar la contraseña temporal:', mailErr);
    emailStatus = 'failed';
  }

  return res.status(200).json({ ok: true, gerente: profile, emailStatus });
}

async function handleCreateUser({ supabase, user, body, res }) {
  const { companyId, email, password, name, role, phone, branchId } = body;
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
    email, password, email_confirm: true
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
    name, email, tempPassword: password,
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
}

async function handleResetCashierPassword({ supabase, user, body, res }) {
  const { companyId, userId, newPassword } = body;
  if (!companyId || !userId || !newPassword) {
    return res.status(400).json({ error: 'companyId, userId y newPassword son requeridos' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

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
}

async function handleResetUserPassword({ supabase, user, body, res }) {
  const { companyId, userId, newPassword } = body;
  if (!companyId || !userId || !newPassword) {
    return res.status(400).json({ error: 'companyId, userId y newPassword son requeridos' });
  }
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
}

async function handleSetUserActive({ supabase, user, body, res }) {
  const { companyId, userId, isActive } = body;
  if (!companyId || !userId || typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'companyId, userId e isActive son requeridos' });
  }
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
}

const ACTIONS = {
  'create-gerente': handleCreateGerente,
  'create-user': handleCreateUser,
  'reset-cashier-password': handleResetCashierPassword,
  'reset-user-password': handleResetUserPassword,
  'set-user-active': handleSetUserActive
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, ...body } = req.body || {};
  const actionHandler = ACTIONS[action];
  if (!actionHandler) {
    return res.status(400).json({ error: 'action inválida o faltante' });
  }

  try {
    const { supabase, user, error: authError, status: authStatus } = await getAuthenticatedUser(req);
    if (authError) return res.status(authStatus).json({ error: authError });

    return await actionHandler({ supabase, user, body, res });
  } catch (error) {
    console.error(`admin/users [${action}] error:`, error);
    return res.status(500).json({ error: error.message || 'Error al procesar la solicitud' });
  }
}
