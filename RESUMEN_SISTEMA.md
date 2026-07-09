# 📘 Resumen del Sistema - POST-PLAT

**Fecha:** 2026-07-09

> Este documento explica **cómo funciona el sistema hoy**: arquitectura, roles, modelo de datos y flujos principales. Para riesgos, mejoras pendientes y hoja de ruta, ver [`AUDITORIA_SISTEMA.md`](./AUDITORIA_SISTEMA.md).

---

## 1. Qué es POST-PLAT

POST-PLAT es un **SaaS multi-tenant de punto de venta (POS) y facturación electrónica** para Ecuador. Un mismo despliegue sirve a múltiples empresas clientes ("tenants"), cada una con su propio RUC, catálogo, usuarios, sucursales y facturación — administradas centralmente por un panel de super-admin que gestiona la suscripción de cada cliente al estilo SaaS clásico (plan, cobro, suspensión).

La pieza diferencial del sistema es que la facturación **no es simulada**: genera comprobantes electrónicos reales, los firma digitalmente (XAdES-BES) y los envía al **SRI** (Servicio de Rentas Internas de Ecuador) por sus web services SOAP oficiales, siguiendo el ciclo real de recepción → autorización.

---

## 2. Roles y usuarios

El sistema tiene dos "mundos" separados que comparten la misma base de datos pero no la misma interfaz:

### 2.1 Super-admin (dueño de la plataforma)
- Tabla `public.users`, `role = 'admin'`.
- Gestiona **empresas clientes**: alta (wizard), edición de datos fiscales, suspensión/reactivación, cambio de plan, registro de pagos, panel de alertas y feed de actividad.
- No participa en la operación diaria de ninguna empresa cliente (no vende, no factura).
- Existe también una tabla legada `admin_users`, que **no se usa** — es de una versión anterior del proyecto y quedó sin políticas RLS ni consultas activas.

### 2.2 Usuarios de una empresa cliente
Todos viven en `public.users`, filtrados por `company_id`, con un `role` de:

| Rol | Uso típico |
|---|---|
| `gerente` | Dueño/administrador de la empresa cliente. Acceso completo a su empresa: inventario, sucursales, cajeros, facturación, reportes, configuración SRI. |
| `vendedor` / `operario` | Cajero. Solo opera el punto de venta (POS) de la sucursal a la que fue asignado. Creados por el propio gerente. |
| `contador` | Rol contemplado en el esquema para acceso contable/reportes; sin pantallas dedicadas propias todavía más allá de lo que ya ve un `gerente`. |

**No existe Supabase Auth.** El login es una función propia (`verify_user_password` / `verify_admin_password`) que compara la contraseña recibida contra un hash `bcrypt` guardado en `password_hash`, usando `pgcrypto` (`crypt()`). El cliente (navegador) se queda con el objeto de usuario devuelto; no hay JWT ni sesión firmada — cada pantalla vuelve a pedir datos filtrando por el `company_id`/`id` que ya tiene en memoria. (Las implicancias de esto para seguridad están detalladas en la auditoría, no aquí.)

---

## 3. Modelo multi-tenant

- `companies` es la tabla raíz de cada tenant: identidad fiscal (RUC, razón social, nombre comercial, dirección, régimen), ambiente SRI (pruebas/producción), y estado de suscripción (`subscription_status`: activa / suspendida / vencida / etc., `subscription_renewal`, `payment_status`).
- `plans` define los planes comerciales (nombre, precio, límites: `max_invoices_monthly`, features incluidas). Cada `companies.plan_id` apunta a uno.
- El **wizard de alta** del panel admin (`CompanyWizard.jsx`) crea, en una sola operación: la fila en `companies`, su primera sucursal ("Matriz"), el primer punto de venta de esa sucursal, y el primer login `gerente` (vía el RPC `create_company_gerente`) — mostrando la contraseña temporal una sola vez para que el admin se la comparta al cliente por un canal seguro.
- **Los clientes (`customers`) son globales dentro de cada empresa**, no por sucursal — a propósito, para no duplicar un mismo cliente que compra en más de un local del mismo RUC.

---

## 4. Modelo multi-sucursal

Cada empresa puede tener una o varias sucursales, y cada sucursal puede facturar con su propio establecimiento/punto de emisión SRI:

- **`branches`** — las sucursales de la empresa (nombre, dirección, código de establecimiento SRI).
- **`point_of_sales`** — los puntos de venta dentro de cada sucursal. Acá vive la numeración SRI real: `numero_establecimiento`, `numero_pos`, y `sequential_current` (el secuencial que se incrementa con cada factura autorizada). Antes de esta arquitectura, esta numeración vivía en una sola fila de `billing_configs` por empresa; ahora cada punto de venta lleva la suya, lo que permite que una misma empresa emita con distintos establecimientos/puntos de emisión simultáneamente, tal como lo permite el propio SRI.
- **`products`** — catálogo compartido por toda la empresa (nombre, código, precio, IVA, categoría). No cambia entre sucursales.
- **`product_stock`** — la existencia real de cada producto, **por sucursal** (`product_id` + `branch_id` + `quantity` + `min_stock`). Es un modelo "auto-sanador": si no existe una fila para un producto en una sucursal, se interpreta como stock 0, sin necesidad de sembrar filas manualmente al crear sucursales o productos nuevos. La vista "todas las sucursales" del inventario simplemente suma estas filas.
- **`users.branch_id`** — a qué sucursal está asignado un cajero (`vendedor`/`operario`). Un cajero sin sucursal asignada no puede vender: el POS bloquea la pantalla con un mensaje explícito.
- **`billing_configs`** sigue existiendo, pero ahora solo para lo que realmente es a nivel de toda la empresa: certificado de firma electrónica (.p12), contraseña del certificado, tasa de IVA, ambiente SRI, régimen contable — no numeración de facturas.

**Flujo de una venta:** el cajero abre el POS → el sistema resuelve su sucursal y el punto de venta activo de esa sucursal → al cobrar, se descuenta `product_stock` de esa sucursal y la factura toma establecimiento/punto de emisión/secuencial de ese punto de venta específico (no de una configuración global).

---

## 5. Facturación electrónica SRI — flujo completo

1. **Venta en el POS** (`POSInterface.jsx`): el cajero arma la venta, se calcula IVA/descuentos, se crea la factura en estado **`borrador`** con sus líneas en `invoice_details`, y se descuenta stock.
2. **Aprobación/envío** (rol `gerente`/`admin`): dispara una llamada a la función serverless `api/sri/submit-invoice.js` (Vercel), pasando `invoiceId`/`companyId`/`userId`. Esta función corre en Node (no en el navegador) porque necesita capacidades que un navegador no tiene: criptografía sobre el certificado `.p12`, y llamadas SOAP directas al SRI.
3. Dentro de esa función:
   - Verifica que el `userId` pertenezca a la `companyId` y tenga rol `gerente`/`admin`.
   - Arma el XML de la factura (formato oficial SRI, usando una versión propia de `open-factura` para generarlo).
   - Descarga el certificado `.p12` de Supabase Storage (bucket privado `sri-certificates`) y lo firma con **XAdES-BES** (librería `xadesjs`, con canonicalización XML real vía WebCrypto — se abandonó una implementación manual anterior porque el SRI la rechazaba por firmas inválidas).
   - Genera la **clave de acceso** (los 49 dígitos que identifican el comprobante ante el SRI), calculada directamente desde un objeto `Date` real para evitar un bug de interpretación de fechas de la librería base.
   - Envía el XML firmado al webservice de **Recepción** del SRI (SOAP). Si es aceptado (`RECIBIDA`), consulta el webservice de **Autorización** (con reintentos, porque el SRI tarda unos segundos en resolver).
   - Según el resultado, la factura queda en `autorizada` (con el XML autorizado y número de autorización guardados) o `devuelta` (con el motivo del rechazo).
4. **PDF (RIDE)**: se genera del lado del cliente con `jsPDF` + `jsbarcode` (código de barras de la clave de acceso), incluyendo el logo de la empresa si lo subió.

Ambientes: cada empresa elige **Pruebas** o **Producción** en `billing_configs.sri_environment`; el endpoint apunta a las URLs SOAP correspondientes de cada ambiente automáticamente.

---

## 6. Módulos del panel del gerente

Acceso vía `StoreManagerLayout.jsx` / `StoreManagerSidebar.jsx` (responsive: menú lateral fijo en escritorio, cajón deslizante en móvil).

- **Dashboard** — métricas del negocio (ventas, stock agregado de todas las sucursales, alertas).
- **POS / Ventas** (`POSInterface.jsx`) — pantalla de cobro del cajero.
- **Inventario** (`InventoryManagement.jsx`) — catálogo (precio, descuento, promoción — compartido) y stock (por sucursal seleccionada, o vista agregada "todas las sucursales").
- **Clientes** (`CustomerManagement.jsx`) — base de clientes global de la empresa.
- **Facturación / Comprobantes** (`InvoiceManagement.jsx`) — historial de facturas, filtro por sucursal, estado SRI, detalle y reenvío.
- **Cajeros** (`CashierManagement.jsx`) — alta de usuarios `vendedor`/`operario` con sucursal asignada obligatoria, cambio de contraseña, reasignación de sucursal.
- **Sucursales** (`Branches.jsx`) — CRUD de sucursales y, dentro de cada una, sus puntos de venta (establecimiento/punto de emisión SRI).
- **Reportes** (`Reports.jsx`) — 7 tipos (resumen, ventas, productos, clientes, cajeros, inventario, impuestos), con filtro de fechas y de sucursal, gráficos propios (sin librería externa de charts), exportación a PDF (diseñado, con logo) y CSV (con BOM UTF-8 para que Excel no rompa acentos).
- **Configuración** — datos de la empresa (incluye logo, usado también en el PDF de facturas) y "Facturación SRI" (certificado, ambiente, tasa de IVA — separado de la numeración, que ahora vive en Sucursales).

---

## 7. Panel de administración SaaS

Acceso separado (`role = 'admin'`), gestiona la plataforma completa, no una empresa en particular:

- **Empresas** (`Companies.jsx`, `CompanyDetail.jsx`, `CompanyEdit.jsx`, `CompanyWizard.jsx`) — listado, alta guiada, edición de identidad fiscal, detalle con historial, cambio de plan, suspensión/reactivación (con motivo), registro manual de pago.
- **Planes** (`Subscriptions.jsx`) — catálogo de planes comerciales y sus precios/límites/features.
- **Alertas** — generadas en el momento de cargar datos (`generateAlerts`), no persistidas: empresa en producción sin certificado cargado, suscripción vencida o por vencer, consumo alto de comprobantes contra el límite del plan.
- **Actividad** — feed de acciones administrativas (alta de empresa, suspensión, cambio de plan, etc.).

---

## 8. Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite, Tailwind CSS, Zustand (estado global) |
| Backend / datos | Supabase (Postgres + Row Level Security + Storage) |
| Funciones serverless | Vercel Functions (`api/sri/*.js`) — solo para lo que requiere Node (firma criptográfica, SOAP al SRI) |
| Documentos | `jsPDF` + `jsbarcode` (facturas RIDE y reportes) |
| Firma electrónica | `xadesjs` + `node-forge` + WebCrypto nativo de Node |
| Despliegue | Push a `main` en GitHub → build y deploy automático en Vercel |

No hay backend propio "tradicional": la app habla directo con Supabase (PostgREST + RPCs) desde el navegador con la clave pública (`anon key`), y solo recurre a una función serverless para las tres cosas que un navegador no puede hacer (criptografía de certificados, SOAP, y — indirectamente — mantener el certificado fuera del alcance del cliente).

---

## 9. Estructura de carpetas

```
POST-PLAT/
├── api/sri/                    # Funciones serverless (Vercel): firma y envío SRI
│   ├── accessKey.js             # Generación de la clave de acceso (49 dígitos)
│   ├── xadesSign.js             # Firma XAdES-BES del XML
│   └── submit-invoice.js        # Orquesta todo el envío al SRI
├── src/
│   ├── components/
│   │   ├── layout/               # Layouts y sidebars (admin / gerente)
│   │   ├── pages/                # Una vista por pantalla (Companies, Reports, POSInterface, etc.)
│   │   └── ui/                   # Componentes reutilizables (Modal, ConfirmDialog, ReportCharts, etc.)
│   ├── lib/
│   │   ├── supabase.js           # Cliente Supabase (anon key)
│   │   ├── supabaseHelpers.js    # Todas las queries/RPCs de la app
│   │   ├── transforms.js         # DB row → shape que usa la UI (companies, plans, activity log)
│   │   ├── reportsHelpers.js / csvExport.js / reportPdfGenerator.js
│   │   ├── rideGenerator.js      # PDF de factura (RIDE)
│   │   └── alerts.js / dates.js
│   ├── store/useStore.js         # Estado global Zustand (única fuente de verdad del frontend)
│   ├── data/                     # Datos de demo — ya no se usan, candidatos a borrar
│   ├── App.jsx / main.jsx
├── DATABASE_SCHEMA_V2.sql        # Esquema de referencia (parcialmente desactualizado, ver auditoría)
├── .mcp.json                     # Config del MCP de Supabase para Claude Code
└── vercel.json
```

---

## 10. Variables de entorno

```
VITE_SUPABASE_URL              # URL del proyecto Supabase
VITE_SUPABASE_ANON_KEY         # Clave pública (RLS la limita en teoría — ver auditoría)
VITE_SUPABASE_SECRET_KEY       # Service role — solo la usan las funciones serverless en api/sri/*, nunca el navegador
```
`.env.local` (con valores reales) está correctamente excluido de git; `.env.example` documenta las claves sin valores reales.

---

## 11. Base de datos — tablas actuales (19)

| Grupo | Tablas |
|---|---|
| Plataforma / SaaS | `companies`, `plans` |
| Identidad y permisos | `users`, `admin_users` *(sin uso)*, `permissions` *(sin uso)*, `role_permissions` *(sin uso)* |
| Sucursales | `branches`, `point_of_sales`, `product_stock` |
| Catálogo y clientes | `products`, `customers` |
| Facturación | `invoices`, `invoice_details`, `billing_configs`, `payment_methods` |
| Movimientos | `inventory_movements` *(sin uso)*, `payments` *(sin uso)* |
| Auditoría | `audit_log` *(sin uso)*, `activity_log` *(con bug activo, ver auditoría)* |

Las marcadas *(sin uso)* existen en el esquema pero ningún flujo de la aplicación las lee o escribe hoy.
