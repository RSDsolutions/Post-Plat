-- Script para crear tabla admin_users e insertar usuario admin
-- Ejecutar en Supabase SQL Editor

-- Crear tabla admin_users
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

-- Insertar usuario administrador
INSERT INTO admin_users (email, password, name, role, is_active)
VALUES ('admin@postplat.com', '123456', 'Administrador', 'admin', true)
ON CONFLICT (email) DO NOTHING;

-- Crear índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);

-- Habilitar RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Crear política de lectura
CREATE POLICY IF NOT EXISTS "Enable read for authenticated" ON admin_users
  FOR SELECT USING (TRUE);

-- Dar permisos
GRANT SELECT ON admin_users TO anon;
GRANT SELECT ON admin_users TO authenticated;

-- Verificar que se creó correctamente
SELECT email, name, role, is_active FROM admin_users WHERE email = 'admin@postplat.com';
