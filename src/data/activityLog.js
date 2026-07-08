import { DEMO_DATE, addDays } from '../lib/dates.js';

export const demoActivityLog = [
  { id: 'a1', date: addDays(DEMO_DATE, -2),    user: 'Administrador', action: 'Empresa creada',          company: 'Delicias de María',        detail: 'Instancia en modo pruebas' },
  { id: 'a2', date: addDays(DEMO_DATE, -9),    user: 'Administrador', action: 'Suscripción vencida',      company: 'Distribuidora El Trébol',  detail: 'Sin renovación registrada' },
  { id: 'a3', date: addDays(DEMO_DATE, -12),   user: 'Administrador', action: 'Empresa suspendida',       company: 'Cafetería Aroma Andino',   detail: 'Motivo: falta de pago' },
  { id: 'a4', date: addDays(DEMO_DATE, -18),   user: 'Administrador', action: 'Pago registrado',          company: 'Panadería San Rafael',     detail: '$45.00 — transferencia bancaria' },
  { id: 'a5', date: addDays(DEMO_DATE, -30),   user: 'Administrador', action: 'Plan modificado',          company: 'Farmacia Cruz Verde Sur',  detail: 'Estándar → Pro' },
  { id: 'a6', date: addDays(DEMO_DATE, -45),   user: 'Administrador', action: 'Empresa creada',           company: 'Ferretería El Tornillo',   detail: 'Instancia en producción' },
];
