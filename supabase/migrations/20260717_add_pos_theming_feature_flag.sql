-- Fase 3 de personalización visual: pos_theming como feature flag comercial
-- (catálogo global + habilitado en todos los planes existentes, para que
-- ninguna empresa actual note un cambio). Sirve de palanca a futuro: un plan
-- nuevo, más barato, podría no incluirlo - CompanyAppearanceSettings.jsx y
-- el paso "Diseño del POS" del wizard ya están preparados para mostrarse
-- bloqueados/forzar el default cuando el plan de la empresa no lo tenga.

insert into public.feature_flags (key, label, description, category)
values (
  'pos_theming',
  'Personalización visual del POS',
  'Elegir tema (claro/oscuro) y paleta de color del punto de venta',
  'apariencia'
)
on conflict (key) do nothing;

update public.plans
set features = features || '["pos_theming"]'::jsonb
where not (features @> '["pos_theming"]'::jsonb);
