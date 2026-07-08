import React, { useState, useEffect } from 'react';
import { TrendingUp, AlertTriangle, Users, Package, DollarSign, Clock, Settings, BarChart3, CheckCircle } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchData } from '../../lib/supabaseHelpers.js';
import MetricCard from '../ui/MetricCard.jsx';
import { formatUSD } from '../../lib/format.js';

export default function StoreManagerDashboard() {
  const { currentUser, setActivePage, showToast } = useStore();
  const [dashboardData, setDashboardData] = useState({
    totalSales: 0,
    invoiceCount: 0,
    totalCustomers: 0,
    totalProducts: 0,
    lowStockCount: 0,
    cashiersOnline: 0,
    pendingApprovals: 0,
    lastUpdated: new Date(),
    dailyMetrics: [],
    topSellers: [],
    alerts: []
  });

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [invoices, customers, products, users] = await Promise.all([
          fetchData('invoices', { filter: { column: 'company_id', value: currentUser.company_id } }),
          fetchData('customers', { filter: { column: 'company_id', value: currentUser.company_id } }),
          fetchData('products', { filter: { column: 'company_id', value: currentUser.company_id } }),
          fetchData('users', { filter: { column: 'company_id', value: currentUser.company_id } })
        ]);

        const totalSales = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
        const lowStockCount = products.filter(p => p.quantity <= p.min_stock).length;
        const cashiers = users.filter(u => u.role === 'operario' || u.role === 'vendedor');
        const pendingApprovals = invoices.filter(i => i.status !== 'autorizada').length;

        const alerts = [];
        if (lowStockCount > 0) alerts.push({ type: 'stock', count: lowStockCount });
        if (pendingApprovals > 0) alerts.push({ type: 'approval', count: pendingApprovals });

        setDashboardData({
          totalSales,
          invoiceCount: invoices.length,
          totalCustomers: customers.length,
          totalProducts: products.length,
          lowStockCount,
          cashiersOnline: cashiers.length,
          pendingApprovals,
          lastUpdated: new Date(),
          dailyMetrics: invoices.slice(-7).sort((a, b) => new Date(b.issue_date) - new Date(a.issue_date)),
          topSellers: cashiers.slice(0, 3),
          alerts
        });
      } catch (error) {
        console.error('Error loading dashboard:', error);
      }
    };

    if (currentUser?.company_id) {
      loadDashboard();
    }
  }, [currentUser]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-zinc-100">Panel Administrativo de Tienda</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Última actualización: {dashboardData.lastUpdated.toLocaleTimeString('es-ES')}
          </p>
        </div>
        <button
          onClick={() => setActivePage('settings')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Settings size={18} />
          Configuración
        </button>
      </div>

      {/* Critical Alerts */}
      {dashboardData.alerts.length > 0 && (
        <div className="space-y-2">
          {dashboardData.alerts.map((alert, idx) => (
            <div key={idx} className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-4">
              <AlertTriangle size={24} className="text-red-500 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-bold text-red-500">
                  {alert.type === 'stock' ? '⚠️ Alerta de Inventario' : '⚠️ Aprobaciones Pendientes'}
                </h3>
                <p className="text-sm text-red-400 mt-1">
                  {alert.type === 'stock'
                    ? `${alert.count} producto(s) requieren reorden inmediato`
                    : `${alert.count} factura(s) esperan aprobación`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={DollarSign} label="Ventas Totales" value={formatUSD(dashboardData.totalSales)} color="emerald" />
        <MetricCard icon={TrendingUp} label="Facturas Emitidas" value={dashboardData.invoiceCount} color="blue" />
        <MetricCard icon={Users} label="Clientes" value={dashboardData.totalCustomers} color="purple" />
        <MetricCard icon={Package} label="Productos" value={dashboardData.totalProducts} color="amber" />
      </div>

      {/* Admin Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button className="bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg flex items-center gap-3 text-lg">
          <span>🔐</span>
          Firma Digital
        </button>
        <button
          onClick={() => setActivePage('inventory')}
          className="bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg flex items-center gap-3 text-lg"
        >
          <span>📦</span>
          Control Inventario
        </button>
        <button
          onClick={() => setActivePage('sales')}
          className="bg-gradient-to-br from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg flex items-center gap-3 text-lg"
        >
          <span>📊</span>
          Reportes Avanzados
        </button>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Actions */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-zinc-100 mb-4">Funciones Administrativas</h2>

          <button
            onClick={() => setActivePage('invoices')}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3 rounded-xl transition-all text-sm"
          >
            ✅ Aprobar Facturas ({dashboardData.pendingApprovals})
          </button>

          <button className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 rounded-xl transition-all text-sm">
            🔒 Cierre de Caja
          </button>

          <button
            onClick={() => setActivePage('customers')}
            className="w-full bg-gradient-to-r from-pink-600 to-pink-700 hover:from-pink-700 hover:to-pink-800 text-white font-bold py-3 rounded-xl transition-all text-sm"
          >
            👥 Créditos y Clientes
          </button>

          <button
            onClick={() => setActivePage('cashiers')}
            className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-bold py-3 rounded-xl transition-all text-sm"
          >
            🏪 Gestionar Cajas
          </button>

          <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-4 mt-4">
            <h3 className="font-bold text-zinc-100 mb-3">Estado del Día</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">Cajas activas:</span>
                <span className="font-bold text-emerald-400">{dashboardData.cashiersOnline}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Stock bajo:</span>
                <span className="font-bold text-amber-400">{dashboardData.lowStockCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Pendientes:</span>
                <span className="font-bold text-red-400">{dashboardData.pendingApprovals}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center & Right Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Transactions */}
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
            <h2 className="text-lg font-bold text-zinc-100 mb-4">Últimas Transacciones</h2>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {dashboardData.dailyMetrics.length > 0 ? (
                dashboardData.dailyMetrics.map((inv, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-zinc-950/50 rounded-xl hover:bg-zinc-950 transition-colors border border-zinc-800/50">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <span className="text-blue-400 font-bold text-sm">{idx + 1}</span>
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-zinc-100">{inv.invoice_number}</div>
                        <div className="text-xs text-zinc-500">
                          {new Date(inv.issue_date).toLocaleString('es-ES')}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-400">{formatUSD(inv.total_amount)}</div>
                      <div className={`text-xs font-bold ${
                        inv.status === 'autorizada' ? 'text-emerald-400' : 'text-amber-400'
                      }`}>
                        {inv.status}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-zinc-500 text-center py-8">Sin transacciones hoy</p>
              )}
            </div>
          </div>

          {/* Operarios Activos */}
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
            <h2 className="text-lg font-bold text-zinc-100 mb-4">Operarios Activos</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {dashboardData.topSellers.length > 0 ? (
                dashboardData.topSellers.map((seller, idx) => (
                  <div key={idx} className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 border border-blue-500/20 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                        👤
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-zinc-100">{seller.name}</div>
                        <div className="text-xs text-blue-300 uppercase font-bold">{seller.role}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-blue-200">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span>Activo</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-zinc-500 col-span-2 text-center py-6">Sin operarios activos</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
