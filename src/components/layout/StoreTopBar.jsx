import React from 'react';
import { Bell, Search, LogOut } from 'lucide-react';
import { useStore } from '../../store/useStore.js';

export default function StoreTopBar() {
  const { currentUser, logout, globalSearch, setGlobalSearch } = useStore();

  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-4">
      <div className="flex-1 max-w-sm">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="relative p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50 rounded-lg transition-colors">
          <Bell size={20} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        <div className="flex items-center gap-3 pl-4 border-l border-zinc-800">
          <div className="text-right">
            <div className="text-sm font-bold text-zinc-100">{currentUser?.name}</div>
            <div className="text-xs text-zinc-500">Vendedor</div>
          </div>
          <button
            onClick={logout}
            className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Cerrar sesión"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
