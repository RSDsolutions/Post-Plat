import React, { useEffect } from 'react';
import { useStore } from './store/useStore.js';
import { supabase } from './lib/supabase.js';
import { fetchCompanies, fetchPlans, fetchActivityLog, fetchMonthlyInvoiceCounts } from './lib/supabaseHelpers.js';
import { transformCompany, transformPlan, transformActivityEvent } from './lib/transforms.js';
import { applyBrandColors } from './lib/brand.js';
import Layout from './components/layout/Layout.jsx';
import StoreManagerLayout from './components/layout/StoreManagerLayout.jsx';
import POSLayout from './components/layout/POSLayout.jsx';
import Login from './components/pages/Login.jsx';
import ResetPassword from './components/pages/ResetPassword.jsx';

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
  const passwordRecoveryMode = useStore(state => state.passwordRecoveryMode);
  const enterPasswordRecoveryMode = useStore(state => state.enterPasswordRecoveryMode);

  useEffect(() => {
    // supabase-js detecta sola los tokens de recuperación en la URL (el link
    // del correo de request-password-reset.js) y arma una sesión real para
    // poder llamar auth.updateUser() - pero dispara el evento PASSWORD_RECOVERY
    // en vez de SIGNED_IN para que la app pueda distinguirlo de un login
    // normal. Sin este listener, restoreAuth() (abajo) trataría esa sesión
    // como si el usuario hubiera iniciado sesión de verdad y lo mandaría
    // directo al dashboard, saltándose por completo la pantalla para elegir
    // la contraseña nueva.
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        enterPasswordRecoveryMode();
      }
    });

    // Restaura la sesión de Supabase Auth si hay una vigente (ver
    // useStore.js restoreAuth) - ya no lee un objeto propio de localStorage.
    restoreAuth();
    applyBrandColors(brand.color);

    return () => authListener?.subscription?.unsubscribe();
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

  // Antes que isAuthenticated a propósito: si venimos de un link de
  // recuperación, Supabase ya armó una sesión real (necesaria para
  // updateUser), pero eso no debe mandar a nadie al dashboard sin haber
  // elegido antes una contraseña nueva.
  if (passwordRecoveryMode) {
    return <ResetPassword />;
  }

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
