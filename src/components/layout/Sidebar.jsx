import React from 'react';
import { LayoutDashboard, Building2, CreditCard, Activity, Palette, Menu, ChevronLeft } from 'lucide-react';
import { useStore } from '../../store/useStore.js';

export default function Sidebar() {
  const { activePage, setActivePage, sidebarCollapsed, toggleSidebar, alerts } = useStore();
  
  const unreadAlerts = alerts.filter(a => !a.attended).length;

  const navItems = [
    { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
    { id: 'companies', label: 'Empresas', icon: Building2 },
    { id: 'subscriptions', label: 'Suscripciones y planes', icon: CreditCard },
    { id: 'activity', label: 'Actividad y alertas', icon: Activity, badge: unreadAlerts },
    { id: 'brand', label: 'Mi marca', icon: Palette },
  ];

  return (
    <div className={`bg-zinc-900 border border-zinc-800 rounded-3xl flex flex-col transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'} hidden md:flex`}>
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
                    ? 'bg-zinc-800/50 text-[var(--brand)] font-bold' 
                    : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 font-medium'
                }`}
              >
                {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--brand)]" />}
                <item.icon size={20} className={active ? 'text-[var(--brand)]' : 'text-gray-500'} />
                {!sidebarCollapsed && (
                  <span className="ml-3 truncate">{item.label}</span>
                )}
                {!sidebarCollapsed && item.badge > 0 && (
                  <span className="ml-auto bg-red-100 text-red-600 py-0.5 px-2 rounded-full text-xs font-medium">
                    {item.badge}
                  </span>
                )}
                {sidebarCollapsed && item.badge > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-600"></span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="p-4 border-t border-zinc-800 flex justify-end">
        <button 
          onClick={toggleSidebar}
          className="p-2 text-zinc-500 hover:bg-zinc-800 rounded-lg"
        >
          {sidebarCollapsed ? <Menu size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>
    </div>
  );
}
