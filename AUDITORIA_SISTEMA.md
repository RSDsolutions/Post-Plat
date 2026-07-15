# 🔍 Auditoría del Sistema - POST-PLAT

**Fecha:** 2026-07-09 (actualizado 2026-07-15 — ver [Actualización 2026-07-15](#actualización-2026-07-15))
**Alcance:** Base de datos (Supabase/Postgres), API serverless (`api/sri/*`), frontend (React/Vite), configuración y despliegue.
**Método:** Supabase Advisors (security + performance), lectura directa de `pg_policies`/`information_schema`, pruebas reales contra la API REST con la anon key (no solo simulación con rol privilegiado), lectura de código fuente y del historial de cambios de esta sesión.

> Ver también [`RESUMEN_SISTEMA.md`](./RESUMEN_SISTEMA.md) para una descripción funcional de cómo está armado el sistema hoy.

---

## Actualización 2026-07-15

Los 3 hallazgos críticos del resumen ejecutivo original (`create_company_gerente` sin verificar quién llama, `plans` ilegible, `activity_log` sin persistir) **ya están resueltos** — se aplicaron migraciones (`admin_user_management_rpcs`, `lock_down_admin_user_management_rpcs`, `close_public_execute_gap_on_admin_rpcs`, `close_create_company_user_public_execute_gap`) y se movieron las creaciones de usuario a endpoints server-side (`api/admin/create-gerente.js`, `api/admin/create-cashier.js`). No se re-verificó cada punto con pruebas reales de nuevo en esta pasada — recomendado antes de la próxima auditoría completa.

Se agregan 4 hallazgos nuevos, detectados en esta fecha:

### 5. Certificado `.p12`: la contraseña se guardaba en texto plano (CRÍTICO — **resuelto en esta sesión**)

`billing_configs.cert_password` es una columna `text` sin cifrar. Estaba protegida solo por `REVOKE SELECT` a nivel de columna para `anon`/`authenticated` (el navegador no podía leerla de vuelta), pero **se escribía en texto plano directamente desde el navegador** (`uploadSriCertificate()` en `supabaseHelpers.js` hacía un `UPDATE` con la contraseña tal cual) y cualquiera con la `service_role key` o acceso directo a Postgres (dump, backup, un admin de infraestructura) la veía en claro — junto con el `.p12` correspondiente en el bucket `sri-certificates`, eso equivale a la firma electrónica completa del cliente.

**Corrección aplicada:** se cifra con `pgcrypto` (`pgp_sym_encrypt`/`pgp_sym_decrypt`) usando una clave que **vive solo en una variable de entorno de Vercel** (`CERT_ENCRYPTION_KEY`), nunca en Postgres. La subida ahora pasa por un endpoint server-side nuevo (`api/sri/upload-certificate.js`) que cifra antes de guardar; `api/sri/submit-invoice.js` descifra vía una función `SECURITY DEFINER` (`get_cert_password`) solo ejecutable por `service_role`. Así, un compromiso de la base de datos por sí solo (sin también comprometer las env vars de Vercel) ya no expone la contraseña del certificado. Detalle técnico abajo, en la hoja de ruta se movió a "ya resuelto" (§1.4).

### 6. No hay notas de crédito ni flujo de anulación fiscal real (CRÍTICO — funcional/cumplimiento)

El enum `invoice_type` en la base ya contempla `nota_credito`, `nota_debito` y `comprobante_retencion`, pero no existe ni un archivo en `src/` que los mencione — no hay UI, no hay generación de XML, no hay firma ni envío al SRI para ninguno de los tres. `invoices.status` sí tiene un valor `anulada`, pero no encontré ningún flujo que lo escriba desde la interfaz (la "anulación" real de un comprobante autorizado ante el SRI ecuatoriano se hace legalmente emitiendo una nota de crédito, no marcando una fila como anulada en la propia base).

**Impacto:** un sistema de facturación electrónica en Ecuador sin nota de crédito está incompleto en la práctica — no hay forma legal de revertir una factura autorizada por devolución de mercadería o error de emisión. Es el vacío funcional más grande detectado hasta ahora. Notas de débito y retenciones son razonables como fase 2, pero la nota de crédito debería entrar antes de que el sistema se use con clientes reales en producción.

**Alcance estimado de la corrección:** UI de emisión (asociada a una factura autorizada existente), generación del XML de nota de crédito, firma XAdES-BES (reutiliza `xadesSign.js`), envío a los webservices del SRI (reutiliza el patrón de `submit-invoice.js`), y actualización del estado de la factura original. Es una feature grande, no un fix puntual.

### 7. Sin contingencia ni cola de reintentos automáticos ante caídas del SRI (ALTA)

El SRI se cae con cierta frecuencia (es un servicio gubernamental, no un SLA comercial). Hoy la única forma de reconsultar una factura es manual (`api/sri/status.js`, el usuario tiene que volver a la pantalla y pedirlo). No hay `cron` configurado (`vercel.json` no define ninguno — confirmado, solo fija `maxDuration: 60` para las funciones) ni cola de reintentos: una factura que queda `devuelta` o atascada en `borrador` porque el webservice no respondió se queda así hasta que alguien la reintente a mano.

**Corrección sugerida:** un cron de Vercel (o `pg_cron`, ya instalado como extensión aunque no habilitado — ver lista de extensiones) que reintente periódicamente facturas `devuelta`/`borrador` con más de N minutos de antigüedad, y opcionalmente implementar el esquema de contingencia oficial del SRI (permite emitir sin autorización inmediata cuando el servicio está caído, regularizando después) para no bloquear la venta en el POS cuando el SRI no responde.

### 8. Sesiones sin JWT ni expiración (ya documentado como §1.2/roadmap ítem 6 — RESUELTO 2026-07-15)

Confirmado vigente en su momento: `useStore.js` guardaba el usuario autenticado tal cual en `localStorage.postplat_auth`, sin token firmado ni expiración. **Resuelto migrando a Supabase Auth de verdad** (Fase 0 de un proyecto mayor — ver [Actualización 2026-07-15 (Fase 0 — Supabase Auth)](#actualización-2026-07-15-fase-0--supabase-auth) más abajo para el detalle completo). Los 7 usuarios existentes se migraron sin perder su contraseña ni cambiar su UUID (`auth.admin.createUser({ id, password_hash, email_confirm:true })`, bcrypt es compatible). Las 21 tablas pasaron de `USING(true)` a políticas reales basadas en `auth.uid()` — verificado con pruebas reales contra la BD (un vendedor ya no puede leer/escribir datos de otra empresa; un admin solo tiene SELECT, no puede escribir facturas/productos de un cliente).

**Lo que queda pendiente de esto mismo:** `api/sri/submit-invoice.js`, `api/sri/status.js`, `api/sri/upload-certificate.js` y `api/emails/send-invoice-ride.js` siguen recibiendo `userId` en el body y verificándolo contra `public.users` con `service_role`, en vez de validar un JWT (`Authorization: Bearer` + `auth.getUser()`). No es peor que antes (mismo patrón que ya tenían), pero migrarlos sería la extensión natural de este trabajo — lo dejo para una sesión aparte, no bloqueaba que RLS fuera honesta.

---

## 🚨 Resumen ejecutivo

Hay **3 hallazgos críticos que están activos en producción ahora mismo**, no son teóricos. Los primeros dos los confirmé con pruebas reales (no solo revisando el código):

1. **Cualquiera con la anon key pública puede crearse un login de `gerente` (control total) para cualquier empresa del sistema, incluyendo FARMACIA CRUZ AZUL.** La función `create_company_gerente` no verifica quién la llama. → [Detalle](#1-create_company_gerente-no-verifica-quién-llama-crítico)
2. **La tabla `plans` no se puede leer desde el navegador.** Lo confirmé con una petición real a la API REST usando la anon key: devuelve `200 []` (vacío) en vez de los 3 planes reales. Esto significa que la pantalla de Suscripciones, el selector de plan del wizard de alta de empresas, y las alertas de consumo probablemente estén rotas o vacías en producción ahora mismo. → [Detalle](#2-la-tabla-plans-es-ilegible-desde-el-cliente-crítico)
3. **El registro de actividad (`activity_log`) nunca se guarda de verdad.** El código que se conectó esta sesión falla silenciosamente por el mismo motivo que el punto 2 (RLS sin políticas) — el error se atrapa y solo hace `console.error`, así que nadie lo nota desde la interfaz. La tabla tiene 0 filas pese a que ya se ejecutaron varias acciones de admin que deberían haberla llenado. → [Detalle](#3-activity_log-nunca-persiste-crítico)

El motivo raíz de los tres es el mismo patrón: varias tablas tienen **RLS activado pero sin ninguna política creada**, lo cual en Postgres significa "nadie puede tocar esta tabla" para cualquier rol sin `BYPASSRLS` (es decir, ni `anon` ni `authenticated`, que son los roles que usa toda la app). Herramientas como el MCP de Supabase usadas para verificar trabajo durante esta sesión corren con un rol privilegiado que sí puede saltarse RLS — por eso estos problemas no se notaron antes: la verificación por SQL directo confirmó que los datos *quedaban bien guardados*, pero no pasó por el mismo camino (anon key) que usa la app real en el navegador.

**Recomendación:** antes de seguir agregando funcionalidades, corregir estos 3 puntos. Son cambios pequeños y acotados (agregar políticas RLS, agregar una verificación de rol en una función). Puedo aplicarlos de inmediato si lo autorizas — no los toqué porque el pedido de esta conversación fue específicamente generar esta auditoría, no modificar la base de datos.

El resto del documento detalla estos y otros hallazgos por categoría, más una hoja de ruta priorizada.

---

## Actualización 2026-07-15 (Fase 0 — Supabase Auth)

Migración real a Supabase Auth, hecha como prerequisito de un proyecto de permisos/contabilidad más grande (ver plan de esa sesión) al descubrir que "RLS impide que un rol escriba" era imposible de cumplir de verdad sin `auth.uid()`. Decisión consciente del usuario, no una iniciativa unilateral — implica apartarse de "no se usa Supabase Auth" que decía `CLAUDE.md`/la spec original.

**Qué cambió:**
- Los 7 usuarios existentes se migraron a `auth.users` preservando **el mismo UUID y la misma contraseña** (`auth.admin.createUser({ id, password_hash, email_confirm:true })` — Supabase soporta importar hashes bcrypt tal cual). Cero resets forzados, cero reescritura de FKs.
- `public.users` pasa a ser tabla de "perfil" (`FK users.id → auth.users.id`), `password_hash` queda inerte (nullable, ya no se lee ni se escribe).
- Login (`useStore.login()`) usa `supabase.auth.signInWithPassword`; sesión persistida/refrescada por supabase-js, no a mano en `localStorage`.
- Las 21 tablas pasaron de `USING(true)` a políticas reales: `SELECT` scopeado a `company_id = current_company_id()` (o `is_platform_admin()` para el panel admin, solo lectura), escritura restringida además por rol (`current_role() in (...)`). Verificado con pruebas reales: un vendedor ya no puede leer ni escribir datos de otra empresa; el admin solo puede leer, no escribir, datos operativos de un cliente.
- `create_company_gerente`, `create_company_user`, `verify_user_password`, `reset_company_user_password` (RPCs bcrypt) — **retiradas**. Los altas/reseteos ahora pasan por `auth.admin.createUser`/`updateUserById` desde endpoints `service_role` (`api/admin/create-gerente.js`, `create-cashier.js`, `reset-user-password.js`, `reset-cashier-password.js` [nuevo], `set-user-active.js`).
- Desactivar un usuario ahora también banea a nivel Auth (`ban_duration`), no solo marca `is_active=false` — antes de esto, un login ya en curso (localStorage) podía seguir "funcionando" indefinidamente aunque se desactivara al usuario, porque nada revisaba `is_active` en cada acción.
- `update_user_branch` ganó verificación real de quién llama (antes cualquiera que supiera `company_id`+`user_id`+`branch_id` podía reasignar — no estaba en la lista original de RPCs "ya bien resueltas").

**Qué NO se tocó (seguimiento pendiente):** `api/sri/submit-invoice.js`, `api/sri/status.js`, `api/sri/upload-certificate.js`, `api/emails/send-invoice-ride.js` siguen validando un `userId` de body contra la tabla `users` con `service_role`, no un JWT real. Es el mismo nivel de seguridad que ya tenían (no es una regresión), pero ahora que hay sesiones reales, migrarlos a `Authorization: Bearer` + `supabase.auth.getUser()` cerraría la última pieza de este mismo problema.

---

## 1. Seguridad

### 1.1 Hallazgos críticos

#### 1. `create_company_gerente` no verifica quién llama (CRÍTICO)

Esta función (creada esta sesión para que el admin dé de alta el primer login de un cliente nuevo) es `SECURITY DEFINER` y es ejecutable directamente por `anon`/`authenticated` vía `/rest/v1/rpc/create_company_gerente`. Su cuerpo real:

```sql
BEGIN
  IF p_email IS NULL OR p_email = '' OR p_name IS NULL OR p_name = '' THEN
    RAISE EXCEPTION 'Nombre y correo son requeridos';
  END IF;
  IF length(p_password) < 6 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres';
  END IF;
  IF EXISTS (SELECT 1 FROM users u WHERE u.company_id = p_company_id AND u.email = p_email) THEN
    RAISE EXCEPTION 'Ya existe un usuario con ese correo en esta empresa';
  END IF;
  INSERT INTO users (company_id, email, password_hash, name, role, is_active)
  VALUES (p_company_id, p_email, crypt(p_password, gen_salt('bf')), p_name, 'gerente', true)
  ...
```

Valida formato de email/contraseña y que no exista ya ese correo **en la empresa indicada** — pero nunca valida que quien llama sea realmente un admin de la plataforma. `p_company_id` es un parámetro que el llamador elige libremente. Como referencia, `create_company_user` (la función equivalente para que un *gerente* cree cajeros) sí tiene este mismo problema de fondo, pero al menos ahí el rol creado está restringido a `operario`/`vendedor`. Esta función crea directamente un **`gerente`**, el rol con más control dentro de una empresa (inventario, facturación, cajeros, sucursales, config SRI).

**Impacto real:** cualquier visitante del sitio puede abrir la consola del navegador y ejecutar el equivalente a:
```
POST /rest/v1/rpc/create_company_gerente
{ "p_company_id": "<uuid de cualquier empresa existente>", "p_email": "atacante@x.com", "p_password": "123456", "p_name": "x" }
```
y quedar con acceso total a esa empresa — incluyendo la real (FARMACIA CRUZ AZUL). Los UUIDs de empresas no son secretos: `companies` es de lectura pública (ver 1.2).

**Corrección sugerida:** esta función no debería ser invocable directamente desde el cliente. Opciones, de más a menos robusta:
- Moverla detrás de un endpoint serverless (`api/admin/create-gerente.js`) que primero verifique la sesión del admin (mismo patrón que ya usa `api/sri/submit-invoice.js` para validar `userId`+`role`), y que la función SQL deje de ser `SECURITY DEFINER` ejecutable por `anon`/`authenticated` (`REVOKE EXECUTE ... FROM anon, authenticated`).
- Como mínimo aceptable hoy: agregar un parámetro `p_admin_user_id` y validar `EXISTS (SELECT 1 FROM users WHERE id = p_admin_user_id AND role = 'admin')` dentro de la función, igual que ya hacen las validaciones de rol en `create_company_user`.

#### 2. La tabla `plans` es ilegible desde el cliente (CRÍTICO)

Prueba real ejecutada contra la API REST de Supabase con la anon key del proyecto (la misma que usa el navegador):
```
GET /rest/v1/plans?select=id,name&limit=3
→ HTTP 200
→ []
```
`plans` tiene RLS activado y **cero políticas** (confirmado en `pg_policies`, no es un falso positivo del advisor). Postgres deniega todo por defecto en ese caso — PostgREST lo traduce en una respuesta `200` con array vacío para `SELECT`, no un error, así que además es un fallo silencioso: no hay excepción visible en consola, solo listas vacías.

**Impacto real:** `fetchPlans()` devuelve `[]` en producción. Cualquier pantalla que dependa de los planes reales —Suscripciones del admin, selector de plan en el wizard de alta de empresa, el cálculo de alertas de consumo (`plan.comprobantesLimit`)— está mostrando vacío o degradando silenciosamente ahora mismo, aunque en las pruebas de esta sesión (hechas vía SQL directo con rol privilegiado) todo se veía correcto.

**Corrección sugerida:**
```sql
CREATE POLICY plans_read_access ON public.plans FOR SELECT USING (true);
```
(Planes no tiene datos sensibles por fila — es catálogo público de precios — así que una política de lectura abierta es razonable, en línea con el resto del esquema.)

#### 3. `activity_log` nunca persiste (CRÍTICO)

Mismo defecto que el punto 2, pero en escritura. `activity_log` también tiene RLS activado sin políticas. El helper que se conectó esta sesión:

```js
// src/lib/supabaseHelpers.js
export async function logActivity(companyId, action, description, userId = null) {
  const { data, error } = await supabase.from('activity_log').insert([...]).select().single();
  if (error) throw new Error(`Error logging activity: ${error.message}`);
  return data;
}
```
y en `useStore.js`:
```js
addActivityEvent: async (action, companyId, companyName, detail) => {
  try {
    const saved = await logActivity(...);
    set((state) => ({ activityLog: [event, ...state.activityLog] })); // nunca se alcanza
  } catch (error) {
    console.error('Error logging activity:', error); // se traga el error
  }
},
```
El `insert` falla por RLS, `logActivity` lanza la excepción, `addActivityEvent` la atrapa y solo hace `console.error` — la acción principal (suspender empresa, registrar pago, etc.) sí se guarda bien porque usa otras tablas con políticas correctas, pero la fila de auditoría nunca se crea, ni siquiera en el estado local (esa línea es inalcanzable si el insert falla). Confirmado con datos: **0 filas en `activity_log`** pese a que ya se ejecutaron altas/suspensiones/cambios de plan reales esta sesión.

**Corrección sugerida:**
```sql
CREATE POLICY activity_log_insert_access ON public.activity_log FOR INSERT WITH CHECK (true);
CREATE POLICY activity_log_read_access ON public.activity_log FOR SELECT USING (true);
```

#### 4. El bloqueo de cuenta por intentos fallidos no existe realmente

`SECURITY_GUIDE.md` documenta `failed_login_attempts`/`locked_until` como una protección activa, y la tabla `users` tiene esas columnas. Pero el cuerpo real de `verify_user_password` es:
```sql
SELECT users.id, users.email, users.name, users.role, users.company_id
FROM users
WHERE users.email = p_email AND users.is_active = true
  AND users.password_hash = crypt(p_password, users.password_hash);
```
Nunca lee ni actualiza `failed_login_attempts`/`locked_until`. No hay límite de intentos: un atacante puede probar contraseñas contra cualquier email indefinidamente (fuerza bruta / credential stuffing), y las columnas de bloqueo son decorativas. Tampoco hay rate-limiting a nivel de red (Vercel/Supabase) delante del RPC.

**Corrección sugerida:** incrementar `failed_login_attempts` en cada intento fallido dentro de la misma función (o en el código que la llama), fijar `locked_until` tras N intentos, y que la función rechace el login mientras `locked_until > now()`. Es exactamente la lógica que `SECURITY_GUIDE.md` ya describe como diseño — falta implementarla.

### 1.2 Hallazgos importantes

**No hay aislamiento real entre empresas (multi-tenant "de confianza", no criptográfico).** Todas las tablas operativas tienen políticas RLS del tipo `USING (true)` / `WITH CHECK (true)`:

| Tabla | Política | Efecto real |
|---|---|---|
| `companies` | insert/update `WITH CHECK(true)` | cualquiera puede editar cualquier empresa |
| `branches`, `point_of_sales`, `product_stock`, `customers`, `invoices`, `invoice_details`, `payment_methods`, `billing_configs` | `ALL USING(true)` | cualquiera puede leer/escribir/borrar filas de cualquier empresa |
| `products` | insert/update/delete `USING(true)`/`WITH CHECK(true)` | ídem |

Esto no es una regresión de esta sesión — es el modelo de confianza que ya tenía el proyecto (todo pasa por la anon key compartida, sin sesión de Supabase Auth real; la app confía en que el propio cliente sólo pide su `company_id`). Quedó registrado explícitamente como decisión consciente al construir sucursales. Lo marco aquí porque es la causa estructural detrás de los puntos 1-3: sin un `auth.uid()` real, no hay forma de que una política RLS diferencie "el gerente de la empresa A" de "un visitante cualquiera", así que hoy la única protección real está en:
- Los RPCs que sí validan (`create_company_user`, `reset_company_user_password`, `update_user_branch` — bien hechos, con guardas server-side).
- El endpoint `api/sri/submit-invoice.js`, que sí valida `userId` pertenece a `companyId` y tiene rol `gerente`/`admin` antes de firmar/enviar al SRI.
- Todo lo demás depende de que el frontend "se porte bien" y filtre por `company_id` — un atacante que hable directo con la API REST no tiene ese límite.

**No hay sesión/token real, solo IDs que el cliente declara.** `api/sri/submit-invoice.js` recibe `{ invoiceId, companyId, userId }` en el body y valida que `userId` pertenezca a `companyId` con el rol correcto — pero nada garantiza criptográficamente que quien hace la petición *es* ese `userId`. Quien conozca (u obtenga listando `users`/`companies`) un UUID de gerente puede invocar el endpoint como si fuera él. Es el mismo problema de fondo que los puntos anteriores, aplicado a la API serverless en vez de a PostgREST directo.

**Funciones `SECURITY DEFINER` sin `search_path` fijo.** `verify_user_password`, `verify_admin_password`, `reset_company_user_password`, `create_company_user`, `update_user_branch` no fijan `search_path`, lo que en teoría permite un ataque de "search path hijacking" si alguna vez existiera un esquema adicional manipulable. Corrección de una línea por función: `SET search_path = public, pg_temp`.

**El bucket `company-logos` permite listar todos los archivos**, no solo obtenerlos por URL conocida (política `SELECT` amplia sobre `storage.objects`). Un visitante puede enumerar los logos de todas las empresas, no solo acceder al que ya conoce. Bajo impacto (son logos, no son datos sensibles) pero fácil de acotar a "get por key" sin "list".

**`api/sri/submit-invoice.js` devuelve `error.stack` al cliente** en dos lugares (falla al cargar `open-factura`, y el catch general). Expone rutas de archivos y estructura interna del servidor en la respuesta HTTP. Debería quedar solo en `console.error` server-side.

### 1.3 Hallazgos menores / hardening

- `rls_auto_enable()` (función interna de infraestructura, dispara con un event trigger de `CREATE TABLE`) también aparece como ejecutable por `anon`/`authenticated`. No hace nada útil invocada manualmente, pero no hay razón para dejarla expuesta: `REVOKE EXECUTE ... FROM anon, authenticated`.
- Múltiples políticas permisivas duplicadas en `invoices` para `SELECT` (`invoices_all_access` + `read_invoices`) — no es un problema de seguridad en sí, pero cada política se evalúa en cada consulta; ver sección de rendimiento.
- `permissions` (10 filas, catálogo cargado) y `role_permissions` (**0 filas**) sugieren que el sistema granular de permisos de `DATABASE_SCHEMA_V2.sql` nunca se terminó de poblar — hoy el control de acceso real es por `role` (`admin`/`gerente`/`vendedor`/`contador`/`operario`) verificado a mano en cada RPC/endpoint, no por esta tabla. Estas dos tablas también están bloqueadas por RLS sin políticas, así que aunque se poblara `role_permissions`, la app no podría leerla hoy.

### 1.4 Lo que ya está bien resuelto

Para que quede balanceado — esto ya se corrigió y verificó en sesiones recientes, no hace falta tocarlo de nuevo:
- **Exposición de `password_hash`:** antes cualquiera con la anon key podía leer los hashes bcrypt de todas las empresas (`GRANT SELECT` sin restricción de columnas + política sin filtro). Ya está revocado y reemplazado por una lista explícita de columnas seguras.
- **Constraint de `point_of_sales` demasiado restrictiva:** impedía repetir un mismo punto de emisión en distintos establecimientos (sí permitido por el SRI). Corregida a `UNIQUE(company_id, numero_establecimiento, numero_pos)`.
- **Panel admin sin persistencia real:** suspender/reactivar/cambiar plan/crear empresa eran mutaciones locales que se perdían al refrescar. Ahora todo pasa por Supabase de verdad.
- **RPCs de cajeros (`create_company_user`, `reset_company_user_password`) con buenas guardas server-side:** restringen rol a `operario`/`vendedor`, validan que el cajero pertenezca a la empresa del gerente que llama. Es el patrón correcto — falta replicarlo en `create_company_gerente` (punto 1.1.1).
- **`create_company_gerente`, `plans`, `activity_log` (puntos 1.1.1-1.1.3 originales):** corregidos — ver [Actualización 2026-07-15](#actualización-2026-07-15).
- **`billing_configs.cert_password` en texto plano (§5 de la actualización 2026-07-15):** cifrado con `pgcrypto` + clave fuera de la base (env var de Vercel), subida movida a un endpoint server-side dedicado.

---

## 2. Estructura / Arquitectura

- **Cero pruebas automatizadas.** No existe ni un solo archivo de test en el proyecto (`**/*.test.js` solo matchea dentro de `node_modules`). El código más frágil y menos visible cuando falla —generación de clave de acceso SRI, firma XAdES, los RPCs con lógica de negocio— es exactamente el que más se beneficiaría de tests, porque un error ahí no se nota hasta que el SRI rechaza un comprobante real.
- **Sin TypeScript ni JSDoc.** Varios bugs de esta sesión (`subtotal` vs `subtotal_amount`, `comprobantes_limit` vs `max_invoices_monthly`) fueron directamente discrepancias de forma/nombre entre lo que el código asumía y lo que la base de datos realmente tenía — la clase de error que un sistema de tipos atrapa en el editor antes de ejecutar nada.
- **Sin CI.** No hay `.github/workflows` ni equivalente. Nada corre build/lint automáticamente antes de mergear a `main`, que además es la rama de despliegue automático a Vercel.
- **Bundle único de ~1.4MB** (advertencia del propio build de Vite, sin resolver). La SPA sirve tres experiencias muy distintas (admin, gerente, punto de venta del cajero) desde un solo bundle inicial — candidata natural a code-splitting por rol/ruta.
- **`CLAUDE.md` describe un esquema desactualizado.** Dice "16 tablas" y no menciona `billing_configs`, `payment_methods` ni `product_stock` (esta última ni existía antes de esta sesión). El esquema real hoy tiene **19 tablas**. Vale la pena actualizar ese documento para que no desoriente a quien lo use como referencia.
- **Código y datos muertos identificados:**
  - `src/data/companies.js`, `src/data/activityLog.js` — datos de demo, no se importan en ningún lado.
  - Tabla `admin_users` — 1 fila residual, bloqueada por RLS sin políticas, la app nunca la consulta (el admin real vive en `public.users` con `role='admin'`).
  - `products.quantity` / `products.min_stock` — columnas que ya no se escriben (reemplazadas por `product_stock` desde la migración de sucursales) pero siguen en el esquema.
  - Dependencia `@modelcontextprotocol/sdk` en `dependencies` de `package.json` — no se usa en ningún archivo de `src/` (es config de Claude Code, no del runtime de la app).
- **Índices duplicados** (gasto puro, sin trade-off en quitarlos):
  - `invoice_details`: `idx_invoice_details_inv` + `idx_invoice_details_invoice_id`
  - `invoices`: `idx_invoices_company` + `idx_invoices_company_id`, y `idx_invoices_date` + `idx_invoices_issue_date`
- **Foreign keys sin índice de cobertura** (impacto en joins/deletes a medida que crecen las tablas): `audit_log.admin_user_id`, `companies.plan_id`, `inventory_movements.user_id`, `invoices.user_id`, `product_stock.branch_id`, `role_permissions.permission_id`, `users.branch_id`.
- **FK sin `ON DELETE CASCADE`:** `activity_log_company_id_fkey` bloquea borrar una empresa si tiene actividad registrada (hoy no importa porque el flujo de auditoría está roto — punto 1.1.3 — pero al corregirlo esto empezará a molestar si algún día se necesita borrar una empresa de prueba).

---

## 3. Funcionalidad

- **Los límites de plan no se hacen cumplir en ningún lado.** `plans.max_invoices_monthly`, y los límites de usuarios/sucursales se guardan y se *muestran* (Subscripciones, alertas de consumo), pero no encontré ningún punto del código que bloquee o avise en el momento en que una empresa los supera (crear una factura número 501 en un plan con tope 500, o un cajero número 6 en un plan con tope 5, simplemente funciona igual). Sin esto, la diferenciación entre planes es solo visual.
- **No hay pasarela de pago real.** "Registrar pago" en el panel admin es un botón que actualiza `subscription_status`/`payment_status` manualmente — no hay integración con Stripe, PayPal ni un procesador local ecuatoriano, ni webhooks. Es coherente con una operación manual hoy, pero vale la pena nombrarlo como lo que es: no hay cobro automático.
- **No hay envío de correo en ningún punto del sistema.** Ni para verificación de cuenta, ni para recuperación de contraseña de `gerente`/`admin` (los cajeros sí pueden ser reseteados, pero por su gerente manualmente, no por email), ni para avisar al cliente que su suscripción está por vencer (las alertas de vencimiento hoy solo las ve el admin en su propio panel, nunca llegan al cliente). Esto fue una decisión consciente tomada esta sesión (mantener el sistema de auth actual en vez de migrar a Supabase Auth), pero como falta funcional queda pendiente.
- **`inventory_movements` existe pero nada escribe ahí.** El descuento de stock en una venta (`decrementProductStock`) actualiza `product_stock` directamente, sin dejar un registro de auditoría de movimiento (quién, cuándo, por qué bajó el stock). Además la tabla está bloqueada por RLS sin políticas (mismo defecto de la sección 1), así que aunque se empezara a usar, fallaría igual que `activity_log`.
- **Asignación cajero↔terminal es implícita, no explícita.** Si una sucursal llega a tener más de un punto de venta activo, cada cajero usa "el primero activo" de su sucursal — no hay forma de asignar un cajero a una terminal específica. Documentado como límite de alcance consciente al construir sucursales, no un bug, pero vale la pena tenerlo en el radar si algún cliente real llega a necesitar dos cajas simultáneas en un mismo local.
- **No hay flujo de baja de empresa** en el panel admin (solo suspender). Tiene sentido no ofrecerlo aún dado que ni siquiera se podría ejecutar limpio hoy (ver el FK no-cascade de la sección 2).

---

## 4. Diseño / UX

- **El panel admin no recibió el pase de responsividad móvil.** El trabajo de esta sesión fue explícitamente para "el sistema del gerente" — Empresas/Suscripciones/Alertas/Actividad del admin probablemente se vean mal o sean poco usables en pantallas chicas. Si el admin (o algún cliente del admin) llega a necesitar gestionar el SaaS desde el celular, esto va a doler.
- **Sin evidencia de accesibilidad tratada como requisito** (`aria-label`, manejo de foco en modales, navegación por teclado, contraste). No es algo que se haya evaluado a fondo en esta auditoría, pero tampoco apareció como consideración explícita en el código revisado esta sesión.
- **Ya resuelto, vale la pena mencionarlo:** la inconsistencia entre `showToast` (se autodescarta a los 4s) y la necesidad de mostrar una contraseña temporal de forma persistente ya se corrigió usando `ConfirmDialog` con `whitespace-pre-line`. Es el patrón correcto a reusar si aparece un caso similar (por ejemplo, si se implementa el punto 1.1.1 con un flujo que también necesite mostrar credenciales one-time).

---

## 5. Rendimiento

- **Bundle único ~1.4MB** sin code-splitting (ver sección 2) — el mayor punto de apalancamiento para mejorar el tiempo de carga inicial, especialmente para el rol `operario`/`vendedor` que solo necesita el POS y hoy probablemente descarga también todo el código del panel admin y del panel gerente.
- **Políticas RLS permisivas duplicadas en `invoices`** (`invoices_all_access` + `read_invoices`, ambas cubren `SELECT` para los mismos roles) — Postgres evalúa ambas en cada consulta. Consolidar en una sola política reduce trabajo por query, aunque con el volumen actual (5 facturas) el impacto real es insignificante; vale la pena limpiarlo ahora que es barato, antes de que haya miles de filas.
- **Índices "no usados" reportados por el advisor** (en `products`, `invoices`, `customers`, `activity_log`, etc.): en su mayoría reflejan que las tablas todavía tienen pocas filas y poco tráfico de queries, no necesariamente que el índice esté mal diseñado. No los tocaría todavía — mejor revisar de nuevo este mismo reporte de advisors dentro de unos meses de uso real en producción, cuando el patrón de queries sea representativo.
- **Duplicados sí vale la pena quitarlos ya** (ver sección 2) — ahí no hay ningún trade-off, solo espacio y escritura desperdiciados.

---

## 6. Hoja de ruta priorizada

*(actualizada 2026-07-15 — los ítems 1-3 originales y el cifrado de `cert_password` ya están resueltos, ver §1.4 y la actualización del 2026-07-15)*

**🔴 Urgente — riesgo activo en producción**
1. ~~`create_company_gerente`: agregar verificación de que quien llama es admin (§1.1.1).~~ ✅ Resuelto.
2. ~~Agregar política `SELECT` a `plans` (§1.1.2).~~ ✅ Resuelto.
3. ~~Agregar políticas `INSERT`/`SELECT` a `activity_log` (§1.1.3).~~ ✅ Resuelto.
4. Implementar de verdad el bloqueo por intentos fallidos en `verify_user_password`/`verify_admin_password` (§1.1.4). **Sigue pendiente.**
5. Quitar `stack` de las respuestas HTTP en `api/sri/submit-invoice.js` (§1.2). **Sigue pendiente.**
6. ~~Sesiones sin JWT/expiración — migrar a Supabase Auth (§8).~~ ✅ Resuelto 2026-07-15 (Fase 0). Queda como seguimiento menor: migrar `api/sri/*`/`api/emails/send-invoice-ride.js` de `userId` en el body a verificar el JWT real (ver la actualización de esa fecha).
7. Nota de crédito / anulación fiscal real de comprobantes autorizados (§6 de la actualización 2026-07-15). **Sigue pendiente — feature grande, priorizar antes de operar con clientes reales.**

**🟠 Alta**
8. Contingencia/reintentos automáticos ante caídas del SRI (§7 de la actualización 2026-07-15). **Sigue pendiente.**
9. Hacer cumplir los límites de plan (facturas/mes, usuarios, sucursales) en el momento de crear el recurso, no solo mostrarlos.
10. `SET search_path` en las funciones `SECURITY DEFINER` (§1.2).
11. Acotar la política de listado del bucket `company-logos` (§1.2).

**🟡 Media**
12. Code-splitting por rol (admin / gerente / POS) para bajar el bundle inicial.
13. Integración de pasarela de pago real.
14. Flujo de recuperación de contraseña por correo para `gerente`/`admin` (el sistema de correos con Resend ya existe desde el 2026-07-11 — falta este flujo puntual).
15. Quitar índices duplicados, agregar índices a las FK listadas en §2, consolidar las políticas duplicadas de `invoices`.
16. Responsividad móvil del panel admin.

**🟢 Baja**
17. Suite de tests mínima, empezando por generación de clave de acceso SRI y los RPCs de negocio (es el código con más riesgo y menos visibilidad cuando falla).
18. Evaluar TypeScript (o al menos JSDoc) — varios bugs de esta sesión eran discrepancias de forma que un tipado hubiera atrapado antes de ejecutar.
19. Pipeline de CI (build + lint) en cada push a `main`.
20. Limpieza de código muerto: `src/data/companies.js`, `src/data/activityLog.js`, tabla `admin_users`, columnas `products.quantity`/`min_stock`, dependencia `@modelcontextprotocol/sdk`.
21. Actualizar la sección de esquema de `CLAUDE.md` para reflejar las 21 tablas reales.
