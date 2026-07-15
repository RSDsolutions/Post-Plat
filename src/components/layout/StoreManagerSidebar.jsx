import React from 'react';
import { LayoutDashboard, Package, BarChart3, FileText, Users, Settings, LogOut, Building2, Receipt, X, MapPin, Calculator } from 'lucide-react';
import { useStore } from '../../store/useStore.js';

export default function StoreManagerSidebar() {
  const { activePage, setActivePage, logout, currentUser, userRole, can, sidebarCollapsed, toggleSidebar, mobileMenuOpen, closeMobileMenu } = useStore();

  // Inicio no lleva permiso propio (siempre visible para quien entra a este
  // layout); el resto se condiciona con can(), no con role === '...' - así
  // el mismo sidebar sirve para gerente y para contador (Fase 5) sin ningún
  // caso especial: cada permiso ya define exactamente qué ve cada rol.
  //
  // 'inventory' se gatea con inventory.read, no products.read (fix de la
  // Fase 1): contador tiene products.read (lo necesita para ver nombres de
  // producto en facturas/reportes) pero NO debe ver la pantalla completa de
  // gestión de inventario - solo gerente tiene inventory.read/write. Con
  // products.read, contador terminaba viendo "Inventario" igual, algo que
  // la Fase 5 dice explícitamente que no debe pasar.
  const menuItems = [
    { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard, permission: null },
    { id: 'branches', label: 'Sucursales', icon: MapPin, permission: 'branches.manage' },
    { id: 'reports', label: 'Reportes', icon: BarChart3, permission: 'reports.read' },
    { id: 'invoices', label: 'Facturas', icon: FileText, permission: 'invoices.read' },
    { id: 'accounting', label: 'Contabilidad', icon: Calculator, permission: 'accounting.read' },
    { id: 'inventory', label: 'Inventario', icon: Package, permission: 'inventory.read' },
    { id: 'customers', label: 'Clientes', icon: Users, permission: 'customers.read' },
    { id: 'cashiers', label: 'Usuarios', icon: Building2, permission: 'users.manage' },
    { id: 'billing', label: 'Facturación SRI', icon: Receipt, permission: 'billing_config.manage' },
    { id: 'settings', label: 'Configuración', icon: Settings, permission: 'settings.manage' },
  ].filter(item => !item.permission || can(item.permission));

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
        bg-gradient-to-b from-panel-surface to-panel-bg border-r border-panel-border flex flex-col transition-all duration-300`}
      >
        {/* Header */}
        <div className="p-4 border-b border-panel-border flex items-center justify-between">
          <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-panel-accent to-panel-accent-hover flex items-center justify-center flex-shrink-0">
              <span className="text-panel-accent-text font-bold text-lg">🏪</span>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-panel-text truncate">{userRole === 'contador' ? 'Contador' : 'Gerente Tienda'}</div>
              <div className="text-xs text-panel-accent-soft truncate">{currentUser?.name}</div>
            </div>
          </div>
          <button
            onClick={toggleSidebar}
            className="hidden lg:block text-panel-text-muted hover:text-panel-text p-1 flex-shrink-0"
            title={sidebarCollapsed ? 'Expandir' : 'Contraer'}
          >
            ☰
          </button>
          <button
            onClick={closeMobileMenu}
            className="lg:hidden text-panel-text-muted hover:text-panel-text p-1 flex-shrink-0"
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
                    ? 'bg-panel-accent/20 text-panel-accent-soft border-l-2 border-panel-accent shadow-lg shadow-panel-accent/10'
                    : 'text-panel-text-muted hover:text-panel-text hover:bg-panel-surface-2'
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
        <div className="p-4 border-t border-panel-border space-y-2">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-panel-text-muted hover:text-panel-danger hover:bg-panel-danger/10 transition-colors"
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
