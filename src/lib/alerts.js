import { daysFrom, DEMO_DATE } from './dates.js';

export function generateAlerts(companies, plans, demoDate = DEMO_DATE) {
  const alerts = [];

  companies.forEach(company => {
    if (company.subscriptionStatus === 'Suspendida') return;

    if (company.cert && company.cert.expiresAt) {
      const certDays = daysFrom(company.cert.expiresAt, demoDate);
      if (certDays <= 0) {
        alerts.push({
          id: `cert_exp_${company.id}`,
          severity: 'danger',
          type: 'cert_expired',
          companyId: company.id,
          companyName: company.nombreComercial,
          message: 'Certificado de firma electrónica vencido.',
          attended: false
        });
      } else if (certDays <= 30) {
        alerts.push({
          id: `cert_expiring_${company.id}`,
          severity: 'warning',
          type: 'cert_expiring',
          companyId: company.id,
          companyName: company.nombreComercial,
          message: `Certificado vence en ${certDays} días.`,
          attended: false
        });
      }
    }

    const subDays = daysFrom(company.subscriptionRenewal, demoDate);
    if (subDays <= 0 && company.subscriptionStatus !== 'Vencida') {
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
    } else if (subDays <= 15) {
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
    if (plan) {
      const limit = plan.comprobantesLimit;
      const usage = company.monthlyComprobantes;
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
