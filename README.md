# POST-PLAT - Sistema de Gestión de Empresas y Puntos de Venta

Un panel de administración completo para gestionar múltiples empresas, puntos de venta, suscripciones y pagos. Construido con React, Tailwind CSS, Zustand y Supabase.

## 🚀 Características

- **Gestión de Empresas**: Crear, editar y administrar múltiples empresas
- **Puntos de Venta**: Configurar y gestionar diferentes puntos de venta por empresa
- **Suscripciones**: Controlar planes, ciclos de facturación y renovaciones
- **Pagos**: Registrar y rastrear pagos, ver histórico completo
- **Alertas**: Sistema inteligente de alertas por vencimientos y pagos pendientes
- **Log de Actividad**: Registro completo de todas las acciones del sistema
- **Interfaz Moderna**: Diseño limpio y responsivo con Tailwind CSS

## 📋 Requisitos

- Node.js 16+
- npm o yarn
- Cuenta de Supabase (gratuita en [supabase.com](https://supabase.com))

## 🔧 Instalación

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Copia `.env.example` a `.env.local` y actualiza con tus credenciales de Supabase:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key-aqui
```

Obtén estas credenciales desde tu dashboard de Supabase:
1. Ve a [supabase.com](https://supabase.com) e inicia sesión
2. Selecciona tu proyecto
3. Ve a Settings > API
4. Copia Project URL y Anon Public Key

### 3. Ejecutar en desarrollo

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

## 📦 Construcción

```bash
npm run build
```

Para preview de la compilación:

```bash
npm run preview
```

## 🏗️ Estructura del Proyecto

```
src/
├── components/
│   ├── layout/          # Componentes de layout principal
│   ├── pages/           # Páginas principales
│   └── ui/              # Componentes UI reutilizables
├── lib/
│   ├── supabase.js      # Cliente Supabase inicializado
│   ├── supabaseHelpers.js # Funciones helper para BD
│   ├── alerts.js        # Lógica de alertas
│   ├── brand.js         # Configuración de branding
│   ├── dates.js         # Utilidades de fechas
│   ├── format.js        # Funciones de formato
│   └── ruc.js           # Validación de RUC
├── store/
│   └── useStore.js      # Store global con Zustand
├── data/
│   ├── companies.js     # Datos de ejemplo (empresas)
│   ├── plans.js         # Datos de planes
│   └── activityLog.js   # Datos de log de actividad
├── App.jsx              # Componente raíz
├── main.jsx             # Punto de entrada
└── index.css            # Estilos globales
```

## 🗄️ Base de Datos (Supabase)

### Tablas principales

#### `companies`
Almacena la información de las empresas clientes

```sql
id, ruc, razon_social, nombre_comercial, address, 
lleva_contabilidad, regimen, environment, establishment, 
point_of_sale, sequential_start, plan_id, billing_cycle,
subscription_start, subscription_renewal, subscription_status,
payment_status, cert, monthly_comprobantes, prev_month_comprobantes,
active_users, branches, suspension_info, internal_notes,
created_at, updated_at, admin_email
```

#### `point_of_sales`
Puntos de venta de cada empresa

```sql
id, company_id, nombre, numero_establecimiento, numero_pos,
sequential_start, sequential_current, status, created_at
```

#### `plans`
Planes de suscripción disponibles

```sql
id, name, description, price, features, max_users,
max_branches, environment_type, created_at
```

#### `payments`
Histórico de pagos

```sql
id, company_id, amount, method, status, payment_date,
reference, created_at
```

#### `activity_log`
Log de todas las actividades

```sql
id, company_id, user_id, action, description, created_at
```

## 🔌 API y Funciones Supabase

### Importar helpers

```javascript
import { 
  fetchCompanies,
  createCompany,
  updateCompany,
  fetchPointOfSales,
  fetchPlans,
  registerPayment,
  logActivity
} from './lib/supabaseHelpers.js';
```

### Ejemplos de uso

#### Obtener todas las empresas
```javascript
const companies = await fetchCompanies();
```

#### Crear una empresa
```javascript
const newCompany = await createCompany({
  ruc: '0190000000001',
  razon_social: 'Mi Empresa S.A.',
  nombre_comercial: 'Mi Empresa',
  // ... más campos
});
```

#### Registrar un pago
```javascript
await registerPayment(companyId, {
  amount: 100.00,
  method: 'Transferencia',
  status: 'Pagado'
});
```

#### Registrar una actividad
```javascript
await logActivity(companyId, 'Empresa creada', 'Nueva empresa en el sistema');
```

## 🎨 Personalización

### Colores de marca

Los colores se definen en `src/index.css`:

```css
:root {
  --brand:      #10b981;
  --brand-dark: #059669;
  --brand-soft: rgba(16, 185, 129, 0.1);
}
```

Cambia estos valores para personalizar los colores de tu aplicación.

### Configuración del store

En `src/store/useStore.js` puedes cambiar la configuración inicial:

```javascript
brand: {
  name: 'Kinetic',
  color: '#10b981',
  colorDark: '#059669',
  colorSoft: 'rgba(16, 185, 129, 0.1)',
}
```

## 🚨 Troubleshooting

### Error: "Missing Supabase credentials"
- Verifica que `.env.local` existe en la raíz del proyecto
- Confirma que `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` están configuradas
- Reinicia el servidor de desarrollo

### Error de CORS
- Ve a Supabase > Settings > API > CORS Allowed Origins
- Agrega `http://localhost:5173` para desarrollo
- Agrega tu dominio de producción

### Conexión rechazada
- Verifica que tu proyecto de Supabase esté activo
- Confirma que tus credenciales son correctas
- Comprueba tu conexión a internet

## 📚 Documentación

- [Documentación de Supabase](https://supabase.com/docs)
- [Documentación de React](https://react.dev)
- [Documentación de Zustand](https://github.com/pmndrs/zustand)
- [Documentación de Tailwind CSS](https://tailwindcss.com)

## 📝 Licencia

Proyecto de RSD Solutions

## 🤝 Soporte

Para soporte o preguntas, contacta al equipo de desarrollo.
