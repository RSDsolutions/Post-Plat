-- Cifra billing_configs.cert_password en reposo (pgcrypto), en vez de guardarla
-- en texto plano. La clave simétrica NUNCA se guarda en Postgres: viaja como
-- parámetro en cada llamada desde las Vercel Functions, tomada de la env var
-- server-side CERT_ENCRYPTION_KEY. Así, un compromiso de la base de datos por
-- sí solo (dump, backup, acceso directo a Postgres) ya no expone la contraseña
-- del certificado .p12 - hace falta también comprometer las env vars de Vercel.
--
-- Ambas funciones son SECURITY DEFINER pero solo ejecutables por service_role:
-- el navegador (anon/authenticated) no puede cifrar ni descifrar directamente.
-- La subida del certificado se movió a api/sri/upload-certificate.js.

create or replace function public.set_cert_password(p_company_id uuid, p_plaintext text, p_key text)
returns void
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  update public.billing_configs
  set cert_password = encode(pgp_sym_encrypt(p_plaintext, p_key), 'base64'),
      updated_at = now()
  where company_id = p_company_id;
$$;

create or replace function public.get_cert_password(p_company_id uuid, p_key text)
returns text
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select pgp_sym_decrypt(decode(cert_password, 'base64'), p_key)
  from public.billing_configs
  where company_id = p_company_id;
$$;

revoke all on function public.set_cert_password(uuid, text, text) from public, anon, authenticated;
revoke all on function public.get_cert_password(uuid, text) from public, anon, authenticated;
grant execute on function public.set_cert_password(uuid, text, text) to service_role;
grant execute on function public.get_cert_password(uuid, text) to service_role;

-- Cierra el hueco por el que el navegador podía escribir la contraseña en
-- texto plano directamente vía PostgREST (uploadSriCertificate() lo hacía).
revoke update (cert_password) on public.billing_configs from anon, authenticated;
