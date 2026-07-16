// Smoke test de login end-to-end contra la base de datos REAL (no usa datos
// descartables/efímeros como los scripts de prueba de cada fase - esta
// cuenta canario es fija y persiste entre corridas).
//
// Nace del incidente real del 2026-07-15: una migración agregó
// users.ui_preferences sin otorgarle SELECT a `authenticated`, y el login
// quedó roto para el 100% de usuarios reales sin que ningún error apareciera
// en build/tests hasta que alguien lo reportó. Supabase Auth aceptaba las
// credenciales perfectamente (ese paso nunca falló) - lo que fallaba era la
// consulta del PERFIL de negocio inmediatamente después, silenciada por RLS.
//
// Por eso este script replica el camino EXACTO de loginWithPassword() en
// src/lib/supabaseHelpers.js: signInWithPassword con la anon key (nunca
// service_role, que no prueba nada de RLS) + el mismo SELECT de columnas +
// la misma RPC record_login. Uso obligatorio después de cualquier migración
// que toque `users`, `companies`, o sus políticas RLS/GRANTs - ver CLAUDE.md.
//
// Uso: npm run smoke:login

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const serviceKey = env.VITE_SUPABASE_SECRET_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error('FALLO: faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_SECRET_KEY en .env.local');
  process.exit(1);
}

const SMOKE_EMAIL = env.SMOKE_TEST_EMAIL || 'smoke-test@postplat.internal';
const SMOKE_PASSWORD = env.SMOKE_TEST_PASSWORD;
const SMOKE_RUC = '1799999999001';

if (!SMOKE_PASSWORD) {
  console.error('FALLO: falta SMOKE_TEST_PASSWORD en .env.local (define una contraseña fija para la cuenta canario).');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// Idempotente: crea la empresa/usuario canario solo si no existen todavía.
// Nunca se borra al final - es una cuenta permanente, no un dato de prueba.
async function ensureSmokeUser() {
  const { data: existingProfile } = await admin.from('users').select('id').eq('email', SMOKE_EMAIL).maybeSingle();
  if (existingProfile) return;

  console.log('Cuenta canario no existe todavía - creándola...');

  let { data: company } = await admin.from('companies').select('id').eq('ruc', SMOKE_RUC).maybeSingle();
  if (!company) {
    const { data: newCompany, error } = await admin.from('companies').insert({
      ruc: SMOKE_RUC,
      razon_social: 'SMOKE TEST - NO BORRAR',
      nombre_comercial: 'SMOKE TEST - NO BORRAR',
      admin_email: SMOKE_EMAIL,
      subscription_status: 'activa'
    }).select().single();
    if (error) throw new Error(`No se pudo crear la empresa canario: ${error.message}`);
    company = newCompany;
  }

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: SMOKE_EMAIL, password: SMOKE_PASSWORD, email_confirm: true
  });
  if (authError) throw new Error(`No se pudo crear el usuario canario en Auth: ${authError.message}`);

  const { error: profileError } = await admin.from('users').insert({
    id: authUser.user.id, company_id: company.id, email: SMOKE_EMAIL, name: 'Smoke Test', role: 'gerente', is_active: true
  });
  if (profileError) throw new Error(`No se pudo crear el perfil canario: ${profileError.message}`);

  console.log('Cuenta canario creada.');
}

try {
  await ensureSmokeUser();

  console.log(`Iniciando sesión como ${SMOKE_EMAIL} (anon key + signInWithPassword, igual que Login.jsx)...`);
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: authData, error: authError } = await client.auth.signInWithPassword({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD });
  if (authError) {
    console.error(`FALLO: Supabase Auth rechazó las credenciales del canario: ${authError.message}`);
    process.exit(1);
  }
  console.log('OK: Auth aceptó las credenciales.');

  // Mismo SELECT que loginWithPassword() en supabaseHelpers.js - acá fue
  // exactamente donde falló el incidente real (GRANT de columna faltante).
  const { data: profile, error: profileError } = await client
    .from('users')
    .select('id, email, name, role, company_id, is_active, ui_preferences')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile) {
    console.error(`FALLO: la sesión se creó pero la consulta del perfil (users) fue rechazada: ${profileError?.message}`);
    console.error('Esto es exactamente el incidente del 2026-07-15 (GRANT de columna faltante) - revisa RLS y GRANTs de la tabla users.');
    await client.auth.signOut();
    process.exit(1);
  }

  const requiredFields = ['id', 'email', 'role', 'company_id'];
  const missing = requiredFields.filter(f => profile[f] === null || profile[f] === undefined);
  if (missing.length > 0) {
    console.error(`FALLO: el perfil volvió incompleto, faltan campos: ${missing.join(', ')}`);
    await client.auth.signOut();
    process.exit(1);
  }
  if (!profile.is_active) {
    console.error('FALLO: la cuenta canario quedó marcada is_active=false (no debería pasar sola).');
    await client.auth.signOut();
    process.exit(1);
  }
  console.log(`OK: perfil recuperado correctamente (role=${profile.role}, company_id=${profile.company_id}).`);

  const { error: recordLoginError } = await client.rpc('record_login', { p_user_id: profile.id });
  if (recordLoginError) {
    console.error(`FALLO: record_login rechazó la llamada: ${recordLoginError.message}`);
    await client.auth.signOut();
    process.exit(1);
  }
  console.log('OK: record_login funcionó.');

  await client.auth.signOut();
  console.log('\n✅ smoke:login PASÓ - el login end-to-end funciona.');
  process.exit(0);
} catch (e) {
  console.error(`FALLO: ${e.message}`);
  process.exit(1);
}
