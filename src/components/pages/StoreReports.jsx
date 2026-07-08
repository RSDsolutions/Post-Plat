import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Calendar } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchData } from '../../lib/supabaseHelpers.js';
import { formatUSD } from '../../lib/format.js';

export default function StoreReports() {
  const { currentUser, showToast } = useStore();
  const [reportData, setReportData] = useState({
    dailySales: [],
    topProducts: [],
    totalRevenue: 0,
    invoiceCount: 0
  });

  useEffect(() => {
    const loadReports = async () => {
      try {
        const invoices = await fetchData('invoices', {
          filter: { column: 'company_id', value: currentUser.company_id }
        });

        const invoiceDetails = await fetchData('invoice_details', {
          limit: 1000
        });

        const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

        // Agrupar productos más vendidos
        const productSales = {};
        invoiceDetails.forEach(detail => {
          const key = detail.product_name;
          productSales[key] = (productSales[key] || 0) + detail.quantity;
        });

        const topProducts = Object.entries(productSales)
          .map(([name, qty]) => ({ name, quantity: qty }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5);

        setReportData({
          dailySales: [],
          topProducts,
          totalRevenue,
          invoiceCount: invoices.length
        });
      } catch (error) {
        console.error('Error loading reports:', error);
        showToast('error', 'Error al cargar los reportes');
      }
    };

    if (currentUser?.company_id) {
      loadReports();
    }
  }, [currentUser, showToast]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-4xl font-bold tracking-tighter uppercase text-zinc-100">Reportes</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-zinc-500">Ingresos totales</div>
              <div className="text-3xl font-bold text-emerald-400 mt-2">
                {formatUSD(reportData.totalRevenue)}
              </div>
            </div>
            <TrendingUp size={32} className="text-emerald-500/30" />
          </div>
        </div>

        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-zinc-500">Facturas emitidas</div>
              <div className="text-3xl font-bold text-blue-400 mt-2">
                {reportData.invoiceCount}
              </div>
            </div>
            <BarChart3 size={32} className="text-blue-500/30" />
          </div>
        </div>

        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-zinc-500">Promedio por factura</div>
              <div className="text-3xl font-bold text-amber-400 mt-2">
                {formatUSD(reportData.invoiceCount > 0 ? reportData.totalRevenue / reportData.invoiceCount : 0)}
              </div>
            </div>
            <Calendar size={32} className="text-amber-500/30" />
          </div>
        </div>

        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-zinc-500">Productos más vendidos</div>
              <div className="text-3xl font-bold text-purple-400 mt-2">
                {reportData.topProducts.length}
              </div>
            </div>
            <BarChart3 size={32} className="text-purple-500/30" />
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6">
        <h2 className="text-lg font-bold text-zinc-100 mb-4">Top 5 Productos Vendidos</h2>
        {reportData.topProducts.length > 0 ? (
          <div className="space-y-3">
            {reportData.topProducts.map((product, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-zinc-950/50 rounded-xl">
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <span className="font-bold text-emerald-400 text-sm">{index + 1}</span>
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-zinc-100">{product.name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-zinc-100">{product.quantity} unidades</div>
                  <div className="w-32 h-2 bg-zinc-800 rounded-full overflow-hidden mt-1">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{
                        width: `${(product.quantity / reportData.topProducts[0].quantity) * 100}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-zinc-500 text-center py-8">Sin datos de ventas aún</p>
        )}
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-3xl p-4">
        <p className="text-sm text-blue-400">
          ℹ️ Los reportes se actualizan en tiempo real basado en tus facturas y ventas.
        </p>
      </div>
    </div>
  );
}
