import React from 'react';
<<<<<<< HEAD
import { LayoutDashboard, Building2, CreditCard, Activity, Palette, Menu, ChevronLeft, X } from 'lucide-react';
=======
import { LayoutDashboard, Building2, CreditCard, Activity, Palette, Menu, ChevronLeft, BarChart3, DollarSign } from 'lucide-react';
>>>>>>> a8b67df4aba83266168d9625ada638299e42d0cd
import { useStore } from '../../store/useStore.js';

export default function Sidebar() {
  const { activePage, setActivePage, sidebarCollapsed, toggleSidebar, mobileMenuOpen, closeMobileMenu, alerts } = useStore();

  const unreadAlerts = alerts.filter(a => !a.attended).length;

  const navItems = [
    { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
    { id: 'companies', label: 'Empresas', icon: Building2 },
    { id: 'subscriptions', label: 'Suscripciones y planes', icon: CreditCard },
    { id: 'payments', label: 'Pagos', icon: DollarSign },
    { id: 'metrics', label: 'Métricas', icon: BarChart3 },
    { id: 'activity', label: 'Actividad y alertas', icon: Activity, badge: unreadAlerts },
    { id: 'brand', label: 'Mi marca', icon: Palette },
  ];

  return (
<<<<<<< HEAD
    <>
      {/* Fondo oscuro en móvil: tap para cerrar el drawer */}
      {mobileMenuOpen && (
        <div
          onClick={closeMobileMenu}
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
        />
      )}

      {/* Debajo de md: drawer fijo deslizable (translate). En md+: vuelve al flujo
          normal y conserva el colapso de ancho de escritorio. setActivePage cierra
          el menú móvil automáticamente (ver store). */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        md:static md:z-auto md:translate-x-0 ${sidebarCollapsed ? 'md:w-20' : 'md:w-64'}
        bg-zinc-900 border-r border-zinc-800 md:border md:rounded-3xl flex flex-col transition-all duration-300`}
      >
      {/* Botón de cerrar, sólo en móvil */}
      <div className="flex justify-end p-4 md:hidden">
        <button
          onClick={closeMobileMenu}
          className="p-2 text-zinc-500 hover:bg-zinc-800 rounded-lg"
          title="Cerrar menú"
        >
          <X size={20} />
        </button>
      </div>
=======
    <div className={`bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-3xl flex flex-col transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'} hidden md:flex`}>
>>>>>>> a8b67df4aba83266168d9625ada638299e42d0cd
      <div className="flex-1 py-6 overflow-y-auto pr-2">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`w-full flex items-center px-6 py-3 relative transition-colors ${
                  active 
                    ? 'bg-[var(--surface-2)]/50 text-[var(--brand)] font-bold' 
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-zinc-300 font-medium'
                }`}
              >
                {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--brand)]" />}
                <item.icon size={20} className={active ? 'text-[var(--brand)]' : 'text-gray-500'} />
                {/* El colapso sólo aplica en md+; en el drawer móvil siempre se ven las etiquetas */}
                <span className={`ml-3 truncate ${sidebarCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
                {item.badge > 0 && (
                  <span className={`ml-auto bg-red-100 text-red-600 py-0.5 px-2 rounded-full text-xs font-medium ${sidebarCollapsed ? 'md:hidden' : ''}`}>
                    {item.badge}
                  </span>
                )}
                {sidebarCollapsed && item.badge > 0 && (
                  <span className="hidden md:block absolute top-2 right-2 w-2 h-2 rounded-full bg-red-600"></span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
<<<<<<< HEAD
      <div className="p-4 border-t border-zinc-800 hidden md:flex justify-end">
        <button
=======
      <div className="p-4 border-t border-[var(--border-subtle)] flex justify-end">
        <button 
>>>>>>> a8b67df4aba83266168d9625ada638299e42d0cd
          onClick={toggleSidebar}
          className="p-2 text-[var(--text-muted)] hover:bg-[var(--surface-2)] rounded-lg"
        >
          {sidebarCollapsed ? <Menu size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>
      </div>
    </>
  );
}
