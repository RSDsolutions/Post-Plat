-- Mejoras Admin Fase 5: nuevo estado para la baja definitiva (soft-delete),
-- distinto de 'cancelada' (ya existe en el enum pero sin ningún código que
-- la escriba - se deja intacta por si en el futuro se construye una
-- cancelación de suscripción real, un concepto distinto y potencialmente
-- reversible, a diferencia de esta baja que es irreversible desde la UI).
alter type subscription_status add value 'dada_de_baja';
