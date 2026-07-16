import { daysFrom } from './dates.js';

export function generateAlerts(companies, plans, referenceDate = new Date(), monthlyInvoiceCounts = {}) {
  const alerts = [];

  companies.forEach(company => {
    if (company.subscriptionStatus === 'Suspendida') return;

    // Expiry isn't tracked (only upload status - see transformCompany), but a
    // production client with no certificate at all can't sign real
    // invoices, which is worth flagging.
    if (company.environment === 'Producción' && !company.certUploaded) {
      alerts.push({
        id: `cert_missing_${company.id}`,
        severity: 'warning',
        type: 'cert_missing',
        companyId: company.id,
        companyName: company.nombreComercial,
        message: 'Ambiente de producción sin certificado de firma cargado.',
        attended: false
      });
    }

    const subDays = company.subscriptionRenewal ? daysFrom(company.subscriptionRenewal, referenceDate) : null;
    if (subDays !== null && subDays <= 0 && company.subscriptionStatus !== 'Vencida') {
        alerts.push({
        id: `sub_exp_${company.id}`,
        severity: 'danger',
        type: 'sub_expired',
        companyId: company.id,
        companyName: company.nombreComercial,
        message: 'Suscripción vencida. Pago pendiente.',
        attended: false
      });
    } else if (company.subscriptionStatus === 'Vencida') {
        alerts.push({
        id: `sub_exp_${company.id}`,
        severity: 'danger',
        type: 'sub_expired',
        companyId: company.id,
        companyName: company.nombreComercial,
        message: 'Suscripción vencida. Pago pendiente.',
        attended: false
      });
    } else if (subDays !== null && subDays <= 15) {
      alerts.push({
        id: `sub_expiring_${company.id}`,
        severity: 'warning',
        type: 'sub_expiring',
        companyId: company.id,
        companyName: company.nombreComercial,
        message: `Suscripción vence en ${subDays} días.`,
        attended: false
      });
    }

    const plan = plans.find(p => p.id === company.planId);
    if (plan && plan.comprobantesLimit) {
      const limit = plan.comprobantesLimit;
      const usage = monthlyInvoiceCounts[company.id]?.current || 0;
      if (usage / limit >= 0.85) {
        alerts.push({
          id: `usage_${company.id}`,
          severity: 'warning',
          type: 'usage_high',
          companyId: company.id,
          companyName: company.nombreComercial,
          message: `Consumo alto: ${usage} de ${limit} comprobantes (${Math.round((usage/limit)*100)}%).`,
          attended: false
        });
      }
    }
  });

  return alerts;
}
