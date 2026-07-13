import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// Núcleo compartido del servicio de correos (Resend + Supabase service role).
//
// Todas las Vercel Functions bajo api/emails/* y api/admin/* consumen esto.
// Vive como Vercel Function (Node) y NO como Supabase Edge Function (Deno)
// porque toda la infraestructura, secretos y pipeline de deploy del proyecto
// ya están en Vercel (mismo patrón que api/sri/submit-invoice.js). Los
// disparos automáticos por cambios en la BD llegan aquí vía Database Webhooks
// de Supabase (HTTP), así que no hace falta un segundo runtime.
// ---------------------------------------------------------------------------

// Dirección remitente. Debe pertenecer a un dominio verificado en Resend
// (con sus DNS en Cloudflare). Ej: "POST-PLAT <facturas@tudominio.com>".
export const EMAIL_FROM = process.env.EMAIL_FROM || 'POST-PLAT <no-reply@example.com>';

let _resend = null;
export function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Falta RESEND_API_KEY en las variables de entorno de Vercel');
  }
  if (!_resend) _resend = new Resend(apiKey);
  return _resend;
}

// Cliente Supabase con service role. Sólo se usa server-side para RE-VALIDAR
// contra la BD (nunca confiamos en lo que manda el navegador) y para resolver
// destinatarios reales (email del cliente/usuario) desde las tablas.
export function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.VITE_SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Configuración de servidor incompleta: falta URL o service key de Supabase');
  }
  return createClient(supabaseUrl, serviceKey);
}

// Verifica el secreto compartido que envían los Database Webhooks de Supabase
// en el header 'x-webhook-secret'. Comparación en tiempo constante para no
// filtrar el secreto por timing. Devuelve true/false (el caller responde 401).
export function verifyWebhookSecret(req) {
  const expected = process.env.EMAIL_WEBHOOK_SECRET;
  if (!expected) return false;
  const got = req.headers['x-webhook-secret'] || '';
  const a = Buffer.from(String(got));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Envoltura única de envío. Centraliza From, manejo de errores y logging para
// que ningún endpoint hable con el SDK de Resend directamente.
export async function sendEmail({ to, subject, html, attachments, replyTo }) {
  if (!to) {
    // No es un error fatal: p.ej. un cliente "consumidor final" sin email.
    return { skipped: true, reason: 'sin destinatario' };
  }
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    ...(replyTo ? { replyTo } : {}),
    ...(attachments ? { attachments } : {})
  });
  if (error) {
    console.error('Resend error:', error);
    throw new Error(error.message || 'Error enviando el correo');
  }
  return { id: data?.id };
}
