import { create } from 'zustand';
import { addDays, computeNextRenewal } from '../lib/dates.js';
import { generateAlerts } from '../lib/alerts.js';
import { formatUSD } from '../lib/format.js';
import { transformCompany } from '../lib/transforms.js';
import {
  createCompany, updateCompany, createBranch, createPointOfSale,
  createCompanyGerente, logActivity, updatePlan as updatePlanInDb,
  fetchCompanyGerente, createPaymentRecord
} from '../lib/supabaseHelpers.js';

function generateTempPassword() {
  return Math.random().toString(36).slice(-5) + Math.random().toString(36).slice(-5).toUpperCase();
}

export const useStore = create((set, get) => ({
  brand: {
    name: 'Kinetic',
    color: '#10b981',
    colorDark: '#059669',
    colorSoft: 'rgba(16, 185, 129, 0.1)',
  },

  // Authentication
  isAuthenticated: false,
  currentUser: null,
  userRole: null,
  isAuthenticating: false,
  // Set while an admin is impersonating a company's gerente ("ver como
  // cliente") - holds who to restore on exitImpersonation. Deliberately
  // never written to localStorage (see impersonateCompany), so a hard
  // refresh mid-impersonation falls back to the real admin session.
  impersonating: null,

  activePage: 'dashboard',
  sidebarCollapsed: false,
  mobileMenuOpen: false,
  companies: [],
  plans: [],
  activityLog: [],
  alerts: [],

  selectedCompanyId: null,
  companyDetailTab: 'resumen',
  wizardOpen: false,
  wizardStep: 1,
  wizardData: {},
  editCompanyId: null,
  toasts: [],
  confirmDialog: null,
  globalSearch: '',

  companySearch: '',
  companyStatusFilter: 'all',
  companyPlanFilter: 'all',

  // Auth actions
  setCurrentUser: (user, role) => {
    const authState = { currentUser: user, userRole: role, isAuthenticated: true, isAuthenticating: false };
    set(authState);
    // Persist to localStorage
    localStorage.setItem('postplat_auth', JSON.stringify({ user, role }));
  },
  logout: () => {
    set({ currentUser: null, userRole: null, isAuthenticated: false, activePage: 'dashboard' });
    localStorage.removeItem('postplat_auth');
  },
  setIsAuthenticating: (authenticating) => set({ isAuthenticating: authenticating }),
  restoreAuth: () => {
    const saved = localStorage.getItem('postplat_auth');
    if (saved) {
      try {
        const { user, role } = JSON.parse(saved);
        set({ currentUser: user, userRole: role, isAuthenticated: true, isAuthenticating: false });
        return true;
      } catch (e) {
        console.error('Error restoring auth:', e);
        localStorage.removeItem('postplat_auth');
        return false;
      }
    }
    return false;
  },

  // "Ver como cliente" - lets an admin drop into a company's gerente view
  // for support, without knowing/resetting their password. Logs who did it
  // to activity_log before switching identity (addActivityEvent reads
  // currentUser at call time, so it must run while currentUser is still
  // the admin).
  impersonateCompany: async (companyId) => {
    const { showToast, currentUser, userRole, companies, addActivityEvent } = get();
    const comp = companies.find(c => c.id === companyId);
    try {
      const gerente = await fetchCompanyGerente(companyId);
      if (!gerente) {
        showToast('error', 'Esta empresa no tiene un usuario gerente activo');
        return;
      }
      await addActivityEvent('Admin ingresó como soporte', companyId, comp?.nombreComercial, `Impersonando a ${gerente.name} (${gerente.email})`);
      set({
        impersonating: { adminUser: currentUser, adminRole: userRole },
        currentUser: gerente,
        userRole: gerente.role,
        activePage: 'dashboard',
        selectedCompanyId: null
      });
    } catch (error) {
      console.error('Error impersonating company:', error);
      showToast('error', error.message || 'Error al entrar como soporte');
    }
  },
  exitImpersonation: () => {
    const { impersonating } = get();
    if (!impersonating) return;
    set({
      currentUser: impersonating.adminUser,
      userRole: impersonating.adminRole,
      impersonating: null,
      activePage: 'companies'
    });
  },

  setBrand: (name, color) => set((state) => ({ brand: { ...state.brand, name, color } })),
  setActivePage: (activePage) => set({ activePage, selectedCompanyId: null, mobileMenuOpen: false }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleMobileMenu: () => set((state) => ({ mobileMenuOpen: !state.mobileMenuOpen })),
  closeMobileMenu: () => set({ mobileMenuOpen: false }),
  selectCompany: (id) => set({ selectedCompanyId: id, activePage: 'companies', companyDetailTab: 'resumen' }),
  setCompanyDetailTab: (tab) => set({ companyDetailTab: tab }),

  openWizard: () => set({ wizardOpen: true, wizardStep: 1, wizardData: {} }),
  closeWizard: () => set({ wizardOpen: false }),
  setWizardStep: (step) => set({ wizardStep: step }),
  setWizardData: (data) => set((state) => ({ wizardData: { ...state.wizardData, ...data } })),

  submitWizard: async () => {
    const { wizardData, plans, addActivityEvent, recalculateAlerts, showToast, openConfirm, currentUser } = get();
    const selectedPlan = plans.find(p => p.id === wizardData.planId) || plans[0];
    const isAnnual = wizardData.billingCycle === 'anual';
    const renewalDays = isAnnual ? 365 : 30;
    const environmentType = wizardData.environment === 'Produccion' ? 'produccion' : 'pruebas';
    const now = new Date();

    try {
      const dbCompany = await createCompany({
        ruc: wizardData.ruc,
        razon_social: wizardData.razonSocial,
        nombre_comercial: wizardData.nombreComercial,
        address: wizardData.address,
        direccion: wizardData.address,
        lleva_contabilidad: wizardData.llevaContabilidad || false,
        regimen: wizardData.regimen || 'General',
        environment_type: environmentType,
        plan_id: selectedPlan.id,
        subscription_status: 'activa',
        subscription_start: now.toISOString(),
        subscription_renewal: addDays(now, renewalDays).toISOString(),
        payment_status: 'Al día',
        admin_email: wizardData.adminEmail
      });

      // First branch + point of sale so the new client can actually invoice
      // immediately - a company with zero branches can't sell anything (see
      // the Sucursales work: POS is blocked without a resolvable branch+POS).
      const branch = await createBranch({
        companyId: dbCompany.id,
        name: 'Matriz',
        code: '001',
        address: wizardData.address,
        establishment: wizardData.establishment || '001'
      });

      await createPointOfSale({
        company_id: dbCompany.id,
        branch_id: branch.id,
        nombre: 'Caja Principal',
        numero_establecimiento: wizardData.establishment || '001',
        numero_pos: wizardData.pointOfSale || '001',
        sequential_start: wizardData.sequentialStart || 1,
        sequential_current: wizardData.sequentialStart || 1,
        status: 'activo',
        is_active: true
      });

      // First login for the client, since there's no self-serve signup flow.
      // The password is only ever visible right now - shown in a dialog that
      // stays open (not a toast) so there's actually time to copy it.
      const tempPassword = generateTempPassword();
      await createCompanyGerente({
        companyId: dbCompany.id,
        email: wizardData.adminEmail,
        password: tempPassword,
        name: `Gerente ${wizardData.nombreComercial}`,
        adminId: currentUser?.id
      });

      set((state) => ({
        companies: [transformCompany(dbCompany), ...state.companies],
        wizardOpen: false
      }));

      await addActivityEvent('Empresa creada', dbCompany.id, dbCompany.nombre_comercial, `Instancia lista en modo ${environmentType}`);
      recalculateAlerts();
      get().setActivePage('companies');
      openConfirm(
        'Empresa creada exitosamente',
        `"${dbCompany.nombre_comercial}" ya está lista. Credenciales del gerente (cópialas ahora, no se vuelven a mostrar):\n\nCorreo: ${wizardData.adminEmail}\nContraseña temporal: ${tempPassword}\n\nCompártelas con el cliente por un canal seguro.`,
        () => {}
      );
    } catch (error) {
      console.error('Error creating company:', error);
      showToast('error', error.message || 'Error al crear la empresa');
    }
  },

  openEditCompany: (id) => set({ editCompanyId: id }),
  closeEditCompany: () => set({ editCompanyId: null }),
  saveEditCompany: async (id, data) => {
    const { showToast, addActivityEvent, recalculateAlerts } = get();
    try {
      const environmentType = data.environment === 'Produccion' ? 'produccion' : 'pruebas';
      const dbCompany = await updateCompany(id, {
        razon_social: data.razonSocial,
        nombre_comercial: data.nombreComercial,
        address: data.address,
        direccion: data.address,
        regimen: data.regimen,
        lleva_contabilidad: data.llevaContabilidad,
        environment_type: environmentType
      });
      // Merge just the changed fields rather than re-transforming dbCompany -
      // updateCompany()'s return has no billing_configs embed, so a full
      // re-transform would wrongly reset the cert-uploaded flag to false.
      set((state) => ({
        companies: state.companies.map(c => c.id === id ? {
          ...c,
          razonSocial: data.razonSocial,
          nombreComercial: data.nombreComercial,
          address: data.address,
          regimen: data.regimen,
          llevaContabilidad: data.llevaContabilidad,
          environment: environmentType === 'produccion' ? 'Producción' : 'Pruebas'
        } : c),
        editCompanyId: null
      }));
      await addActivityEvent('Empresa actualizada', id, dbCompany.nombre_comercial, 'Datos modificados');
      recalculateAlerts();
      showToast('success', 'Datos guardados correctamente.');
    } catch (error) {
      console.error('Error saving company:', error);
      showToast('error', error.message || 'Error al guardar los datos');
    }
  },

  suspendCompany: async (id, motive, reason) => {
    const { showToast, addActivityEvent, recalculateAlerts, companies } = get();
    const comp = companies.find(c => c.id === id);
    const suspensionInfo = { date: new Date().toISOString(), reason, motive };
    try {
      await updateCompany(id, {
        subscription_status: 'suspendida',
        payment_status: 'Vencido',
        suspension_info: suspensionInfo
      });
      set((state) => ({
        companies: state.companies.map(c =>
          c.id === id ? { ...c, subscriptionStatus: 'Suspendida', paymentStatus: 'Vencido', suspensionInfo } : c
        )
      }));
      await addActivityEvent('Empresa suspendida', id, comp.nombreComercial, `Motivo: ${reason}`);
      recalculateAlerts();
      showToast('warning', 'Empresa suspendida correctamente.');
    } catch (error) {
      console.error('Error suspending company:', error);
      showToast('error', error.message || 'Error al suspender la empresa');
    }
  },

  reactivateCompany: async (id) => {
    const { showToast, addActivityEvent, recalculateAlerts, companies, plans } = get();
    const comp = companies.find(c => c.id === id);
    const plan = plans.find(p => p.id === comp.planId);
    const cycleDays = plan?.billingCycle === 'anual' ? 365 : 30;
    const renewal = computeNextRenewal(comp.subscriptionRenewal, cycleDays);
    try {
      await updateCompany(id, {
        subscription_status: 'activa',
        payment_status: 'Al día',
        subscription_renewal: renewal.toISOString(),
        suspension_info: null
      });
      set((state) => ({
        companies: state.companies.map(c =>
          c.id === id ? { ...c, subscriptionStatus: 'Activa', paymentStatus: 'Al día', subscriptionRenewal: renewal, suspensionInfo: null } : c
        )
      }));
      await addActivityEvent('Empresa reactivada', id, comp.nombreComercial, 'Reactivada manualmente');
      recalculateAlerts();
      showToast('success', 'Empresa reactivada.');
    } catch (error) {
      console.error('Error reactivating company:', error);
      showToast('error', error.message || 'Error al reactivar la empresa');
    }
  },

  // Persists the real subscription/status fields (what actually gates
  // access) and, since this session, a real row in the payments ledger too
  // - registerPayment used to only touch companies, so CompanyDetail's
  // itemized history was session-local and vanished on refresh.
  registerPayment: async (companyId, { method = 'Transferencia bancaria', reference = null } = {}) => {
    const { showToast, addActivityEvent, recalculateAlerts, companies, plans } = get();
    const comp = companies.find(c => c.id === companyId);
    const plan = plans.find(p => p.id === comp.planId);
    const amount = comp.customPrice ?? (plan ? plan.price : 0);
    // Extends from the current renewal date if the subscription still has
    // time left (so paying early/on time never loses days), or from today
    // if it already lapsed. Cycle length follows the plan (mensual=30,
    // anual=365) instead of always assuming monthly.
    const cycleDays = plan?.billingCycle === 'anual' ? 365 : 30;
    const renewal = computeNextRenewal(comp.subscriptionRenewal, cycleDays);
    try {
      await updateCompany(companyId, {
        subscription_renewal: renewal.toISOString(),
        subscription_status: 'activa',
        payment_status: 'Al día'
      });
      await createPaymentRecord({ companyId, amount, method, reference });
      set((state) => ({
        companies: state.companies.map(c => c.id === companyId
          ? { ...c, subscriptionRenewal: renewal, subscriptionStatus: 'Activa', paymentStatus: 'Al día' }
          : c)
      }));
      await addActivityEvent('Pago registrado', companyId, comp.nombreComercial, `${formatUSD(amount)} — ${method}`);
      recalculateAlerts();
      showToast('success', 'Pago registrado. Suscripción renovada.');
    } catch (error) {
      console.error('Error registering payment:', error);
      showToast('error', error.message || 'Error al registrar el pago');
    }
  },

  changeCompanyPlan: async (companyId, planId) => {
    const { showToast, addActivityEvent, recalculateAlerts, companies, plans } = get();
    const comp = companies.find(c => c.id === companyId);
    const oldPlan = plans.find(p => p.id === comp.planId);
    const newPlan = plans.find(p => p.id === planId);
    try {
      await updateCompany(companyId, { plan_id: planId });
      set((state) => ({
        companies: state.companies.map(c => c.id === companyId ? { ...c, planId } : c)
      }));
      await addActivityEvent('Plan modificado', companyId, comp.nombreComercial, `${oldPlan?.name || '—'} → ${newPlan?.name || '—'}`);
      recalculateAlerts();
      showToast('success', 'Plan actualizado correctamente.');
    } catch (error) {
      console.error('Error changing plan:', error);
      showToast('error', error.message || 'Error al cambiar el plan');
    }
  },

  updatePlan: async (planId, changes) => {
    const { showToast, addActivityEvent } = get();
    try {
      await updatePlanInDb(planId, { name: changes.name, price: changes.price });
      set((state) => ({
        plans: state.plans.map(p => p.id === planId ? { ...p, ...changes } : p)
      }));
      showToast('success', 'Plan actualizado. El MRR se ha recalculado.');
      await addActivityEvent('Plan modificado', null, changes.name || planId, 'Configuración de precios actualizada');
    } catch (error) {
      console.error('Error updating plan:', error);
      showToast('error', error.message || 'Error al actualizar el plan');
    }
  },

  updateCompanyNotes: async (companyId, notes) => {
    const { showToast } = get();
    try {
      await updateCompany(companyId, { internal_notes: notes });
      set((state) => ({
        companies: state.companies.map(c => c.id === companyId ? { ...c, internalNotes: notes } : c)
      }));
      showToast('success', 'Notas guardadas.');
    } catch (error) {
      console.error('Error saving notes:', error);
      showToast('error', error.message || 'Error al guardar las notas');
    }
  },

  updateCompanyCustomPrice: async (companyId, customPrice) => {
    const { showToast, addActivityEvent, companies } = get();
    const comp = companies.find(c => c.id === companyId);
    try {
      await updateCompany(companyId, { custom_price: customPrice });
      set((state) => ({
        companies: state.companies.map(c => c.id === companyId ? { ...c, customPrice } : c)
      }));
      await addActivityEvent('Precio especial actualizado', companyId, comp?.nombreComercial, customPrice != null ? formatUSD(customPrice) : 'Precio de lista restaurado');
      showToast('success', 'Precio actualizado.');
    } catch (error) {
      console.error('Error updating custom price:', error);
      showToast('error', error.message || 'Error al actualizar el precio');
    }
  },

  updateCompanyTrialEndsAt: async (companyId, trialEndsAt) => {
    const { showToast, companies } = get();
    try {
      await updateCompany(companyId, { trial_ends_at: trialEndsAt ? trialEndsAt.toISOString() : null });
      set((state) => ({
        companies: state.companies.map(c => c.id === companyId ? { ...c, trialEndsAt } : c)
      }));
      showToast('success', 'Período de prueba actualizado.');
    } catch (error) {
      console.error('Error updating trial:', error);
      showToast('error', error.message || 'Error al actualizar el período de prueba');
    }
  },

  setCompanySearch: (q) => set({ companySearch: q }),
  setCompanyStatusFilter: (v) => set({ companyStatusFilter: v }),
  setCompanyPlanFilter: (v) => set({ companyPlanFilter: v }),
  setGlobalSearch: (q) => set({ globalSearch: q }),

  attendAlert: (alertId) => {
    set((state) => ({
      alerts: state.alerts.map(a => a.id === alertId ? { ...a, attended: true } : a)
    }));
  },

  showToast: (type, message) => {
    const id = Date.now();
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }));
    setTimeout(() => get().dismissToast(id), 4000);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })),

  openConfirm: (title, message, onConfirm) => set({ confirmDialog: { title, message, onConfirm } }),
  closeConfirm: () => set({ confirmDialog: null }),

  recalculateAlerts: () => {
    const { companies, plans } = get();
    const existingAttended = get().alerts.filter(a => a.attended).map(a => a.id);
    const newAlerts = generateAlerts(companies, plans).map(a => ({
      ...a,
      attended: existingAttended.includes(a.id)
    }));
    set({ alerts: newAlerts });
  },

  // Persists to activity_log (logActivity) so the audit trail survives a
  // refresh, then mirrors it into local state immediately rather than
  // waiting on a re-fetch. companyId may be null for events not tied to one
  // specific company (e.g. editing a plan's price affects every subscriber).
  addActivityEvent: async (action, companyId, companyName, detail) => {
    const currentUser = get().currentUser;
    try {
      const saved = await logActivity(companyId, action, detail, currentUser?.id || null);
      const event = { id: saved.id, date: new Date(saved.created_at), user: currentUser?.name || 'Administrador', action, company: companyName, detail };
      set((state) => ({ activityLog: [event, ...state.activityLog] }));
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  },

  initData: (companiesData, plansData, logData) => {
     set({ companies: [...companiesData], plans: [...plansData], activityLog: [...logData] });
     get().recalculateAlerts();
  }
}));
