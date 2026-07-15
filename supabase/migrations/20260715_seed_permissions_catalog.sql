-- Activa permissions/role_permissions. permissions tenía 10 filas residuales
-- del seed original de DATABASE_SCHEMA_V2.sql (create_invoice, view_product...,
-- nomenclatura snake_case vieja) pero role_permissions tenía 0 - nunca se usó
-- de verdad (confirmado: ningún código de la app las lee). Se reemplazan por
-- el catálogo modulo.accion pedido acá; con RLS ya basada en auth.uid()
-- (Fase 0), este catálogo pasa a ser la fuente de verdad tanto para la UI
-- (can(), src/lib/permissions.js) como, a futuro, para afinar las políticas
-- RLS que hoy usan listas de roles hardcodeadas.
delete from public.permissions;

insert into public.permissions (name, description) values
  ('pos.operate',          'Operar el punto de venta (cobrar, armar la venta)'),
  ('products.read',        'Ver el catálogo de productos'),
  ('products.write',       'Crear/editar productos, precios, descuentos'),
  ('inventory.read',       'Ver existencias de inventario'),
  ('inventory.write',      'Ajustar existencias de inventario'),
  ('customers.read',       'Ver clientes'),
  ('customers.write',      'Crear/editar clientes'),
  ('invoices.read',        'Ver facturas/comprobantes'),
  ('invoices.export',      'Exportar facturas (CSV, XML, PDF)'),
  ('invoices.resend_sri',  'Reenviar/reconsultar el estado de una factura ante el SRI'),
  ('invoices.send_ride',   'Enviar el RIDE de una factura por correo'),
  ('reports.read',         'Ver reportes'),
  ('reports.export',       'Exportar reportes (CSV, PDF)'),
  ('accounting.read',      'Ver el módulo de contabilidad'),
  ('accounting.export',    'Exportar datos contables'),
  ('cash_closure.create',  'Registrar un cierre de caja'),
  ('cash_closure.read',    'Ver historial de cierres de caja'),
  ('users.manage',         'Crear/editar/desactivar usuarios de la empresa'),
  ('branches.manage',      'Crear/editar sucursales y puntos de venta'),
  ('settings.manage',      'Editar configuración general de la empresa'),
  ('billing_config.manage','Editar configuración de facturación SRI (certificado, ambiente, IVA)')
on conflict (name) do nothing;

-- gerente: todos los permisos de empresa.
insert into public.role_permissions (role, permission_id)
select 'gerente'::user_role, id from public.permissions
on conflict do nothing;

-- vendedor / operario: solo lo que el POS efectivamente ejerce.
insert into public.role_permissions (role, permission_id)
select r.role, p.id
from public.permissions p
cross join (values ('vendedor'::user_role), ('operario'::user_role)) as r(role)
where p.name in ('pos.operate', 'products.read', 'customers.read', 'customers.write', 'cash_closure.create')
on conflict do nothing;

-- contador: lectura/exportación de facturación, reportes y contabilidad;
-- reconsulta de estado SRI (invoices.resend_sri) pero NO reenvío - eso lo
-- distingue la propia acción en la UI/endpoint, el permiso solo habilita ver
-- el botón de reconsultar.
insert into public.role_permissions (role, permission_id)
select 'contador'::user_role, id from public.permissions
where name in (
  'invoices.read', 'invoices.export', 'invoices.resend_sri',
  'reports.read', 'reports.export',
  'accounting.read', 'accounting.export',
  'cash_closure.read', 'customers.read', 'products.read'
)
on conflict do nothing;
