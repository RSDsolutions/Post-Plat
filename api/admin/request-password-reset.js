import { getSupabaseAdmin } from '../_authHelpers.js';
import { sendEmail } from '../emails/_lib.js';
import { passwordRecoveryEmail } from '../emails/_templates.js';

// ---------------------------------------------------------------------------
// "Olvidé mi contraseña" - self-service, sin JWT (quien llama no tiene
// sesión, por definición). Aplica a cualquier rol (admin, gerente, vendedor,
// operario, contador) - todos viven en Supabase Auth por igual desde la
// migración de la Fase 0.
//
// La respuesta es SIEMPRE la misma exista o no el email, y sin importar si
// el pedido quedó limitado por la tasa - así nadie puede usar este endpoint
// para averiguar qué correos están registrados en el sistema.
// ---------------------------------------------------------------------------

const GENERIC_RESPONSE = { ok: true, message: 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    // Ni siquiera un email con forma inválida distingue la respuesta - se
    // valida, pero el mensaje de vuelta es el mismo genérico.
    return res.status(200).json(GENERIC_RESPONSE);
  }

  const supabase = getSupabaseAdmin();
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const { data: allowed, error: rateLimitError } = await supabase.rpc('check_and_record_password_reset_attempt', {
      p_email: normalizedEmail
    });
    if (rateLimitError) {
      console.error('request-password-reset rate limit error:', rateLimitError);
      return res.status(200).json(GENERIC_RESPONSE);
    }
    if (!allowed) {
      return res.status(200).json({ ok: true, message: 'Ya solicitaste varios enlaces recientemente. Espera unos minutos antes de intentar de nuevo.' });
    }

    // redirectTo apunta a la raíz, no a /reset-password: esta SPA no tiene
    // router real (App.jsx alterna vistas por estado, no por URL - ver
    // ResetPassword.jsx), así que la detección de "vengo de un link de
    // recuperación" depende solo del fragmento #access_token=...&type=recovery
    // que Supabase agrega a la URL (supabase-js lo detecta solo y dispara
    // PASSWORD_RECOVERY vía onAuthStateChange, ver App.jsx) - nunca de la
    // ruta. Apuntar a una ruta que nadie más visita arriesgaría un 404 si
    // Vercel no hace SPA-fallback para rutas no configuradas.
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: normalizedEmail,
      options: process.env.EMAIL_APP_URL ? { redirectTo: process.env.EMAIL_APP_URL } : undefined
    });

    // generateLink falla si el correo no corresponde a ningún usuario real -
    // ese es exactamente el caso que no debe distinguirse desde afuera.
    if (linkError || !linkData?.properties?.action_link) {
      return res.status(200).json(GENERIC_RESPONSE);
    }

    // Nombre para personalizar el correo - best effort, un fallback genérico
    // no bloquea el envío si por lo que sea no hay perfil en public.users.
    const { data: profile } = await supabase
      .from('users')
      .select('name')
      .eq('email', normalizedEmail)
      .maybeSingle();

    const { subject, html } = passwordRecoveryEmail({
      email: normalizedEmail,
      name: profile?.name || null,
      actionLink: linkData.properties.action_link
    });

    try {
      await sendEmail({ to: normalizedEmail, subject, html });
    } catch (mailErr) {
      // Un fallo de Resend no debe filtrarse como señal de "el correo no
      // existe" - se registra server-side y se responde igual.
      console.error('request-password-reset: fallo al enviar el correo:', mailErr);
    }

    return res.status(200).json(GENERIC_RESPONSE);
  } catch (error) {
    console.error('request-password-reset error:', error);
    // Ni siquiera un error interno cambia la forma de la respuesta.
    return res.status(200).json(GENERIC_RESPONSE);
  }
}
