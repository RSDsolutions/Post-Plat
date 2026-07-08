export function formatUSD(n) {
  return '$' + Number(n).toFixed(2);
}

export function formatMRR(companies, plans) {
  let sum = 0;
  for (const c of companies) {
    if (c.subscriptionStatus === 'Activa') {
      const plan = plans.find(p => p.id === c.planId);
      if (plan) sum += plan.price;
    }
  }
  return sum;
}

export function formatNumber(n) {
  return new Intl.NumberFormat('en-US').format(n);
}
