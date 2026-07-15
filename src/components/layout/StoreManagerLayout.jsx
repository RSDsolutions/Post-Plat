import React from 'react';
import { useStore } from '../../store/useStore.js';
import StoreManagerSidebar from './StoreManagerSidebar.jsx';
import StoreManagerTopBar from './StoreManagerTopBar.jsx';
import StoreManagerDashboard from '../pages/StoreManagerDashboard.jsx';
import AccountantDashboard from '../pages/AccountantDashboard.jsx';
import Branches from '../pages/Branches.jsx';
import InventoryManagement from '../pages/InventoryManagement.jsx';
import Reports from '../pages/Reports.jsx';
import InvoiceManagement from '../pages/InvoiceManagement.jsx';
import UserManagement from '../pages/UserManagement.jsx';
import CustomerManagement from '../pages/CustomerManagement.jsx';
import StoreSettings from '../pages/StoreSettings.jsx';
import BillingConfiguration from '../pages/BillingConfiguration.jsx';
import Accounting from '../pages/Accounting.jsx';
import Toast from '../ui/Toast.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';

export default function StoreManagerLayout() {
  const { activePage, userRole, panelMode } = useStore();

  // El contador entra al mismo layout que el gerente (Fase 5) pero con un
  // dashboard de entrada distinto - resumen contable en vez de comercial.
  // Reutiliza las mismas páginas para todo lo demás; el sidebar ya filtra
  // qué secciones ve cada uno por permiso (can()).
  const DashboardContent = userRole === 'contador' ? AccountantDashboard : StoreManagerDashboard;

  let Content;
  switch (activePage) {
    case 'dashboard': Content = DashboardContent; break;
    case 'branches': Content = Branches; break;
    case 'inventory': Content = InventoryManagement; break;
    case 'reports': Content = Reports; break;
    case 'invoices': Content = InvoiceManagement; break;
    case 'accounting': Content = Accounting; break;
    case 'cashiers': Content = UserManagement; break;
    case 'customers': Content = CustomerManagement; break;
    case 'settings': Content = StoreSettings; break;
    case 'billing': Content = BillingConfiguration; break;
    default: Content = DashboardContent;
  }

  return (
    <div
      data-panel-mode={panelMode}
      className="flex h-screen overflow-hidden bg-panel-bg text-panel-text font-sans p-3 sm:p-4 lg:p-6 lg:gap-4"
    >
      <StoreManagerSidebar />
      <div className="flex flex-col flex-1 overflow-hidden w-full min-w-0 relative">
        <StoreManagerTopBar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden pt-4 lg:pt-6 pb-24 lg:pr-2">
          <Content />
        </main>
      </div>
      <Toast />
      <ConfirmDialog />
    </div>
  );
}
