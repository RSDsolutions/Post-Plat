import React from 'react';
import { useStore } from '../../store/useStore.js';
import StoreManagerSidebar from './StoreManagerSidebar.jsx';
import StoreManagerTopBar from './StoreManagerTopBar.jsx';
import StoreManagerDashboard from '../pages/StoreManagerDashboard.jsx';
import InventoryManagement from '../pages/InventoryManagement.jsx';
import SalesAnalytics from '../pages/SalesAnalytics.jsx';
import InvoiceManagement from '../pages/InvoiceManagement.jsx';
import CashierManagement from '../pages/CashierManagement.jsx';
import CustomerManagement from '../pages/CustomerManagement.jsx';
import StoreSettings from '../pages/StoreSettings.jsx';
import Toast from '../ui/Toast.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';

export default function StoreManagerLayout() {
  const { activePage } = useStore();

  let Content;
  switch (activePage) {
    case 'dashboard': Content = StoreManagerDashboard; break;
    case 'inventory': Content = InventoryManagement; break;
    case 'sales': Content = SalesAnalytics; break;
    case 'invoices': Content = InvoiceManagement; break;
    case 'cashiers': Content = CashierManagement; break;
    case 'customers': Content = CustomerManagement; break;
    case 'settings': Content = StoreSettings; break;
    default: Content = StoreManagerDashboard;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans p-6 gap-4">
      <StoreManagerSidebar />
      <div className="flex flex-col flex-1 overflow-hidden w-full relative">
        <StoreManagerTopBar />
        <main className="flex-1 overflow-y-auto pt-6 pb-24 pr-2">
          <Content />
        </main>
      </div>
      <Toast />
      <ConfirmDialog />
    </div>
  );
}
