import { getAuthenticatedUser } from '../_authHelpers.js';

// Sube el certificado .p12 y guarda su contraseña cifrada. Antes esto lo
// hacía el navegador directo contra Supabase (anon key): el archivo iba al
// bucket privado, pero la contraseña se escribía en texto plano en
// billing_configs.cert_password. Ahora todo pasa por acá (service_role) y la
// contraseña se cifra con pgcrypto (ver supabase/migrations/20260715_encrypt_cert_password.sql)
// usando una clave que solo existe en esta env var, nunca en Postgres.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { certPassword, fileBase64 } = req.body || {};
  if (!certPassword || !fileBase64) {
    return res.status(400).json({ error: 'certPassword y el archivo son requeridos' });
  }

  const encryptionKey = process.env.CERT_ENCRYPTION_KEY;
  if (!encryptionKey) {
    return res.status(500).json({ error: 'Configuración de servidor incompleta: falta CERT_ENCRYPTION_KEY en las variables de entorno de Vercel' });
  }

  const { supabase, user, error: authError, status: authStatus } = await getAuthenticatedUser(req);
  if (authError) return res.status(authStatus).json({ error: authError });
  if (!['gerente', 'admin'].includes(user.role)) {
    return res.status(403).json({ error: 'No autorizado para configurar el certificado de esta empresa' });
  }
  const companyId = user.company_id;
  if (!companyId) {
    return res.status(403).json({ error: 'No autorizado para configurar el certificado de esta empresa' });
  }

  try {
    const { data: existingConfig, error: configError } = await supabase
      .from('billing_configs')
      .select('id')
      .eq('company_id', companyId)
      .single();

    if (configError || !existingConfig) {
      return res.status(400).json({ error: 'Guarda la configuración de facturación antes de subir el certificado' });
    }

    const storagePath = `${companyId}/certificado.p12`;
    const fileBuffer = Buffer.from(fileBase64, 'base64');

    const { error: uploadError } = await supabase
      .storage
      .from('sri-certificates')
      .upload(storagePath, fileBuffer, { upsert: true, contentType: 'application/x-pkcs12' });

    if (uploadError) {
      return res.status(500).json({ error: `No se pudo subir el certificado: ${uploadError.message}` });
    }

    const { error: encryptError } = await supabase.rpc('set_cert_password', {
      p_company_id: companyId,
      p_plaintext: certPassword,
      p_key: encryptionKey
    });

    if (encryptError) {
      return res.status(500).json({ error: `No se pudo guardar la contraseña del certificado: ${encryptError.message}` });
    }

    const uploadedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('billing_configs')
      .update({ cert_storage_path: storagePath, cert_uploaded_at: uploadedAt })
      .eq('company_id', companyId);

    if (updateError) {
      return res.status(500).json({ error: `No se pudo actualizar la configuración de facturación: ${updateError.message}` });
    }

    return res.status(200).json({ certStoragePath: storagePath, certUploadedAt: uploadedAt });
  } catch (error) {
    console.error('Error uploading SRI certificate:', error);
    return res.status(500).json({ error: 'Error interno al subir el certificado' });
  }
}
