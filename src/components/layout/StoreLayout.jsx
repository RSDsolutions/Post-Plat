import React from 'react';
import { useStore } from '../../store/useStore.js';
import StoreSidebar from './StoreSidebar.jsx';
import StoreTopBar from './StoreTopBar.jsx';
import StoreDashboard from '../pages/StoreDashboard.jsx';
import StoreSales from '../pages/StoreSales.jsx';
import StoreInventory from '../pages/StoreInventory.jsx';
import StoreCustomers from '../pages/StoreCustomers.jsx';
import StoreReports from '../pages/StoreReports.jsx';
import Toast from '../ui/Toast.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';

export default function StoreLayout() {
  const { activePage } = useStore();

  let Content;
  switch (activePage) {
    case 'dashboard': Content = StoreDashboard; break;
    case 'sales': Content = StoreSales; break;
    case 'inventory': Content = StoreInventory; break;
    case 'customers': Content = StoreCustomers; break;
    case 'reports': Content = StoreReports; break;
    default: Content = StoreDashboard;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans p-6 gap-4">
      <StoreSidebar />
      <div className="flex flex-col flex-1 overflow-hidden w-full relative">
        <StoreTopBar />
        <main className="flex-1 overflow-y-auto pt-6 pb-24 pr-2">
          <Content />
        </main>
      </div>
      <Toast />
      <ConfirmDialog />
    </div>
  );
}
