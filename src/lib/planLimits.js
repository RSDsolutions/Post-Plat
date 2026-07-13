// Plan-limit + feature-flag logic, shared by every screen that creates a
// company-scoped resource (cashiers, branches, points of sale, products) or
// needs to know if a feature is enabled for the current company. Pure
// functions only - callers fetch counts/overrides and pass them in.

const LIMIT_FIELDS = {
  invoices: { planField: 'comprobantesLimit', label: 'facturas este mes' },
  users: { planField: 'usersLimit', label: 'usuarios' },
  branches: { planField: 'branchesLimit', label: 'sucursales' },
  products: { planField: 'productsLimit', label: 'productos' },
  pos: { planField: 'posLimit', label: 'puntos de venta' }
};

export function checkLimit(kind, plan, currentCount) {
  const field = LIMIT_FIELDS[kind];
  if (!field) throw new Error(`Límite desconocido: ${kind}`);
  const limit = plan?.[field.planField];
  if (limit == null) return { ok: true, limit: null, current: currentCount, label: field.label };
  return { ok: currentCount < limit, limit, current: currentCount, label: field.label };
}

export function limitReachedMessage(check, planName) {
  return `Alcanzaste el límite de ${check.limit} ${check.label} de tu plan${planName ? ` (${planName})` : ''}. Actualiza tu plan para continuar.`;
}

// overrides: rows from company_feature_overrides ({ feature_key, enabled })
export function getEffectiveFeatures(plan, overrides = []) {
  const features = new Set(plan?.features || []);
  for (const o of overrides) {
    if (o.enabled) features.add(o.feature_key);
    else features.delete(o.feature_key);
  }
  return features;
}

export function hasFeature(plan, overrides, key) {
  return getEffectiveFeatures(plan, overrides).has(key);
}
