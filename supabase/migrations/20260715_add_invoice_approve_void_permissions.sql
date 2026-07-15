-- Cierra el gap dejado pendiente desde la Fase 1: "Aprobar y Enviar al SRI"
-- y "Anular factura" en InvoiceManagement.jsx no tenían permiso propio en el
-- catálogo original de 21 claves, así que quedaban visibles para cualquier
-- rol que llegara a la pantalla (incluido contador, que la Fase 5 prohíbe
-- explícitamente). Server-side ya estaban protegidas (submit-invoice.js
-- exige gerente/admin; RLS de invoices excluye a contador de UPDATE) - esto
-- solo agrega el permiso para que la UI también los oculte.
--
-- Solo gerente: coincide con el chequeo real de submit-invoice.js
-- (['gerente','admin'].includes(role)), vendedor/operario nunca pudieron
-- aprobar/anular aunque el botón estuviera visible.
insert into public.permissions (name, description) values
  ('invoices.approve', 'Aprobar y enviar una factura borrador al SRI'),
  ('invoices.void',    'Anular una factura')
on conflict (name) do nothing;

insert into public.role_permissions (role, permission_id)
select 'gerente'::user_role, id from public.permissions
where name in ('invoices.approve', 'invoices.void')
on conflict do nothing;
