import React, { useEffect } from 'react';
import { useStore } from './store/useStore.js';
import { fetchCompanies, fetchPlans, fetchActivityLog } from './lib/supabaseHelpers.js';
import { transformCompany, transformPlan, transformActivityEvent } from './lib/transforms.js';
import { applyBrandColors } from './lib/brand.js';
import Layout from './components/layout/Layout.jsx';
import StoreLayout from './components/layout/StoreLayout.jsx';
import StoreManagerLayout from './components/layout/StoreManagerLayout.jsx';
import POSLayout from './components/layout/POSLayout.jsx';
import Login from './components/pages/Login.jsx';

export default function App() {
  const isAuthenticated = useStore(state => state.isAuthenticated);
  const userRole = useStore(state => state.userRole);
  const initData = useStore(state => state.initData);
  const brand = useStore(state => state.brand);
  const restoreAuth = useStore(state => state.restoreAuth);

  useEffect(() => {
    // Restore authentication from localStorage
    restoreAuth();
    applyBrandColors(brand.color);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const loadData = async () => {
      try {
        const [companies, plans, activityLog] = await Promise.all([
          fetchCompanies(),
          fetchPlans(),
          fetchActivityLog()
        ]);

        const transformedCompanies = companies.map(transformCompany);
        const transformedPlans = plans.map(transformPlan);
        const transformedActivityLog = (activityLog || []).map(transformActivityEvent);

        initData(transformedCompanies, transformedPlans, transformedActivityLog);
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

  // Show correct layout based on user role
  switch (userRole) {
    case 'admin':
      return <Layout />;
    case 'gerente':
      return <StoreManagerLayout />;
    case 'operario':
    case 'vendedor':
      return <POSLayout />;
    default:
      return <StoreLayout />;
  }
}
