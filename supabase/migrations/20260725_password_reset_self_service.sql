-- Fase 5: Recuperación de contraseña self-service.
--
-- password_reset_attempts es tabla nueva, sin el lastre del resto del
-- esquema (timestamp without time zone en todos lados, ver AUDITORIA_SISTEMA.md
-- #10) - acá sí usamos timestamptz (instante absoluto real), correcto porque
-- esta columna nunca se muestra a un humano, solo se compara en SQL contra
-- now() dentro del mismo RPC. Sin RLS con políticas (nadie la lee/escribe
-- directo) - solo alcanzable vía la función SECURITY DEFINER de abajo.
create table if not exists public.password_reset_attempts (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  requested_at timestamptz not null default now()
);

create index if not exists idx_password_reset_attempts_email_time
  on public.password_reset_attempts(email, requested_at);

alter table public.password_reset_attempts enable row level security;

-- Verifica y registra un intento de recuperación en un solo paso atómico
-- (evita la carrera de "leo el conteo, decido, inserto" en dos pasos
-- separados). Máximo 3 intentos por email en 15 minutos. Devuelve false =
-- rate-limited, true = se registró el intento y puede proceder.
create or replace function public.check_and_record_password_reset_attempt(p_email text)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $function$
DECLARE
  v_recent_count integer;
  v_normalized text := lower(trim(p_email));
BEGIN
  SELECT count(*) INTO v_recent_count
  FROM password_reset_attempts
  WHERE email = v_normalized
    AND requested_at > now() - interval '15 minutes';

  IF v_recent_count >= 3 THEN
    RETURN false;
  END IF;

  INSERT INTO password_reset_attempts (email) VALUES (v_normalized);
  RETURN true;
END;
$function$;

revoke all on function public.check_and_record_password_reset_attempt(text) from public, anon, authenticated;
