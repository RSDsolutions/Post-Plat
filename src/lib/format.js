export function formatUSD(n) {
  return '$' + Number(n).toFixed(2);
}

export function formatMRR(companies, plans) {
  let sum = 0;
  for (const c of companies) {
    if (c.subscriptionStatus === 'Activa') {
      const plan = plans.find(p => p.id === c.planId);
      const price = c.customPrice ?? plan?.price;
      if (price) sum += price;
    }
  }
  return sum;
}

export function formatNumber(n) {
  return new Intl.NumberFormat('en-US').format(n);
}

// Churn del mes en curso: empresas que se suspendieron dentro del período
// (companies.suspensionInfo.date, real - lo setea suspendCompany) + empresas
// actualmente en 'Vencida' (sin fecha de transición todavía - nada escribe
// ese estado hoy, ver AUDITORIA_SISTEMA.md; se cuentan igual, sin acotar al
// período, hasta que la automatización de trial lo setee de verdad) +
// empresas que bajaron de plan dentro del período (activity_log 'Plan
// modificado', parseando "Origen → Destino" del detalle contra el precio
// real de cada plan - no hay una tabla de historial de planes separada).
export function computeMonthlyChurn(companies, plans, activityLog) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const planByName = new Map(plans.map(p => [p.name, p]));

  const suspendedThisMonth = companies.filter(c => {
    const suspendedAt = c.suspensionInfo?.date ? new Date(c.suspensionInfo.date) : null;
    return c.subscriptionStatus === 'Suspendida' && suspendedAt && suspendedAt >= monthStart;
  });
  const expiredNow = companies.filter(c => c.subscriptionStatus === 'Vencida');

  const downgradesThisMonth = activityLog.filter(e => {
    if (e.action !== 'Plan modificado' || !e.companyId || e.date < monthStart) return false;
    const [fromName, toName] = String(e.detail || '').split('→').map(s => s.trim());
    const fromPlan = planByName.get(fromName);
    const toPlan = planByName.get(toName);
    return fromPlan && toPlan && toPlan.price < fromPlan.price;
  });

  const churnedIds = new Set([
    ...suspendedThisMonth.map(c => c.id),
    ...expiredNow.map(c => c.id),
    ...downgradesThisMonth.map(e => e.companyId)
  ]);

  return { count: churnedIds.size, limitedData: companies.length < 5 };
}
