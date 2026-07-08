import React, { useEffect } from 'react';
import { useStore } from './store/useStore.js';
import { demoCompanies } from './data/companies.js';
import { demoPlans } from './data/plans.js';
import { demoActivityLog } from './data/activityLog.js';
import { applyBrandColors } from './lib/brand.js';
import Layout from './components/layout/Layout.jsx';
import Login from './components/pages/Login.jsx';

export default function App() {
  const isAuthenticated = useStore(state => state.isAuthenticated);
  const initData = useStore(state => state.initData);
  const brand = useStore(state => state.brand);

  useEffect(() => {
    initData(demoCompanies, demoPlans, demoActivityLog);
    applyBrandColors(brand.color);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAuthenticated) {
    return <Login />;
  }

  return <Layout />;
}
