# 🔧 CLAUDE.md - POST-PLAT Development Guide

## 🎯 Principios Fundamentales

Este proyecto usa **MCP (Model Context Protocol)** para acceso directo a Supabase. Toda operación en la base de datos debe hacerse a través del MCP.

---

## 📡 MCP Configuration

### Global MCP Setup (Already Configured)
```json
// ~/.mcp.json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=mupqrcqwvvxubasnmron&features=storage%2Cbranching%2Cfunctions%2Cdatabase%2Caccount%2Cdevelopment%2Cdebugging%2Cdocs"
    }
  }
}
```

### Project MCP Setup
```json
// .mcp.json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=mupqrcqwvvxubasnmron&features=storage%2Cbranching%2Cfunctions%2Cdatabase%2Caccount%2Cdevelopment%2Cdebugging%2Cdocs"
    }
  }
}
```

**Available Tools:**
- `mcp__supabase__execute_sql` - Run SQL queries
- `mcp__supabase__list_tables` - List all tables
- `mcp__supabase__query_table` - Query specific table
- `mcp__supabase__insert_record` - Insert data
- `mcp__supabase__update_record` - Update data
- `mcp__supabase__delete_record` - Delete data
- `mcp__supabase__apply_migration` - Apply migrations

---

## 💾 Database

### Database Version
- **Schema:** v2.0
- **Location:** `DATABASE_SCHEMA_V2.sql`
- **Last Updated:** 2026-07-08

### Core Tables (16 total)

**Administration:**
- `admin_users` - System administrators
- `permissions` - Granular permissions
- `role_permissions` - Role-permission mapping

**Companies & Structure:**
- `companies` - Main company records
- `plans` - Subscription plans
- `branches` - Company branches
- `point_of_sales` - POS terminals

**Operations:**
- `users` - Company users with roles
- `products` - Inventory management
- `customers` - Customer database
- `invoices` - Invoice/comprobante records
- `invoice_details` - Invoice line items
- `payments` - Payment records
- `inventory_movements` - Stock audit trail

**Monitoring:**
- `audit_log` - Detailed change audit
- `activity_log` - Activity tracking

### Security Features
- ✅ Password hashing with bcrypt
- ✅ Row Level Security (RLS) enabled
- ✅ Role-based access control
- ✅ Failed login attempt tracking
- ✅ Complete audit logging
- ✅ Soft delete support

---

## 🔐 Authentication & Access

### Admin User Creation
```sql
INSERT INTO admin_users (email, password_hash, name)
VALUES (
  'admin@example.com',
  crypt('secure_password', gen_salt('bf')),
  'Admin Name'
);
```

### User Creation (Company)
```sql
INSERT INTO users (company_id, email, password_hash, name, role)
VALUES (
  'company-uuid',
  'user@example.com',
  crypt('secure_password', gen_salt('bf')),
  'User Name',
  'vendedor'::user_role
);
```

### Valid Roles
- `admin` - Full system access
- `gerente` - Manager access
- `vendedor` - Sales person
- `contador` - Accountant
- `operario` - Operator

---

## 📝 Git Workflow

### ALWAYS commit after changes:
```bash
git add .
git commit -m "feat: Description of changes"
git push origin main
```

### Commit Message Format
- **feat:** New feature
- **fix:** Bug fix
- **refactor:** Code reorganization
- **docs:** Documentation
- **db:** Database schema changes
- **chore:** Maintenance

### Examples
```bash
# Database changes
git commit -m "db: Add invoice_details table"

# New feature
git commit -m "feat: Add customer management page"

# Bug fix
git commit -m "fix: Correct RLS policy for products"
```

---

## 🗂️ Project Structure

```
POST-PLAT/
├── src/
│   ├── components/
│   │   ├── layout/        # Layout components
│   │   ├── pages/         # Page components
│   │   └── ui/            # UI components
│   ├── lib/
│   │   ├── supabase.js    # Supabase client
│   │   └── ...helpers.js  # Helper functions
│   ├── store/             # Zustand state management
│   ├── data/              # Mock data
│   ├── App.jsx
│   └── main.jsx
├── .mcp.json              # MCP configuration
├── .env.local             # Environment variables
├── .claude/               # Claude Code customization
├── DATABASE_SCHEMA_V2.sql # Database schema
├── DATABASE_IMPROVEMENTS.md # Schema documentation
├── SECURITY_GUIDE.md      # Security guidelines
├── README.md              # Project overview
└── package.json
```

---

## 🚀 Development Workflow

### 1. Making Database Changes
```bash
# Option A: Use MCP directly
# In Claude Code:
mcp__supabase__execute_sql("ALTER TABLE products ADD COLUMN ...")

# Option B: Create migration file
# Edit DATABASE_SCHEMA_V2.sql
# Then apply via MCP
```

**⚠️ Si la migración toca `users`, `companies`, o sus políticas RLS/GRANTs: corré `npm run smoke:login` antes de dar el cambio por terminado.** El 2026-07-15 una migración agregó una columna a `users` sin otorgarle `SELECT` a `authenticated` y el login quedó roto para el 100% de usuarios reales sin que ningún build/test lo detectara — el script replica el login real end-to-end (Auth + el mismo `SELECT` de perfil que usa `useStore.js`) contra la base de datos real, con una cuenta canario fija (no se borra, se crea sola la primera vez). Ver `scripts/smoke-login.mjs`.

### 2. Making Code Changes
```bash
# Edit components/pages/features
# Test in development
npm run dev

# Stage and commit
git add .
git commit -m "feat: Add new feature"
git push origin main
```

### 3. Deployment
```bash
# Push to GitHub → Automatic Vercel deploy
git push origin main
# Vercel automatically builds and deploys
```

---

## 🔍 Common Tasks

### Query data via MCP
```javascript
// Using MCP tool
mcp__supabase__execute_sql(
  "SELECT * FROM companies WHERE subscription_status = 'activa'"
)
```

### Create migration
```sql
-- Add column to products table
ALTER TABLE products ADD COLUMN warehouse_location VARCHAR(100);

-- Create index for performance
CREATE INDEX idx_products_warehouse ON products(warehouse_location);
```

### Add new user permission
```sql
INSERT INTO permissions (name, description)
VALUES ('archive_invoice', 'Archive invoice records');

-- Link to role
INSERT INTO role_permissions (role, permission_id)
VALUES (
  'gerente'::user_role,
  (SELECT id FROM permissions WHERE name = 'archive_invoice')
);
```

---

## 📊 Monitoring & Auditing

### View audit log
```sql
SELECT * FROM audit_log 
WHERE company_id = 'uuid' 
ORDER BY created_at DESC;
```

### Check login attempts
```sql
SELECT email, failed_login_attempts, locked_until 
FROM admin_users 
WHERE failed_login_attempts > 0;
```

### View activity
```sql
SELECT * FROM activity_log 
WHERE company_id = 'uuid' 
ORDER BY created_at DESC;
```

---

## ⚙️ Environment Variables

Required in `.env.local`:
```
VITE_SUPABASE_URL=https://mupqrcqwvvxubasnmron.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

**Never commit secrets!** Use `.env.local` for local development.

---

## 📚 Documentation Files

- `README.md` - Project overview and setup
- `DATABASE_SCHEMA_V2.sql` - Complete database schema
- `DATABASE_IMPROVEMENTS.md` - Schema changes and improvements
- `SECURITY_GUIDE.md` - Security best practices

---

## 🎯 Important Rules

### MUST USE MCP FOR:
- ✅ Database queries
- ✅ Schema changes
- ✅ Data migrations
- ✅ Bulk operations

### MUST COMMIT AFTER:
- ✅ Any code changes
- ✅ Database schema updates
- ✅ New features
- ✅ Bug fixes

### MUST RUN `npm run smoke:login` AFTER:
- ✅ Cualquier migración que toque `users`, `companies`, o sus políticas RLS/GRANTs
- ✅ Cambios a `loginWithPassword()`, `useStore.js` (`login`/`restoreAuth`), o las funciones `current_company_id()`/`current_role()`/`is_platform_admin()`
- Ver detalle y motivo (incidente real) en la sección "Making Database Changes" arriba.

### DO NOT COMMIT:
- ❌ `.env.local` (secrets)
- ❌ `node_modules/`
- ❌ `.DS_Store` / `Thumbs.db`
- ❌ IDE-specific files (already in `.gitignore`)

---

## 🔗 References

- **Supabase Project:** https://app.supabase.com (mupqrcqwvvxubasnmron)
- **MCP Docs:** https://modelcontextprotocol.io
- **Database Schema:** See DATABASE_SCHEMA_V2.sql
- **Vercel Deploy:** Automatic on GitHub push

---

## 📞 Quick Reference

**Start Development:**
```bash
npm install
npm run dev
```

**Build for Production:**
```bash
npm run build
```

**View Database:**
```bash
# Open Supabase Studio
https://app.supabase.com/project/mupqrcqwvvxubasnmron
```

**Check Git Status:**
```bash
git status
git log --oneline
```

---

**Last Updated:** 2026-07-08  
**Version:** 2.0  
**Status:** ✅ Production Ready
