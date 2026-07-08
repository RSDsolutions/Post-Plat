import React, { useState, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchData } from '../../lib/supabaseHelpers.js';
import { formatUSD } from '../../lib/format.js';

export default function SalesAnalytics() {
  const { currentUser } = useStore();
  const [stats, setStats] = useState({ total: 0, count: 0, avg: 0 });

  useEffect(() => {
    const load = async () => {
      try {
        const invoices = await fetchData('invoices', {
          filter: { column: 'company_id', value: currentUser.company_id }
        });
        const total = invoices.reduce((s, i) => s + (i.total_amount || 0), 0);
        setStats({ total, count: invoices.length, avg: total / (invoices.length || 1) });
      } catch (e) { console.error(e); }
    };
    if (currentUser?.company_id) load();
  }, [currentUser]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-4xl font-bold text-zinc-100">Análisis de Ventas</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <TrendingUp className="text-emerald-500 mb-2" size={28} />
          <div className="text-sm text-zinc-500">Ventas Totales</div>
          <div className="text-3xl font-bold text-emerald-400">{formatUSD(stats.total)}</div>
        </div>
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <div className="text-sm text-zinc-500">Total Facturas</div>
          <div className="text-3xl font-bold text-blue-400">{stats.count}</div>
        </div>
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <div className="text-sm text-zinc-500">Promedio</div>
          <div className="text-3xl font-bold text-amber-400">{formatUSD(stats.avg)}</div>
        </div>
      </div>
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
        <p className="text-blue-400">Reportes detallados en desarrollo</p>
      </div>
    </div>
  );
}
