-- =====================================================================
-- POST-PLAT Sample Data
-- 3 Companies with different subscriptions, users, and transactions
-- =====================================================================

-- Companies
INSERT INTO companies (ruc, razon_social, nombre_comercial, email, phone, address, city,
                       plan_id, subscription_status, subscription_start, subscription_renewal,
                       admin_email, environment_type)
VALUES
  ('0190000000001', 'Supermercado ABC S.A.', 'Supermercado ABC', 'admin@supermercadoabc.com',
   '0987654321', 'Calle Principal 123', 'Quito',
   (SELECT id FROM plans WHERE name = 'Básico'), 'activa'::subscription_status,
   NOW(), NOW() + INTERVAL '1 month', 'admin@supermercadoabc.com', 'produccion'::environment_type),

  ('0190000000002', 'Farmacia XYZ Ecuatoriana', 'Farmacia XYZ', 'admin@farmaciaxyz.com',
   '0987654322', 'Av. Amazonas 456', 'Guayaquil',
   (SELECT id FROM plans WHERE name = 'Profesional'), 'activa'::subscription_status,
   NOW(), NOW() + INTERVAL '1 month', 'admin@farmaciaxyz.com', 'produccion'::environment_type),

  ('0190000000003', 'Centro Comercial Premium', 'Premium Mall', 'admin@premiumcenter.com',
   '0987654323', 'Calle Comercial 789', 'Cuenca',
   (SELECT id FROM plans WHERE name = 'Empresarial'), 'activa'::subscription_status,
   NOW(), NOW() + INTERVAL '1 month', 'admin@premiumcenter.com', 'produccion'::environment_type);

-- Users for each company
INSERT INTO users (company_id, email, password_hash, name, role, is_active)
VALUES
  -- Supermercado ABC
  ((SELECT id FROM companies WHERE ruc = '0190000000001'), 'gerente@supermercadoabc.com',
   crypt('ABC123456', gen_salt('bf')), 'Juan García', 'gerente'::user_role, true),
  ((SELECT id FROM companies WHERE ruc = '0190000000001'), 'vendedor1@supermercadoabc.com',
   crypt('ABC123456', gen_salt('bf')), 'Carlos López', 'vendedor'::user_role, true),

  -- Farmacia XYZ
  ((SELECT id FROM companies WHERE ruc = '0190000000002'), 'gerente@farmaciaxyz.com',
   crypt('XYZ123456', gen_salt('bf')), 'María Rodríguez', 'gerente'::user_role, true),
  ((SELECT id FROM companies WHERE ruc = '0190000000002'), 'contador@farmaciaxyz.com',
   crypt('XYZ123456', gen_salt('bf')), 'Roberto Martínez', 'contador'::user_role, true),

  -- Premium Mall
  ((SELECT id FROM companies WHERE ruc = '0190000000003'), 'gerente@premiumcenter.com',
   crypt('PREMIUM123456', gen_salt('bf')), 'Diana Flores', 'gerente'::user_role, true),
  ((SELECT id FROM companies WHERE ruc = '0190000000003'), 'operario@premiumcenter.com',
   crypt('PREMIUM123456', gen_salt('bf')), 'Miguel Torres', 'operario'::user_role, true);

-- Branches for each company
INSERT INTO branches (company_id, name, code, address, city, establishment, is_active)
VALUES
  ((SELECT id FROM companies WHERE ruc = '0190000000001'), 'Sucursal Centro', '001', 'Calle Principal 123', 'Quito', '001', true),
  ((SELECT id FROM companies WHERE ruc = '0190000000001'), 'Sucursal Norte', '002', 'Calle Norte 456', 'Quito', '001', true),
  ((SELECT id FROM companies WHERE ruc = '0190000000002'), 'Farmacia Principal', '001', 'Av. Amazonas 456', 'Guayaquil', '001', true),
  ((SELECT id FROM companies WHERE ruc = '0190000000003'), 'Mall Zona 1', '001', 'Calle Comercial 789', 'Cuenca', '001', true);

-- Point of Sales
INSERT INTO point_of_sales (company_id, branch_id, nombre, numero_establecimiento, numero_pos,
                            sequential_start, sequential_current, status, is_active)
VALUES
  ((SELECT id FROM companies WHERE ruc = '0190000000001'),
   (SELECT id FROM branches WHERE company_id = (SELECT id FROM companies WHERE ruc = '0190000000001') AND code = '001'),
   'Caja 1 Centro', '001', '001', 1, 2, 'activo', true),
  ((SELECT id FROM companies WHERE ruc = '0190000000001'),
   (SELECT id FROM branches WHERE company_id = (SELECT id FROM companies WHERE ruc = '0190000000001') AND code = '001'),
   'Caja 2 Centro', '001', '002', 1, 0, 'activo', true),
  ((SELECT id FROM companies WHERE ruc = '0190000000001'),
   (SELECT id FROM branches WHERE company_id = (SELECT id FROM companies WHERE ruc = '0190000000001') AND code = '002'),
   'Caja 1 Norte', '001', '003', 1, 0, 'activo', true),
  ((SELECT id FROM companies WHERE ruc = '0190000000002'),
   (SELECT id FROM branches WHERE company_id = (SELECT id FROM companies WHERE ruc = '0190000000002') AND code = '001'),
   'Caja Farmacia', '001', '001', 1, 1, 'activo', true),
  ((SELECT id FROM companies WHERE ruc = '0190000000003'),
   (SELECT id FROM branches WHERE company_id = (SELECT id FROM companies WHERE ruc = '0190000000003') AND code = '001'),
   'Caja Central', '001', '001', 1, 1, 'activo', true);

-- Products
INSERT INTO products (company_id, code, name, description, cost_price, sale_price,
                     tax_percentage, quantity, min_stock, category, is_active)
VALUES
  -- Supermercado ABC
  ((SELECT id FROM companies WHERE ruc = '0190000000001'), 'PROD001', 'Arroz 1kg', 'Arroz blanco premium',
   1.50, 2.50, 12.00, 100, 20, 'Alimentos', true),
  ((SELECT id FROM companies WHERE ruc = '0190000000001'), 'PROD002', 'Aceite 1L', 'Aceite vegetal puro',
   2.00, 3.50, 12.00, 50, 10, 'Alimentos', true),
  ((SELECT id FROM companies WHERE ruc = '0190000000001'), 'PROD003', 'Leche 1L', 'Leche fresca entera',
   0.80, 1.50, 12.00, 200, 50, 'Lácteos', true),

  -- Farmacia XYZ
  ((SELECT id FROM companies WHERE ruc = '0190000000002'), 'FAR001', 'Aspirina 500mg', 'Blister x 10 tabletas',
   1.20, 2.99, 12.00, 150, 30, 'Medicamentos', true),
  ((SELECT id FROM companies WHERE ruc = '0190000000002'), 'FAR002', 'Vitamina C 1000mg', 'Frasco x 30 tabletas',
   3.50, 7.99, 12.00, 80, 15, 'Vitaminas', true),
  ((SELECT id FROM companies WHERE ruc = '0190000000002'), 'FAR003', 'Antigripal', 'Caja x 12 sobres',
   2.50, 5.99, 12.00, 60, 10, 'Medicamentos', true),

  -- Premium Mall
  ((SELECT id FROM companies WHERE ruc = '0190000000003'), 'PREM001', 'Camiseta', 'Talla M color azul',
   8.00, 25.00, 12.00, 200, 50, 'Ropa', true),
  ((SELECT id FROM companies WHERE ruc = '0190000000003'), 'PREM002', 'Pantalón', 'Talla 32 jean negro',
   15.00, 45.00, 12.00, 100, 20, 'Ropa', true),
  ((SELECT id FROM companies WHERE ruc = '0190000000003'), 'PREM003', 'Zapatos', 'Talla 42 deportivos',
   20.00, 70.00, 12.00, 80, 15, 'Calzado', true);

-- Customers
INSERT INTO customers (company_id, identification_type, identification_number, name, email,
                       phone, address, city, credit_limit, current_balance, is_active)
VALUES
  -- Supermercado ABC
  ((SELECT id FROM companies WHERE ruc = '0190000000001'), 'RUC', '0190999999001', 'Distribuidora El Éxito',
   'compras@exito.com', '0987654321', 'Calle 5 y 10', 'Quito', 5000.00, 1500.00, true),
  ((SELECT id FROM companies WHERE ruc = '0190000000001'), 'Cédula', '1234567890', 'Juan Pérez',
   'juan@email.com', '0987654322', 'Av. 6 de diciembre', 'Quito', 500.00, 200.00, true),

  -- Farmacia XYZ
  ((SELECT id FROM companies WHERE ruc = '0190000000002'), 'RUC', '0190888888001', 'Hospital Central',
   'compras@hospital.com', '0987654323', 'Av. Carlos Juan Arosemena', 'Guayaquil', 8000.00, 2000.00, true),
  ((SELECT id FROM companies WHERE ruc = '0190000000002'), 'Cédula', '0987654321', 'María García',
   'maria@email.com', '0987654324', 'Calle Clemente Ballén', 'Guayaquil', 300.00, 0.00, true),

  -- Premium Mall
  ((SELECT id FROM companies WHERE ruc = '0190000000003'), 'RUC', '0190777777001', 'Tienda Boutique Premium',
   'compras@boutique.com', '0987654325', 'Centro histórico', 'Cuenca', 3000.00, 500.00, true),
  ((SELECT id FROM companies WHERE ruc = '0190000000003'), 'Cédula', '1111111111', 'Carlos Rodríguez',
   'carlos@email.com', '0987654326', 'Calle Larga', 'Cuenca', 1000.00, 0.00, true);

-- Invoices
INSERT INTO invoices (company_id, pos_id, invoice_type, invoice_number, issue_date,
                      subtotal, tax_amount, discount_amount, total_amount, status)
VALUES
  ((SELECT id FROM companies WHERE ruc = '0190000000001'),
   (SELECT id FROM point_of_sales WHERE company_id = (SELECT id FROM companies WHERE ruc = '0190000000001') AND numero_pos = '001' LIMIT 1),
   'factura'::invoice_type, '001-001-000000001', NOW(), 100.00, 12.00, 0.00, 112.00, 'autorizada'::invoice_status),
  ((SELECT id FROM companies WHERE ruc = '0190000000001'),
   (SELECT id FROM point_of_sales WHERE company_id = (SELECT id FROM companies WHERE ruc = '0190000000001') AND numero_pos = '001' LIMIT 1),
   'factura'::invoice_type, '001-001-000000002', NOW() - INTERVAL '1 day', 250.00, 30.00, 0.00, 280.00, 'autorizada'::invoice_status),
  ((SELECT id FROM companies WHERE ruc = '0190000000002'),
   (SELECT id FROM point_of_sales WHERE company_id = (SELECT id FROM companies WHERE ruc = '0190000000002')),
   'factura'::invoice_type, '001-001-000000001', NOW(), 150.00, 18.00, 0.00, 168.00, 'autorizada'::invoice_status),
  ((SELECT id FROM companies WHERE ruc = '0190000000003'),
   (SELECT id FROM point_of_sales WHERE company_id = (SELECT id FROM companies WHERE ruc = '0190000000003')),
   'factura'::invoice_type, '001-001-000000001', NOW() - INTERVAL '2 days', 300.00, 36.00, 0.00, 336.00, 'autorizada'::invoice_status);

-- Invoice Details
INSERT INTO invoice_details (invoice_id, product_code, product_name, quantity, unit_price,
                             discount_percent, tax_percent, subtotal, tax_amount, total)
VALUES
  -- Factura 1 Supermercado ABC
  ((SELECT id FROM invoices WHERE invoice_number = '001-001-000000001' AND company_id = (SELECT id FROM companies WHERE ruc = '0190000000001') LIMIT 1),
   'PROD001', 'Arroz 1kg', 20, 2.50, 0, 12.00, 50.00, 6.00, 56.00),
  ((SELECT id FROM invoices WHERE invoice_number = '001-001-000000001' AND company_id = (SELECT id FROM companies WHERE ruc = '0190000000001') LIMIT 1),
   'PROD002', 'Aceite 1L', 10, 3.50, 0, 12.00, 35.00, 4.20, 39.20),
  ((SELECT id FROM invoices WHERE invoice_number = '001-001-000000001' AND company_id = (SELECT id FROM companies WHERE ruc = '0190000000001') LIMIT 1),
   'PROD003', 'Leche 1L', 10, 1.50, 0, 12.00, 15.00, 1.80, 16.80),

  -- Factura 3 Farmacia XYZ
  ((SELECT id FROM invoices WHERE invoice_number = '001-001-000000001' AND company_id = (SELECT id FROM companies WHERE ruc = '0190000000002')),
   'FAR001', 'Aspirina 500mg', 30, 2.99, 0, 12.00, 89.70, 10.76, 100.46),
  ((SELECT id FROM invoices WHERE invoice_number = '001-001-000000001' AND company_id = (SELECT id FROM companies WHERE ruc = '0190000000002')),
   'FAR002', 'Vitamina C 1000mg', 5, 7.99, 0, 12.00, 39.95, 4.79, 44.74),

  -- Factura 4 Premium Mall
  ((SELECT id FROM invoices WHERE invoice_number = '001-001-000000001' AND company_id = (SELECT id FROM companies WHERE ruc = '0190000000003')),
   'PREM001', 'Camiseta', 6, 25.00, 0, 12.00, 150.00, 18.00, 168.00),
  ((SELECT id FROM invoices WHERE invoice_number = '001-001-000000001' AND company_id = (SELECT id FROM companies WHERE ruc = '0190000000003')),
   'PREM002', 'Pantalón', 2, 45.00, 0, 12.00, 90.00, 10.80, 100.80);

-- Summary statistics
-- Total companies: 3
-- Total users: 6
-- Total branches: 4
-- Total POS: 5
-- Total products: 9
-- Total customers: 6
-- Total invoices: 4
-- Total invoice details: 7
