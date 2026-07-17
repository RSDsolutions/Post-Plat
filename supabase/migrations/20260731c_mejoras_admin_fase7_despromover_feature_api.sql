-- Mejoras Admin Fase 7: la feature "api" se vendía en el plan Empresarial
-- sin ningún endpoint público real detrás (confirmado en la verificación de
-- 2026-07-16: 0 tablas de api_keys/tokens, los 12 endpoints existentes son
-- todos internos). Decisión de negocio fijada por el usuario: no construir
-- la API pública ahora (proyecto aparte); se deja de prometer activamente.
update public.plans
set features = (select jsonb_agg(f) from jsonb_array_elements(features) f where f <> '"api"')
where name = 'Empresarial';

update public.feature_flags
set description = 'Acceso programático vía API (Próximamente - todavía no hay endpoints públicos reales detrás de esta funcionalidad)'
where key = 'api';
