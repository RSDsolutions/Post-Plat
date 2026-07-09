import React from 'react';
import { LayoutDashboard, Package, BarChart3, FileText, Users, Settings, LogOut, Building2, Receipt, X, MapPin } from 'lucide-react';
import { useStore } from '../../store/useStore.js';

export default function StoreManagerSidebar() {
  const { activePage, setActivePage, logout, currentUser, sidebarCollapsed, toggleSidebar, mobileMenuOpen, closeMobileMenu } = useStore();

  const menuItems = [
    { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
    { id: 'branches', label: 'Sucursales', icon: MapPin },
    { id: 'reports', label: 'Reportes', icon: BarChart3 },
    { id: 'invoices', label: 'Facturas', icon: FileText },
    { id: 'inventory', label: 'Inventario', icon: Package },
    { id: 'customers', label: 'Clientes', icon: Users },
    { id: 'cashiers', label: 'Cajas', icon: Building2 },
    { id: 'billing', label: 'Facturación SRI', icon: Receipt },
    { id: 'settings', label: 'Configuración', icon: Settings },
  ];

  return (
    <>
      {/* Mobile backdrop - tap to close the drawer */}
      {mobileMenuOpen && (
        <div
          onClick={closeMobileMenu}
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
        />
      )}

      {/* Below lg: fixed slide-in drawer, full width, ignores the desktop
          icon-collapse mode. At lg+: back in normal flow, collapse behavior
          unchanged. */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:static lg:translate-x-0 lg:z-auto ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-72'}
        bg-gradient-to-b from-zinc-900 to-zinc-950 border-r border-zinc-800 flex flex-col transition-all duration-300`}
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-lg">🏪</span>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate">Gerente Tienda</div>
              <div className="text-xs text-blue-400 truncate">{currentUser?.name}</div>
            </div>
          </div>
          <button
            onClick={toggleSidebar}
            className="hidden lg:block text-zinc-500 hover:text-zinc-300 p-1 flex-shrink-0"
            title={sidebarCollapsed ? 'Expandir' : 'Contraer'}
          >
            ☰
          </button>
          <button
            onClick={closeMobileMenu}
            className="lg:hidden text-zinc-500 hover:text-zinc-300 p-1 flex-shrink-0"
            title="Cerrar menú"
          >
            <X size={22} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto">
          {menuItems.map(item => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-blue-500/20 text-blue-400 border-l-2 border-blue-500 shadow-lg shadow-blue-500/10'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
                title={sidebarCollapsed ? item.label : ''}
              >
                <Icon size={20} className="flex-shrink-0" />
                <span className={`text-sm font-medium whitespace-nowrap ${sidebarCollapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
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
            <LogOut size={20} className="flex-shrink-0" />
            <span className={`text-sm font-medium whitespace-nowrap ${sidebarCollapsed ? 'lg:hidden' : ''}`}>Cerrar sesión</span>
          </button>
        </div>
      </div>
    </>
  );
}
