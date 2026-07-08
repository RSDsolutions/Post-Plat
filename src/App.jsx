import React, { useEffect } from 'react';
import { useStore } from './store/useStore.js';
import { demoCompanies } from './data/companies.js';
import { demoPlans } from './data/plans.js';
import { demoActivityLog } from './data/activityLog.js';
import { applyBrandColors } from './lib/brand.js';
import Layout from './components/layout/Layout.jsx';

export default function App() {
  const initData = useStore(state => state.initData);
  const brand = useStore(state => state.brand);

  useEffect(() => {
    initData(demoCompanies, demoPlans, demoActivityLog);
    applyBrandColors(brand.color);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Layout />;
}
