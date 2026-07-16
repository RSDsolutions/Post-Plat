import React, { useEffect } from 'react';
import { useStore } from './store/useStore.js';
import { fetchCompanies, fetchPlans, fetchActivityLog, fetchMonthlyInvoiceCounts } from './lib/supabaseHelpers.js';
import { transformCompany, transformPlan, transformActivityEvent } from './lib/transforms.js';
import { applyBrandColors } from './lib/brand.js';
import Layout from './components/layout/Layout.jsx';
import StoreManagerLayout from './components/layout/StoreManagerLayout.jsx';
import POSLayout from './components/layout/POSLayout.jsx';
import Login from './components/pages/Login.jsx';

function ImpersonationBanner() {
  const impersonating = useStore(state => state.impersonating);
  const exitImpersonation = useStore(state => state.exitImpersonation);
  const currentUser = useStore(state => state.currentUser);

  if (!impersonating) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-zinc-950 px-4 py-2 flex items-center justify-center gap-3 text-sm font-bold shadow-lg">
      <span>Viendo como {currentUser?.name || 'cliente'} — modo soporte</span>
      <button
        onClick={exitImpersonation}
        className="bg-zinc-950 text-amber-400 px-3 py-1 rounded-lg text-xs uppercase tracking-wider hover:bg-zinc-800 transition-colors"
      >
        Volver al panel admin
      </button>
    </div>
  );
}

export default function App() {
  const isAuthenticated = useStore(state => state.isAuthenticated);
  const userRole = useStore(state => state.userRole);
  const initData = useStore(state => state.initData);
  const brand = useStore(state => state.brand);
  const restoreAuth = useStore(state => state.restoreAuth);
  const impersonating = useStore(state => state.impersonating);

  useEffect(() => {
    // Restaura la sesión de Supabase Auth si hay una vigente (ver
    // useStore.js restoreAuth) - ya no lee un objeto propio de localStorage.
    restoreAuth();
    applyBrandColors(brand.color);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const loadData = async () => {
      try {
        const [companies, plans, activityLog, monthlyInvoiceCounts] = await Promise.all([
          fetchCompanies(),
          fetchPlans(),
          fetchActivityLog(),
          // Vacío (no error) para cualquier rol que no sea admin de plataforma -
          // ver get_monthly_invoice_counts en la migración de límites de plan.
          fetchMonthlyInvoiceCounts().catch(() => ({}))
        ]);

        const transformedCompanies = companies.map(transformCompany);
        const transformedPlans = plans.map(transformPlan);
        const transformedActivityLog = (activityLog || []).map(transformActivityEvent);

        initData(transformedCompanies, transformedPlans, transformedActivityLog, monthlyInvoiceCounts);
      } catch (error) {
        console.error('Error loading data from Supabase:', error);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Login />;
  }

  // Show correct layout based on user role. contador entra por el mismo
  // StoreManagerLayout que gerente desde la Fase 5 (antes tenía su propio
  // StoreLayout legado, retirado) - el sidebar y el dashboard de entrada ya
  // se resuelven por rol/permiso adentro de ese layout, no acá.
  let ActiveLayout;
  switch (userRole) {
    case 'admin':
      ActiveLayout = Layout;
      break;
    case 'gerente':
    case 'contador':
      ActiveLayout = StoreManagerLayout;
      break;
    case 'operario':
    case 'vendedor':
      ActiveLayout = POSLayout;
      break;
    default:
      ActiveLayout = StoreManagerLayout;
  }

  return (
    <>
      {impersonating && <ImpersonationBanner />}
      <ActiveLayout />
    </>
  );
}
