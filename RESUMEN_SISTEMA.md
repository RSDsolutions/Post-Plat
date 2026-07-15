# 📘 Resumen del Sistema — POST-PLAT

**Fecha de esta versión:** 2026-07-15

> Este documento explica **qué es el sistema y cómo funciona hoy**: infraestructura, base de datos, roles, módulos y flujos principales. Para riesgos conocidos y deuda técnica ver [`AUDITORIA_SISTEMA.md`](./AUDITORIA_SISTEMA.md); para el detalle del sistema de correos ver [`EMAILS_SETUP.md`](./EMAILS_SETUP.md).

---

## 1. Qué es POST-PLAT

POST-PLAT es un **SaaS multi-tenant de punto de venta (POS) y facturación electrónica** para Ecuador. Un mismo despliegue sirve a múltiples empresas clientes ("tenants"), cada una con su propio RUC, catálogo, sucursales, usuarios y facturación — administradas centralmente por un **panel de super-admin** que gestiona la suscripción de cada cliente al estilo SaaS clásico (plan, cobro, límites de uso, suspensión).

La pieza diferencial del sistema es que la facturación **no es simulada**: genera comprobantes electrónicos reales, los firma digitalmente (XAdES-BES) y los envía al **SRI** (Servicio de Rentas Internas de Ecuador) por sus web services SOAP oficiales, siguiendo el ciclo real de recepción → autorización.

---

## 2. Infraestructura

| Capa | Tecnología | Rol |
|---|---|---|
| Frontend | React 18 + Vite, Tailwind CSS, Zustand | SPA única; `useStore.js` es la única fuente de verdad del estado del cliente |
| Backend de datos | **Supabase** (Postgres + Row Level Security + Storage) | La app habla directo con Postgres vía PostgREST/RPC desde el navegador con la `anon key` — no hay backend tradicional |
| Funciones serverless | **Vercel Functions** (`api/sri/*`, `api/emails/*`, `api/admin/*`), Node.js | Solo para lo que el navegador no puede hacer: criptografía, SOAP al SRI, envío de correos con secretos, y mutaciones que requieren `service_role` |
| Documentos | `jsPDF` + `jsbarcode` | PDF de facturas (RIDE) y reportes, generados en el cliente |
| Firma electrónica | `xadesjs` + `node-forge` + WebCrypto (Node) | Firma XAdES-BES del XML de factura |
| Correo transaccional | **Resend**, dominio verificado vía **Cloudflare DNS** | Contraseñas temporales, bienvenida de cajero, stock bajo, factura devuelta, envío de RIDE al cliente |
| Automatización DB → correo | **Supabase Database Webhooks** (`pg_net`) | Dispara un `HTTP POST` a `api/emails/webhook` cuando cambian `product_stock` o `invoices` |
| Despliegue | GitHub → Vercel (CI/CD automático) | `git push origin main` dispara build y deploy |

No existe backend propio "tradicional": el navegador consulta Supabase directamente, y solo recurre a Vercel Functions para (a) criptografía de certificados, (b) SOAP al SRI, (c) envío de correos con secretos server-side, y (d) mutaciones administrativas que requieren `service_role` (crear usuarios, resetear contraseñas) para que la `anon key` del navegador nunca tenga esos privilegios.

### Variables de entorno

```
# Cliente (navegador, prefijo VITE_ obligatorio para que Vite las exponga)
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY

# Solo servidor (Vercel Functions) — sin prefijo VITE_, nunca llegan al navegador
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
EMAIL_FROM
EMAIL_WEBHOOK_SECRET
EMAIL_APP_URL            # opcional
CERT_ENCRYPTION_KEY      # cifra/descifra billing_configs.cert_password (pgcrypto)
```

`.env.local` (valores reales) está excluido de git; `.env.example` documenta las claves sin valores.

---

## 3. Autenticación y roles

**No existe Supabase Auth.** El login es una función propia (`verify_user_password` / `verify_admin_password`, RPC de Postgres) que compara la contraseña recibida contra un hash `bcrypt` en `password_hash`, usando `pgcrypto` (`crypt()`). El navegador guarda el objeto de usuario devuelto (persistido en `localStorage`, restaurado en `restoreAuth()`); no hay JWT ni sesión firmada — cada pantalla vuelve a pedir datos filtrando por el `company_id`/`id` que ya tiene en memoria, reforzado por RLS del lado de la base.

El sistema tiene tres interfaces según el rol del usuario (`App.jsx` decide el layout activo):

| Rol | Tabla | Layout | Uso |
|---|---|---|---|
| `admin` | `public.users` | `Layout` (panel SaaS) | Super-admin de la plataforma: gestiona empresas clientes, planes, pagos, feature flags. No opera ninguna empresa cliente. |
| `gerente` | `public.users`, filtrado por `company_id` | `StoreManagerLayout` | Dueño/administrador de una empresa cliente. Acceso completo a su empresa. |
| `vendedor` / `operario` | `public.users`, filtrado por `company_id` + `branch_id` | `POSLayout` | Cajero. Solo opera el punto de venta de su sucursal asignada. |
| `contador` | `public.users` | `StoreLayout` (fallback legado) | Contemplado en el esquema; usa un set de pantallas antiguo (`Store*.jsx`) que no ha recibido las mejoras recientes (multi-sucursal, reportes nuevos) — candidato a unificarse con `StoreManagerLayout` o a eliminarse. |

Existe también una tabla legada `admin_users` (1 fila) — de una versión anterior del proyecto, sin políticas activas en el flujo actual; el admin real vive en `public.users` con `role = 'admin'`.

**Soporte / impersonación:** el admin puede "ver como" una empresa cliente (`impersonating` en el store) — muestra un banner ámbar fijo y un botón para volver al panel admin. Útil para depurar o dar soporte sin pedir la contraseña del cliente.

---

## 4. Modelo multi-tenant y multi-sucursal

- **`companies`** es la raíz de cada tenant: identidad fiscal (RUC, razón social, nombre comercial, dirección, régimen), configuración SRI heredada (establecimiento/punto de venta/secuencial — hoy vive realmente en `point_of_sales`), suscripción (`subscription_status`: activa/suspendida/cancelada/vencida, `subscription_start`, `subscription_renewal`, `trial_ends_at`), contadores de uso (`monthly_comprobantes`, `prev_month_comprobantes`, `active_users`, `branches`), `custom_price` (override manual de precio por cliente), logo (`logo_url`), y `deleted_at` (soft delete).
- **`plans`** define los planes comerciales: precio, ciclo de facturación, límites (`max_users`, `max_branches`, `max_invoices_monthly`, `max_products`, `max_pos`) y `features` (array JSON de claves de funcionalidad).
- **`feature_flags`** + **`company_feature_overrides`**: catálogo global de funcionalidades activables (7 definidas) y una tabla de excepciones por empresa (activar/desactivar una feature puntual sin cambiarle el plan completo). `planLimits.js` (`getEffectiveFeatures`, `hasFeature`) combina las features del plan con los overrides para decidir qué ve cada empresa.
- El **wizard de alta** (`CompanyWizard.jsx`) crea en una sola operación: la fila en `companies`, su primera sucursal ("Matriz"), el primer punto de venta, y el primer login `gerente` — mostrando la contraseña temporal una sola vez (y, si el correo está configurado, enviándosela automáticamente al gerente).
- **`branches`** — sucursales de la empresa (nombre, código, dirección, establecimiento SRI).
- **`point_of_sales`** — puntos de venta dentro de cada sucursal; acá vive la numeración SRI real (`numero_establecimiento`, `numero_pos`, `sequential_current`), permitiendo que una misma empresa emita simultáneamente desde distintos establecimientos/puntos de emisión.
- **`products`** — catálogo compartido por toda la empresa (precio, IVA, descuento, promoción, si el precio incluye IVA).
- **`product_stock`** — existencia real de cada producto **por sucursal** (modelo "auto-sanador": sin fila = stock 0, no requiere sembrar datos al crear sucursales/productos nuevos).
- **`customers`** — clientes globales por empresa (no por sucursal), para no duplicar un mismo cliente que compra en más de un local.
- **`users.branch_id`** — sucursal asignada a un cajero. Sin sucursal asignada, el POS bloquea la venta con un mensaje explícito.
- **`billing_configs`** — un registro por empresa: certificado de firma (`.p12`, en Storage), su contraseña (cifrada en reposo con `pgcrypto`, clave fuera de la base — ver `CERT_ENCRYPTION_KEY` en §2 y `AUDITORIA_SISTEMA.md`), ambiente SRI, tasa de IVA, régimen contable, texto de pie de recibo. La subida del certificado pasa por `api/sri/upload-certificate.js` (service role), no se escribe directo desde el navegador.

---

## 5. Facturación electrónica SRI — flujo completo

1. **Venta en el POS** (`POSInterface.jsx`): el cajero arma la venta, se calcula IVA/descuentos, se crea la factura en estado **`borrador`** con sus líneas en `invoice_details`, y se descuenta `product_stock` de la sucursal correspondiente.
2. **Envío al SRI**: dispara `api/sri/submit-invoice.js` (Vercel Function, Node), pasando `invoiceId`/`companyId`/`userId`.
3. Dentro de esa función:
   - Verifica que el `userId` pertenezca a la `companyId` y tenga rol habilitado.
   - Arma el XML oficial del comprobante (versión propia de `open-factura`).
   - Descarga el certificado `.p12` desde el bucket privado `sri-certificates` de Supabase Storage y lo firma con **XAdES-BES** (`xadesjs`, canonicalización XML real vía WebCrypto).
   - Genera la **clave de acceso** (49 dígitos) desde un objeto `Date` real.
   - Envía el XML firmado al webservice de **Recepción** SRI (SOAP). Si es `RECIBIDA`, consulta **Autorización** con reintentos (el SRI tarda unos segundos).
   - Según el resultado, la factura queda `autorizada` (con XML autorizado y número de autorización) o `devuelta` (con motivo del rechazo, y dispara automáticamente un correo de alerta — ver §7).
4. **`api/sri/status.js`** — endpoint separado para reconsultar el estado de autorización de una factura ya enviada (reintentos manuales).
5. **PDF (RIDE)**: generado del lado del cliente con `jsPDF` + `jsbarcode` (código de barras de la clave de acceso), incluye el logo de la empresa. También puede generarse en `base64` server-side para adjuntarlo a un correo.
6. **Envío del RIDE por correo**: `api/emails/send-invoice-ride.js` adjunta el PDF y lo envía al cliente final; se dispara manualmente desde `InvoiceManagement.jsx` o automáticamente en ambiente de producción.

Ambientes: cada empresa elige **Pruebas** o **Producción** en `billing_configs.sri_environment`; el endpoint apunta a las URLs SOAP correspondientes automáticamente.

---

## 6. Módulos del panel del gerente (`StoreManagerLayout`)

- **Dashboard** (`StoreManagerDashboard.jsx`) — métricas del negocio agregadas de todas las sucursales.
- **POS / Ventas** (`POSInterface.jsx`, dentro de `POSLayout` para cajeros) — pantalla de cobro.
- **Inventario** (`InventoryManagement.jsx`) — catálogo (precio, descuento, promoción — compartido) y stock por sucursal o vista agregada.
- **Clientes** (`CustomerManagement.jsx`) — base de clientes global de la empresa.
- **Facturación / Comprobantes** (`InvoiceManagement.jsx`) — historial, filtro por sucursal y estado SRI, detalle, reenvío al SRI, reenvío del RIDE por correo.
- **Cajeros** (`CashierManagement.jsx`) — alta de `vendedor`/`operario` con sucursal obligatoria, cambio de contraseña, reasignación de sucursal.
- **Sucursales** (`Branches.jsx`) — CRUD de sucursales y sus puntos de venta.
- **Reportes** (`Reports.jsx`) — 7 tipos (resumen, ventas, productos, clientes, cajeros, inventario, impuestos), filtro de fechas/sucursal, gráficos propios (`ReportCharts.jsx`, sin librería externa), exportación a PDF y CSV (BOM UTF-8 para Excel).
- **Configuración** (`StoreSettings.jsx`) — datos de la empresa (logo) — y **Facturación SRI** (`BillingConfiguration.jsx`) — certificado, ambiente, tasa de IVA.

---

## 7. Panel de administración SaaS (`Layout`, rol `admin`)

- **Dashboard** (`Dashboard.jsx`) — visión general de la plataforma.
- **Empresas** (`Companies.jsx`, `CompanyDetail.jsx`, `CompanyEdit.jsx`, `CompanyWizard.jsx`) — listado con **health score** por empresa (`healthScore.js`: puntaje 0-100 derivado de estado de suscripción, certificado en producción, sucursales configuradas, consumo de facturas vs. límite del plan, vencimiento de trial — calculado en el cliente, no persistido), alta guiada, edición de identidad fiscal, checklist de onboarding (certificado, sucursal con POS, cajero, primera factura autorizada), cambio de plan, suspensión/reactivación con motivo.
  - **Pestaña de usuarios** (`CompanyUsersTab.jsx`, nueva) — el admin puede, desde el detalle de una empresa: crear el gerente si falta, agregar/gestionar cajeros, **resetear contraseñas** y **activar/desactivar** cualquier usuario de la empresa — todo vía endpoints `service_role` (`api/admin/reset-user-password.js`, `api/admin/set-user-active.js`) para que la lógica sensible nunca corra con la `anon key`.
- **Planes** (`Subscriptions.jsx`) — catálogo de planes comerciales y sus precios/límites/features.
- **Métricas** (`Metrics.jsx`, nueva) — panel agregado de indicadores de la plataforma (MRR, empresas activas, uso de facturación, etc.).
- **Pagos** (`Payments.jsx`, nuevo) — dashboard dedicado de cobros: total recaudado histórico y del mes, empresas al día vs. pendientes, último pago por empresa, y alta manual de un pago vía `PaymentModal.jsx` (modal estructurado, reemplaza el registro ad-hoc anterior).
- **Alertas** — generadas al cargar datos (`generateAlerts`), no persistidas: empresa en producción sin certificado, suscripción vencida/por vencer, consumo alto de comprobantes.
- **Actividad** (`Activity.jsx`) — feed de acciones administrativas (alta de empresa, suspensión, cambio de plan, pago registrado, etc.), leído de `activity_log`.
- **Marca** (`BrandConfig.jsx`) — personalización de color/branding del panel.

---

## 8. Sistema de correo transaccional (Resend)

Servicio centralizado en `api/emails/*` y `api/admin/*` (Vercel Functions, Node), con disparos automáticos vía **Database Webhooks de Supabase** (`pg_net`) para no depender de que el frontend esté abierto.

```
Frontend (React) ──► /api/emails/*        ─┐
Supabase (pg_net) ─► /api/emails/webhook  ─┼─► Resend ─► correo
Frontend (admin)  ─► /api/admin/create-*  ─┘
```

| Evento | Disparo | Destinatario | Plantilla |
|---|---|---|---|
| Contraseña temporal (alta de gerente) | `api/admin/create-gerente.js` | Gerente nuevo | `tempPasswordEmail` |
| Bienvenida cajero | `api/admin/create-cashier.js` | Vendedor/operario nuevo | `welcomeCashierEmail` |
| Stock bajo | Trigger DB en `product_stock` → webhook | `companies.email` / `admin_email` | `lowStockEmail` |
| Factura devuelta por el SRI | Trigger DB en `invoices` → webhook | Empresa | `invoiceReturnedEmail` |
| Nueva factura emitida (RIDE adjunto) | `api/emails/send-invoice-ride.js` | Cliente (`customers.email`) | `newInvoiceEmail` |

**Seguridad:** los endpoints públicos validan contra la BD con `service_role` — el navegador nunca elige el destinatario. Los webhooks se autentican con un secreto compartido (`x-webhook-secret`, comparación en tiempo constante). `create_company_gerente` fue revocada de `anon`/`authenticated`; solo es invocable desde el endpoint server-side que verifica que quien llama es admin. Ningún secreto (Resend/Supabase) viaja al navegador — ninguna de esas variables lleva prefijo `VITE_`.

El trigger de stock bajo solo dispara al **cruzar** el mínimo hacia abajo (no en cada venta mientras siga bajo), y solo si `min_stock > 0`, para evitar spam.

---

## 9. Estructura de carpetas

```
POST-PLAT/
├── api/
│   ├── sri/                       # Firma y envío al SRI (Node/Vercel)
│   │   ├── accessKey.js            # Clave de acceso (49 dígitos)
│   │   ├── xadesSign.js            # Firma XAdES-BES
│   │   ├── submit-invoice.js       # Orquesta el envío completo
│   │   └── status.js               # Reconsulta estado de autorización
│   ├── emails/                     # Notificaciones transaccionales (Resend)
│   │   ├── _lib.js                 # Cliente Resend + Supabase service-role + verificación de secreto
│   │   ├── _templates.js           # 5 plantillas HTML responsivas
│   │   ├── webhook.js              # Receptor de Database Webhooks (stock bajo, factura devuelta)
│   │   └── send-invoice-ride.js    # Adjunta y envía el RIDE al cliente
│   └── admin/                      # Mutaciones sensibles con service_role
│       ├── create-gerente.js
│       ├── create-cashier.js
│       ├── reset-user-password.js
│       └── set-user-active.js
├── src/
│   ├── components/
│   │   ├── layout/                 # Layout + Sidebar + TopBar por rol (admin / gerente / cajero / contador-legado)
│   │   ├── pages/                  # Una vista por pantalla
│   │   └── ui/                     # Componentes reutilizables (Modal, ConfirmDialog, PaymentModal, ReportCharts, etc.)
│   ├── lib/
│   │   ├── supabase.js             # Cliente Supabase (anon key)
│   │   ├── supabaseHelpers.js      # Todas las queries/RPCs de la app
│   │   ├── transforms.js           # DB row → shape que usa la UI
│   │   ├── healthScore.js          # Puntaje de salud + checklist de onboarding por empresa (derivado, no persistido)
│   │   ├── planLimits.js           # Límites de plan + feature flags efectivos
│   │   ├── reportsHelpers.js / csvExport.js / reportPdfGenerator.js
│   │   ├── rideGenerator.js        # PDF de factura (RIDE), soporta salida base64
│   │   └── alerts.js / dates.js / password.js / ruc.js / certValidation.js
│   ├── store/useStore.js           # Estado global Zustand (única fuente de verdad del frontend)
│   ├── data/                       # Datos de demo — no usados, candidatos a borrar
│   └── App.jsx / main.jsx
├── supabase/migrations/            # Migraciones SQL aplicadas vía MCP
├── DATABASE_SCHEMA_V2.sql          # Esquema de referencia (parcialmente desactualizado frente al real)
├── EMAILS_SETUP.md                 # Guía completa del sistema de correos
├── AUDITORIA_SISTEMA.md            # Riesgos y deuda técnica
├── .mcp.json                       # Config del MCP de Supabase para Claude Code
└── vercel.json
```

---

## 10. Base de datos — tablas actuales (21)

| Grupo | Tablas |
|---|---|
| Plataforma / SaaS | `companies`, `plans`, `feature_flags`, `company_feature_overrides` |
| Identidad y permisos | `users`, `admin_users` *(legado, sin uso real)*, `permissions`, `role_permissions` *(sin filas — no se usa aún para autorización granular)* |
| Sucursales | `branches`, `point_of_sales`, `product_stock` |
| Catálogo y clientes | `products`, `customers` |
| Facturación | `invoices`, `invoice_details`, `billing_configs`, `payment_methods` |
| Cobros SaaS | `payments` (cobros a las empresas clientes por su suscripción) |
| Movimientos | `inventory_movements` *(esquema presente, sin uso activo)* |
| Auditoría | `audit_log` *(esquema presente, sin uso activo)*, `activity_log` (feed real del panel admin) |

Storage buckets: `sri-certificates` (privado, certificados `.p12`), `company-logos` (público, logos de empresas clientes).

RLS está habilitado en las 21 tablas. No hay Edge Functions de Supabase en uso (toda la lógica serverless vive en Vercel Functions, ver §2).

---

## 11. Roles válidos (enum `user_role`)

| Rol | Uso típico |
|---|---|
| `admin` | Super-admin de la plataforma SaaS |
| `gerente` | Dueño/administrador de una empresa cliente |
| `vendedor` | Cajero, atado a una sucursal |
| `operario` | Igual que `vendedor` (variante de nombre) |
| `contador` | Contemplado en el esquema; hoy cae en el layout legado `StoreLayout` |

---

## 12. Notas para agentes AI que trabajen en este repo

- Al modificar la base de datos, usar siempre el MCP de Supabase (ver `CLAUDE.md`) y revisar/actualizar políticas RLS.
- No se usa Supabase Auth: cualquier lógica de login o creación de usuarios pasa por RPCs custom o por los endpoints `api/admin/*` con `service_role` — nunca exponer una RPC sensible directo a `anon`/`authenticated`.
- La firma XML (`xadesjs`) es frágil: no modificar las rutinas de canonicalización salvo estrictamente necesario, el SRI rechaza firmas inválidas sin mensajes claros.
- Cualquier paquete Node nuevo en `api/*` debe ser compatible con el runtime y límites de tamaño/ejecución de Vercel Functions (~4.5 MB de body, por ejemplo, relevante para el envío de RIDE en base64).
- Para contexto de riesgos conocidos y roadmap, revisar `AUDITORIA_SISTEMA.md` y `MEJORAS_ADMIN_SAAS.md` antes de asumir que algo es un bug nuevo.
