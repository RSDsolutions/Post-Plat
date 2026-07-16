-- Compras Fase 5 — bucket privado para los XML originales que suben los
-- proveedores (trazabilidad: nunca se firman ni se reenvían al SRI como
-- propios, solo se guardan tal cual llegaron).
--
-- A diferencia de company-logos (cuyas políticas solo chequean bucket_id,
-- sin scoping por empresa - un hallazgo de seguridad real pero fuera de
-- alcance de esta fase, señalado aparte) este bucket SÍ queda scopeado por
-- carpeta: storage.foldername(name)[1] debe ser el company_id del que
-- sube/lee, igual de estricto que el resto de las políticas RLS del
-- proyecto. Solo gerente puede subir; cualquiera de la empresa (gerente o
-- contador) puede leer, igual que puede leer purchases.
insert into storage.buckets (id, name, public)
values ('supplier-invoices', 'supplier-invoices', false)
on conflict (id) do nothing;

create policy supplier_invoices_select on storage.objects for select
  using (
    bucket_id = 'supplier-invoices'
    and (storage.foldername(name))[1] = (select public.current_company_id())::text
  );

create policy supplier_invoices_insert on storage.objects for insert
  with check (
    bucket_id = 'supplier-invoices'
    and (storage.foldername(name))[1] = (select public.current_company_id())::text
    and (select public.current_role()) = 'gerente'
  );
