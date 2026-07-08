import React from 'react';
import { LayoutDashboard, FileText, Package, Users, BarChart3, Settings, LogOut } from 'lucide-react';
import { useStore } from '../../store/useStore.js';

export default function StoreSidebar() {
  const { activePage, setActivePage, logout, currentUser, sidebarCollapsed, toggleSidebar } = useStore();

  const menuItems = [
    { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
    { id: 'sales', label: 'Mis Ventas', icon: FileText },
    { id: 'inventory', label: 'Inventario', icon: Package },
    { id: 'customers', label: 'Clientes', icon: Users },
    { id: 'reports', label: 'Reportes', icon: BarChart3 },
  ];

  return (
    <div className={`${sidebarCollapsed ? 'w-20' : 'w-64'} bg-zinc-900 border-r border-zinc-800 flex flex-col transition-all duration-300`}>
      {/* Logo/Brand */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'hidden' : ''}`}>
          <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center">
            <span className="text-white font-bold">📦</span>
          </div>
          <div>
            <div className="text-sm font-bold text-white">Tienda</div>
            <div className="text-xs text-zinc-500">{currentUser?.name}</div>
          </div>
        </div>
        <button
          onClick={toggleSidebar}
          className="text-zinc-500 hover:text-zinc-300 p-1"
          title={sidebarCollapsed ? 'Expandir' : 'Contraer'}
        >
          ☰
        </button>
      </div>

      {/* Menu Items */}
      <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto">
        {menuItems.map(item => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                isActive
                  ? 'bg-emerald-500/20 text-emerald-400 border-l-2 border-emerald-500'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
              title={sidebarCollapsed ? item.label : ''}
            >
              <Icon size={20} />
              {!sidebarCollapsed && <span className="text-sm font-medium">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-zinc-800 space-y-2">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title={sidebarCollapsed ? 'Cerrar sesión' : ''}
        >
          <LogOut size={20} />
          {!sidebarCollapsed && <span className="text-sm font-medium">Cerrar sesión</span>}
        </button>
      </div>
    </div>
  );
}
