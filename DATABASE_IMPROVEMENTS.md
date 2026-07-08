# 📊 Mejoras de Base de Datos - POST-PLAT v2.0

## 🎯 Resumen de Cambios

Se ha creado una estructura de base de datos mejorada para un sistema profesional de **Gestión de Empresas, POS y Facturación** con:
- ✅ Seguridad de nivel empresarial
- ✅ Control de acceso granular (RLS)
- ✅ Auditoría completa
- ✅ Escalabilidad para miles de usuarios
- ✅ Integridad de datos garantizada

---

## 📋 Nuevas Tablas Agregadas

### 1. **roles y permissions**
- Gestión granular de permisos por rol
- Soporte para roles: admin, gerente, vendedor, contador, operario
- Permisos específicos para cada operación

### 2. **users** (Usuarios de Empresa)
- Usuarios con acceso a cuentas específicas
- Contraseña hasheada (seguridad)
- Control de intentos fallidos
- Bloqueo automático

### 3. **branches** (Sucursales)
- Soporte para múltiples sucursales por empresa
- Datos tributarios por sucursal
- Independencia de datos entre sucursales

### 4. **products** (Productos)
- Inventario de productos
- Precios (costo y venta)
- Impuestos
- Stock mínimo

### 5. **customers** (Clientes)
- Gestión de clientes
- Crédito disponible
- Balance adeudado

### 6. **invoices** (Facturas/Comprobantes)
- Soporte para múltiples tipos: factura, nota de crédito, nota de débito
- Autorización fiscal
- Estados: borrador, autorizada, anulada
- Detalles completos de facturación

### 7. **invoice_details** (Detalles de Facturas)
- Cada línea de factura
- Descuentos y impuestos por línea
- Referencia a productos

### 8. **inventory_movements** (Movimientos de Inventario)
- Auditoría completa de stock
- Trazabilidad de cambios
- Soporte para múltiples tipos de movimiento

### 9. **audit_log** (Auditoría Detallada)
- Registro de todos los cambios
- Valores antes y después
- IP y user agent
- Completo para cumplimiento normativo

### 10. **activity_log** (Actividad)
- Registro simplificado de actividades
- Para reportes de uso

---

## 🔒 Mejoras de Seguridad

### 1. **Hashing de Contraseñas**
```sql
-- Usa pgcrypto para hash de contraseñas
password_hash VARCHAR(255) NOT NULL
```
Para guardar: `crypt('password', gen_salt('bf'))`
Para verificar: `password_hash = crypt('password', password_hash)`

### 2. **Row Level Security (RLS)**
- Habilitado en todas las tablas sensibles
- Usuarios solo ven datos de su empresa
- Políticas separadas por rol

### 3. **Control de Acceso**
- Roles específicos: admin, gerente, vendedor, contador
- Permisos granulares para cada operación
- Bloqueo automático después de fallos de login

### 4. **Auditoría Completa**
- Cada cambio es registrado en `audit_log`
- Valores antes y después
- Identificación del usuario y IP

---

## 📊 Estructura de Relaciones

```
plans (planes)
  ↓ foreign key
companies (empresas)
  ↓ foreign key
├── users (usuarios)
├── branches (sucursales)
│   └── point_of_sales (POS)
│       └── invoices (facturas)
│           └── invoice_details
├── products (productos)
│   └── inventory_movements
├── customers (clientes)
└── payments (pagos)

audit_log (auditoría de cambios)
activity_log (registro de actividades)
```

---

## 🚀 Cómo Ejecutar la Migración

### Opción 1: Ejecutar en Supabase SQL Editor (Recomendado)

1. Ve a tu proyecto en https://supabase.com
2. Abre **SQL Editor** → **New Query**
3. Copia TODO el contenido de `DATABASE_SCHEMA_V2.sql`
4. Pega en el editor
5. Click **Run**
6. ✅ Espera a que se ejecute sin errores

### Opción 2: Usar el MCP de Supabase (Desde Claude Code)

```bash
# En Claude Code, usa el MCP para ejecutar el SQL
mcp__supabase__apply_migration "DATABASE_SCHEMA_V2.sql"
```

---

## ✨ Tablas Modificadas

### **admin_users**
Cambios:
- ✅ Nuevo campo `password_hash` (para hash seguro)
- ✅ Campos de seguridad: `failed_login_attempts`, `locked_until`
- ✅ Auditoría: `last_password_change`

### **companies**
Cambios:
- ✅ Nuevo campo `deleted_at` (soft delete)
- ✅ Mejor indexación
- ✅ Relación con `plans` mejorada

### **activity_log** → **audit_log**
Cambios:
- ✅ Nueva tabla `audit_log` para auditoría detallada
- ✅ `activity_log` simplificada para registros rápidos

---

## 🔑 Permisos Predefinidos

```
create_invoice    - Crear facturas
view_invoice      - Ver facturas
edit_invoice      - Editar facturas
delete_invoice    - Eliminar facturas
create_product    - Crear productos
view_product      - Ver productos
edit_product      - Editar productos
view_reports      - Ver reportes
manage_users      - Gestionar usuarios
manage_company    - Gestionar empresa
```

---

## 📈 Índices Agregados

Se han agregado índices en:
- `companies.ruc` - Búsqueda rápida por RUC
- `companies.subscription_status` - Filtrado por estado
- `users.company_id, users.email` - Acceso a usuarios
- `products.company_id, products.code` - Búsqueda de productos
- `invoices.company_id, invoices.status` - Filtrado de facturas
- `invoice_details.invoice_id` - Acceso a detalles
- `payments.payment_date` - Reportes por fecha
- `audit_log.created_at` - Consultas de auditoría

---

## 🛡️ Buenas Prácticas Implementadas

1. **Soft Delete**: Columna `deleted_at` en `companies` para no perder datos
2. **Timestamps**: `created_at` y `updated_at` en todas las tablas
3. **Integridad**: Foreign keys con `ON DELETE CASCADE` donde es apropiado
4. **Auditoría**: Todo cambio se registra en `audit_log`
5. **Escalabilidad**: Índices optimizados para búsquedas rápidas
6. **Seguridad**: RLS habilitado en tablas sensibles

---

## 🔄 Próximos Pasos

1. ✅ **Ejecutar el script SQL** (como se describe arriba)
2. ✅ **Verificar la creación** de todas las tablas
3. ✅ **Configurar RLS policies** adicionales según necesidad
4. ✅ **Actualizar la aplicación** para usar las nuevas tablas
5. ✅ **Crear funciones** para operaciones comunes (login, facturación, etc.)

---

## 🚨 Notas Importantes

⚠️ **ANTES DE EJECUTAR:**
- Hacer backup de la base de datos actual
- Revisar que no hayas ejecutado esto antes
- Verificar que tienes acceso de admin a Supabase

✅ **DESPUÉS DE EJECUTAR:**
- Verificar que todas las tablas se crearon
- Confirmar que los índices funcionan
- Probar las políticas de RLS

---

## 📞 Soporte

Si hay errores al ejecutar:
1. Revisa el mensaje de error en Supabase
2. Verifica que no existan tablas duplicadas
3. Si necesitas limpiar: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
4. Vuelve a ejecutar el script

---

**Status:** ✅ Listo para Producción (después de testing)
**Última actualización:** 2026-07-08
**Versión:** 2.0
