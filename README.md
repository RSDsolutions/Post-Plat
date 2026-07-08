# 📊 POST-PLAT v2.0 - Sistema de Gestión Empresarial

Sistema profesional para gestionar empresas, puntos de venta y facturación. Desarrollado con React, Vite, Tailwind CSS, Zustand y Supabase.

## ✨ Características

- ✅ **Gestión de Empresas** - Múltiples empresas con suscripciones
- ✅ **POS & Facturación** - Gestión completa de puntos de venta y facturas
- ✅ **Inventario** - Control de productos y stock
- ✅ **Clientes** - Base de datos de clientes con crédito
- ✅ **Usuarios** - Control de acceso por roles (admin, gerente, vendedor, contador)
- ✅ **Seguridad** - RLS, auditoría, contraseñas hasheadas
- ✅ **Auditoría Completa** - Registro de todos los cambios
- ✅ **API Supabase** - Acceso directo vía MCP

## 🚀 Quick Start

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
# Copia .env.example a .env.local

# 3. Ejecutar en desarrollo
npm run dev

# 4. Abrir en navegador
# http://localhost:5173
```

## 🗂️ Estructura del Proyecto

```
POST-PLAT/
├── src/
│   ├── components/
│   │   ├── layout/      # Layout y navegación
│   │   ├── pages/       # Páginas principales
│   │   └── ui/          # Componentes UI
│   ├── lib/
│   │   ├── supabase.js  # Cliente Supabase
│   │   └── ...helpers.js
│   ├── store/           # Zustand state management
│   ├── App.jsx
│   └── main.jsx
├── DATABASE_SCHEMA_V2.sql      # Base de datos
├── DATABASE_IMPROVEMENTS.md    # Documentación BD
├── SECURITY_GUIDE.md           # Seguridad
├── CLAUDE.md                   # Guía de desarrollo
└── package.json
```

## 📡 MCP Integration

**Todas las operaciones de BD usan MCP (Model Context Protocol)**

Herramientas disponibles:
- `mcp__supabase__execute_sql` - Ejecutar SQL
- `mcp__supabase__query_table` - Consultar tabla
- `mcp__supabase__insert_record` - Insertar datos
- `mcp__supabase__update_record` - Actualizar datos

Ver `CLAUDE.md` para más detalles.

## 🗄️ Base de Datos v2.0

**16 Tablas** con arquitectura profesional:

**Usuarios & Acceso:**
- admin_users, users, permissions, role_permissions

**Empresas:**
- companies, plans, branches, point_of_sales

**Operaciones:**
- products, customers, invoices, invoice_details, payments

**Auditoría:**
- inventory_movements, audit_log, activity_log

**Seguridad:**
- ✅ RLS habilitado
- ✅ Contraseñas hasheadas (bcrypt)
- ✅ Auditoría detallada
- ✅ Control de roles granular

## 🔧 Configuración

### Variables de Entorno
```env
VITE_SUPABASE_URL=https://mupqrcqwvvxubasnmron.supabase.co
VITE_SUPABASE_ANON_KEY=your_key_here
```

### MCP Configuration
- Global: `~/.mcp.json`
- Project: `.mcp.json`

Ambos están configurados para usar Supabase MCP oficial.

## 📝 Git Workflow

```bash
# Hacer cambios
git add .
git commit -m "feat: Descripción de cambios"
git push origin main

# Vercel despliega automáticamente
```

**Formato de commits:**
- `feat:` Nueva funcionalidad
- `fix:` Corrección de bug
- `db:` Cambios de BD
- `refactor:` Reorganización de código

## 📚 Documentación

- `CLAUDE.md` - Guía completa de desarrollo
- `DATABASE_SCHEMA_V2.sql` - Schema completo
- `DATABASE_IMPROVEMENTS.md` - Mejoras implementadas
- `SECURITY_GUIDE.md` - Mejores prácticas de seguridad

## 🔐 Seguridad

- Contraseñas hasheadas con bcrypt
- Row Level Security (RLS) en todas las tablas
- Auditoría de cambios (audit_log)
- Control de acceso por roles
- Bloqueo automático tras fallos de login

## 🚀 Deployment

```bash
# Push a GitHub → Vercel despliega automáticamente
git push origin main
```

## 🔗 Links

- **Supabase:** https://app.supabase.com/project/mupqrcqwvvxubasnmron
- **Vercel:** Configurado para deploy automático

## 📞 Desarrollo

Para guía de desarrollo, ver `CLAUDE.md`

---

**Version:** 2.0 | **Status:** ✅ Production Ready | **Updated:** 2026-07-08
