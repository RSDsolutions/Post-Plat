import React from 'react';
import { Search, Bell, Menu, LogOut } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { getBrandInitials } from '../../lib/brand.js';

export default function TopBar() {
  const { brand, globalSearch, setGlobalSearch, alerts, setActivePage, toggleSidebar, currentUser, logout } = useStore();
  const initials = getBrandInitials(brand.name);
  const unreadAlerts = alerts.filter(a => !a.attended).length;

  return (
    <header className="flex items-center justify-between h-12 shrink-0">
      <div className="flex items-center flex-1">
        <button onClick={toggleSidebar} className="md:hidden p-2 -ml-2 mr-2 text-zinc-500 hover:bg-zinc-800 rounded-lg">
          <Menu size={20} />
        </button>
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-[var(--brand)] rounded-lg flex items-center justify-center">
             <div className="w-4 h-4 border-2 border-zinc-950"></div>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">{brand.name}</h1>
        </div>
      </div>

      <div className="flex-1 max-w-md px-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-zinc-500" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-zinc-800 rounded-full leading-5 bg-zinc-900 text-zinc-300 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[var(--brand)] sm:text-sm"
            placeholder="Buscar empresas, RUC..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-6 flex-1 justify-end">
        <button
          className="relative p-2 text-zinc-400 hover:text-zinc-100 transition-colors rounded-full"
          onClick={() => setActivePage('activity')}
        >
          <Bell size={20} />
          {unreadAlerts > 0 && (
            <span className="absolute top-1 right-1 flex h-2 w-2 rounded-full bg-[var(--brand)]">
            </span>
          )}
        </button>

        <div className="flex items-center gap-2 bg-zinc-900 py-1.5 px-3 rounded-full border border-zinc-800">
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500"></div>
          <span className="text-xs font-semibold text-zinc-300">{currentUser?.name || 'Administrador'}</span>
          <button
            onClick={logout}
            className="ml-2 p-1 text-zinc-400 hover:text-red-400 transition-colors"
            title="Cerrar sesión"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
