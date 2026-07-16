import { sendEmail } from '../emails/_lib.js';
import { tempPasswordEmail } from '../emails/_templates.js';
import { getAuthenticatedUser } from '../_authHelpers.js';

// ---------------------------------------------------------------------------
// Crea el primer login 'gerente' de una empresa recién dada de alta y le envía
// su contraseña temporal por correo — en un solo paso server-side.
//
// Desde la migración a Supabase Auth, el usuario se crea en dos pasos: primero
// auth.admin.createUser() (única forma de dar de alta credenciales reales,
// requiere service role) y después el perfil en public.users con el MISMO id
// que devolvió Auth. La RPC create_company_gerente (bcrypt directo sobre
// password_hash) se retiró - ya no tiene caso de uso, y dejarla viva sería un
// camino muerto que crea un perfil sin auth.users correspondiente = login roto.
//
// Sigue cerrando la vulnerabilidad §1.1.1 de AUDITORIA_SISTEMA.md: solo un
// admin real puede llegar a este punto - verificado con JWT real
// (api/_authHelpers.js), no con un adminId que el body simplemente afirmaba
// (Fase 1 de hardening).
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { companyId, email, password, name } = req.body || {};
  if (!companyId || !email || !password || !name) {
    return res.status(400).json({ error: 'companyId, email, password y name son requeridos' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  try {
    const { supabase, user, error: authError, status: authStatus } = await getAuthenticatedUser(req);
    if (authError) return res.status(authStatus).json({ error: authError });
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

    // Paso 1: credenciales reales en Auth.
    const { data: authUser, error: createAuthError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (createAuthError) {
      return res.status(400).json({ error: createAuthError.message });
    }

    // Paso 2: perfil de negocio, mismo id que Auth le asignó.
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert({ id: authUser.user.id, company_id: companyId, email, name, role: 'gerente', is_active: true })
      .select('id, email, name, role')
      .single();
    if (profileError) {
      // El perfil falló pero el Auth user ya existe - lo revertimos para no
      // dejar una credencial huérfana sin perfil de negocio.
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return res.status(400).json({ error: profileError.message });
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

    return res.status(200).json({ ok: true, gerente: profile, emailStatus });
  } catch (error) {
    console.error('create-gerente error:', error);
    return res.status(500).json({ error: error.message || 'Error al crear el gerente' });
  }
}
