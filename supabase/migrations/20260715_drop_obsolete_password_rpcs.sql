-- Retira las RPCs bcrypt reemplazadas por Supabase Auth. Dejarlas vivas sería
-- un camino muerto que crea/actualiza password_hash sin tocar auth.users
-- (login roto) o compara contra un hash que ya no es la fuente de verdad.
-- Confirmado sin referencias en src/ ni api/ antes de este DROP.
drop function if exists public.create_company_gerente(uuid, character varying, character varying, character varying, uuid);
drop function if exists public.create_company_user(uuid, character varying, character varying, character varying, user_role, character varying, uuid);
drop function if exists public.verify_user_password(character varying, character varying);
drop function if exists public.reset_company_user_password(uuid, uuid, character varying);
