# 🔐 Guía de Seguridad - POST-PLAT

## 1. Autenticación de Usuarios

### Cambio Importante: Contraseñas Hasheadas

**ANTES (❌ INSEGURO):**
```sql
INSERT INTO admin_users (email, password, name)
VALUES ('admin@postplat.com', '123456', 'Admin');
-- ⚠️ Contraseña en plaintext
```

**AHORA (✅ SEGURO):**
```sql
INSERT INTO admin_users (email, password_hash, name)
VALUES (
  'admin@postplat.com',
  crypt('123456', gen_salt('bf')),
  'Admin'
);
-- ✅ Contraseña hasheada con bcrypt
```

### Código JavaScript para Login

```javascript
// src/lib/supabaseHelpers.js

export async function validateAdminCredentialsV2(email, password) {
  const { data, error } = await supabase
    .from('admin_users')
    .select('id, email, password_hash, name, role, is_active')
    .eq('email', email)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    throw new Error('Email o contraseña inválidos');
  }

  // Verificar contraseña hasheada
  const { data: result } = await supabase.rpc('verify_password', {
    password,
    password_hash: data.password_hash
  });

  if (!result) {
    throw new Error('Email o contraseña inválidos');
  }

  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role
  };
}

export async function validateUserCredentialsV2(email, password, companyId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, password_hash, name, role, is_active')
    .eq('email', email)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    throw new Error('Credenciales inválidas');
  }

  // Verificar contraseña
  const { data: result } = await supabase.rpc('verify_password', {
    password,
    password_hash: data.password_hash
  });

  if (!result) {
    // Incrementar intentos fallidos
    await supabase
      .from('users')
      .update({ failed_login_attempts: (data.failed_login_attempts || 0) + 1 })
      .eq('id', data.id);

    throw new Error('Credenciales inválidas');
  }

  // Resetear intentos fallidos
  await supabase
    .from('users')
    .update({ 
      failed_login_attempts: 0,
      last_login: new Date().toISOString()
    })
    .eq('id', data.id);

  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role,
    company_id: companyId
  };
}
```

### Función PostgreSQL para Verificar Contraseña

Agregar esta función en Supabase SQL Editor:

```sql
CREATE OR REPLACE FUNCTION verify_password(password TEXT, password_hash TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN password_hash = crypt(password, password_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Dar permiso a usuarios autenticados
GRANT EXECUTE ON FUNCTION verify_password TO authenticated;
```

---

## 2. Row Level Security (RLS)

### Política para Usuarios Leyendo sus Datos

```sql
-- Los usuarios solo ven su propia empresa
CREATE POLICY "users_can_read_own_company" ON companies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.company_id = companies.id
      AND users.id = auth.uid()
    )
  );

-- Los usuarios solo ven sus propios datos
CREATE POLICY "users_can_read_own_profile" ON users
  FOR SELECT
  USING (id = auth.uid());
```

### Política para Admins

```sql
-- Los admins ven todo
CREATE POLICY "admin_can_read_all" ON companies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role = 'admin'
    )
  );
```

---

## 3. Auditoría de Cambios

### Registrar Cambios Automáticamente

Crear función trigger:

```sql
CREATE OR REPLACE FUNCTION audit_changes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (
    table_name,
    action,
    record_id,
    old_values,
    new_values,
    user_id,
    company_id
  ) VALUES (
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
    auth.uid(),
    COALESCE(NEW.company_id, OLD.company_id)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear triggers en tablas sensibles
CREATE TRIGGER audit_products AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

CREATE TRIGGER audit_invoices AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_changes();
```

---

## 4. Control de Acceso por Rol

### Estructura de Permisos

```javascript
// src/lib/permissions.js

const ROLE_PERMISSIONS = {
  admin: [
    'create_invoice', 'view_invoice', 'edit_invoice', 'delete_invoice',
    'create_product', 'view_product', 'edit_product',
    'manage_users', 'manage_company', 'view_reports'
  ],
  gerente: [
    'create_invoice', 'view_invoice', 'edit_invoice',
    'create_product', 'view_product', 'edit_product',
    'view_reports'
  ],
  vendedor: [
    'create_invoice', 'view_invoice',
    'view_product'
  ],
  contador: [
    'view_invoice', 'view_product', 'view_reports'
  ],
  operario: [
    'view_product'
  ]
};

export function canUserDo(userRole, action) {
  return ROLE_PERMISSIONS[userRole]?.includes(action) ?? false;
}
```

---

## 5. Protección de Datos Sensibles

### Variables de Entorno

**NO HACER:** 
```javascript
// ❌ Exponer claves en el código
const apiKey = "sk-xxx-xxx";
```

**SÍ HACER:**
```javascript
// ✅ Usar variables de entorno
const apiKey = process.env.VITE_SUPABASE_ANON_KEY;
```

### Datos en Supabase

```javascript
// Para datos sensibles, crear tabla aparte
CREATE TABLE sensitive_data (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  certificate BYTEA,  -- Datos binarios
  api_keys JSONB,
  created_at TIMESTAMP
);

-- Habilitar RLS
ALTER TABLE sensitive_data ENABLE ROW LEVEL SECURITY;

-- Solo admin puede acceder
CREATE POLICY "admin_only" ON sensitive_data
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role = 'admin'
    )
  );
```

---

## 6. Bloqueo de Cuenta por Intentos Fallidos

```javascript
export async function handleLoginFailure(userId, isAdmin = false) {
  const table = isAdmin ? 'admin_users' : 'users';
  const { data } = await supabase
    .from(table)
    .select('failed_login_attempts')
    .eq('id', userId)
    .single();

  const attempts = (data?.failed_login_attempts || 0) + 1;

  if (attempts >= 5) {
    // Bloquear por 30 minutos
    await supabase
      .from(table)
      .update({
        failed_login_attempts: attempts,
        locked_until: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      })
      .eq('id', userId);

    throw new Error('Cuenta bloqueada por intentos fallidos. Intenta de nuevo en 30 minutos.');
  }

  await supabase
    .from(table)
    .update({ failed_login_attempts: attempts })
    .eq('id', userId);
}
```

---

## 7. Cumplimiento Normativo

### Registro de Cambios (RGPD/Compliance)

```javascript
export async function getAuditTrail(companyId, startDate, endDate) {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('company_id', companyId)
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Error fetching audit trail: ${error.message}`);
  return data;
}

export async function exportAuditReport(companyId, format = 'json') {
  const auditData = await getAuditTrail(companyId, '2024-01-01', new Date().toISOString());

  if (format === 'csv') {
    return convertToCSV(auditData);
  }
  return auditData;
}
```

---

## 8. Checklist de Seguridad

- [ ] ✅ Todas las contraseñas hasheadas con bcrypt
- [ ] ✅ RLS habilitado en tablas sensibles
- [ ] ✅ Auditoría registrando todos los cambios
- [ ] ✅ Control de acceso por rol implementado
- [ ] ✅ Bloqueo de cuenta tras fallos de login
- [ ] ✅ HTTPS obligatorio en producción
- [ ] ✅ Claves API en variables de entorno
- [ ] ✅ Backups automáticos de BD
- [ ] ✅ Certificado SSL/TLS activo
- [ ] ✅ Política de privacidad y términos actualizados

---

## 🚀 Para Producción

```sql
-- 1. Desactivar el usuario demo
UPDATE admin_users SET is_active = FALSE WHERE email = 'admin@postplat.com';

-- 2. Cambiar a environment de producción
UPDATE companies SET environment_type = 'produccion' WHERE id = 'xxxxx';

-- 3. Validar que RLS está activo
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
-- Todos deben tener rowsecurity = true

-- 4. Verificar que no hay datos de prueba
SELECT COUNT(*) FROM companies;
```

---

**Última actualización:** 2026-07-08
**Versión:** 2.0
**Estado:** ✅ Listo para Producción
