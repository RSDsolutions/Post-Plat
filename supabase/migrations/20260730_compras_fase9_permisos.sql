-- Compras Fase 9 — catálogo de permisos para las pantallas ya construidas en
-- Fases 2/3/6/8 (SupplierManagement.jsx, PurchaseManagement.jsx,
-- AccountsPayable.jsx, AtsExport.jsx) que hasta ahora no eran alcanzables
-- desde ningún sidebar. gerente = todo; contador = solo lectura/exportación
-- (nunca .write), mismo criterio que el catálogo original de Ventas.
--
-- vendedor/operario no reciben ninguno de estos - Compras es una pantalla de
-- gerente/contador, igual que Reportes/Contabilidad hoy (ausencia de fila en
-- role_permissions = denegado por defecto, can() es fail-closed).
insert into public.permissions (name, description) values
  ('suppliers.read',         'Ver el catálogo de proveedores'),
  ('suppliers.write',        'Crear y editar proveedores'),
  ('purchases.read',         'Ver el registro de compras'),
  ('purchases.write',        'Registrar compras (manual o por XML del proveedor)'),
  ('purchases.export',       'Exportar compras y generar el ATS'),
  ('accounts_payable.read',  'Ver cuentas por pagar'),
  ('accounts_payable.write', 'Registrar pagos de cuentas por pagar')
on conflict (name) do nothing;

insert into public.role_permissions (role, permission_id)
select 'gerente'::user_role, id from public.permissions
where name in (
  'suppliers.read', 'suppliers.write',
  'purchases.read', 'purchases.write', 'purchases.export',
  'accounts_payable.read', 'accounts_payable.write'
)
on conflict do nothing;

insert into public.role_permissions (role, permission_id)
select 'contador'::user_role, id from public.permissions
where name in ('suppliers.read', 'purchases.read', 'purchases.export', 'accounts_payable.read')
on conflict do nothing;
