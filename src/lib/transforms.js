// DB row -> UI shape mappings for companies/plans, shared between App.jsx
// (initial load) and useStore.js (re-syncing local state after a write, so
// the admin doesn't see stale fields until the next full page load).

const SUBSCRIPTION_STATUS_LABELS = {
  activa: 'Activa',
  suspendida: 'Suspendida',
  cancelada: 'Cancelada',
  vencida: 'Vencida'
};

export const transformCompany = (dbCompany) => ({
  id: dbCompany.id,
  ruc: dbCompany.ruc,
  razonSocial: dbCompany.razon_social,
  nombreComercial: dbCompany.nombre_comercial,
  address: dbCompany.direccion || dbCompany.address,
  city: dbCompany.city,
  email: dbCompany.email_facturacion || dbCompany.email,
  phone: dbCompany.telefono_facturacion || dbCompany.phone,
  planId: dbCompany.plan_id,
  subscriptionStatus: SUBSCRIPTION_STATUS_LABELS[dbCompany.subscription_status] || 'Activa',
  subscriptionStart: dbCompany.subscription_start ? new Date(dbCompany.subscription_start) : null,
  subscriptionRenewal: dbCompany.subscription_renewal ? new Date(dbCompany.subscription_renewal) : null,
  billingCycle: 'mensual',
  monthlyComprobantes: dbCompany.monthly_comprobantes || 0,
  prevMonthComprobantes: dbCompany.prev_month_comprobantes || 0,
  activeUsers: dbCompany.active_users || 0,
  branches: dbCompany.branches || 0,
  paymentStatus: dbCompany.payment_status || 'Al día',
  suspensionInfo: dbCompany.suspension_info || null,
  internalNotes: dbCompany.internal_notes || '',
  // The real cert (path + upload date) lives on billing_configs, uploaded by
  // the client themselves via BillingConfiguration.jsx - holder name/expiry
  // are parsed client-side at upload time and aren't persisted anywhere, so
  // this is the most the admin can honestly see without re-parsing the file.
  certUploaded: !!dbCompany.billing_configs?.cert_storage_path,
  certUploadedAt: dbCompany.billing_configs?.cert_uploaded_at ? new Date(dbCompany.billing_configs.cert_uploaded_at) : null,
  createdAt: dbCompany.created_at ? new Date(dbCompany.created_at) : null,
  adminEmail: dbCompany.admin_email,
  regimen: dbCompany.regimen || 'General',
  llevaContabilidad: dbCompany.lleva_contabilidad || false,
  environment: dbCompany.environment_type === 'produccion' ? 'Producción' : 'Pruebas',
  logoUrl: dbCompany.logo_url || null,
  customPrice: dbCompany.custom_price != null ? Number(dbCompany.custom_price) : null,
  trialEndsAt: dbCompany.trial_ends_at ? new Date(dbCompany.trial_ends_at) : null,
  comprobantesPeriodStart: dbCompany.comprobantes_period_start || null
});

export const transformActivityEvent = (dbEvent) => ({
  id: dbEvent.id,
  action: dbEvent.action,
  date: dbEvent.created_at ? new Date(dbEvent.created_at) : new Date(),
  company: dbEvent.companies?.nombre_comercial || '—',
  detail: dbEvent.description || '',
  user: dbEvent.users?.name || 'Administrador'
});

export const transformPlan = (dbPlan) => ({
  id: dbPlan.id,
  name: dbPlan.name,
  price: Number(dbPlan.price) || 0,
  comprobantesLimit: dbPlan.max_invoices_monthly ?? null,
  usersLimit: dbPlan.max_users ?? null,
  branchesLimit: dbPlan.max_branches ?? null,
  productsLimit: dbPlan.max_products ?? null,
  posLimit: dbPlan.max_pos ?? null,
  description: dbPlan.description || '',
  features: Array.isArray(dbPlan.features) ? dbPlan.features : [],
  color: 'emerald'
});
