-- Fase 2: si el gerente marca "reingresar mercadería al stock" al emitir una
-- nota de crédito, esa decisión debe sobrevivir el viaje borrador -> envío al
-- SRI (api/sri/submit-credit-note.js solo recibe {invoiceId}, igual que
-- submit-invoice.js desde la Fase 1 - no vuelve a recibir flags de negocio en
-- el body). Se persiste en la propia fila en vez de volver a pasarla en el
-- submit, para que no pueda alterarse entre la creación del borrador y el
-- envío real.
alter table public.invoices
  add column if not exists credit_note_restock boolean not null default false;
