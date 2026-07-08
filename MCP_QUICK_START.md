# 🚀 MCP Supabase - Guía Rápida

## ⚡ Instalación en 2 minutos

### Paso 1: Las dependencias ya están instaladas ✅
```bash
# Ya hecho:
npm install @modelcontextprotocol/sdk
```

### Paso 2: El servidor MCP ya está creado ✅
- Archivo: `src/mcp-server.js`
- Configuración: `.mcp.json`

### Paso 3: Reinicia Claude Code
1. Cierra Claude Code completamente
2. Abre nuevamente el proyecto POST-PLAT
3. Espera a que cargue el servidor MCP

---

## ✨ ¿Qué puedes pedirme ahora?

Una vez que MCP esté conectado, puedo hacer cualquier cosa con tu BD:

### 📖 Consultar (SELECT)
```
"Muéstrame todas las empresas"
"¿Cuántas empresas tienen suscripción activa?"
"Dame los pagos del último mes"
"Listar todos los puntos de venta de la empresa ABC"
```

### ➕ Crear (INSERT)
```
"Crea una nueva empresa llamada 'Tech Solutions' con RUC 0190000000001"
"Registra un pago de $150 USD del cliente XYZ"
"Agrega un nuevo punto de venta en Lima"
"Crea un nuevo plan llamado 'StartUp' por $50/mes"
```

### ✏️ Actualizar (UPDATE)
```
"Cambia el status de la empresa ABC123 a 'Suspendida'"
"Actualiza el plan de XYZ Corp a 'Empresarial'"
"Marca el pago PAGO-001 como 'Pagado'"
"Cambia el nombre comercial de la empresa ABC a 'Tech ABC'"
```

### 🗑️ Eliminar (DELETE)
```
"Elimina la empresa de prueba TEST123"
"Borra el punto de venta POS-TEST-001"
"Elimina el registro de actividad de prueba"
```

### 📊 Análisis
```
"¿Cuál es el ingreso total de pagos?"
"¿Cuántos usuarios activos hay?"
"Muéstrame empresas con pagos vencidos"
"¿Cuántas empresas hay por plan?"
```

---

## 🎯 Ejemplo Real

### Tú escribes:
```
"Crea una nueva empresa:
- RUC: 0190000000005
- Razón Social: Nueva Startup S.A.
- Nombre Comercial: Mi Startup
- Plan: Básico
- Email: admin@mistartup.com"
```

### Yo hago:
```
1. Conecto a Supabase via MCP
2. Ejecuto: INSERT INTO companies (...)
3. Retorno el registro creado con su ID
4. Registro la actividad en el log
5. Te confirmo que está listo
```

**Sin escribir código. Solo pidiendo.**

---

## 🔧 Herramientas MCP Disponibles

| Herramienta | Qué hace | Parámetros |
|-------------|----------|-----------|
| **query_table** | Consultar datos | table, select, filter, order, limit |
| **insert_record** | Crear registro | table, data |
| **update_record** | Modificar registro | table, id, data |
| **delete_record** | Eliminar registro | table, id |
| **list_tables** | Ver todas las tablas | - |
| **execute_sql** | SQL directo | sql |

---

## 📋 Tablas Disponibles

```
- companies          (Empresas)
- point_of_sales     (Puntos de venta)
- plans              (Planes)
- payments           (Pagos)
- activity_log       (Historial)
```

---

## 🎨 Ejemplo: Workflow Completo

**Tarea:** "Agrega una empresa nueva y registra un pago"

**Conversación:**
```
Tú: "Necesito crear una empresa nueva para 'Retail Solutions' 
     y registrar un pago inicial de $99.99"

Yo: 
  1. ✅ Creé la empresa (ID: xyz789)
  2. ✅ Registré el pago $99.99
  3. ✅ Registré la actividad en el log
  4. ✅ Aquí está el resumen:
     - Empresa: Retail Solutions
     - Plan: Profesional
     - Primer Pago: $99.99 (Pagado)
     - Status: Activa
     - Creada: 2026-07-08

Tú: "Perfecto, ahora actualiza el status a 'Suspendida' por pago vencido"

Yo:
  1. ✅ Actualicé la empresa a "Suspendida"
  2. ✅ Registré la actividad
  3. ✅ Listo
```

---

## 🔐 Seguridad

✅ Credenciales en `.env.local` (no expuestas)  
✅ Servidor MCP solo local  
✅ Acceso controlado por Supabase RLS  
✅ Auditoría completa en activity_log  

---

## 🚨 Situaciones Especiales

### ¿Quiero hacer SQL directo?
```
Tú: "Ejecuta esta query: SELECT COUNT(*) FROM companies WHERE subscription_status = 'Activa'"

Yo: Usaré execute_sql y te daré el resultado
```

### ¿Necesito datos completos de una empresa?
```
Tú: "Dame todos los datos de la empresa ABC123, incluyendo sus puntos de venta y pagos"

Yo: 
  1. Obtengo empresa
  2. Obtengo sus puntos de venta
  3. Obtengo su historial de pagos
  4. Te devuelvo un JSON completo
```

### ¿Quiero un reporte?
```
Tú: "Muéstrame un reporte de:
     - Total de empresas activas
     - Ingreso total mensual
     - Empresas con pagos vencidos
     - Actividad del último mes"

Yo: Hago múltiples queries y te presento un reporte formateado
```

---

## ✅ Verificar que MCP está activo

Cuando abras Claude Code, busca este mensaje:
```
✅ MCP Server Connected: supabase
   Status: Ready
   Commands available: 6
   Database: mupqrcqwvvxubasnmron
```

Si no ves este mensaje:
1. Verifica que `.mcp.json` existe
2. Verifica que `.env.local` tiene credenciales
3. Reinicia Claude Code
4. Revisa console (F12) para errores

---

## 💡 Pro Tips

1. **Sé específico**: 
   - ❌ "Crea una empresa"
   - ✅ "Crea una empresa Tech Solutions con RUC 0190000000010, plan Profesional"

2. **Combina operaciones**:
   - ✅ "Crea la empresa, registra un pago, y muéstrame los datos"

3. **Pide análisis**:
   - ✅ "Analiza qué empresas están a punto de vencer"

4. **Automatiza**:
   - ✅ "Cada vez que crees una empresa, registra la actividad automáticamente"

---

## 🎊 ¡Listo!

Tu base de datos de Supabase está ahora completamente accesible a través de MCP.

**Prueba ahora pidiéndome:**
```
"¿Cuántas empresas hay en la BD?"
"Muéstrame las primeras 3 empresas"
"¿Cuál es el plan más popular?"
```

---

**MCP Status:** ✅ Configurado y listo  
**Fecha:** 2026-07-08  
**Siguiente:** Cierra y reabre Claude Code para activar
