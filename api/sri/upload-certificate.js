import { createClient } from '@supabase/supabase-js';

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

  const { companyId, userId, certPassword, fileBase64 } = req.body || {};
  if (!companyId || !userId || !certPassword || !fileBase64) {
    return res.status(400).json({ error: 'companyId, userId, certPassword y el archivo son requeridos' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.VITE_SUPABASE_SECRET_KEY;
  const encryptionKey = process.env.CERT_ENCRYPTION_KEY;
  if (!supabaseUrl || !serviceKey || !encryptionKey) {
    return res.status(500).json({ error: 'Configuración de servidor incompleta: falta Supabase o CERT_ENCRYPTION_KEY en las variables de entorno de Vercel' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, company_id, role')
      .eq('id', userId)
      .single();

    if (userError || !user || user.company_id !== companyId || !['gerente', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'No autorizado para configurar el certificado de esta empresa' });
    }

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
