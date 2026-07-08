import React, { useState, useEffect } from 'react';
import { BarChart3, AlertTriangle, Users, Package, DollarSign, TrendingUp, Activity, Settings, LogOut, Eye, Lock, Zap } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchData } from '../../lib/supabaseHelpers.js';
import { formatUSD } from '../../lib/format.js';

export default function StoreManagerDashboard() {
  const { currentUser, setActivePage, logout, showToast } = useStore();
  const [stats, setStats] = useState({
    todaySales: 0,
    monthSales: 0,
    invoiceCount: 0,
    monthInvoices: 0,
    customerCount: 0,
    activeUsers: 0,
    productCount: 0,
    lowStockCount: 0,
    onlineOperators: 0,
    totalRevenue: 0,
    avgTicket: 0,
    topProducts: [],
    recentTransactions: [],
    alerts: [],
    userList: [],
    productList: []
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

        const todaySales = invoices
          .filter(inv => new Date(inv.issue_date).toDateString() === new Date().toDateString())
          .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

        const monthSales = invoices
          .filter(inv => {
            const invDate = new Date(inv.issue_date);
            const now = new Date();
            return invDate.getMonth() === now.getMonth() && invDate.getFullYear() === now.getFullYear();
          })
          .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

        const monthInvoices = invoices.filter(inv => {
          const invDate = new Date(inv.issue_date);
          const now = new Date();
          return invDate.getMonth() === now.getMonth() && invDate.getFullYear() === now.getFullYear();
        }).length;

        const lowStockCount = products.filter(p => p.quantity <= p.min_stock).length;
        const operators = users.filter(u => u.role === 'operario' || u.role === 'vendedor');

        const alerts = [];
        if (lowStockCount > 0) alerts.push({ type: 'stock', count: lowStockCount, severity: 'high' });
        const pendingInvoices = invoices.filter(i => i.status !== 'autorizada').length;
        if (pendingInvoices > 0) alerts.push({ type: 'approval', count: pendingInvoices, severity: 'medium' });

        setStats({
          todaySales,
          monthSales,
          invoiceCount: invoices.length,
          monthInvoices,
          customerCount: customers.length,
          activeUsers: users.length,
          productCount: products.length,
          lowStockCount,
          onlineOperators: operators.length,
          totalRevenue: invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0),
          avgTicket: invoices.length > 0 ? invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0) / invoices.length : 0,
          topProducts: products.sort((a, b) => b.quantity - a.quantity).slice(0, 5),
          recentTransactions: invoices.slice(-10).sort((a, b) => new Date(b.issue_date) - new Date(a.issue_date)),
          alerts,
          userList: users.slice(0, 5),
          productList: products.slice(0, 5)
        });
      } catch (error) {
        console.error('Error loading dashboard:', error);
        showToast('error', 'Error cargando dashboard');
      }
    };

    if (currentUser?.company_id) {
      loadDashboard();
    }
  }, [currentUser, showToast]);

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold">🏪 Dashboard de Tienda</h1>
            <p className="text-blue-100 mt-1">Gerente: {currentUser?.name}</p>
          </div>
          <button
            onClick={logout}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 font-bold transition-colors"
          >
            <LogOut size={20} />
            Cerrar sesión
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Alerts */}
        {stats.alerts.length > 0 && (
          <div className="space-y-3">
            {stats.alerts.map((alert, idx) => (
              <div key={idx} className={`p-4 rounded-xl border flex items-start gap-4 ${
                alert.severity === 'high'
                  ? 'bg-red-500/10 border-red-500/30'
                  : 'bg-amber-500/10 border-amber-500/30'
              }`}>
                <AlertTriangle size={24} className={alert.severity === 'high' ? 'text-red-500' : 'text-amber-500'} />
                <div className="flex-1">
                  <h3 className={`font-bold ${alert.severity === 'high' ? 'text-red-500' : 'text-amber-500'}`}>
                    {alert.type === 'stock' ? '📦 Stock Bajo' : '⚠️ Aprobaciones Pendientes'}
                  </h3>
                  <p className={`text-sm mt-1 ${alert.severity === 'high' ? 'text-red-400' : 'text-amber-400'}`}>
                    {alert.count} {alert.type === 'stock' ? 'producto(s)' : 'factura(s)'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* KPI Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-500 text-sm font-bold">VENTAS HOY</span>
              <DollarSign className="text-emerald-500" size={24} />
            </div>
            <div className="text-3xl font-bold text-emerald-400">{formatUSD(stats.todaySales)}</div>
            <div className="text-xs text-zinc-500 mt-2">{stats.invoiceCount} facturas</div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-500 text-sm font-bold">VENTAS MES</span>
              <TrendingUp className="text-blue-500" size={24} />
            </div>
            <div className="text-3xl font-bold text-blue-400">{formatUSD(stats.monthSales)}</div>
            <div className="text-xs text-zinc-500 mt-2">{stats.monthInvoices} facturas</div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-500 text-sm font-bold">PROMEDIO TICKET</span>
              <BarChart3 className="text-purple-500" size={24} />
            </div>
            <div className="text-3xl font-bold text-purple-400">{formatUSD(stats.avgTicket)}</div>
            <div className="text-xs text-zinc-500 mt-2">Por transacción</div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-500 text-sm font-bold">INGRESOS TOTALES</span>
              <Zap className="text-amber-500" size={24} />
            </div>
            <div className="text-3xl font-bold text-amber-400">{formatUSD(stats.totalRevenue)}</div>
            <div className="text-xs text-zinc-500 mt-2">Histórico</div>
          </div>
        </div>

        {/* KPI Row 2 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-500 text-sm font-bold">CLIENTES</span>
              <Users className="text-pink-500" size={24} />
            </div>
            <div className="text-3xl font-bold text-pink-400">{stats.customerCount}</div>
            <div className="text-xs text-zinc-500 mt-2">Registrados</div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-500 text-sm font-bold">PRODUCTOS</span>
              <Package className="text-cyan-500" size={24} />
            </div>
            <div className="text-3xl font-bold text-cyan-400">{stats.productCount}</div>
            <div className={`text-xs mt-2 ${stats.lowStockCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {stats.lowStockCount} bajo stock
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-500 text-sm font-bold">OPERARIOS</span>
              <Activity className="text-green-500" size={24} />
            </div>
            <div className="text-3xl font-bold text-green-400">{stats.onlineOperators}</div>
            <div className="text-xs text-zinc-500 mt-2">Activos</div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Controls */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-zinc-100">Controles Administrativos</h2>

            <button
              onClick={() => setActivePage('inventory')}
              className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-bold py-3 rounded-xl transition-all text-sm"
            >
              📦 Gestionar Inventario
            </button>

            <button
              onClick={() => setActivePage('invoices')}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3 rounded-xl transition-all text-sm"
            >
              ✅ Aprobar Facturas
            </button>

            <button
              onClick={() => setActivePage('sales')}
              className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-bold py-3 rounded-xl transition-all text-sm"
            >
              📊 Reportes & Análisis
            </button>

            <button
              onClick={() => setActivePage('customers')}
              className="w-full bg-gradient-to-r from-pink-600 to-pink-700 hover:from-pink-700 hover:to-pink-800 text-white font-bold py-3 rounded-xl transition-all text-sm"
            >
              👥 Gestionar Clientes
            </button>

            <button
              onClick={() => setActivePage('cashiers')}
              className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-bold py-3 rounded-xl transition-all text-sm"
            >
              🏪 Cajas & Operarios
            </button>

            <button className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 rounded-xl transition-all text-sm">
              🔒 Cierre de Caja
            </button>

            <button className="w-full bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white font-bold py-3 rounded-xl transition-all text-sm">
              🔐 Firma Digital
            </button>

            <button
              onClick={() => setActivePage('settings')}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2"
            >
              <Settings size={18} />
              Configuración
            </button>
          </div>

          {/* Center & Right Columns - Data */}
          <div className="lg:col-span-2 space-y-6">
            {/* Recent Transactions */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-zinc-100 mb-4">Últimas Transacciones</h2>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {stats.recentTransactions.length > 0 ? (
                  stats.recentTransactions.map((inv, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-zinc-950/50 rounded-lg hover:bg-zinc-950 transition-colors border border-zinc-800/50">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                          <span className="text-blue-400 font-bold text-sm">{idx + 1}</span>
                        </div>
                        <div>
                          <div className="font-bold text-zinc-100 text-sm">{inv.invoice_number}</div>
                          <div className="text-xs text-zinc-500">{new Date(inv.issue_date).toLocaleString('es-ES')}</div>
                        </div>
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
                  <p className="text-zinc-500 text-center py-8">Sin transacciones</p>
                )}
              </div>
            </div>

            {/* Top Operators & Users */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-zinc-100 mb-4">Personal de Tienda</h2>
              <div className="grid grid-cols-2 gap-3">
                {stats.userList.length > 0 ? (
                  stats.userList.map((user, idx) => (
                    <div key={idx} className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 border border-blue-500/20 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
                          👤
                        </div>
                        <div>
                          <div className="font-bold text-zinc-100 text-sm">{user.name}</div>
                          <div className="text-xs text-blue-300 uppercase font-bold">{user.role}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-blue-200">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span>Activo</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-zinc-500 text-center col-span-2 py-4">Sin personal registrado</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
