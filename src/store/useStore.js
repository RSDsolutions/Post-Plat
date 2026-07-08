import { create } from 'zustand';
import { DEMO_DATE, addDays } from '../lib/dates.js';
import { generateAlerts } from '../lib/alerts.js';
import { formatUSD } from '../lib/format.js';

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

  activePage: 'dashboard',
  sidebarCollapsed: false,
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
  setCurrentUser: (user, role) => set({ currentUser: user, userRole: role, isAuthenticated: true, isAuthenticating: false }),
  logout: () => set({ currentUser: null, userRole: null, isAuthenticated: false, activePage: 'dashboard' }),
  setIsAuthenticating: (authenticating) => set({ isAuthenticating: authenticating }),

  setBrand: (name, color) => set((state) => ({ brand: { ...state.brand, name, color } })),
  setActivePage: (activePage) => set({ activePage, selectedCompanyId: null }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  selectCompany: (id) => set({ selectedCompanyId: id, activePage: 'companies', companyDetailTab: 'resumen' }),
  setCompanyDetailTab: (tab) => set({ companyDetailTab: tab }),

  openWizard: () => set({ wizardOpen: true, wizardStep: 1, wizardData: {} }),
  closeWizard: () => set({ wizardOpen: false }),
  setWizardStep: (step) => set({ wizardStep: step }),
  setWizardData: (data) => set((state) => ({ wizardData: { ...state.wizardData, ...data } })),

  submitWizard: () => {
    const { wizardData, plans, addActivityEvent, recalculateAlerts, showToast } = get();
    const selectedPlan = plans.find(p => p.id === wizardData.planId) || plans[0];
    const isAnnual = wizardData.billingCycle === 'anual';
    const renewalDays = isAnnual ? 365 : 30;
    
    const newCompany = {
      id: `c_${Date.now()}`,
      ruc: wizardData.ruc || '0190000000001',
      razonSocial: wizardData.razonSocial,
      nombreComercial: wizardData.nombreComercial,
      address: wizardData.address,
      llevaContabilidad: wizardData.llevaContabilidad || false,
      regimen: wizardData.regimen || 'General',
      environment: wizardData.environment || 'Pruebas',
      establishment: wizardData.establishment || '001',
      pointOfSale: wizardData.pointOfSale || '001',
      sequentialStart: wizardData.sequentialStart || 1,
      planId: selectedPlan.id,
      billingCycle: wizardData.billingCycle || 'mensual',
      subscriptionStart: DEMO_DATE,
      subscriptionRenewal: addDays(DEMO_DATE, renewalDays),
      subscriptionStatus: 'Activa',
      paymentStatus: 'Al día',
      cert: wizardData.certFilename ? { filename: wizardData.certFilename, expiresAt: new Date(wizardData.certExpiresAt) } : null,
      monthlyComprobantes: 0,
      prevMonthComprobantes: 0,
      activeUsers: 1,
      branches: 1,
      paymentHistory: [{ date: DEMO_DATE, amount: selectedPlan.price, method: 'Transferencia', status: 'Pagado' }],
      suspensionInfo: null,
      internalNotes: '',
      createdAt: DEMO_DATE,
      adminEmail: wizardData.adminEmail || 'admin@empresa.com'
    };

    set((state) => ({
      companies: [newCompany, ...state.companies],
      wizardOpen: false
    }));

    addActivityEvent('Empresa creada', newCompany.nombreComercial, `Instancia lista en modo ${newCompany.environment.toLowerCase()}`);
    recalculateAlerts();
    showToast('success', 'Empresa creada — instancia lista en modo pruebas');
    get().setActivePage('companies');
  },

  openEditCompany: (id) => set({ editCompanyId: id }),
  closeEditCompany: () => set({ editCompanyId: null }),
  saveEditCompany: (id, data) => {
    set((state) => ({
      companies: state.companies.map(c => c.id === id ? { ...c, ...data } : c),
      editCompanyId: null
    }));
    const comp = get().companies.find(c => c.id === id);
    get().addActivityEvent('Empresa actualizada', comp.nombreComercial, 'Datos modificados');
    get().recalculateAlerts();
    get().showToast('success', 'Datos guardados correctamente.');
  },

  suspendCompany: (id, motive, reason) => {
    set((state) => ({
      companies: state.companies.map(c => 
        c.id === id ? { 
          ...c, 
          subscriptionStatus: 'Suspendida', 
          paymentStatus: 'Vencido',
          suspensionInfo: { date: DEMO_DATE, reason, motive } 
        } : c
      )
    }));
    const comp = get().companies.find(c => c.id === id);
    get().addActivityEvent('Empresa suspendida', comp.nombreComercial, `Motivo: ${reason}`);
    get().recalculateAlerts();
    get().showToast('warning', 'Empresa suspendida correctamente.');
  },

  reactivateCompany: (id) => {
    set((state) => ({
      companies: state.companies.map(c => 
        c.id === id ? { 
          ...c, 
          subscriptionStatus: 'Activa', 
          paymentStatus: 'Al día',
          subscriptionRenewal: addDays(DEMO_DATE, 30),
          suspensionInfo: null 
        } : c
      )
    }));
    const comp = get().companies.find(c => c.id === id);
    get().addActivityEvent('Empresa reactivada', comp.nombreComercial, 'Reactivada manualmente');
    get().recalculateAlerts();
    get().showToast('success', 'Empresa reactivada.');
  },

  registerPayment: (companyId) => {
    set((state) => ({
      companies: state.companies.map(c => {
        if (c.id === companyId) {
          const plan = state.plans.find(p => p.id === c.planId);
          return {
            ...c,
            subscriptionRenewal: addDays(DEMO_DATE, 30),
            subscriptionStatus: 'Activa',
            paymentStatus: 'Al día',
            paymentHistory: [
              { date: DEMO_DATE, amount: plan ? plan.price : 0, method: 'Transferencia bancaria', status: 'Pagado' },
              ...c.paymentHistory
            ]
          };
        }
        return c;
      })
    }));
    const comp = get().companies.find(c => c.id === companyId);
    const plan = get().plans.find(p => p.id === comp.planId);
    get().addActivityEvent('Pago registrado', comp.nombreComercial, `${formatUSD(plan ? plan.price : 0)} — transferencia bancaria`);
    get().recalculateAlerts();
    get().showToast('success', 'Pago registrado. Suscripción renovada.');
  },

  updatePlan: (planId, changes) => {
    set((state) => ({
      plans: state.plans.map(p => p.id === planId ? { ...p, ...changes } : p)
    }));
    get().showToast('success', 'Plan actualizado. El MRR se ha recalculado.');
    get().addActivityEvent('Plan modificado', changes.name || planId, 'Configuración de precios actualizada');
  },

  updateCompanyNotes: (companyId, notes) => {
    set((state) => ({
      companies: state.companies.map(c => c.id === companyId ? { ...c, internalNotes: notes } : c)
    }));
    get().showToast('success', 'Notas guardadas.');
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
    const newAlerts = generateAlerts(companies, plans, DEMO_DATE).map(a => ({
      ...a,
      attended: existingAttended.includes(a.id)
    }));
    set({ alerts: newAlerts });
  },

  addActivityEvent: (action, companyName, detail) => {
    const event = { id: `ev_${Date.now()}`, date: DEMO_DATE, user: 'Administrador', action, company: companyName, detail };
    set((state) => ({ activityLog: [event, ...state.activityLog] }));
  },
  
  initData: (companiesData, plansData, logData) => {
     set({ companies: [...companiesData], plans: [...plansData], activityLog: [...logData] });
     get().recalculateAlerts();
  }
}));
