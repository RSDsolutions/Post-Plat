import React, { useState } from 'react';
import { Bell, Search, LogOut, Menu } from 'lucide-react';
import { useStore } from '../../store/useStore.js';

export default function StoreManagerTopBar() {
  const { currentUser, logout, globalSearch, setGlobalSearch, toggleMobileMenu } = useStore();
  const [dateFilter, setDateFilter] = useState('today');

  return (
    <div className="flex items-center justify-between gap-2 sm:gap-4 border-b border-zinc-800 pb-4">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <button
          onClick={toggleMobileMenu}
          className="lg:hidden flex-shrink-0 p-2 -ml-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50 rounded-lg transition-colors"
          title="Abrir menú"
        >
          <Menu size={22} />
        </button>

        <div className="flex-1 min-w-0 flex gap-2 sm:gap-4">
          <div className="relative flex-1 min-w-0">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar facturas, productos, clientes..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="hidden sm:block bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="today">Hoy</option>
            <option value="week">Esta semana</option>
            <option value="month">Este mes</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        <div className="relative">
          <button className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50 rounded-lg transition-colors relative">
            <Bell size={20} />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          </button>
        </div>

        <div className="hidden sm:block h-10 w-px bg-zinc-800" />

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-bold text-zinc-100">{currentUser?.name}</div>
            <div className="text-xs text-blue-400">Gerente Tienda</div>
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
