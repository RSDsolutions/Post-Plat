// Derived "health" signal for a client company - never persisted, computed
// on the fly from data already loaded in bulk (fetchCompanies/fetchPlans),
// so it can be shown as a column in Companies.jsx without an extra query
// per row. Deliberately simple: a handful of real signals, not a model.

export function computeHealthScore(company, plan, invoiceUsage) {
  const reasons = [];
  let score = 100;

  if (company.subscriptionStatus === 'Suspendida') {
    score -= 50;
    reasons.push('Suscripción suspendida');
  } else if (company.subscriptionStatus === 'Vencida') {
    score -= 35;
    reasons.push('Suscripción vencida');
  }

  if (company.environment === 'Producción' && !company.certUploaded) {
    score -= 20;
    reasons.push('Sin certificado de firma en producción');
  }

  if (!company.branches || company.branches === 0) {
    score -= 15;
    reasons.push('Sin sucursales configuradas');
  }

  if (plan?.comprobantesLimit) {
    const usage = (invoiceUsage?.current || 0) / plan.comprobantesLimit;
    if (usage >= 1) {
      score -= 15;
      reasons.push('Límite de facturas alcanzado');
    } else if (usage >= 0.85) {
      score -= 5;
      reasons.push('Consumo de facturas alto');
    }
  }

  if (company.trialEndsAt && company.trialEndsAt.getTime() < Date.now()) {
    score -= 20;
    reasons.push('Período de prueba vencido');
  }

  score = Math.max(0, Math.min(100, score));
  const level = score >= 80 ? 'Alto' : score >= 50 ? 'Medio' : 'Bajo';
  return { score, level, reasons };
}

// Onboarding checklist - needs a couple of counts CompanyDetail already has
// to hand (branches with a POS, cashiers, authorized invoices), so this is
// pure too; the fetching happens once in CompanyDetail, not per list row.
export function computeOnboardingChecklist({ certUploaded, branchesWithPos, cashierCount, authorizedInvoiceCount }) {
  return [
    { key: 'cert', label: 'Certificado de firma cargado', done: !!certUploaded },
    { key: 'branch', label: 'Al menos una sucursal con punto de venta', done: branchesWithPos > 0 },
    { key: 'cashier', label: 'Al menos un cajero creado', done: cashierCount > 0 },
    { key: 'invoice', label: 'Primera factura autorizada por el SRI', done: authorizedInvoiceCount > 0 }
  ];
}
