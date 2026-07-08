SELECT 'Companies' as tabla, COUNT(*) as total FROM companies
UNION ALL
SELECT 'Users', COUNT(*) FROM users
UNION ALL
SELECT 'Branches', COUNT(*) FROM branches
UNION ALL
SELECT 'Point of Sales', COUNT(*) FROM point_of_sales
UNION ALL
SELECT 'Products', COUNT(*) FROM products
UNION ALL
SELECT 'Customers', COUNT(*) FROM customers
UNION ALL
SELECT 'Invoices', COUNT(*) FROM invoices
UNION ALL
SELECT 'Invoice Details', COUNT(*) FROM invoice_details;
