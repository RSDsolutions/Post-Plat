# 🛠️ Mejoras del Panel Admin / SaaS - POST-PLAT

**Fecha:** 2026-07-09

> Brainstorm de funcionalidades para el panel del **super-admin** (gestión de la plataforma, no de una empresa individual). No es una lista de bugs — para eso ver [`AUDITORIA_SISTEMA.md`](./AUDITORIA_SISTEMA.md). Este documento es un catálogo de qué se podría construir, con diseño propuesto para cada idea, para decidir con calma qué priorizar.

Convención usada abajo: **Ya existe** = la columna/tabla ya está en el esquema pero nada la usa todavía. **Nuevo** = hay que crear estructura.

---

## 1. Activación de funcionalidades por empresa (feature flags por tienda)

Tu idea, desarrollada. Hoy el sistema ya tiene un concepto de "features" pero **solo a nivel de plan**, no por empresa individual:

```
plans.features = jsonb, ej: ["usuarios","productos","facturas","inventario","reportes","api","soporte"]
```
Básico tiene 3, Profesional 5, Empresarial las 7. El problema: todas las empresas de un mismo plan tienen exactamente las mismas features prendidas. No hay forma de darle una excepción a un cliente puntual sin cambiarle el plan completo (con su precio).

### Casos de uso reales que esto resolvería
- Un cliente en plan **Básico** al que le querés activar **Reportes** como cortesía o prueba, sin subirlo a Profesional.
- Un cliente **Empresarial** al que todavía no le querés dar **API** porque no está lista para él (aunque el plan la incluya en teoría).
- Lanzar una función nueva en **beta** a un solo cliente elegido antes de ofrecerla a todos.
- Negociaciones comerciales puntuales ("te dejo Inventario multi-sucursal aunque tu plan no lo incluya, a cambio de un contrato anual").

### Diseño propuesto

**Opción A — rápida (una columna nueva):**
```sql
ALTER TABLE companies ADD COLUMN feature_overrides jsonb DEFAULT '{}';
-- ej: {"reportes": true, "api": false}
```
Al leer las features efectivas de una empresa: `{ ...featuresDelPlan, ...company.feature_overrides }` (el override gana). Simple, rápido de construir, alcanza para empezar.

**Opción B — escalable (recomendada si esto va a crecer):**
```sql
CREATE TABLE feature_flags (
  key text PRIMARY KEY,           -- 'reportes', 'api', 'multi_sucursal', etc.
  label text NOT NULL,            -- nombre visible
  description text,
  category text                   -- 'facturación', 'inventario', 'reportes', ...
);

CREATE TABLE company_feature_overrides (
  company_id uuid REFERENCES companies(id),
  feature_key text REFERENCES feature_flags(key),
  enabled boolean NOT NULL,
  note text,                      -- por qué se dio la excepción
  updated_by uuid REFERENCES users(id),  -- qué admin lo activó
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (company_id, feature_key)
);
```
Ventaja sobre la opción A: queda un catálogo central de qué features existen (útil para armar el toggle UI automáticamente en vez de hardcodear la lista), y un registro de auditoría de quién activó qué y por qué — relevante si varias personas del equipo POST-PLAT administran clientes.

### Dónde se vería
- **`CompanyDetail.jsx`**: nueva sección "Funcionalidades" con un toggle por feature. Las que vienen del plan se muestran activas por defecto; si el admin las apaga/prende manualmente, queda marcado con un badge "Personalizado" para diferenciarlas de lo que da el plan.
- **Requiere un "feature gate" reusable en el frontend** que hoy no existe — actualmente el control de acceso a pantallas es solo por `role` (`gerente`/`vendedor`/etc.), nunca por plan/feature. Por ejemplo, `Reports.jsx` no verifica en ningún lado si la empresa tiene la feature `reportes` habilitada; cualquier empresa ve reportes completos sin importar su plan. Antes de que los toggles tengan efecto real, cada pantalla relevante necesita empezar a preguntar "¿esta empresa tiene esta feature?" — hoy esa pregunta no se le hace a nadie.

---

## 2. Límites y control de consumo

El esquema ya tiene casi todas las columnas necesarias para esto — **existen pero no se usan en ningún lado del código**. Es la brecha más grande entre "lo que ya se puede mostrar" y "lo que realmente se hace cumplir".

| Recurso | Columna de límite (plan) | Columna de conteo (empresa) | Estado |
|---|---|---|---|
| Facturas/mes | `plans.max_invoices_monthly` ✅ ya existe | `companies.monthly_comprobantes` ✅ ya existe | Ninguna se actualiza ni se compara automáticamente |
| Usuarios (cajeros + gerente) | `plans.max_users` ✅ ya existe | `companies.active_users` ✅ ya existe | Igual |
| Sucursales | `plans.max_branches` ✅ ya existe | `companies.branches` ✅ ya existe (contador manual, no derivado de la tabla `branches` real) | Igual |
| Productos (SKUs) | `plans.max_products` ✅ ya existe | — Nuevo: se puede calcular con `COUNT(*) FROM products WHERE company_id=X`, no hace falta contador aparte | Sin construir |
| Cajas / puntos de venta | — Nuevo: `plans.max_pos` | — se calcula con `COUNT(*) FROM point_of_sales` | Sin construir (ver nota abajo) |

### 2.1 Facturas emitidas
- Al momento en que una factura pasa a `autorizada` (no en `borrador`, para no penalizar facturas que el SRI rechazó), incrementar `companies.monthly_comprobantes`.
- Un job mensual (o chequeo al primer login del mes) que mueva `monthly_comprobantes` → `prev_month_comprobantes` y reinicie el contador en 0.
- Antes de permitir emitir (en `api/sri/submit-invoice.js`, que es donde ya se valida todo lo demás): si `monthly_comprobantes >= plan.max_invoices_monthly`, bloquear con un mensaje claro ("Alcanzaste el límite de tu plan. Actualiza a Profesional para seguir facturando este mes").
- Ya existe una alerta al 85% de consumo (`alerts.js`) que hoy solo la ve el admin en su propio panel — con esto tendría sentido que también le llegue al cliente (ver sección 3).
- Decisión de negocio a definir: ¿bloquear en seco al llegar al 100%, o permitir seguir facturando con un cargo extra por "excedente" (modelo común en SaaS de uso medido)?

### 2.2 Inventario (productos)
"Cantidad de inventario" probablemente tiene más sentido como **número de productos distintos (SKUs)** que como unidades de stock (no tendría sentido comercial limitar cuántas unidades vende un cliente). `plans.max_products` ya existe para esto.
- Al crear un producto nuevo en `InventoryManagement.jsx`, verificar `COUNT(products) < plan.max_products` antes de permitirlo.
- Si en algún momento se quiere limitar algo relacionado a movimiento en vez de catálogo, la tabla `inventory_movements` (hoy sin uso — ver auditoría) sería el lugar natural para contar "movimientos de stock por mes", pero no la propondría como límite de plan; es más un dato de uso interno.

### 2.3 Sucursales
`plans.max_branches` ya existe. Bloquear alta de sucursal nueva en `Branches.jsx` al llegar al tope, con upsell explícito. Nota de diseño: hoy `companies.branches` es un **contador entero manual** en vez de derivarse de `COUNT(*) FROM branches WHERE company_id=X` — conviene calcularlo en vivo desde la tabla real en vez de mantener un contador aparte que se puede desincronizar (ej. si algún día se permite desactivar/borrar una sucursal).

### 2.4 Cajas / puntos de venta
No hay hoy un límite explícito de "cajas" — depende de si por "cajas" te referís a:
- **Puntos de venta (`point_of_sales`)**, es decir cuántos establecimiento+punto-de-emisión SRI puede configurar una empresa en total (cruza sucursales). Necesitaría una columna nueva `plans.max_pos`.
- **Cajeros simultáneos**, que ya está cubierto por `plans.max_users` (un cajero = un usuario `vendedor`/`operario`).

Vale la pena definir cuál de las dos es la que realmente querés limitar antes de construir nada — son conceptos distintos y probablemente quieras las dos, pero con números distintos (ej: un plan puede permitir 3 sucursales pero solo 5 puntos de venta en total).

### 2.5 Usuarios
`plans.max_users` ya existe. Bloquear alta de cajero en `CashierManagement.jsx` (y de gerentes adicionales, si algún día se permite más de uno por empresa) al llegar al tope, igual patrón que el resto.

---

## 3. Suscripciones y cobros

- **Recordatorios automáticos al cliente**, no solo alertas internas al admin. Hoy `generateAlerts()` calcula "vence en N días" pero esa alerta solo la ve el super-admin en su propio dashboard — el cliente nunca se entera por sí mismo salvo que el admin lo llame. Requiere tener algún canal de notificación al cliente (email como mínimo — ver hueco de "sin envío de correo" en la auditoría).
- **Historial de pagos real.** Existe la tabla `payments` en el esquema pero está vacía y sin usar — "Registrar pago" hoy solo mueve `subscription_renewal`/`payment_status` en `companies`, no deja un renglón por cobro. Un ledger real (`payments`: monto, fecha, método, referencia, quién lo registró) permite mostrar historial de facturación al cliente y conciliar ingresos.
- **Períodos de prueba (trial).** Un plan o flag "trial_ends_at" para dejar operar full-featured N días antes de requerir pago, con degradación automática (a un plan gratuito limitado, o suspensión) al vencer si no se convierte.
- **Prorateo en upgrade/downgrade.** Hoy `changeCompanyPlan` cambia el plan sin ajustar nada de lo ya cobrado — cambiar a mitad de ciclo no calcula diferencia a favor/en contra.
- **Cupones / precio especial por cliente.** Mismo patrón que los feature overrides de la sección 1, pero sobre precio: un `companies.custom_price` opcional que pisa `plan.price` para negociaciones puntuales, sin tener que crear un plan nuevo en el catálogo por cada cliente con condiciones especiales.
- **Cancelación/pausa autogestionada.** Hoy solo el admin puede suspender una empresa; no hay forma de que el propio cliente pause su cuenta (por temporada baja, por ejemplo) sin llamar a soporte.
- **Dunning (gestión de cobro fallido).** Si en algún momento se conecta una pasarela de pago real (ver auditoría, sección de funcionalidad), hace falta lógica de reintentos + período de gracia antes de suspender por un cobro que falló, en vez de suspender en el primer intento fallido.
- **Distinción importante a tener clara:** esto es la facturación de **POST-PLAT a sus clientes** (las empresas) por el uso del SaaS. Es un nivel totalmente distinto de la facturación electrónica SRI que el sistema ya genera — esa es de cada empresa cliente hacia *sus propios* clientes finales. Vale la pena no mezclar ambos conceptos en el diseño (dos ledgers distintos, dos flujos de "factura" distintos).

---

## 4. Ideas adicionales para el panel admin

Más allá de lo que pediste puntualmente, cosas que suelen aparecer en paneles SaaS maduros y que encajan bien con lo que ya existe:

- **"Ver como cliente" (impersonación).** El admin entra a la vista del gerente de una empresa para dar soporte o revisar un problema, sin pedirle la contraseña. Requiere un mecanismo explícito y auditado (queda registrado en `activity_log` quién impersonó a quién y cuándo) — no un simple cambio de `company_id` en el estado local.
- **Health score / salud del cliente.** Un puntaje simple por empresa combinando señales que ya existen: último login, % de uso del límite de facturas, si subió certificado de firma, si tiene sucursales/productos configurados, si tuvo facturas rechazadas por el SRI recientemente. Sirve para que el admin priorice seguimiento comercial en vez de mirar cliente por cliente.
- **Checklist de onboarding por cliente nuevo.** Después del alta (wizard), mostrar en `CompanyDetail.jsx` una lista de pasos típicos de puesta en marcha (certificado subido, primera sucursal configurada, primer cajero creado, primera venta hecha, primera factura autorizada por el SRI) — ayuda a detectar clientes que se trabaron en el setup y nunca llegaron a facturar de verdad.
- **Dashboard de métricas SaaS.** MRR/ARR reales (ya hay una mención de "recalcular MRR" al cambiar precio de plan, pero no vi una vista dedicada), churn del mes, clientes en riesgo (uso bajo o sin login reciente), distribución de clientes por plan.
- **Roles dentro del propio equipo admin.** Hoy `role = 'admin'` es plano — todo admin puede todo. Si el equipo de POST-PLAT crece, tendría sentido diferenciar por ejemplo "soporte" (solo lectura + impersonación) de "super-admin" (también puede suspender, cambiar precios, borrar).
- **Auditoría de acciones del propio equipo admin.** Distinto de `activity_log` (que registra eventos de negocio sobre las empresas) — esto sería específicamente "qué hizo cada persona del equipo POST-PLAT y cuándo", útil si hay más de un admin operando.
- **Exportar/backup de datos por empresa.** A pedido del cliente, o como paso antes de dar de baja definitivamente una empresa (hoy no hay ni flujo de baja — solo suspensión — ni forma de exportar los datos de un cliente que se va).
- **Página de estado del servicio.** Un lugar visible (para vos y opcionalmente para tus clientes) que muestre si el SRI está respondiendo con normalidad — el SRI tiene caídas conocidas y hoy esa información solo se descubre cuando una factura falla.
- **La feature "api" que ya aparece en el plan Empresarial no tiene todavía ningún endpoint real detrás.** Está listada como característica vendible pero no existe una API pública documentada — si algún cliente Empresarial la pidiera hoy, no habría qué entregarle. Vale la pena tenerlo presente antes de venderla activamente.

---

## 5. Prioridad sugerida

| Prioridad | Ítem |
|---|---|
| Alta | Hacer cumplir los límites que **ya tienen columna en el esquema**: facturas/mes, usuarios, sucursales, productos (sección 2) — es la brecha más grande entre lo que se muestra y lo que se hace cumplir hoy. |
| Alta | Feature overrides por empresa (sección 1, Opción A para arrancar rápido) — es tu idea original y tiene impacto comercial directo (permite negociar sin tocar precios de catálogo). |
| Media | Historial de pagos real (`payments`) y recordatorios de vencimiento al cliente (sección 3) — depende de resolver primero el envío de email (brecha ya anotada en la auditoría). |
| Media | Health score y checklist de onboarding (sección 4) — alto valor para retención, no depende de nada más. |
| Baja | Impersonación, roles internos del equipo admin, dashboard de métricas SaaS, prorateo — con 1 solo admin operando hoy, el retorno inmediato es menor; quedan mejor para cuando el equipo/base de clientes crezca. |
