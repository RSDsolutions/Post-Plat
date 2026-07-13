-- ===========================================================================
-- Sistema de notificaciones por correo — triggers de BD (POST-PLAT)
-- Fecha: 2026-07-11
--
-- Dispara HTTP POST hacia la Vercel Function api/emails/webhook.js cuando:
--   1) product_stock cruza su stock mínimo  -> evento 'low_stock'
--   2) una factura pasa a estado 'devuelta' -> evento 'invoice_returned'
--
-- Usa pg_net (net.http_post). El endpoint se autentica con un secreto
-- compartido enviado en el header 'x-webhook-secret'.
--
-- IMPORTANTE: ejecuta este archivo con MCP (mcp__supabase__apply_migration)
-- o desde el SQL Editor de Supabase. Requiere la extensión pg_net.
-- ===========================================================================

-- 1) Extensiones -----------------------------------------------------------
-- pg_net no es reubicable: siempre crea/usa su propio schema `net`.
create extension if not exists pg_net;

-- 2) Config privada del webhook (URL + secreto) ----------------------------
-- Tabla de una sola fila, en un schema privado y con RLS activo sin políticas
-- (nadie vía API la lee). Los triggers corren como owner y sí la leen.
create schema if not exists private;

create table if not exists private.email_webhook_config (
  id            boolean primary key default true,
  endpoint_url  text not null,
  secret        text not null,
  constraint email_webhook_config_singleton check (id)
);

alter table private.email_webhook_config enable row level security;

-- >>> AJUSTA ESTOS VALORES <<<
--   endpoint_url: la URL pública de tu deploy de Vercel + /api/emails/webhook
--   secret:       el mismo valor que pongas en EMAIL_WEBHOOK_SECRET en Vercel
insert into private.email_webhook_config (id, endpoint_url, secret)
values (true, 'https://TU-APP.vercel.app/api/emails/webhook', 'CAMBIA-ESTE-SECRETO')
on conflict (id) do update
  set endpoint_url = excluded.endpoint_url,
      secret       = excluded.secret;

-- 3) Helper para postear un evento ----------------------------------------
create or replace function private.emit_email_event(payload jsonb)
returns void
language plpgsql
security definer
set search_path = private, net, public
as $$
declare
  cfg private.email_webhook_config;
begin
  select * into cfg from private.email_webhook_config where id is true;
  if cfg is null then
    return; -- sin config, no-op (no rompe la transacción de negocio)
  end if;

  perform net.http_post(
    url     := cfg.endpoint_url,
    body    := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', cfg.secret
    ),
    timeout_milliseconds := 5000
  );
end;
$$;

-- 4) Trigger: stock bajo ---------------------------------------------------
-- Sólo dispara cuando el stock CRUZA hacia abajo el mínimo (no en cada venta
-- mientras ya está bajo), y sólo si min_stock > 0.
create or replace function private.notify_low_stock()
returns trigger
language plpgsql
security definer
set search_path = private, net, public
as $$
begin
  if new.min_stock > 0
     and new.quantity <= new.min_stock
     and old.quantity > new.min_stock then
    perform private.emit_email_event(jsonb_build_object(
      'event',     'low_stock',
      'product_id', new.product_id,
      'branch_id',  new.branch_id,
      'quantity',   new.quantity,
      'min_stock',  new.min_stock
    ));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_low_stock on public.product_stock;
create trigger trg_notify_low_stock
  after update of quantity on public.product_stock
  for each row
  execute function private.notify_low_stock();

-- 5) Trigger: factura devuelta --------------------------------------------
create or replace function private.notify_invoice_returned()
returns trigger
language plpgsql
security definer
set search_path = private, net, public
as $$
begin
  if new.status = 'devuelta' and old.status is distinct from 'devuelta' then
    perform private.emit_email_event(jsonb_build_object(
      'event',      'invoice_returned',
      'invoice_id', new.id
    ));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_invoice_returned on public.invoices;
create trigger trg_notify_invoice_returned
  after update of status on public.invoices
  for each row
  execute function private.notify_invoice_returned();

-- 6) Defensa extra sobre create_company_gerente ----------------------------
-- La RPC ya verifica internamente que p_admin_id sea un admin activo (cierra la
-- §1.1.1). Como el alta ahora pasa por api/admin/create-gerente.js (service
-- role, que conserva permiso), revocamos también el EXECUTE directo a
-- anon/authenticated como capa adicional. Firma real: 5 args (incl. p_admin_id).
revoke execute on function
  public.create_company_gerente(uuid, character varying, character varying, character varying, uuid)
  from anon, authenticated;

-- ===========================================================================
-- Verificación rápida (opcional):
--   update public.product_stock set quantity = 0
--     where id = '<algún-id>';   -- debería disparar low_stock
-- Revisa net._http_response para ver el resultado del POST:
--   select * from net._http_response order by created desc limit 5;
-- ===========================================================================
