# 🔐 Login Real - Configuración en Supabase

El login ahora está conectado **realmente** a Supabase con credenciales almacenadas en la base de datos.

## ⚙️ Configuración Requerida

### 1. **Ejecutar SQL en Supabase**

Este paso es **obligatorio** para que el login funcione.

#### Opción A: Ejecutar el SQL completo (Recomendado)

1. Ve a https://supabase.com → Tu Proyecto
2. Ve a **SQL Editor** → **New Query**
3. **Copia TODO el contenido** de:
   ```
   SUPABASE_MIGRATIONS.sql
   ```
4. **Pega en el SQL Editor** de Supabase
5. Click **Run** (o Cmd+Enter)
6. ✅ Verifica que se ejecutó sin errores

#### Opción B: Ejecutar solo la tabla de admin_users

Si ya ejecutaste SUPABASE_MIGRATIONS.sql anteriormente, solo ejecuta esto:

```sql
-- Tabla: admin_users (Usuarios Administradores)
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) DEFAULT 'Administrador',
  role VARCHAR(50) DEFAULT 'admin',
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar usuario administrador
INSERT INTO admin_users (email, password, name, role)
VALUES
  ('admin@postplat.com', '123456', 'Administrador', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Índices
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);

-- RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read for authenticated" ON admin_users FOR SELECT USING (TRUE);

-- Permisos
GRANT SELECT ON admin_users TO anon;
```

---

## 🔑 Credenciales de Login

```
📧 Email:    admin@postplat.com
🔒 Password: 123456
👤 Role:     admin
```

---

## 🚀 Cómo Usar

### 1. Abre la app
```bash
npm run dev
# http://localhost:3000
```

### 2. Verás la pantalla de Login

### 3. Opciones:

#### ✅ Login Normal
- Email: `admin@postplat.com`
- Password: `123456`
- Click "Entrar como Administrador"

#### ✅ Demo (Acceso Rápido)
- Click "Acceso de Demostración"
- Entra automáticamente con credenciales reales

### 4. Acceso Exitoso
- ✅ Dashboard carga
- ✅ Nombre aparece en TopBar
- ✅ Botón logout disponible

---

## 📊 Estructura de la Tabla `admin_users`

```
Columna       | Tipo      | Descripción
--------------|-----------|------------------------
id            | TEXT      | UUID único
email         | VARCHAR   | Email único (ej: admin@postplat.com)
password      | VARCHAR   | Contraseña en plaintext (123456)
name          | VARCHAR   | Nombre mostrado (Administrador)
role          | VARCHAR   | Rol (admin, store, etc)
is_active     | BOOLEAN   | Si puede acceder (true/false)
last_login    | TIMESTAMP | Última vez que entró
created_at    | TIMESTAMP | Fecha de creación
updated_at    | TIMESTAMP | Última actualización
```

---

## 🔄 Cómo Funciona

```
Usuario abre app
    ↓
App muestra Login si no está autenticado
    ↓
Usuario ingresa: admin@postplat.com / 123456
    ↓
validateAdminCredentials() consulta Supabase
    ↓
SELECT * FROM admin_users 
  WHERE email = 'admin@postplat.com' 
    AND is_active = true
    ↓
Compara password en código
    ↓
✅ Match → setCurrentUser() → Acceso a Dashboard
❌ No match → Muestra error
```

---

## 🛠️ Funciones Helper Nuevas

**Archivo:** `src/lib/supabaseHelpers.js`

```javascript
// Validar credenciales
validateAdminCredentials(email, password)
  → Retorna: { id, email, name, role }
  → Lanza error si credenciales son inválidas

// Obtener usuario admin
getAdminUser(email)
  → Retorna: usuario completo

// Actualizar último login
updateAdminLastLogin(email)
  → Registra cuándo entró el usuario
```

---

## ✨ Cambios Realizados

### Tabla
- ✅ `admin_users` creada en Supabase
- ✅ Índice en email para búsquedas rápidas
- ✅ RLS habilitado
- ✅ Usuario admin precargado: `admin@postplat.com` / `123456`

### Código
- ✅ `validateAdminCredentials()` en supabaseHelpers.js
- ✅ Login.jsx conectado a validación real
- ✅ `updateAdminLastLogin()` registra accesos
- ✅ Contraseña mostrada en el UI para desarrollo

### Flujo
- ✅ No se requiere Supabase Auth (más simple)
- ✅ Validación directa contra tabla
- ✅ Last login se actualiza automáticamente

---

## 🔒 Seguridad (Notas)

⚠️ **DESARROLLO SOLAMENTE:**
- Las contraseñas están en plaintext (NO para producción)
- El email está visible en el UI

✅ **Para Producción:**
1. Usar bcrypt o similar para hash de passwords
2. No mostrar email en el UI
3. Implementar rate limiting en login
4. Usar HTTPS obligatorio
5. Considerar 2FA
6. Usar Supabase Auth nativo si es posible

---

## 🐛 Troubleshooting

### "Email o contraseña inválidos"
```
✓ Verifica que ejecutaste el SQL
✓ Confirma que admin_users existe en Supabase
✓ Revisa que insertaste el usuario correctamente
✓ Intenta con: admin@postplat.com / 123456
```

### "Tabla no encontrada"
```
✓ Verifica que la tabla admin_users existe
✓ Ejecuta el SQL nuevamente
✓ En Supabase: Table Editor → busca "admin_users"
```

### "Error al conectar"
```
✓ Verifica tu conexión a internet
✓ Revisa que .env.local tiene credenciales Supabase correctas
✓ Reinicia: npm run dev
```

---

## 📝 Próximos Pasos

- [ ] Ejecutar SQL en Supabase
- [ ] Verificar que tabla `admin_users` existe
- [ ] Probar login con `admin@postplat.com` / `123456`
- [ ] Verificar "Acceso de Demostración" funciona
- [ ] Probar logout

---

**Login está LISTO para usar** ✅

Luego de ejecutar el SQL, el login funcionará con credenciales reales almacenadas en Supabase.
