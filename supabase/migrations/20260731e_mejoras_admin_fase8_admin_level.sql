-- Mejoras Admin Fase 8: diferenciación liviana dentro del rol admin
-- ('soporte' vs 'super'), no un sistema de permisos granular nuevo.
-- Decisión de negocio fijada por el usuario. admin_level vive en users
-- (no en un enum de user_role nuevo) porque es un nivel DENTRO del rol
-- admin, no un rol distinto - gerente/vendedor/etc. simplemente lo ignoran
-- (default 'super', inerte para ellos).
alter table public.users add column admin_level text not null default 'super' check (admin_level in ('soporte','super'));

-- CRÍTICO: SELECT sobre public.users es una lista blanca de columnas para
-- authenticated (no un grant de tabla completa) - sin este GRANT explícito,
-- loginWithPassword()/restoreAuth() (que van a seleccionar esta columna
-- para saber si el admin es soporte o super) rompen el login de TODOS los
-- usuarios con "permission denied for table users", exactamente el
-- incidente ya documentado en AUDITORIA_SISTEMA.md #9. Verificado después
-- con information_schema.column_privileges, no solo leído a ojo.
grant select (admin_level) on public.users to authenticated;

-- Helper más estricto que is_platform_admin(): exige además admin_level='super'.
-- is_platform_admin() se deja intacta (sigue usándose en políticas de SOLO
-- LECTURA y en activity_log_insert, donde soporte también debe poder
-- escribir su propio rastro de auditoría) - este nuevo helper reemplaza a
-- is_platform_admin() únicamente en las políticas de ESCRITURA que deben
-- quedar exclusivas de super.
create or replace function public.is_platform_super_admin() returns boolean
language sql security definer stable set search_path = public, pg_temp
as $$ select exists(select 1 from public.users where id = auth.uid() and role = 'admin' and admin_level = 'super' and is_active = true) $$;

-- companies_insert/update, company_feature_overrides_*, payments_*,
-- plans_update: todas mutaciones que la Fase 8 reserva a super (crear
-- empresa, suspender/reactivar/editar/cambiar plan/precio/trial/baja
-- definitiva, togglear features, registrar pagos, editar precios de plan).
-- activity_log_insert y todas las políticas de SELECT quedan intactas.
drop policy companies_insert on public.companies;
create policy companies_insert on public.companies for insert with check (public.is_platform_super_admin());

drop policy companies_update on public.companies;
create policy companies_update on public.companies for update using (public.is_platform_super_admin());

drop policy company_feature_overrides_insert on public.company_feature_overrides;
create policy company_feature_overrides_insert on public.company_feature_overrides for insert with check (public.is_platform_super_admin());

drop policy company_feature_overrides_update on public.company_feature_overrides;
create policy company_feature_overrides_update on public.company_feature_overrides for update using (public.is_platform_super_admin());

drop policy company_feature_overrides_delete on public.company_feature_overrides;
create policy company_feature_overrides_delete on public.company_feature_overrides for delete using (public.is_platform_super_admin());

drop policy payments_insert on public.payments;
create policy payments_insert on public.payments for insert with check (public.is_platform_super_admin());

drop policy payments_update on public.payments;
create policy payments_update on public.payments for update using (public.is_platform_super_admin());

drop policy payments_delete on public.payments;
create policy payments_delete on public.payments for delete using (public.is_platform_super_admin());

drop policy plans_update on public.plans;
create policy plans_update on public.plans for update using (public.is_platform_super_admin());
