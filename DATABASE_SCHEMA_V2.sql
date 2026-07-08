-- =====================================================================
-- POST-PLAT Database Schema v2.0
-- Sistema de Gestión de Empresas, POS y Facturación
-- Con Seguridad, Auditoría y Control de Acceso
-- =====================================================================

-- =====================================================================
-- 1. EXTENSIONES NECESARIAS
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 2. ENUMS (Tipos de datos)
-- =====================================================================
CREATE TYPE user_role AS ENUM ('admin', 'gerente', 'vendedor', 'contador', 'operario');
CREATE TYPE subscription_status AS ENUM ('activa', 'suspendida', 'cancelada', 'vencida');
CREATE TYPE payment_status AS ENUM ('pendiente', 'pagado', 'vencido', 'cancelado', 'reembolsado');
CREATE TYPE invoice_status AS ENUM ('borrador', 'autorizada', 'anulada', 'devuelta');
CREATE TYPE invoice_type AS ENUM ('factura', 'nota_credito', 'nota_debito', 'comprobante_retencion');
CREATE TYPE environment_type AS ENUM ('pruebas', 'produccion');

-- =====================================================================
-- 3. TABLA: PLANES DE SUSCRIPCIÓN
-- =====================================================================
DROP TABLE IF EXISTS plans CASCADE;
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  currency VARCHAR(3) DEFAULT 'USD',
  billing_cycle VARCHAR(20) DEFAULT 'monthly',

  -- Límites del plan
  max_users INTEGER,
  max_branches INTEGER,
  max_invoices_monthly INTEGER,
  max_products INTEGER,

  -- Características
  features JSONB DEFAULT '[]',

  -- Estado
  is_active BOOLEAN DEFAULT TRUE,
  environment_type environment_type DEFAULT 'pruebas',

  -- Auditoría
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_plans_is_active ON plans(is_active);

-- =====================================================================
-- 4. TABLA: EMPRESAS
-- =====================================================================
DROP TABLE IF EXISTS companies CASCADE;
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Información básica
  ruc VARCHAR(20) UNIQUE NOT NULL,
  razon_social VARCHAR(255) NOT NULL,
  nombre_comercial VARCHAR(255) NOT NULL,

  -- Contacto
  email VARCHAR(255),
  phone VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  province VARCHAR(100),

  -- Datos tributarios
  lleva_contabilidad BOOLEAN DEFAULT FALSE,
  regimen VARCHAR(50) DEFAULT 'General',

  -- Plan y suscripción
  plan_id UUID REFERENCES plans(id),
  subscription_status subscription_status DEFAULT 'activa',
  subscription_start TIMESTAMP,
  subscription_renewal TIMESTAMP,

  -- Facturación
  environment_type environment_type DEFAULT 'pruebas',
  establishment VARCHAR(10) DEFAULT '001',
  point_of_sale VARCHAR(10) DEFAULT '001',
  sequential_start INTEGER DEFAULT 1,
  sequential_current INTEGER DEFAULT 0,

  -- Control
  payment_status VARCHAR(50) DEFAULT 'Al día',
  monthly_comprobantes INTEGER DEFAULT 0,
  prev_month_comprobantes INTEGER DEFAULT 0,
  active_users INTEGER DEFAULT 1,
  branches INTEGER DEFAULT 1,

  -- Certificado digital
  cert JSONB,

  -- Nota de suspensión
  suspension_info JSONB,
  internal_notes TEXT,
  admin_email VARCHAR(255),

  -- Auditoría
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_companies_ruc ON companies(ruc);
CREATE INDEX idx_companies_admin_email ON companies(admin_email);
CREATE INDEX idx_companies_subscription_status ON companies(subscription_status);
CREATE INDEX idx_companies_deleted_at ON companies(deleted_at);

-- =====================================================================
-- 5. TABLA: ROLES Y PERMISOS
-- =====================================================================
DROP TABLE IF EXISTS permissions CASCADE;
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS role_permissions CASCADE;
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role user_role NOT NULL,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role, permission_id)
);

-- =====================================================================
-- 6. TABLA: USUARIOS ADMINISTRADORES
-- =====================================================================
DROP TABLE IF EXISTS admin_users CASCADE;
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) DEFAULT 'Administrador',
  role VARCHAR(50) DEFAULT 'admin',
  is_active BOOLEAN DEFAULT TRUE,

  -- Seguridad
  last_login TIMESTAMP,
  last_password_change TIMESTAMP,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,

  -- Auditoría
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_users_is_active ON admin_users(is_active);

-- =====================================================================
-- 7. TABLA: USUARIOS DE EMPRESA
-- =====================================================================
DROP TABLE IF EXISTS users CASCADE;
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Información personal
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),

  -- Acceso
  role user_role NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,

  -- Seguridad
  last_login TIMESTAMP,
  last_password_change TIMESTAMP,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,

  -- Auditoría
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(company_id, email)
);

CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_role ON users(role);

-- =====================================================================
-- 8. TABLA: SUCURSALES
-- =====================================================================
DROP TABLE IF EXISTS branches CASCADE;
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  code VARCHAR(10) NOT NULL,

  -- Ubicación
  address TEXT,
  city VARCHAR(100),
  phone VARCHAR(20),

  -- Datos tributarios
  establishment VARCHAR(10) NOT NULL,

  -- Estado
  is_active BOOLEAN DEFAULT TRUE,

  -- Auditoría
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(company_id, code)
);

CREATE INDEX idx_branches_company_id ON branches(company_id);
CREATE INDEX idx_branches_is_active ON branches(is_active);

-- =====================================================================
-- 9. TABLA: PUNTOS DE VENTA
-- =====================================================================
DROP TABLE IF EXISTS point_of_sales CASCADE;
CREATE TABLE point_of_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,

  -- Información
  nombre VARCHAR(255) NOT NULL,
  numero_establecimiento VARCHAR(10) NOT NULL,
  numero_pos VARCHAR(10) NOT NULL,

  -- Secuencia de facturación
  sequential_start INTEGER DEFAULT 1,
  sequential_current INTEGER DEFAULT 0,
  last_issue_number VARCHAR(20),
  last_issue_date TIMESTAMP,

  -- Estado
  status VARCHAR(50) DEFAULT 'activo',
  is_active BOOLEAN DEFAULT TRUE,

  -- Auditoría
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(company_id, numero_pos)
);

CREATE INDEX idx_pos_company_id ON point_of_sales(company_id);
CREATE INDEX idx_pos_branch_id ON point_of_sales(branch_id);
CREATE INDEX idx_pos_is_active ON point_of_sales(is_active);

-- =====================================================================
-- 10. TABLA: PRODUCTOS
-- =====================================================================
DROP TABLE IF EXISTS products CASCADE;
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Información
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Precios
  cost_price NUMERIC(12, 4) NOT NULL,
  sale_price NUMERIC(12, 4) NOT NULL,

  -- Impuestos
  tax_code VARCHAR(50),
  tax_percentage NUMERIC(5, 2) DEFAULT 0,

  -- Stock
  quantity INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,

  -- Categoría
  category VARCHAR(100),

  -- Estado
  is_active BOOLEAN DEFAULT TRUE,

  -- Auditoría
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(company_id, code)
);

CREATE INDEX idx_products_company_id ON products(company_id);
CREATE INDEX idx_products_code ON products(code);
CREATE INDEX idx_products_is_active ON products(is_active);
CREATE INDEX idx_products_category ON products(category);

-- =====================================================================
-- 11. TABLA: CLIENTES
-- =====================================================================
DROP TABLE IF EXISTS customers CASCADE;
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Identificación
  identification_type VARCHAR(20),
  identification_number VARCHAR(50) NOT NULL,

  -- Información
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),

  -- Dirección
  address TEXT,
  city VARCHAR(100),

  -- Información comercial
  credit_limit NUMERIC(12, 2) DEFAULT 0,
  current_balance NUMERIC(12, 2) DEFAULT 0,

  -- Estado
  is_active BOOLEAN DEFAULT TRUE,

  -- Auditoría
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(company_id, identification_number)
);

CREATE INDEX idx_customers_company_id ON customers(company_id);
CREATE INDEX idx_customers_identification ON customers(identification_number);
CREATE INDEX idx_customers_is_active ON customers(is_active);

-- =====================================================================
-- 12. TABLA: FACTURAS/COMPROBANTES
-- =====================================================================
DROP TABLE IF EXISTS invoices CASCADE;
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pos_id UUID NOT NULL REFERENCES point_of_sales(id),
  user_id UUID REFERENCES users(id),
  customer_id UUID REFERENCES customers(id),

  -- Identificación de factura
  invoice_type invoice_type NOT NULL,
  invoice_number VARCHAR(20) NOT NULL,
  issue_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Información fiscal
  authorization_number VARCHAR(100),
  authorization_date TIMESTAMP,

  -- Montos
  subtotal NUMERIC(12, 2) NOT NULL,
  tax_amount NUMERIC(12, 2) NOT NULL,
  discount_amount NUMERIC(12, 2) DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL,

  -- Forma de pago
  payment_method VARCHAR(50),

  -- Estado
  status invoice_status DEFAULT 'borrador',
  voided_at TIMESTAMP,
  voided_reason TEXT,

  -- Observaciones
  notes TEXT,

  -- Auditoría
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(company_id, invoice_number)
);

CREATE INDEX idx_invoices_company_id ON invoices(company_id);
CREATE INDEX idx_invoices_pos_id ON invoices(pos_id);
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_issue_date ON invoices(issue_date);

-- =====================================================================
-- 13. TABLA: DETALLES DE FACTURAS
-- =====================================================================
DROP TABLE IF EXISTS invoice_details CASCADE;
CREATE TABLE invoice_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),

  -- Información del producto
  product_code VARCHAR(100),
  product_name VARCHAR(255) NOT NULL,

  -- Cantidad y precios
  quantity NUMERIC(12, 2) NOT NULL,
  unit_price NUMERIC(12, 4) NOT NULL,
  discount_percent NUMERIC(5, 2) DEFAULT 0,
  tax_percent NUMERIC(5, 2) DEFAULT 0,

  -- Subtotal
  subtotal NUMERIC(12, 2) NOT NULL,
  tax_amount NUMERIC(12, 2) NOT NULL,
  total NUMERIC(12, 2) NOT NULL,

  -- Auditoría
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoice_details_invoice_id ON invoice_details(invoice_id);
CREATE INDEX idx_invoice_details_product_id ON invoice_details(product_id);

-- =====================================================================
-- 14. TABLA: INVENTARIO
-- =====================================================================
DROP TABLE IF EXISTS inventory_movements CASCADE;
CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Movimiento
  movement_type VARCHAR(50) NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL,
  reference_id UUID,
  reference_type VARCHAR(50),

  -- Usuario
  user_id UUID REFERENCES users(id),

  -- Observación
  notes TEXT,

  -- Auditoría
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inventory_movements_company_id ON inventory_movements(company_id);
CREATE INDEX idx_inventory_movements_product_id ON inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_created_at ON inventory_movements(created_at);

-- =====================================================================
-- 15. TABLA: PAGOS
-- =====================================================================
DROP TABLE IF EXISTS payments CASCADE;
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id),

  -- Monto
  amount NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',

  -- Método de pago
  payment_method VARCHAR(100) NOT NULL,

  -- Referencia
  reference VARCHAR(255),

  -- Estado
  status payment_status DEFAULT 'pagado',
  payment_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Auditoría
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_company_id ON payments(company_id);
CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX idx_payments_payment_date ON payments(payment_date);
CREATE INDEX idx_payments_status ON payments(status);

-- =====================================================================
-- 16. TABLA: AUDITORÍA
-- =====================================================================
DROP TABLE IF EXISTS audit_log CASCADE;
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  user_id UUID REFERENCES users(id),
  admin_user_id UUID REFERENCES admin_users(id),

  -- Acción
  table_name VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  record_id UUID,

  -- Cambios
  old_values JSONB,
  new_values JSONB,

  -- Contexto
  ip_address VARCHAR(50),
  user_agent TEXT,

  -- Auditoría
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_company_id ON audit_log(company_id);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_table_name ON audit_log(table_name);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- =====================================================================
-- 17. TABLA: ACTIVIDAD
-- =====================================================================
DROP TABLE IF EXISTS activity_log CASCADE;
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  user_id UUID REFERENCES users(id),

  action VARCHAR(255) NOT NULL,
  description TEXT,

  -- Auditoría
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_log_company_id ON activity_log(company_id);
CREATE INDEX idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at);

-- =====================================================================
-- 18. ROW LEVEL SECURITY (RLS)
-- =====================================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_of_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para lectura
CREATE POLICY "read_companies" ON companies
  FOR SELECT USING (TRUE);

CREATE POLICY "read_users" ON users
  FOR SELECT USING (TRUE);

CREATE POLICY "read_products" ON products
  FOR SELECT USING (TRUE);

CREATE POLICY "read_invoices" ON invoices
  FOR SELECT USING (TRUE);

-- Permisos para servicios
GRANT SELECT ON companies TO anon, authenticated;
GRANT SELECT ON users TO anon, authenticated;
GRANT SELECT ON products TO anon, authenticated;
GRANT SELECT ON invoices TO anon, authenticated;
GRANT SELECT ON customers TO anon, authenticated;

-- =====================================================================
-- 19. DATOS DE EJEMPLO
-- =====================================================================

-- Insertar planes
INSERT INTO plans (name, description, price, max_users, max_branches, max_invoices_monthly, features, is_active)
VALUES
  ('Básico', 'Plan básico para pequeños negocios', 29.99, 3, 1, 100, '["usuarios", "productos", "facturas"]'::jsonb, true),
  ('Profesional', 'Plan profesional con todas las características', 79.99, 10, 5, 1000, '["usuarios", "productos", "facturas", "inventario", "reportes"]'::jsonb, true),
  ('Empresarial', 'Plan empresarial con soporte prioritario', 199.99, 50, 20, 10000, '["usuarios", "productos", "facturas", "inventario", "reportes", "api", "soporte"]'::jsonb, true);

-- Insertar permisos
INSERT INTO permissions (name, description) VALUES
  ('create_invoice', 'Crear facturas'),
  ('view_invoice', 'Ver facturas'),
  ('edit_invoice', 'Editar facturas'),
  ('delete_invoice', 'Eliminar facturas'),
  ('create_product', 'Crear productos'),
  ('view_product', 'Ver productos'),
  ('edit_product', 'Editar productos'),
  ('view_reports', 'Ver reportes'),
  ('manage_users', 'Gestionar usuarios'),
  ('manage_company', 'Gestionar empresa');

-- =====================================================================
-- FIN DEL SCHEMA
-- =====================================================================
