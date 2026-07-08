import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, Package, DollarSign, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchData } from '../../lib/supabaseHelpers.js';
import MetricCard from '../ui/MetricCard.jsx';
import { formatUSD } from '../../lib/format.js';

export default function StoreManagerDashboard() {
  const { currentUser, setActivePage } = useStore();
  const [stats, setStats] = useState({
    dailySales: 0,
    invoiceCount: 0,
    customerCount: 0,
    productCount: 0,
    lowStockProducts: [],
    recentInvoices: [],
    topProducts: []
  });

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [invoices, customers, products, details] = await Promise.all([
          fetchData('invoices', { filter: { column: 'company_id', value: currentUser.company_id } }),
          fetchData('customers', { filter: { column: 'company_id', value: currentUser.company_id } }),
          fetchData('products', { filter: { column: 'company_id', value: currentUser.company_id } }),
          fetchData('invoice_details', {})
        ]);

        const dailySales = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
        const lowStockProducts = products.filter(p => p.quantity <= p.min_stock);

        setStats({
          dailySales,
          invoiceCount: invoices.length,
          customerCount: customers.length,
          productCount: products.length,
          lowStockProducts,
          recentInvoices: invoices.slice(0, 5).sort((a, b) => new Date(b.issue_date) - new Date(a.issue_date)),
          topProducts: []
        });
      } catch (error) {
        console.error('Error loading stats:', error);
      }
    };

    if (currentUser?.company_id) {
      loadStats();
    }
  }, [currentUser]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold text-zinc-100">Dashboard de Gerente</h1>
        <div className="text-sm text-zinc-500">
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={DollarSign} label="Ventas Hoy" value={formatUSD(stats.dailySales)} color="emerald" />
        <MetricCard icon={TrendingUp} label="Facturas" value={stats.invoiceCount} color="blue" />
        <MetricCard icon={Users} label="Clientes" value={stats.customerCount} color="purple" />
        <MetricCard icon={Package} label="Productos" value={stats.productCount} color="amber" />
      </div>

      {/* Alerts */}
      {stats.lowStockProducts.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={24} className="text-amber-500 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="font-bold text-amber-500 mb-1">Stock Bajo</h3>
              <p className="text-sm text-amber-400">
                {stats.lowStockProducts.length} producto(s) necesitan reorden inmediato
              </p>
              <button
                onClick={() => setActivePage('inventory')}
                className="text-amber-500 hover:text-amber-400 text-sm font-bold mt-2"
              >
                Ver inventario →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Invoices */}
        <div className="lg:col-span-2 bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
          <h2 className="text-lg font-bold text-zinc-100 mb-4">Últimas Facturas</h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {stats.recentInvoices.length > 0 ? (
              stats.recentInvoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between p-4 bg-zinc-950/50 rounded-xl hover:bg-zinc-950 transition-colors">
                  <div>
                    <div className="font-bold text-zinc-100">{inv.invoice_number}</div>
                    <div className="text-xs text-zinc-500">{new Date(inv.issue_date).toLocaleString('es-ES')}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-emerald-400">{formatUSD(inv.total_amount)}</div>
                    <div className={`text-xs font-bold ${inv.status === 'autorizada' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {inv.status}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-zinc-500 text-center py-8">Sin facturas registradas</p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
            <h2 className="text-lg font-bold text-zinc-100 mb-4">Acciones Rápidas</h2>
            <div className="space-y-2">
              <button
                onClick={() => setActivePage('sales')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition-colors"
              >
                Ver Ventas
              </button>
              <button
                onClick={() => setActivePage('inventory')}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded-lg transition-colors"
              >
                Gestionar Inventario
              </button>
              <button
                onClick={() => setActivePage('customers')}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg transition-colors"
              >
                Ver Clientes
              </button>
              <button
                onClick={() => setActivePage('cashiers')}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 rounded-lg transition-colors"
              >
                Gestionar Cajas
              </button>
            </div>
          </div>

          {/* Stats Card */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
            <h3 className="font-bold mb-2">Resumen del Día</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-blue-100">Transacciones:</span>
                <span className="font-bold">{stats.invoiceCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-100">Monto total:</span>
                <span className="font-bold">{formatUSD(stats.dailySales)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-100">Promedio:</span>
                <span className="font-bold">{formatUSD(stats.invoiceCount > 0 ? stats.dailySales / stats.invoiceCount : 0)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
