import React from 'react';
import { useStore } from '../../store/useStore.js';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import Companies from '../pages/Companies.jsx';
import CompanyDetail from '../pages/CompanyDetail.jsx';
import Subscriptions from '../pages/Subscriptions.jsx';
import Activity from '../pages/Activity.jsx';
import BrandConfig from '../pages/BrandConfig.jsx';
import Metrics from '../pages/Metrics.jsx';
import Toast from '../ui/Toast.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import CompanyWizard from '../pages/CompanyWizard.jsx';
import CompanyEdit from '../pages/CompanyEdit.jsx';

export default function Layout() {
  const { activePage, selectedCompanyId, wizardOpen, editCompanyId } = useStore();

  let Content;
  switch (activePage) {
    case 'dashboard': Content = Dashboard; break;
    case 'companies': Content = selectedCompanyId ? CompanyDetail : Companies; break;
    case 'subscriptions': Content = Subscriptions; break;
    case 'metrics': Content = Metrics; break;
    case 'activity': Content = Activity; break;
    case 'brand': Content = BrandConfig; break;
    default: Content = Dashboard;
  }

  return (
    <div className="admin-theme flex h-screen overflow-hidden bg-[var(--surface-0)] text-[var(--text-primary)] font-sans p-6 gap-4">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden w-full relative">
        <TopBar />
        <main className="flex-1 overflow-y-auto pt-6 pb-24 pr-2">
          <Content />
        </main>
      </div>
      {wizardOpen && <CompanyWizard />}
      {editCompanyId && <CompanyEdit />}
      <Toast />
      <ConfirmDialog />
    </div>
  );
}
