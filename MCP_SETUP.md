# 🔌 Configuración de MCP (Model Context Protocol) para Supabase

Con esta configuración, podré acceder y manejar directamente tu base de datos de Supabase sin necesidad de código intermediario.

---

## 📋 Requisitos

- Claude Code instalado
- Servidor MCP Node.js (ya creado en `src/mcp-server.js`)
- Variables de entorno de Supabase configuradas

---

## ⚙️ Instalación

### Paso 1: Instalar dependencias MCP

```bash
npm install @modelcontextprotocol/sdk
```

### Paso 2: Verificar que el archivo MCP existe

El archivo `src/mcp-server.js` ya está creado con todas las herramientas necesarias.

### Paso 3: Configurar en Claude Code

Tienes dos opciones:

---

## 🔧 Opción A: Usar `.mcp.json` (Recomendado para este proyecto)

El archivo `.mcp.json` ya está en la raíz del proyecto:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "node",
      "args": ["src/mcp-server.js"],
      "env": {
        "VITE_SUPABASE_URL": "${VITE_SUPABASE_URL}",
        "VITE_SUPABASE_ANON_KEY": "${VITE_SUPABASE_ANON_KEY}"
      }
    }
  }
}
```

**El servidor MCP se cargará automáticamente** cuando abras este proyecto en Claude Code.

---

## 🔧 Opción B: Configurar en ~/.claude/settings.json (Global)

Si quieres que MCP esté disponible globalmente, agrega esto a tu archivo de configuración:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "node",
      "args": ["/ruta/absoluta/a/POST-PLAT/src/mcp-server.js"],
      "env": {
        "VITE_SUPABASE_URL": "https://tu-proyecto.supabase.co",
        "VITE_SUPABASE_ANON_KEY": "tu-anon-key-aqui"
      }
    }
  }
}
```

**Nota:** Reemplaza las rutas y credenciales con las tuyas.

---

## 🧠 Herramientas MCP Disponibles

Una vez conectado, tendré acceso a estas herramientas:

### 1. **query_table** - Consultar datos
```
Parámetros:
  - table (requerido): Nombre de la tabla
  - select: Columnas a seleccionar (default: *)
  - filter_column: Columna para filtrar
  - filter_value: Valor del filtro
  - order_by: Columna para ordenar
  - ascending: Orden ascendente/descendente
  - limit: Limitar resultados

Ejemplo: Obtener todas las empresas activas
  table: "companies"
  filter_column: "subscription_status"
  filter_value: "Activa"
  limit: 10
```

### 2. **insert_record** - Insertar registro
```
Parámetros:
  - table (requerido): Tabla destino
  - data (requerido): Objeto con datos

Ejemplo: Crear nueva empresa
  table: "companies"
  data: {
    "ruc": "0190000000001",
    "razon_social": "Nueva Empresa S.A.",
    "nombre_comercial": "Nueva Empresa",
    "plan_id": "plan-1"
  }
```

### 3. **update_record** - Actualizar registro
```
Parámetros:
  - table (requerido): Tabla
  - id (requerido): ID del registro
  - data (requerido): Datos a actualizar

Ejemplo: Cambiar estado de empresa
  table: "companies"
  id: "empresa-123"
  data: {
    "subscription_status": "Activa",
    "payment_status": "Al día"
  }
```

### 4. **delete_record** - Eliminar registro
```
Parámetros:
  - table (requerido): Tabla
  - id (requerido): ID a eliminar

Ejemplo: Eliminar empresa
  table: "companies"
  id: "empresa-123"
```

### 5. **list_tables** - Listar tablas
```
Sin parámetros. Retorna todas las tablas de la BD.
```

### 6. **execute_sql** - SQL directo
```
Parámetros:
  - sql (requerido): Query SQL

Ejemplo:
  sql: "SELECT COUNT(*) as total FROM companies WHERE subscription_status = 'Activa'"
```

---

## 🚀 Cómo Usarlo

Una vez que MCP esté configurado, simplemente:

1. **Abre este proyecto en Claude Code**
2. **Espera a que se cargue el servidor MCP** (verás un mensaje de confirmación)
3. **Pídeme que haga algo con la BD:**

```
"Obtén todas las empresas con suscripción activa"
"Crea una nueva empresa con RUC 0190000000001"
"Actualiza el estado de pago de la empresa ABC123"
"Muéstrame el historial de pagos del último mes"
"Elimina la empresa TEST123"
```

**Yo usaré el MCP automáticamente para ejecutar estos comandos.**

---

## 📊 Casos de Uso Comunes

### Obtener datos
```
"Muéstrame todas las empresas"
"¿Cuántos pagos pendientes hay?"
"Listar puntos de venta de la empresa XYZ"
```

### Crear datos
```
"Crea una nueva empresa llamada ABC Corp"
"Registra un pago de $100 USD"
"Agrega un nuevo punto de venta"
```

### Modificar datos
```
"Actualiza el status de la empresa ABC123 a 'Suspendida'"
"Cambia el plan de la empresa XYZ a 'Profesional'"
"Registra una actividad: empresa actualizada"
```

### Eliminar datos
```
"Elimina la empresa de prueba TEST123"
"Borra el punto de venta POS-001"
```

### Análisis
```
"¿Cuántas empresas están activas?"
"Cuál es el ingreso total de pagos?"
"Muéstrame el log de actividades de hoy"
```

---

## 🔍 Verificar que MCP está conectado

Después de configurar, podrás ver en Claude Code:

```
✅ MCP Server: supabase
   Status: Connected
   Tools: 6 available
```

---

## 🔒 Seguridad

### ✅ Protegido
- Credenciales en `.env.local` (no en `.mcp.json`)
- Servidor MCP solo accesible localmente
- Variables de entorno se pasan de forma segura

### ⚠️ Importante
- **No compartir** `.env.local`
- **No publicar** credenciales en GitHub
- El archivo `.mcp.json` es seguro (no contiene credenciales)

---

## 🐛 Troubleshooting

### "MCP Server not found"
- Verifica que `.mcp.json` está en la raíz del proyecto
- Reinicia Claude Code
- Verifica que `src/mcp-server.js` existe

### "Connection refused"
- Asegúrate que `.env.local` tiene credenciales válidas
- Verifica permisos de Supabase
- Intenta ejecutar el servidor manualmente:
  ```bash
  node src/mcp-server.js
  ```

### "Module not found"
- Instala dependencias:
  ```bash
  npm install @modelcontextprotocol/sdk
  ```

### "Invalid credentials"
- Verifica que `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` son correctas
- Las credenciales deben venir de https://supabase.com > Settings > API

---

## 📚 Más Información

- [Documentación de MCP](https://modelcontextprotocol.io)
- [Documentación de Supabase](https://supabase.com/docs)
- [Claude Code MCP Guide](https://claude.ai/help)

---

## ✨ Una vez configurado

Podrás simplemente decirme:

**"Crea una empresa nueva llamada 'Mi Startup' con RUC 0190000000002 en el plan Profesional"**

Y yo:
1. ✅ Accederé directamente a Supabase via MCP
2. ✅ Crearé el registro en la BD
3. ✅ Te mostraré el resultado
4. ✅ Todo sin necesidad de código intermediario

---

**Estado:** 📍 Listo para configurar  
**Próximo paso:** Instala las dependencias y reinicia Claude Code
