# 📘 Resumen del Sistema — POST-PLAT

**Fecha de esta versión:** 2026-07-15 (actualizado: personalización visual — temas del POS y modo claro/oscuro del panel)

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
| Autenticación | **Supabase Auth** | Login, sesión (JWT) y expiración reales — ver §3 |
| Backend de datos | **Supabase** (Postgres + Row Level Security + Storage) | La app habla directo con Postgres vía PostgREST/RPC desde el navegador; RLS real basada en `auth.uid()` aísla cada empresa — no hay backend tradicional |
| Funciones serverless | **Vercel Functions** (`api/sri/*`, `api/emails/*`, `api/admin/*`), Node.js | Solo para lo que el navegador no puede hacer: criptografía, SOAP al SRI, envío de correos con secretos, y mutaciones que requieren `service_role` (incluida la Auth Admin API) |
| Documentos | `jsPDF` + `jsbarcode` | PDF de facturas (RIDE) y reportes, generados en el cliente |
| Compresión | `jszip` | Descarga masiva de XML autorizados en un `.zip`, armado 100% en el navegador |
| Firma electrónica | `xadesjs` + `node-forge` + WebCrypto (Node) | Firma XAdES-BES del XML de factura |
| Correo transaccional | **Resend**, dominio verificado vía **Cloudflare DNS** | Contraseñas temporales, bienvenida de usuario nuevo, stock bajo, factura devuelta, envío de RIDE al cliente |
| Automatización DB → correo | **Supabase Database Webhooks** (`pg_net`) | Dispara un `HTTP POST` a `api/emails/webhook` cuando cambian `product_stock` o `invoices` |
| Despliegue | GitHub → Vercel (CI/CD automático) | `git push origin main` dispara build y deploy |

No existe backend propio "tradicional": el navegador consulta Supabase directamente (con sesión real de Supabase Auth), y solo recurre a Vercel Functions para (a) criptografía de certificados, (b) SOAP al SRI, (c) envío de correos con secretos server-side, y (d) mutaciones administrativas que requieren `service_role` (crear usuarios vía la Auth Admin API, resetear contraseñas, banear/desbanear al desactivar).

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

## 3. Autenticación, roles y permisos

**Supabase Auth real**, migrado desde un sistema propio de comparación bcrypt sin sesión. Login vía `supabase.auth.signInWithPassword()` (`useStore.js` → `login()`); la sesión (JWT, refresco automático) la maneja `supabase-js`, no `localStorage` a mano. `public.users` es la tabla de "perfil" (rol, `company_id`, `branch_id`, `is_active`), enlazada 1:1 a `auth.users` por `id` (FK). Desactivar un usuario también lo banea a nivel Auth (`ban_duration`), no solo marca `is_active = false` — así una sesión ya emitida no sigue funcionando indefinidamente.

El sistema tiene **dos interfaces** según el rol del usuario (`App.jsx` decide el layout activo):

| Rol | Layout | Uso |
|---|---|---|
| `admin` | `Layout` (panel SaaS) | Super-admin de la plataforma: gestiona empresas clientes, planes, pagos, feature flags. No opera ninguna empresa cliente. |
| `gerente` | `StoreManagerLayout` | Dueño/administrador de una empresa cliente. Acceso completo a su empresa (todos los permisos, ver abajo). |
| `contador` | `StoreManagerLayout` (mismo layout que gerente) | Rol de solo lectura/exportación a nivel empresa (`branch_id = null`): Contabilidad completa, Facturación en modo lectura+export, Reportes, Clientes en lectura. Su vista de entrada es un dashboard contable (`AccountantDashboard.jsx`), no el comercial del gerente. |
| `vendedor` / `operario` | `POSLayout` | Cajero. Solo opera el punto de venta de su sucursal asignada. |

Existe también una tabla legada `admin_users` (1 fila) — de una versión anterior del proyecto, sin uso en el flujo actual; el admin real vive en `public.users` con `role = 'admin'`.

**Soporte / impersonación:** el admin puede "ver como" el gerente de una empresa cliente (`impersonating` en el store, incluye el set de permisos que se restaura al salir) — banner ámbar fijo + botón para volver. Es un swap de estado local, nunca crea una sesión Auth real del cliente; las queries siguen corriendo con la sesión del admin, que tiene SELECT (no escritura) sobre datos operativos de cualquier empresa.

### Catálogo de permisos (`permissions` / `role_permissions`)

21 claves `modulo.accion` (más `invoices.approve`/`invoices.void`, agregadas para cerrar un hueco de UI — ver más abajo), asignadas por rol:

| Rol | Permisos |
|---|---|
| `gerente` | Todos (23) |
| `vendedor` / `operario` | `pos.operate`, `products.read`, `customers.read`, `customers.write`, `cash_closure.create` |
| `contador` | `invoices.read`, `invoices.export`, `invoices.resend_sri` (solo reconsulta, no reenvío), `reports.read`, `reports.export`, `accounting.read`, `accounting.export`, `cash_closure.read`, `customers.read`, `products.read`, `inventory.read` (desde la Fase 6 — ve el Kardex, no `inventory.write`) |

`src/lib/permissions.js` (`fetchRolePermissions`, `can()`) carga el set del rol al hacer login/`restoreAuth()` y queda expuesto como `useStore().can(key)`. El sidebar de `StoreManagerLayout` y los botones de acción sensibles (crear/editar producto, enviar RIDE, exportar reportes, aprobar/anular factura) se condicionan con `can()`, no con `role === '...'` — así el mismo código sirve para gerente y contador sin casos especiales. Fail-closed: sin permisos cargados, `can()` deniega todo.

**La protección real vive en RLS (`auth.uid()`), no en la UI.** Las 21 tablas operativas pasaron de `USING(true)` (cualquiera con la `anon key` leía/escribía todo) a políticas reales: `SELECT` scopeado a `company_id = current_company_id()` (o `is_platform_admin()` para el panel admin, siempre solo lectura de datos operativos), escritura restringida además por rol vía `current_role()`. Tres funciones helper `SECURITY DEFINER` (`current_company_id()`, `current_role()`, `is_platform_admin()`) resuelven esto sin recursión de RLS. Verificado con pruebas reales: un vendedor no puede leer ni escribir datos de otra empresa; un contador no puede escribir en ninguna tabla operativa aunque llame la query directo desde la consola del navegador.

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
- **`users.branch_id`** — sucursal asignada a un cajero. `NULL` para `gerente`, `admin` y `contador` (roles a nivel empresa). Sin sucursal asignada, el POS bloquea la venta con un mensaje explícito.
- **`billing_configs`** — un registro por empresa: certificado de firma (`.p12`, en Storage), su contraseña (cifrada en reposo con `pgcrypto`, clave fuera de la base — ver `CERT_ENCRYPTION_KEY` en §2), ambiente SRI, tasa de IVA, régimen contable, texto de pie de recibo. La subida del certificado pasa por `api/sri/upload-certificate.js` (service role, solo gerente/admin), no se escribe directo desde el navegador.

---

## 5. Facturación electrónica SRI — flujo completo

1. **Venta en el POS** (`POSInterface.jsx`): el cajero arma la venta, se calcula IVA/descuentos, se crea la factura en estado **`borrador`** con sus líneas en `invoice_details`, y se descuenta `product_stock` de la sucursal correspondiente vía la RPC `adjust_product_stock` (atómica, deja movimiento `venta` en el kardex — ver §6).
2. **Envío al SRI**: dispara `api/sri/submit-invoice.js` (Vercel Function, Node; solo `gerente`/`admin`, gateado en la UI por `invoices.approve`), pasando `invoiceId`/`companyId`/`userId`.
3. Dentro de esa función:
   - Verifica que el `userId` pertenezca a la `companyId` y tenga rol habilitado.
   - Arma el XML oficial del comprobante (versión propia de `open-factura`).
   - Descarga el certificado `.p12` desde el bucket privado `sri-certificates`, descifra su contraseña (`get_cert_password`, `pgcrypto` con la clave de `CERT_ENCRYPTION_KEY`), y lo firma con **XAdES-BES** (`xadesjs`, canonicalización XML real vía WebCrypto).
   - Genera la **clave de acceso** (49 dígitos) desde un objeto `Date` real; se guarda en `invoices.authorization_number` tanto si el SRI autoriza como si rechaza.
   - Envía el XML firmado al webservice de **Recepción** SRI (SOAP). Si es `RECIBIDA`, consulta **Autorización** con reintentos (el SRI tarda unos segundos).
   - Según el resultado, la factura queda `autorizada` (con XML autorizado y número de autorización) o `devuelta` (con motivo del rechazo en `sri_response_message`, y dispara automáticamente un correo de alerta — ver §8).
4. **Reconsulta de una factura `devuelta`**: `api/sri/reconcile-invoice.js` — consulta de nuevo el estado de autorización usando la clave de acceso ya guardada, **sin volver a firmar ni reenviar**. Cubre el caso real de que el SRI haya recibido el comprobante pero submit-invoice.js haya agotado sus reintentos mientras el SRI seguía "EN PROCESO" — al reconsultar más tarde puede aparecer autorizado. Distinto de `api/sri/status.js`, que solo hace ping a si las URLs del SRI están arriba (no consulta ningún comprobante puntual). Gateado por `invoices.resend_sri`, permitido también para `contador` (puede reconsultar, no reenviar).
5. **PDF (RIDE)**: generado del lado del cliente con `jsPDF` + `jsbarcode` (código de barras de la clave de acceso), incluye el logo de la empresa. También puede generarse en `base64` server-side para adjuntarlo a un correo.
6. **Envío del RIDE por correo**: `api/emails/send-invoice-ride.js` (solo `gerente`/`admin`) adjunta el PDF y lo envía al cliente final; se dispara manualmente desde `InvoiceManagement.jsx` o automáticamente en ambiente de producción.
7. **Descarga de XML autorizados**: individual (`downloadInvoiceXml`) o masiva por rango de fechas/sucursal (`downloadInvoicesXmlZip`, `src/lib/invoiceXmlExport.js`) — arma un `.zip` **100% en el navegador** (sin pasar por ninguna Vercel Function) con un `.xml` por factura autorizada, nombrado con su clave de acceso, más un `resumen.csv`. Gateado por `invoices.export`, accesible desde `InvoiceManagement.jsx` y desde la pestaña "Descarga de XML" de Contabilidad.

Ambientes: cada empresa elige **Pruebas** o **Producción** en `billing_configs.sri_environment`; el endpoint apunta a las URLs SOAP correspondientes automáticamente.

---

## 6. Módulos del panel del gerente / contador (`StoreManagerLayout`)

El sidebar se arma dinámicamente según los permisos del rol (§3) — la lista de abajo es la vista completa del gerente; el contador ve un subconjunto (Contabilidad, Facturas, Reportes, Clientes).

- **Dashboard** — `StoreManagerDashboard.jsx` (gerente: métricas comerciales) o `AccountantDashboard.jsx` (contador: resumen contable del mes en curso — ventas, IVA, comprobantes por estado, últimos cierres de caja; reutiliza los mismos helpers que Contabilidad, sin queries propias).
- **POS / Ventas** (`POSInterface.jsx`, dentro de `POSLayout` para cajeros) — pantalla de cobro, y **cierre de caja** (`POSSettings.jsx`) — ver §7.
- **Inventario** (`InventoryManagement.jsx`, permiso `inventory.read` — gerente y, desde la Fase 6, también contador en modo solo lectura) — dos pestañas:
  - **Productos** — catálogo (precio, descuento, promoción — compartido) y stock por sucursal o vista agregada. Alta/edición/baja de producto sigue gateada por `products.write` (solo gerente); el stock mínimo se edita ahí mismo, pero la **cantidad** ya no se edita como campo suelto — solo vía "Ajustar" (ver abajo).
  - **Kardex** — historial de movimientos de un producto (venta, reingreso por nota de crédito, ajuste manual, transferencia entrada/salida) con saldo corrida y exportación CSV. Cada fila sale de `inventory_movements`, que solo se escribe a través de las funciones `SECURITY DEFINER` de abajo — nunca por `UPDATE` directo a `product_stock`.
  - Acciones **Ajustar Stock** y **Transferir** (entre sucursales), gateadas por `inventory.write` (solo gerente), usan las RPCs atómicas `adjust_product_stock`/`transfer_stock`: mueven `product_stock` y dejan el movimiento en la misma transacción, recortando (nunca negativo) pero siempre logueando el delta realmente aplicado, así el saldo del kardex nunca diverge del stock real. La venta del POS y el reingreso por nota de crédito (§5) pasan por la misma función.
- **Clientes** (`CustomerManagement.jsx`) — base de clientes global de la empresa, solo lectura (el alta de cliente ocurre en el POS).
- **Facturación / Comprobantes** (`InvoiceManagement.jsx`) — historial, filtro por sucursal y estado SRI, detalle, descarga de XML, y en modo lectura+export para contador: aprobar/anular (`invoices.approve`/`invoices.void`) y enviar RIDE (`invoices.send_ride`) son solo-gerente.
- **Contabilidad** (`Accounting.jsx`, permiso `accounting.read`) — nueva sección con 4 pestañas:
  - **Libro de Ventas** — base imponible 0%/gravada, IVA generado, descuentos, totales por forma de pago y sucursal, conteo por estado. Cálculo en `src/lib/accountingHelpers.js` (`buildSalesLedger`), sobre `invoices.subtotal`/`tax_amount` (la cabecera, no la suma de líneas — ver nota técnica abajo). Ya resta notas de crédito de todos los totales si algún día existen (`invoice_type = 'nota_credito'`). Exportable a PDF/CSV.
  - **Conciliación SRI** — tarjetas de conteo por estado, listado de no-autorizadas con motivo, botón "Reconsultar estados" (llama `api/sri/reconcile-invoice.js` en serie).
  - **Cierres de Caja** (`CashClosures.jsx`) — historial de `cash_closures`, filtrable por sucursal/cajero/fecha, diferencias resaltadas, export CSV.
  - **Descarga de XML** — mismo mecanismo que en Facturas, sobre el rango ya seleccionado en la página.
- **Usuarios** (`UserManagement.jsx`, permiso `users.manage`) — alta de `vendedor`/`operario` (con sucursal obligatoria) y `contador` (sin sucursal), cambio de contraseña, reasignación de sucursal.
- **Sucursales** (`Branches.jsx`) — CRUD de sucursales y sus puntos de venta.
- **Reportes** (`Reports.jsx`) — 7 tipos (resumen, ventas, productos, clientes, cajeros, inventario, impuestos), filtro de fechas/sucursal, gráficos propios (`ReportCharts.jsx`, sin librería externa), exportación a PDF y CSV (BOM UTF-8 para Excel).
- **Configuración** (`StoreSettings.jsx`) — datos de la empresa (logo), **Apariencia del POS** (`AppearanceSettings.jsx`, ver §7.1) — y **Facturación SRI** (`BillingConfiguration.jsx`) — certificado, ambiente, tasa de IVA.
- **Modo claro/oscuro** — toggle personal en el TopBar del panel, independiente del tema del POS — ver §7.2.

**Nota técnica sobre el Libro de Ventas:** se detectó con datos reales que `invoices.subtotal`/`tax_amount` (cabecera) no siempre coincide centavo a centavo con la suma de sus `invoice_details` (descuentos con pequeñas diferencias de redondeo). El cálculo usa la cabecera como fuente de verdad de los totales (es lo que realmente se firmó y envió al SRI) y las líneas solo para determinar la proporción 0%/gravada — así el Libro de Ventas cuadra siempre contra el reporte "Impuestos/SRI" existente, verificado con datos reales.

---

## 7. Personalización visual (temas del POS y modo claro/oscuro del panel)

Dos sistemas de theming independientes, ambos vía CSS custom properties + atributos `data-*` — Tailwind + `var()` únicamente, sin librería de theming nueva. Ninguno de los dos toca `rideGenerator.js`, `reportPdfGenerator.js` ni los recibos impresos — los documentos fiscales/formales quedan siempre fuera de este sistema.

### 7.1 Temas del POS (por empresa)

`companies.ui_settings jsonb` (`{"pos_theme", "pos_accent"}`, default `light-classic`+`blue`) — lo elige el gerente, aplica a todos los cajeros de la empresa.

- **4 temas** (`src/styles/themes.css`, atributo `data-pos-theme` en `POSLayout.jsx`): `light-classic` (blanco, bordes suaves — default de fábrica para empresas nuevas), `light-soft` (crema cálido, tarjetas con sombra en vez de borde, radio y tipografía de totales más grandes), `dark-classic` (reproduce EXACTO el look que tenía el POS antes de esta fase — es el valor de backfill de las empresas que ya existían, para que su POS no cambiara), `dark-contrast` (negro puro, botones principales más grandes, pensado para uso rápido/táctil).
- **6 paletas de acento** (`data-pos-accent`): blue, emerald, violet, amber, rose, slate. Cada paleta tiene un valor de fondo de botón (`--pos-accent`, igual en los 4 temas — un botón autocontenido no depende del fondo de la página) **y un segundo valor separado** (`--pos-accent-soft`) para cuando el acento se usa como texto/ícono directo sobre la página — un mismo color no sirve para los dos roles (verificado numéricamente: los tonos afinados para fondo de botón fallan como texto).
- Catálogo único: `src/lib/themes.js` (`POS_THEMES`/`POS_ACCENTS`: id, nombre, descripción, colores de preview) — consumido por el paso "Diseño del POS" de `CompanyWizard.jsx` (opcional/saltable) y por `AppearanceSettings.jsx` (pantalla del gerente en Configuración, con vista previa en vivo que reutiliza el mismo `data-pos-theme`/`data-pos-accent`, sin duplicar lógica de color).
- Feature flag comercial `pos_theming` (`feature_flags`/`company_feature_overrides`) — habilitado en los 3 planes ya existentes al introducirse, pensado como palanca para planes futuros más económicos.
- Se guarda vía RPC `set_company_ui_settings` (`SECURITY DEFINER`, valida `role = 'gerente'` internamente), no con una política RLS directa: `gerente` y `admin` comparten el mismo rol de Postgres (`authenticated`), así que una política de `UPDATE` no podría restringirse a un rol de aplicación sin abrirle también la puerta a `admin` sobre cualquier empresa.

### 7.2 Modo claro/oscuro del panel (gerente y contador)

Preferencia **personal**, no de empresa — `users.ui_preferences jsonb` (`{"panel_mode"}`, default `light` para usuarios nuevos; los usuarios que ya existían al introducirse quedaron en `dark` vía backfill, para que su panel no cambiara). Aplica solo a `StoreManagerLayout` — **no** al POS ni al panel super-admin (`Layout`, siempre oscuro, con su propio sistema `.admin-theme` en `index.css`).

- Tokens `--panel-*` en `src/styles/panel-theme.css`, atributo `data-panel-mode` en la raíz de `StoreManagerLayout`. Acento fijo azul en los dos modos — a diferencia del POS, acá no hay paleta elegible (es una preferencia personal simple, no una identidad de marca de la empresa).
- Se guarda vía RPC `set_ui_preferences`. Se evaluó una política RLS directa (`id = auth.uid()`) pero se descartó al confirmar por consulta directa a Postgres que `authenticated` ya tenía `UPDATE` de tabla completa otorgado sobre `users` — con eso, cualquier política de `UPDATE` sin restricción de columna hubiera dejado a un usuario reescribir su propio `role`. Probado en vivo contra Supabase con datos descartables antes de darlo por bueno.
- Toggle sol/luna en el TopBar (`StoreManagerTopBar.jsx`) — aplica al instante; si la RPC falla, revierte visualmente y avisa por toast.
- `Modal.jsx`/`Toast.jsx`/`ConfirmDialog.jsx`/`Badge.jsx`/`Table.jsx`/`Tabs.jsx` (`src/components/ui/`) son compartidos entre el POS, el panel admin y este panel, y ya usaban variables genéricas `--surface-*`/`--text-*` (`index.css` `:root`, hoy sobreescritas solo por `.admin-theme`) — se extendió ese mismo mecanismo con un bloque `[data-panel-mode="light"]` en vez de migrarlos a nombrar `--panel-*` directamente, así no necesitan saber de qué layout cuelgan.
- `color-scheme` (propiedad CSS) declarada explícitamente en los tres sistemas de tema (`:root`, `themes.css`, `panel-theme.css`): sin esto, los controles nativos del navegador (flecha de `<select>`, ícono de `<input type="date">`) renderizan con su chrome claro sin importar el tema activo.

### 7.3 Verificación de contraste

Todo el trabajo de color se verificó con la fórmula de luminancia relativa WCAG (no a ojo). Esto sacó a la luz varias fallas AA **ya presentes en producción antes de esta fase**, no introducidas por ella — entre otras, el botón principal de cobro del POS y tres botones de acción del dashboard del gerente usaban tonos que fallan 3.2–3.8:1 con texto blanco (necesitan ≥4.5:1), y casi todos los colores de acento/badge/KPI del panel solo estaban afinados para fondo oscuro (fallan 1.7–3:1 sobre fondo claro). Se corrigieron todos. Verificación final: 132 pares en las 24 combinaciones tema×paleta del POS + los pares equivalentes del panel en ambos modos, todos ≥4.5:1.

---

## 8. Cierre de caja / arqueo

Tabla `cash_closures`, un registro **inmutable** por cierre (sin política RLS de `UPDATE` ni `DELETE` para ningún rol — correcciones se anotan en un cierre nuevo, no editando el viejo).

- El cajero (`POSSettings.jsx`) ve lo esperado — calculado desde sus facturas en su punto de venta desde su último cierre (o desde que se creó su login, si nunca cerró caja), agrupado por forma de pago (`src/lib/cashClosureHelpers.js`) — ingresa lo contado, ve la diferencia en vivo, y registra. Solo puede insertar/leer sus propios cierres.
- Gerente y contador leen todos los cierres de su empresa (`Contabilidad → Cierres de Caja`); contador sin escritura.
- No se implementó el bloqueo de venta por "cierre pendiente de más de 24h" (opcional en la spec original): el diseño de un solo paso nunca produce un cierre realmente "pendiente" que bloquear.

---

## 9. Panel de administración SaaS (`Layout`, rol `admin`)

- **Dashboard** (`Dashboard.jsx`) — visión general de la plataforma.
- **Empresas** (`Companies.jsx`, `CompanyDetail.jsx`, `CompanyEdit.jsx`, `CompanyWizard.jsx`) — listado con **health score** por empresa (`healthScore.js`), alta guiada, edición de identidad fiscal, checklist de onboarding, cambio de plan, suspensión/reactivación con motivo.
  - **Pestaña de usuarios** (`CompanyUsersTab.jsx`) — el admin puede, desde el detalle de una empresa: crear el gerente si falta, agregar/gestionar `vendedor`/`operario`/`contador`, **resetear contraseñas** y **activar/desactivar** cualquier usuario — todo vía endpoints `service_role` (`api/admin/create-user.js`, `api/admin/reset-user-password.js`, `api/admin/set-user-active.js`). Las altas quedan registradas en `activity_log`.
- **Planes** (`Subscriptions.jsx`) — catálogo de planes comerciales y sus precios/límites/features.
- **Métricas** (`Metrics.jsx`) — panel agregado de indicadores de la plataforma.
- **Pagos** (`Payments.jsx`) — dashboard de cobros: total recaudado histórico y del mes, empresas al día vs. pendientes, alta manual de un pago vía `PaymentModal.jsx`.
- **Alertas** — generadas al cargar datos (`generateAlerts`), no persistidas.
- **Actividad** (`Activity.jsx`) — feed de acciones administrativas, leído de `activity_log`.
- **Marca** (`BrandConfig.jsx`) — personalización de color/branding del panel.

---

## 10. Sistema de correo transaccional (Resend)

Servicio centralizado en `api/emails/*` y `api/admin/*` (Vercel Functions, Node), con disparos automáticos vía **Database Webhooks de Supabase** (`pg_net`).

```
Frontend (React) ──► /api/emails/*        ─┐
Supabase (pg_net) ─► /api/emails/webhook  ─┼─► Resend ─► correo
Frontend (admin)  ─► /api/admin/create-*  ─┘
```

| Evento | Disparo | Destinatario | Plantilla |
|---|---|---|---|
| Contraseña temporal (alta de gerente) | `api/admin/create-gerente.js` | Gerente nuevo | `tempPasswordEmail` |
| Bienvenida usuario (vendedor/operario/contador) | `api/admin/create-user.js` | Usuario nuevo | `welcomeCashierEmail` (genérica, `roleLabel` variable — no se duplicó una plantilla nueva) |
| Stock bajo | Trigger DB en `product_stock` → webhook | `companies.email` / `admin_email` | `lowStockEmail` |
| Factura devuelta por el SRI | Trigger DB en `invoices` → webhook | Empresa | `invoiceReturnedEmail` |
| Nueva factura emitida (RIDE adjunto) | `api/emails/send-invoice-ride.js` | Cliente (`customers.email`) | `newInvoiceEmail` |

**Seguridad:** los endpoints públicos validan contra la BD con `service_role` y verifican el rol de quien llama (todos los endpoints sensibles de `api/sri/*`/`api/emails/*` exigen `gerente`/`admin`, salvo la reconsulta SRI que también admite `contador`) — el navegador nunca elige el destinatario. Los webhooks se autentican con un secreto compartido. Ningún secreto viaja al navegador.

---

## 11. Estructura de carpetas

```
POST-PLAT/
├── api/
│   ├── sri/                       # Firma y envío al SRI (Node/Vercel)
│   │   ├── accessKey.js            # Clave de acceso (49 dígitos)
│   │   ├── xadesSign.js            # Firma XAdES-BES
│   │   ├── submit-invoice.js       # Orquesta el envío completo (solo gerente/admin)
│   │   ├── reconcile-invoice.js    # Reconsulta una factura 'devuelta' puntual (gerente/admin/contador)
│   │   ├── status.js               # Ping de disponibilidad de las URLs del SRI (no consulta comprobantes)
│   │   └── upload-certificate.js   # Sube+cifra el certificado (service role, solo gerente/admin)
│   ├── emails/                     # Notificaciones transaccionales (Resend)
│   │   ├── _lib.js / _templates.js / webhook.js
│   │   └── send-invoice-ride.js    # Solo gerente/admin
│   └── admin/                      # Mutaciones sensibles con service_role
│       ├── create-gerente.js
│       ├── create-user.js          # vendedor/operario/contador (generaliza el viejo create-cashier.js)
│       ├── reset-user-password.js  # admin → cualquier usuario
│       ├── reset-cashier-password.js # gerente → vendedor/operario/contador de su empresa
│       └── set-user-active.js      # también banea/desbanea a nivel Auth
├── src/
│   ├── components/
│   │   ├── layout/                 # Layout + Sidebar + TopBar por rol (admin / gerente+contador / cajero)
│   │   ├── pages/                  # Una vista por pantalla (incluye Accounting.jsx, CashClosures.jsx,
│   │   │                           # AccountantDashboard.jsx, UserManagement.jsx)
│   │   └── ui/                     # Componentes reutilizables (Modal, ConfirmDialog, PaymentModal, ReportCharts, Tabs, etc.)
│   ├── lib/
│   │   ├── supabase.js             # Cliente Supabase (anon key + sesión Auth)
│   │   ├── supabaseHelpers.js      # Todas las queries/RPCs de la app
│   │   ├── permissions.js          # Catálogo de permisos: fetchRolePermissions(), can()
│   │   ├── accountingHelpers.js    # Libro de ventas + conciliación SRI (puro, testeable)
│   │   ├── cashClosureHelpers.js   # Cálculo de esperado/diferencia de un cierre de caja (puro)
│   │   ├── invoiceXmlExport.js     # Descarga individual/masiva de XML (jszip, 100% cliente)
│   │   ├── transforms.js           # DB row → shape que usa la UI
│   │   ├── healthScore.js          # Puntaje de salud + checklist de onboarding por empresa
│   │   ├── planLimits.js           # Límites de plan + feature flags efectivos
│   │   ├── reportsHelpers.js / csvExport.js / reportPdfGenerator.js
│   │   ├── rideGenerator.js        # PDF de factura (RIDE), soporta salida base64
│   │   └── alerts.js / dates.js / password.js / ruc.js / certValidation.js
│   ├── store/useStore.js           # Estado global Zustand + sesión Auth + permisos
│   ├── data/                       # Datos de demo — no usados, candidatos a borrar
│   └── App.jsx / main.jsx
├── supabase/migrations/            # Migraciones SQL aplicadas vía MCP
├── DATABASE_SCHEMA_V2.sql          # Esquema de referencia (desactualizado frente al real)
├── EMAILS_SETUP.md                 # Guía completa del sistema de correos
├── AUDITORIA_SISTEMA.md            # Riesgos y deuda técnica
├── .mcp.json                       # Config del MCP de Supabase para Claude Code
└── vercel.json
```

---

## 12. Base de datos — tablas actuales (22)

| Grupo | Tablas |
|---|---|
| Plataforma / SaaS | `companies` (incluye `ui_settings jsonb` — tema/paleta del POS, ver §7.1), `plans`, `feature_flags` (incluye `pos_theming`), `company_feature_overrides` |
| Identidad y permisos | `users` (perfil, FK a `auth.users`, incluye `ui_preferences jsonb` — modo claro/oscuro del panel, ver §7.2), `admin_users` *(legado, sin uso real)*, `permissions`, `role_permissions` *(catálogo `modulo.accion`, ver §3)* |
| Sucursales | `branches`, `point_of_sales`, `product_stock` |
| Catálogo y clientes | `products`, `customers` |
| Facturación | `invoices`, `invoice_details`, `billing_configs`, `payment_methods` |
| Contabilidad | `cash_closures` *(nueva — arqueo de caja, inmutable)* |
| Cobros SaaS | `payments` (cobros a las empresas clientes por su suscripción) |
| Movimientos | `inventory_movements` (kardex — desde la Fase 6, incluye `branch_id`; solo se escribe vía las RPCs `adjust_product_stock`/`transfer_stock`, nunca `INSERT` directo, ver §6) |
| Auditoría | `audit_log` *(esquema presente, sin uso activo)*, `activity_log` (feed real del panel admin, incluye altas de usuario) |

Además, esquema `auth` (Supabase Auth): `auth.users` es ahora la fuente de verdad de credenciales, `public.users.id` es FK a `auth.users.id`.

Storage buckets: `sri-certificates` (privado, certificados `.p12` — subida solo vía endpoint service-role), `company-logos` (público, logos de empresas clientes).

RLS está habilitado en las 22 tablas de `public`, con políticas reales basadas en `auth.uid()` (no `USING(true)`) en las tablas operativas. No hay Edge Functions de Supabase en uso (toda la lógica serverless vive en Vercel Functions, ver §2).

---

## 13. Roles válidos (enum `user_role`)

| Rol | Uso típico | `branch_id` |
|---|---|---|
| `admin` | Super-admin de la plataforma SaaS | `NULL` |
| `gerente` | Dueño/administrador de una empresa cliente | `NULL` |
| `contador` | Solo lectura/exportación contable de una empresa | `NULL` |
| `vendedor` | Cajero, atado a una sucursal | requerido |
| `operario` | Igual que `vendedor` (variante de nombre) | requerido |

---

## 14. Notas para agentes AI que trabajen en este repo

- Al modificar la base de datos, usar siempre el MCP de Supabase (ver `CLAUDE.md`) y revisar/actualizar políticas RLS — las tablas operativas usan `auth.uid()` real, no `USING(true)`.
- **Colores del POS y del panel gerente/contador van SIEMPRE por los tokens `--pos-*`/`--panel-*`** (§7), nunca clases Tailwind de color hardcodeadas (`bg-zinc-900`, `text-emerald-400`, etc.) — un color nuevo que no pase por el token correspondiente probablemente falla WCAG AA en alguno de los 4 temas del POS o en modo claro del panel (ya pasó varias veces: verificar siempre con la fórmula de contraste real, no a ojo). El panel super-admin (`Layout`) es la excepción — sigue siendo siempre oscuro, vía `.admin-theme`/`index.css`.
- El login/sesión es Supabase Auth real (`supabase.auth.signInWithPassword`, `useStore.js`). La creación de usuarios pasa por la Auth Admin API desde endpoints `api/admin/*` con `service_role` (`auth.admin.createUser`) — nunca insertar directo en `public.users` sin crear primero el `auth.users` correspondiente (hay una FK que lo exige).
- **`public.users` restringe `SELECT` con lista blanca de columnas para `authenticated`** (no un grant de tabla completa) — a propósito, para mantener `password_hash`/`failed_login_attempts`/`locked_until` ocultas del cliente. Cualquier columna nueva que el frontend necesite leer (`loginWithPassword()`/`restoreAuth()` seleccionan la fila completa en cada login) necesita su propio `GRANT SELECT (columna) ON public.users TO authenticated` además del `ALTER TABLE ADD COLUMN` — `INSERT`/`UPDATE`/`REFERENCES` sí se heredan automáticamente, `SELECT` no. Olvidar esto rompe el login para **todos** los usuarios (pasó una vez, ver `AUDITORIA_SISTEMA.md` §9) porque el código trata cualquier error de esa consulta como "cuenta desactivada". Verificar con `select * from information_schema.column_privileges where grantee = 'authenticated' and table_name = 'users'` antes de dar por cerrada una migración así — y probar el `select` real con la `anon key`, no solo con el MCP (que corre con un rol que no tiene esta restricción).
- La UI se condiciona con `can(permiso)` (`src/lib/permissions.js`), no con `role === '...'` — al agregar una pantalla o botón nuevo, sumar su permiso al catálogo (`permissions`/`role_permissions`) en vez de hardcodear el rol.
- La firma XML (`xadesjs`) es frágil: no modificar las rutinas de canonicalización salvo estrictamente necesario, el SRI rechaza firmas inválidas sin mensajes claros.
- Cualquier paquete Node nuevo en `api/*` debe ser compatible con el runtime y límites de tamaño/ejecución de Vercel Functions (~4.5 MB de body).
- Para contexto de riesgos conocidos y roadmap, revisar `AUDITORIA_SISTEMA.md` y `MEJORAS_ADMIN_SAAS.md` antes de asumir que algo es un bug nuevo.
