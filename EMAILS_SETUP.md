# 📧 Sistema de Notificaciones por Correo (Resend) — POST-PLAT

Servicio centralizado de correos para POST-PLAT usando **Resend** (dominio con DNS en **Cloudflare**), sobre **Vercel Functions** (Node), con disparos automáticos vía **Database Webhooks de Supabase**.

---

## 🧭 Decisión arquitectónica: ¿Vercel Functions o Supabase Edge Functions?

**Elegido: Vercel Functions** (`api/emails/`, `api/admin/`). Razones:

- Toda la infraestructura, secretos y pipeline de deploy del proyecto ya viven en Vercel (mismo patrón que `api/sri/submit-invoice.js`). Meter Edge Functions (Deno) significaría un segundo runtime, segundo almacén de secretos y segundo deploy.
- Los disparos automáticos ante cambios en la BD **no requieren** Edge Functions: los **Database Webhooks de Supabase** (basados en `pg_net`) hacen un HTTP POST a cualquier endpoint HTTPS — incluidos los de Vercel.
- El SDK de Resend es Node y encaja directo en las Vercel Functions.

```
Frontend (React) ──► /api/emails/*  ─┐
Supabase (pg_net) ─► /api/emails/webhook ─┼─► Resend ─► correo
Frontend (admin) ──► /api/admin/create-* ─┘
```

---

## 🗂️ Archivos creados / modificados

| Archivo | Rol |
|---|---|
| `api/emails/_lib.js` | Núcleo: cliente Resend, `sendEmail()`, service-role Supabase, verificación de secreto |
| `api/emails/_templates.js` | Plantillas HTML responsivas (5 tipos) |
| `api/emails/webhook.js` | Receptor de Database Webhooks → stock bajo + factura devuelta |
| `api/emails/send-invoice-ride.js` | Adjunta el RIDE (PDF) y lo envía al cliente |
| `api/admin/create-gerente.js` | Crea gerente + envía contraseña temporal (cierra vuln §1.1.1) |
| `api/admin/create-cashier.js` | Crea vendedor/operario + correo de bienvenida |
| `supabase/migrations/20260711_email_notifications.sql` | Triggers `pg_net` + `REVOKE` de la RPC |
| `src/lib/rideGenerator.js` | Nueva opción `output: 'base64'` (no rompe la descarga) |
| `src/lib/supabaseHelpers.js` | `emailInvoiceRide()` + `createCompanyGerente`/`createCashierUser` ahora vía serverless |
| `src/components/pages/InvoiceManagement.jsx` | Botón "Enviar por correo" + auto-envío en producción |

---

## ✅ Acciones MANUALES que debes hacer tú (yo no puedo)

> No pude ejecutarlas porque requieren tus dashboards / credenciales y el MCP de Supabase pide autorización interactiva que no está disponible en esta sesión.

### 1. Cloudflare + Resend (verificar dominio)
1. En **Resend** → *Domains* → *Add Domain* → escribe tu dominio (ej. `tudominio.com`).
2. Resend te dará registros **DNS** (SPF/`TXT`, **DKIM**/`CNAME` o `TXT`, y un `MX` de return-path).
3. En **Cloudflare** → *DNS* → agrega esos registros **tal cual**. Importante: en los `CNAME`/`TXT` de DKIM pon el proxy en **DNS only** (nube gris), no proxied.
4. Espera la verificación en Resend (unos minutos). Sin dominio verificado sólo puedes enviar a tu propio correo de prueba.
5. En **Resend** → *API Keys* → crea una API key (permiso *Sending access*).

### 2. Variables de entorno en Vercel
En *Project → Settings → Environment Variables* agrega (Production + Preview):

| Variable | Valor |
|---|---|
| `RESEND_API_KEY` | la API key de Resend |
| `EMAIL_FROM` | `POST-PLAT <facturas@tudominio.com>` (dominio verificado) |
| `EMAIL_WEBHOOK_SECRET` | un secreto largo aleatorio (guárdalo, va también en la SQL) |
| `EMAIL_APP_URL` | (opcional) URL pública de tu app, para los botones de los correos |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | ya deberían existir (las usa `api/sri/*`) |

> Genera el secreto, por ejemplo, con: `openssl rand -hex 32`

### 3. Migración SQL en Supabase
1. Abre `supabase/migrations/20260711_email_notifications.sql`.
2. **Edita la fila de config** (`private.email_webhook_config`): pon tu `endpoint_url`
   = `https://TU-APP.vercel.app/api/emails/webhook` y `secret` = **el mismo** `EMAIL_WEBHOOK_SECRET`.
3. Ejecútala vía MCP (`mcp__supabase__apply_migration`) o en el **SQL Editor** de Supabase.
   - Requiere la extensión `pg_net` (la migración la habilita).
4. Verifica: haz un `UPDATE` que deje un `product_stock.quantity` por debajo de su `min_stock`
   y revisa `select * from net._http_response order by created desc limit 5;`.

### 4. Deploy e instalación
- `npm install` (ya agregué `resend` al `package.json`; localmente ya lo instalé).
- `git push` → Vercel construye y publica los nuevos endpoints automáticamente.

---

## 📨 Eventos cubiertos

| Evento | Origen del disparo | Destinatario | Plantilla |
|---|---|---|---|
| Contraseña temporal (alta empresa) | `api/admin/create-gerente.js` (cliente admin) | Gerente nuevo | `tempPasswordEmail` |
| Bienvenida vendedor/operario | `api/admin/create-cashier.js` (cliente gerente) | Cajero nuevo | `welcomeCashierEmail` |
| Stock bajo | Trigger `product_stock` → webhook | Empresa (`companies.email`) | `lowStockEmail` |
| Factura devuelta por el SRI | Trigger `invoices` → webhook | Empresa | `invoiceReturnedEmail` |
| Nueva factura emitida (RIDE PDF) | `api/emails/send-invoice-ride.js` (cliente) | Cliente (`customers.email`) | `newInvoiceEmail` |

---

## 🔐 Seguridad aplicada

- **Endpoints públicos validan contra la BD** con service role; el navegador nunca elige el destinatario ni datos sensibles.
- **Webhooks** autenticados con secreto compartido (`x-webhook-secret`, comparación en tiempo constante).
- **`create_company_gerente`** dejó de ser invocable por `anon`/`authenticated` (REVOKE); ahora sólo via el endpoint que verifica que quien llama es admin. Esto cierra el punto **§1.1.1** de `AUDITORIA_SISTEMA.md`.
- Ningún secreto de Resend/Supabase viaja al navegador (todas las vars son server-side, **sin** prefijo `VITE_`).

---

## ⚠️ Notas / posibles ajustes

- El RIDE viaja como Base64 en el body del POST; los RIDE son pequeños, pero recuerda el límite de body de Vercel (~4.5 MB). No debería ser problema.
- El correo de stock bajo se envía a `companies.email` (o `admin_email`). Si prefieres notificar a cada gerente, ajusta el destinatario en `api/emails/webhook.js`.
- El trigger de stock sólo dispara al **cruzar** el mínimo hacia abajo (no en cada venta mientras siga bajo) y sólo si `min_stock > 0`, para no spamear.
