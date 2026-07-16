-- Bug encontrado probando la Fase 2 con datos reales: invoices tenía
-- UNIQUE (company_id, invoice_number) sin distinguir invoice_type. Factura y
-- nota de crédito usan secuenciales INDEPENDIENTES (ver 20260721_credit_notes_schema.sql)
-- así que el mismo estab-ptoEmi-secuencial es perfectamente válido y esperado
-- para una factura Y una nota de crédito al mismo tiempo (el SRI las
-- distingue por codDoc, no por el número solo) - con la constraint vieja, la
-- segunda de las dos en insertarse chocaba con un 23505 real.
--
-- Ensanchar el scope de la unicidad a (company_id, invoice_type, invoice_number)
-- es estrictamente más permisivo que antes: cualquier par de filas que ya
-- cumplía la constraint vieja sigue cumpliendo esta (nunca puede haber datos
-- existentes que la violen), así que es segura de aplicar sin backfill.
alter table public.invoices drop constraint if exists invoices_company_id_invoice_number_key;

alter table public.invoices
  add constraint invoices_company_id_invoice_type_invoice_number_key
  unique (company_id, invoice_type, invoice_number);
