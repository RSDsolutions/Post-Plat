import React, { useState, useEffect } from 'react';
import { FileText, Users, TrendingUp, Package } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchData } from '../../lib/supabaseHelpers.js';
import MetricCard from '../ui/MetricCard.jsx';
import { formatUSD } from '../../lib/format.js';

export default function StoreDashboard() {
  const { currentUser } = useStore();
  const [stats, setStats] = useState({
    totalSales: 0,
    invoiceCount: 0,
    customerCount: 0,
    productCount: 0,
    recentInvoices: []
  });

  useEffect(() => {
    const loadStats = async () => {
      try {
        const invoices = await fetchData('invoices', {
          filter: { column: 'company_id', value: currentUser.company_id }
        });

        const customers = await fetchData('customers', {
          filter: { column: 'company_id', value: currentUser.company_id }
        });

        const products = await fetchData('products', {
          filter: { column: 'company_id', value: currentUser.company_id }
        });

        const totalSales = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

        setStats({
          totalSales,
          invoiceCount: invoices.length,
          customerCount: customers.length,
          productCount: products.length,
          recentInvoices: invoices.slice(0, 5).sort((a, b) =>
            new Date(b.issue_date) - new Date(a.issue_date)
          )
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
      <h1 className="text-4xl font-bold tracking-tighter uppercase text-zinc-100">Inicio</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={FileText} label="Facturas emitidas" value={stats.invoiceCount} color="brand" />
        <MetricCard icon={TrendingUp} label="Ventas totales" value={formatUSD(stats.totalSales)} color="green" />
        <MetricCard icon={Users} label="Clientes" value={stats.customerCount} color="blue" />
        <MetricCard icon={Package} label="Productos" value={stats.productCount} color="amber" />
      </div>

      <div className="bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden p-6">
        <h2 className="text-lg font-bold text-zinc-100 mb-4">Últimas Facturas</h2>
        {stats.recentInvoices.length > 0 ? (
          <div className="space-y-3">
            {stats.recentInvoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-4 bg-zinc-950/50 rounded-xl hover:bg-zinc-950 transition-colors">
                <div>
                  <div className="font-bold text-zinc-100">{inv.invoice_number}</div>
                  <div className="text-sm text-zinc-500">{new Date(inv.issue_date).toLocaleDateString('es-ES')}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-zinc-100">{formatUSD(inv.total_amount)}</div>
                  <div className="text-xs text-zinc-500 capitalize">{inv.status}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-zinc-500 text-center py-8">No hay facturas aún</p>
        )}
      </div>
    </div>
  );
}
