import React, { useState } from 'react';
import { Bell, Search, LogOut, Menu, Sun, Moon } from 'lucide-react';
import { useStore } from '../../store/useStore.js';

export default function StoreManagerTopBar() {
  const { currentUser, userRole, logout, globalSearch, setGlobalSearch, toggleMobileMenu, panelMode, togglePanelMode } = useStore();
  const [dateFilter, setDateFilter] = useState('today');

  return (
    <div className="flex items-center justify-between gap-2 sm:gap-4 border-b border-panel-border pb-4">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <button
          onClick={toggleMobileMenu}
          className="lg:hidden flex-shrink-0 p-2 -ml-1 text-panel-text-muted hover:text-panel-text hover:bg-panel-surface-2 rounded-lg transition-colors"
          title="Abrir menú"
        >
          <Menu size={22} />
        </button>

        <div className="flex-1 min-w-0 flex gap-2 sm:gap-4">
          <div className="relative flex-1 min-w-0">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-panel-text-muted" />
            <input
              type="text"
              placeholder="Buscar facturas, productos, clientes..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="w-full bg-panel-surface border border-panel-border rounded-lg pl-10 pr-4 py-2 text-sm text-panel-text placeholder-panel-text-muted focus:outline-none focus:ring-2 focus:ring-panel-accent"
            />
          </div>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="hidden sm:block bg-panel-surface border border-panel-border rounded-lg px-4 py-2 text-sm text-panel-text focus:outline-none focus:ring-2 focus:ring-panel-accent"
          >
            <option value="today">Hoy</option>
            <option value="week">Esta semana</option>
            <option value="month">Este mes</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        <button
          onClick={togglePanelMode}
          className="p-2 text-panel-text-muted hover:text-panel-text hover:bg-panel-surface-2 rounded-lg transition-colors"
          title={panelMode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {panelMode === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <div className="relative">
          <button className="p-2 text-panel-text-muted hover:text-panel-text hover:bg-panel-surface-2 rounded-lg transition-colors relative">
            <Bell size={20} />
            <span className="absolute top-1 right-1 w-2 h-2 bg-panel-danger rounded-full animate-pulse" />
          </button>
        </div>

        <div className="hidden sm:block h-10 w-px bg-panel-border" />

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-bold text-panel-text">{currentUser?.name}</div>
            <div className="text-xs text-panel-accent-soft">{userRole === 'contador' ? 'Contador' : 'Gerente Tienda'}</div>
          </div>
          <button
            onClick={logout}
            className="p-2 text-panel-text-muted hover:text-panel-danger hover:bg-panel-danger/10 rounded-lg transition-colors"
            title="Cerrar sesión"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
