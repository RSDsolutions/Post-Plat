import React, { useEffect } from 'react';
import { useStore } from './store/useStore.js';
import { fetchCompanies, fetchPlans, fetchActivityLog } from './lib/supabaseHelpers.js';
import { applyBrandColors } from './lib/brand.js';
import Layout from './components/layout/Layout.jsx';
import Login from './components/pages/Login.jsx';

const transformCompany = (dbCompany) => ({
  id: dbCompany.id,
  ruc: dbCompany.ruc,
  razonSocial: dbCompany.razon_social,
  nombreComercial: dbCompany.nombre_comercial,
  address: dbCompany.address,
  city: dbCompany.city,
  email: dbCompany.email,
  phone: dbCompany.phone,
  planId: dbCompany.plan_id,
  subscriptionStatus: dbCompany.subscription_status === 'activa' ? 'Activa' :
                     dbCompany.subscription_status === 'suspendida' ? 'Suspendida' : 'Activa',
  subscriptionStart: new Date(dbCompany.subscription_start),
  subscriptionRenewal: new Date(dbCompany.subscription_renewal),
  billingCycle: 'mensual',
  monthlyComprobantes: 0,
  prevMonthComprobantes: 0,
  activeUsers: 0,
  branches: 0,
  paymentStatus: 'Al día',
  paymentHistory: [],
  suspensionInfo: null,
  internalNotes: '',
  cert: null,
  createdAt: new Date(dbCompany.created_at),
  adminEmail: dbCompany.admin_email,
  // Campos opcionales para compatibilidad
  regimen: 'General',
  llevaContabilidad: false,
  environment: 'Producción',
  establishment: '001',
  pointOfSale: '001'
});

const transformPlan = (dbPlan) => ({
  id: dbPlan.id,
  name: dbPlan.name,
  price: dbPlan.price,
  comprobantesLimit: dbPlan.comprobantes_limit || 100,
  description: dbPlan.description,
  features: [],
  usersLimit: 10,
  branchesLimit: 5,
  includesProduction: true,
  includesLots: true,
  color: 'emerald'
});

export default function App() {
  const isAuthenticated = useStore(state => state.isAuthenticated);
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

        initData(transformedCompanies, transformedPlans, activityLog || []);
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

  return <Layout />;
}
