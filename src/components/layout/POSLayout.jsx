import React from 'react';
import { useStore } from '../../store/useStore.js';
import POSInterface from '../pages/POSInterface.jsx';
import POSSettings from '../pages/POSSettings.jsx';
import POSHistory from '../pages/POSHistory.jsx';
import Toast from '../ui/Toast.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';

export default function POSLayout() {
  const { activePage } = useStore();

  let Content;
  switch (activePage) {
    case 'pos': Content = POSInterface; break;
    case 'pos-settings': Content = POSSettings; break;
    case 'pos-history': Content = POSHistory; break;
    default: Content = POSInterface;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      <main className="flex-1 overflow-hidden w-full">
        <Content />
      </main>
      <Toast />
      <ConfirmDialog />
    </div>
  );
}
