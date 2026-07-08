-- Tabla: plans (Planes de suscripción)
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  features JSONB DEFAULT '[]'::jsonb,
  max_users INTEGER,
  max_branches INTEGER,
  environment_type VARCHAR(50) DEFAULT 'pruebas',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: companies (Empresas)
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  ruc VARCHAR(20) UNIQUE,
  razon_social VARCHAR(255) NOT NULL,
  nombre_comercial VARCHAR(255) NOT NULL,
  address TEXT,
  lleva_contabilidad BOOLEAN DEFAULT FALSE,
  regimen VARCHAR(50) DEFAULT 'General',
  environment VARCHAR(50) DEFAULT 'Pruebas',
  establishment VARCHAR(10) DEFAULT '001',
  point_of_sale VARCHAR(10) DEFAULT '001',
  sequential_start INTEGER DEFAULT 1,
  plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL,
  billing_cycle VARCHAR(20) DEFAULT 'mensual',
  subscription_start TIMESTAMP,
  subscription_renewal TIMESTAMP,
  subscription_status VARCHAR(50) DEFAULT 'Activa',
  payment_status VARCHAR(50) DEFAULT 'Al día',
  cert JSONB,
  monthly_comprobantes INTEGER DEFAULT 0,
  prev_month_comprobantes INTEGER DEFAULT 0,
  active_users INTEGER DEFAULT 1,
  branches INTEGER DEFAULT 1,
  suspension_info JSONB,
  internal_notes TEXT,
  admin_email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: point_of_sales (Puntos de venta)
CREATE TABLE IF NOT EXISTS point_of_sales (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  numero_establecimiento VARCHAR(10) DEFAULT '001',
  numero_pos VARCHAR(10) DEFAULT '001',
  sequential_start INTEGER DEFAULT 1,
  sequential_current INTEGER DEFAULT 1,
  status VARCHAR(50) DEFAULT 'activo',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, numero_establecimiento, numero_pos)
);

-- Tabla: payments (Pagos)
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  method VARCHAR(100) DEFAULT 'Transferencia',
  status VARCHAR(50) DEFAULT 'Pagado',
  payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reference VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: activity_log (Log de actividades)
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT,
  action VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: admin_users (Usuarios Administradores)
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) DEFAULT 'Administrador',
  role VARCHAR(50) DEFAULT 'admin',
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para mejor performance
CREATE INDEX IF NOT EXISTS idx_companies_plan_id ON companies(plan_id);
CREATE INDEX IF NOT EXISTS idx_companies_subscription_status ON companies(subscription_status);
CREATE INDEX IF NOT EXISTS idx_companies_payment_status ON companies(payment_status);
CREATE INDEX IF NOT EXISTS idx_companies_created_at ON companies(created_at);

CREATE INDEX IF NOT EXISTS idx_point_of_sales_company_id ON point_of_sales(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_company_id ON payments(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);

CREATE INDEX IF NOT EXISTS idx_activity_log_company_id ON activity_log(company_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);

-- RLS (Row Level Security) - Configuración básica
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_of_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para permitir lectura pública (modificar según necesidades de seguridad)
CREATE POLICY "Enable read access for all" ON companies FOR SELECT USING (TRUE);
CREATE POLICY "Enable read access for all" ON point_of_sales FOR SELECT USING (TRUE);
CREATE POLICY "Enable read access for all" ON payments FOR SELECT USING (TRUE);
CREATE POLICY "Enable read access for all" ON activity_log FOR SELECT USING (TRUE);
CREATE POLICY "Enable read access for all" ON plans FOR SELECT USING (TRUE);

-- Insertar usuario administrador
INSERT INTO admin_users (email, password, name, role)
VALUES
  ('admin@postplat.com', '123456', 'Administrador', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Insertar planes de ejemplo
INSERT INTO plans (name, description, price, features, max_users, max_branches, environment_type)
VALUES
  ('Básico', 'Plan básico para pequeñas empresas', 29.99, '["1 POS", "Reportes básicos", "Soporte por email"]'::jsonb, 3, 1, 'Pruebas'),
  ('Profesional', 'Plan profesional para empresas medianas', 99.99, '["5 POS", "Reportes avanzados", "Soporte prioritario", "Integraciones"]'::jsonb, 10, 3, 'Pruebas'),
  ('Empresarial', 'Plan empresarial con todas las características', 299.99, '["Ilimitado POS", "Reportes premium", "Soporte 24/7", "Integraciones", "API access"]'::jsonb, 50, 10, 'Producción')
ON CONFLICT (name) DO NOTHING;

-- Índices para admin_users
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);

-- RLS para admin_users
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read for authenticated" ON admin_users FOR SELECT USING (TRUE);

-- Permisos
GRANT SELECT ON plans TO anon;
GRANT SELECT ON companies TO anon;
GRANT SELECT ON point_of_sales TO anon;
GRANT SELECT ON payments TO anon;
GRANT SELECT ON activity_log TO anon;
GRANT SELECT ON admin_users TO anon;
