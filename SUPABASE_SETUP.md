# Configuración de Supabase con Nueva Cuenta

## Pasos para conectar a tu nueva cuenta de Supabase

### 1. Obtener las credenciales de tu nueva cuenta Supabase

1. Ve a [supabase.com](https://supabase.com) e inicia sesión con tu nueva cuenta
2. Crea un nuevo proyecto o selecciona uno existente
3. En el dashboard del proyecto, ve a **Settings > API**
4. Copia los siguientes valores:
   - **Project URL** (ej: `https://xxxxxxxxxxxxx.supabase.co`)
   - **Anon Public Key** (la clave pública)

### 2. Actualizar el archivo `.env.local`

Edita el archivo `.env.local` en la raíz del proyecto y reemplaza los valores:

```env
VITE_SUPABASE_URL=https://tu-nuevo-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-nueva-anon-key-aqui
```

**IMPORTANTE:** 
- Nunca comitas el archivo `.env.local` al repositorio (ya está en `.gitignore`)
- Las credenciales de Supabase son sensibles. No las compartas públicamente.

### 3. Reiniciar el servidor de desarrollo

Si el servidor estaba corriendo, reinicialo para que cargue las nuevas variables de entorno:

```bash
npm run dev
```

### 4. Verificar la conexión

En la consola del navegador (F12 > Console), deberías ver que no hay errores de credenciales faltantes.

---

## Cómo usar Supabase en el proyecto

### Importar funciones helper

```javascript
import { 
  fetchDataFromSupabase, 
  insertIntoSupabase,
  updateInSupabase,
  deleteFromSupabase,
  signIn,
  signUp,
  signOut,
  getCurrentUser
} from './lib/supabaseHelpers.js';
```

### Ejemplos de uso

#### Obtener datos de una tabla
```javascript
const products = await fetchDataFromSupabase('products');
const specificProduct = await fetchDataFromSupabase('products', {
  filter: { column: 'id', value: 123 }
});
```

#### Insertar datos
```javascript
const newProduct = await insertIntoSupabase('products', {
  name: 'Nuevo Producto',
  price: 99.99,
  stock: 10
});
```

#### Actualizar datos
```javascript
const updated = await updateInSupabase('products', 123, {
  price: 89.99,
  stock: 8
});
```

#### Eliminar datos
```javascript
const success = await deleteFromSupabase('products', 123);
```

#### Autenticación
```javascript
// Registrarse
const signupResult = await signUp('user@example.com', 'password123');

// Iniciar sesión
const signinResult = await signIn('user@example.com', 'password123');

// Obtener usuario actual
const user = await getCurrentUser();

// Cerrar sesión
await signOut();
```

---

## Integración con el Store de Zustand (Opcional)

Si quieres integrar Supabase con el store de Zustand, puedes hacer algo como:

```javascript
import create from 'zustand';
import { fetchDataFromSupabase } from '../lib/supabaseHelpers';

const useStore = create((set) => ({
  products: [],
  loading: false,
  
  loadProducts: async () => {
    set({ loading: true });
    const data = await fetchDataFromSupabase('products');
    set({ products: data || [], loading: false });
  },
  
  // ... rest de tu store
}));
```

---

## Cambiar entre cuentas de Supabase

Para cambiar a otra cuenta diferente:
1. Actualiza los valores en `.env.local`
2. Reinicia el servidor de desarrollo
3. Las nuevas credenciales se cargarán automáticamente

---

## Troubleshooting

**Problema:** Error "Supabase credentials not configured"
- **Solución:** Verifica que el archivo `.env.local` exista en la raíz del proyecto y contenga las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`

**Problema:** Error CORS al conectar con Supabase
- **Solución:** Asegúrate de que la URL de tu aplicación local esté permitida en los CORS de Supabase (Settings > API > CORS Allowed Origins)

**Problema:** Credenciales no se cargan
- **Solución:** Reinicia el servidor de desarrollo después de editar `.env.local`

---

## Archivos creados

- `src/lib/supabase.js` - Cliente de Supabase inicializado
- `src/lib/supabaseHelpers.js` - Funciones helper para operaciones comunes
- `.env.local` - Variables de entorno (no se versionan en git)
