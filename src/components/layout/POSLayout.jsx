import React from 'react';
import { useStore } from '../../store/useStore.js';
import POSInterface from '../pages/POSInterface.jsx';
import POSSettings from '../pages/POSSettings.jsx';
import POSHistory from '../pages/POSHistory.jsx';
import Toast from '../ui/Toast.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';

export default function POSLayout() {
  const { activePage, posTheme } = useStore();

  let Content;
  switch (activePage) {
    case 'pos': Content = POSInterface; break;
    case 'pos-settings': Content = POSSettings; break;
    case 'pos-history': Content = POSHistory; break;
    default: Content = POSInterface;
  }

  // data-pos-theme/data-pos-accent resuelven las variables --pos-* de
  // src/styles/themes.css para todo lo que cuelga de este contenedor -
  // posTheme ya viene con el fallback seguro aplicado (useStore.js login()/
  // restoreAuth(), ver src/lib/themes.js).
  return (
    <div
      data-pos-theme={posTheme.pos_theme}
      data-pos-accent={posTheme.pos_accent}
      className="flex h-screen overflow-hidden bg-pos-bg text-pos-text font-sans"
    >
      <main className="flex-1 overflow-hidden w-full">
        <Content />
      </main>
      <Toast />
      <ConfirmDialog />
    </div>
  );
}
