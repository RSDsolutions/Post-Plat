# Resumen del Proyecto POST-PLAT v2.0 (Para Agentes AI)

Este documento proporciona una visión general técnica y arquitectónica rápida de **POST-PLAT v2.0**, diseñada específicamente para dar contexto a un agente de Inteligencia Artificial que vaya a trabajar en el repositorio.

## 1. Propósito General del Sistema
POST-PLAT es un **SaaS multi-tenant de Punto de Venta (POS) y Facturación Electrónica** para Ecuador. Sirve a múltiples empresas ("tenants") desde una misma instancia. Cada empresa gestiona su catálogo, sucursales, usuarios, y emite facturas reales validadas por el SRI (Servicio de Rentas Internas de Ecuador). También cuenta con un panel "Super-admin" para gestionar las suscripciones SaaS de los clientes.

## 2. Stack Tecnológico
*   **Frontend:** React 18, Vite, Tailwind CSS, Zustand (estado global).
*   **Backend / Base de Datos:** Supabase (PostgreSQL, Row Level Security - RLS, Storage, RPCs). No hay un backend Node.js tradicional monolítico.
*   **Serverless Functions:** Vercel Functions (`api/sri/*.js`), en Node.js, utilizadas **únicamente** para tareas que no pueden correr en el navegador (firma criptográfica XAdES-BES del XML de la factura y llamadas SOAP al SRI).
*   **PDFs y Reportes:** Generación del lado del cliente usando `jsPDF` y `jsbarcode`.
*   **Deploy:** GitHub conectado a Vercel para CI/CD automático.

## 3. Arquitectura y Modelo de Datos
*   **Multi-tenant:** La tabla `companies` es la raíz. Todo está aislado por RLS usando el `company_id`.
*   **Estructura Jerárquica:** Empresa (`companies`) -> Sucursales (`branches`) -> Puntos de Venta (`point_of_sales`). El inventario de productos (`products`) es global por empresa, pero el stock (`product_stock`) se maneja por sucursal.
*   **Usuarios y Autenticación:** 
    *   **No usa Supabase Auth.** Utiliza un sistema propio. Las credenciales se verifican usando funciones RPC de PostgreSQL (`verify_user_password`) que comparan un hash `bcrypt` generado por `pgcrypto`.
    *   **Roles:** `admin` (super-admin del SaaS), `gerente` (dueño de empresa cliente), `vendedor` (cajero atado a una sucursal), `contador`.

## 4. Flujo de Facturación Electrónica (SRI)
La característica crítica del sistema es la facturación real con el gobierno ecuatoriano:
1.  **Venta:** El POS (`POSInterface.jsx`) crea un borrador de factura en la base de datos (Supabase).
2.  **Firma y Envío:** Se llama a la función Vercel `/api/sri/submit-invoice.js`.
3.  **Proceso Serverless:** 
    *   Descarga el certificado P12 del cliente desde Supabase Storage.
    *   Genera el XML de la factura.
    *   Firma el XML con XAdES-BES usando la librería `xadesjs` y WebCrypto de Node.
    *   Calcula la "Clave de Acceso" de 49 dígitos.
    *   Envía el XML por SOAP a los Web Services del SRI (Recepción y luego Autorización).
4.  **Respuesta:** Guarda el estado de autorización o devolución en Supabase y el frontend genera el PDF (RIDE) de la factura.

## 5. Estructura del Repositorio (Key Files)
*   `/api/sri/`: Funciones serverless de Vercel para la lógica del SRI (Node.js).
*   `/src/components/layout/`: Paneles de navegación.
*   `/src/components/pages/`: Vistas de las pantallas.
*   `/src/lib/`: Utilidades core (`supabase.js`, `reportsHelpers.js`, `rideGenerator.js`).
*   `/src/store/`: Estado global de Zustand.
*   `DATABASE_SCHEMA_V2.sql`: Esquema SQL base de la DB.
*   `.mcp.json`: Configuración para integraciones Model Context Protocol (MCP) de Supabase, que permite a agentes interactuar directamente con la DB.

## 6. Documentación Adicional
Para profundizar, el agente debe revisar:
*   `RESUMEN_SISTEMA.md`: Explicación detallada de roles, multi-tenant y flujos del frontend.
*   `AUDITORIA_SISTEMA.md`: Riesgos actuales, deuda técnica y roadmap.
*   `DATABASE_IMPROVEMENTS.md`: Notas sobre las actualizaciones de base de datos V2.
*   `SECURITY_GUIDE.md`: Prácticas de seguridad implementadas.

## 7. Instrucciones para Agentes AI
*   **Seguridad:** Al modificar la DB, asegúrate de aplicar o revisar las políticas RLS. Recuerda que no se usa Supabase Auth nativo, cualquier lógica de login pasa por las RPCs custom.
*   **MCP:** El proyecto está preparado para que utilices herramientas de bases de datos vía Supabase MCP.
*   **Vercel Functions:** Si modificas lógica de facturación, ten en cuenta que cualquier paquete de Node.js adicional debe ser compatible con Vercel Functions y su límite de tamaño/ejecución. La firma XML es frágil, no modificar las rutinas de canonicalización de `xadesjs` a menos que sea estrictamente necesario.
