-- Descubierto al analizar el XSD real ComprobanteRetencion_V2.0.0.xsd (Fase 4):
-- infoCompRetencion.parteRel es REQUERIDO (minOccurs="1", patrón SI|NO) - "parte
-- relacionada" para fines tributarios (declaración anti-elusión de precios de
-- transferencia). No estaba contemplado en el modelo de la Fase 1 porque no
-- se conocía el esquema real todavía. Default false/'NO' - es el caso común
-- para la enorme mayoría de proveedores.
alter table public.suppliers
  add column es_parte_relacionada boolean not null default false;
