-- Personalización visual del POS por empresa (tema + paleta de acento).
--
-- Diseño de escritura: gerente y admin comparten el mismo rol de Postgres
-- (authenticated) - una política RLS de UPDATE por fila no puede restringir
-- a "solo esta columna", y un GRANT UPDATE(ui_settings) a nivel de columna
-- tampoco sirve porque admin necesita seguir editando el resto de columnas
-- de companies (ruc, subscription_status, etc.) con el mismo rol compartido.
-- Se usa una RPC angosta (mismo patrón ya usado para billing_configs.cert_password
-- y users.last_login vía record_login) en vez de una política directa - la
-- spec anticipa exactamente este problema para users.ui_preferences en la
-- Fase 4 ("usa una RPC si la política directa resulta insegura"); acá aplica
-- igual, un turno antes.
--
-- Lectura: ya cubierta por la política companies_select existente (Fase 0),
-- que deja leer la propia empresa a cualquier rol (gerente/cajero/contador) -
-- ui_settings no es dato sensible, no necesita una política nueva.
alter table public.companies
  add column ui_settings jsonb not null default '{"pos_theme": "light-classic", "pos_accent": "blue"}'::jsonb;

-- Backfill: las empresas que ya existían antes de esta migración se fijan al
-- par que reproduce EXACTO su POS actual (dark-classic + emerald, ver
-- src/styles/themes.css) - así nadie ve un cambio de apariencia de golpe.
-- El default de la columna (light-classic + blue) queda como el que
-- realmente aplica de acá en adelante para empresas nuevas.
update public.companies
set ui_settings = '{"pos_theme": "dark-classic", "pos_accent": "emerald"}'::jsonb;

create or replace function public.set_company_ui_settings(p_company_id uuid, p_pos_theme text, p_pos_accent text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND company_id = p_company_id AND role = 'gerente' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'No autorizado para cambiar la apariencia de esta empresa';
  END IF;

  IF p_pos_theme NOT IN ('light-classic', 'light-soft', 'dark-classic', 'dark-contrast') THEN
    RAISE EXCEPTION 'Tema no válido: %', p_pos_theme;
  END IF;
  IF p_pos_accent NOT IN ('blue', 'emerald', 'violet', 'amber', 'rose', 'slate') THEN
    RAISE EXCEPTION 'Paleta de acento no válida: %', p_pos_accent;
  END IF;

  UPDATE companies
  SET ui_settings = jsonb_build_object('pos_theme', p_pos_theme, 'pos_accent', p_pos_accent)
  WHERE id = p_company_id
  RETURNING ui_settings INTO v_result;

  RETURN v_result;
END;
$function$;

revoke all on function public.set_company_ui_settings(uuid, text, text) from public;
grant execute on function public.set_company_ui_settings(uuid, text, text) to authenticated;
