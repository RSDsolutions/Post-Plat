# Guía de Inicio Rápido - POST-PLAT

Comienza a usar POST-PLAT en 5 minutos.

## ⚡ Instalación Rápida

### 1. Clonar/descargar el proyecto
```bash
cd "RSD Solutions\POST-PLAT"
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar Supabase

#### Paso 3a: Crear proyecto en Supabase
1. Ve a [https://supabase.com](https://supabase.com)
2. Inicia sesión o crea una cuenta
3. Crea un nuevo proyecto
4. Guarda la contraseña de la base de datos

#### Paso 3b: Obtener credenciales
1. En tu dashboard de Supabase, ve a **Settings > API**
2. Copia **Project URL** y **Anon Public Key**

#### Paso 3c: Configurar variables de entorno
1. Copia `.env.example` a `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Edita `.env.local` y pega las credenciales:
   ```env
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-key
   ```

#### Paso 3d: Crear tablas en Supabase
1. En Supabase, ve a **SQL Editor**
2. Crea una nueva query
3. Copia el contenido de `SUPABASE_MIGRATIONS.sql`
4. Pega en el SQL Editor y ejecuta

### 4. Iniciar el servidor
```bash
npm run dev
```

La aplicación se abrirá en `http://localhost:5173`

---

## 🎯 Primeros Pasos

### Ver datos de ejemplo
1. Abre la aplicación en tu navegador
2. El sistema carga con datos de ejemplo (demo)
3. Explora los diferentes módulos

### Crear una empresa
1. Ve a la sección "Empresas"
2. Haz clic en "Crear Empresa"
3. Completa el formulario con:
   - Razón Social: Tu empresa
   - Nombre Comercial: Nombre público
   - RUC: 0190000000001 (para pruebas)
   - Dirección: Tu dirección
   - Selecciona un plan
4. Haz clic en "Crear"

### Registrar un pago
1. Haz clic en una empresa
2. Ve a la pestaña "Pagos"
3. Haz clic en "Registrar Pago"
4. Ingresa el monto y método
5. Guarda

---

## 📂 Estructura del Proyecto

```
POST-PLAT/
├── src/
│   ├── components/      # Componentes React
│   ├── lib/            # Lógica y helpers
│   ├── store/          # Store global (Zustand)
│   ├── data/           # Datos de ejemplo
│   ├── App.jsx         # Componente principal
│   └── main.jsx        # Punto de entrada
├── .env.example        # Plantilla de variables
├── .env.local          # ⚠️ NO VERSIONAR
├── package.json        # Dependencias
├── vite.config.js      # Config de Vite
└── README.md           # Documentación completa
```

---

## 🔗 Integración con Supabase

### Usar funciones helper

```javascript
import { 
  fetchCompanies, 
  createCompany,
  registerPayment 
} from './lib/supabaseHelpers';

// Obtener empresas
const companies = await fetchCompanies();

// Crear empresa
const newCompany = await createCompany({
  razon_social: 'Mi Empresa',
  nombre_comercial: 'Mi Empresa',
  ruc: '0190000000001',
  plan_id: 'plan-1'
});

// Registrar pago
await registerPayment(companyId, {
  amount: 100.00,
  method: 'Transferencia',
  status: 'Pagado'
});
```

---

## 🐛 Troubleshooting

### "Missing Supabase credentials"
```bash
# Verifica que .env.local exista y tenga:
cat .env.local
# Debe mostrar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
```

### "Cannot GET /"
```bash
# El servidor no está corriendo. Ejecuta:
npm run dev
```

### Errores de CORS
1. Ve a Supabase > Settings > API
2. En "CORS Allowed Origins" agrega:
   - `http://localhost:5173` (desarrollo)
   - Tu dominio de producción

### Tabla no existe
1. Verifica que ejecutaste el SQL en Supabase
2. Ve a Supabase > SQL Editor > Ver tablas
3. Si no ves las tablas, re-ejecuta `SUPABASE_MIGRATIONS.sql`

---

## 📚 Recursos

- **Documentación completa:** [README.md](./README.md)
- **Mejoras implementadas:** [IMPROVEMENTS.md](./IMPROVEMENTS.md)
- **Setup detallado de Supabase:** [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)
- **Docs de Supabase:** https://supabase.com/docs
- **Docs de React:** https://react.dev
- **Docs de Tailwind:** https://tailwindcss.com

---

## 💡 Tips

1. **Desarrollo local**: Los datos se almacenan en memoria y en Supabase
2. **Datos de ejemplo**: Se cargan automáticamente al iniciar
3. **Actualizaciones en tiempo real**: Implementa con `supabase.from().on()` cuando necesites
4. **Sincronización**: Los cambios locales se sincronizan con Supabase cuando llamas a las funciones

---

## ¿Necesitas más ayuda?

Consulta el [README.md](./README.md) para documentación completa o contacta al equipo de soporte.

---

**¡Listo para empezar!** 🚀
