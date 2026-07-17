import React, { useState } from 'react';
import { DollarSign, TrendingUp, Building2, PieChart, Activity, Loader, Wifi, WifiOff, TrendingDown } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import MetricCard from '../ui/MetricCard.jsx';
import { formatUSD, formatMRR, formatNumber, computeMonthlyChurn } from '../../lib/format.js';
import { checkSriStatus } from '../../lib/supabaseHelpers.js';

export default function Metrics() {
  const { companies, plans, activityLog, selectCompany, monthlyInvoiceCounts } = useStore();
  const [sriStatus, setSriStatus] = useState(null);
  const [checkingSri, setCheckingSri] = useState(false);

  const mrr = formatMRR(companies, plans);
  const arr = mrr * 12;
  const statusCounts = companies.reduce((acc, c) => {
    acc[c.subscriptionStatus] = (acc[c.subscriptionStatus] || 0) + 1;
    return acc;
  }, {});
  const churn = computeMonthlyChurn(companies, plans, activityLog);

  const planDistribution = plans.map(plan => ({
    plan,
    count: companies.filter(c => c.planId === plan.id).length
  })).sort((a, b) => b.count - a.count);
  const maxPlanCount = Math.max(1, ...planDistribution.map(p => p.count));

  const topByUsage = [...companies]
    .map(c => ({ ...c, currentInvoiceUsage: monthlyInvoiceCounts[c.id]?.current || 0 }))
    .filter(c => c.currentInvoiceUsage > 0)
    .sort((a, b) => b.currentInvoiceUsage - a.currentInvoiceUsage)
    .slice(0, 5);

  const handleCheckSri = async () => {
    setCheckingSri(true);
    try {
      setSriStatus(await checkSriStatus());
    } catch (error) {
      setSriStatus({ error: error.message || 'No se pudo verificar el estado del SRI' });
    } finally {
      setCheckingSri(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-4xl font-bold tracking-tighter uppercase text-[var(--text-primary)]">Métricas</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard icon={DollarSign} label="MRR" value={formatUSD(mrr)} color="green" />
        <MetricCard icon={TrendingUp} label="ARR" value={formatUSD(arr)} color="brand" />
        <MetricCard icon={Building2} label="Total empresas" value={companies.length} color="blue" />
        <MetricCard icon={Activity} label="Activas" value={statusCounts['Activa'] || 0} color="green" />
        <MetricCard icon={TrendingDown} label="Churn del mes" value={formatNumber(churn.count)} color="red" />
      </div>
      {churn.limitedData && (
        <p className="text-xs text-[var(--text-muted)] -mt-2">
          Churn: datos limitados — pocas empresas registradas todavía para que el número sea representativo.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="font-bold text-lg text-[var(--text-primary)] flex items-center gap-2"><PieChart size={18} /> Distribución por plan</h2>
          <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-3xl p-5 space-y-4">
            {planDistribution.map(({ plan, count }) => (
              <div key={plan.id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-bold text-zinc-300">{plan.name}</span>
                  <span className="text-[var(--text-muted)]">{count} empresa{count === 1 ? '' : 's'}</span>
                </div>
                <div className="w-full h-2.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${(count / maxPlanCount) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>

          <h2 className="font-bold text-lg text-[var(--text-primary)] pt-2">Estado de suscripciones</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['Activa', 'Por vencer', 'Vencida', 'Suspendida'].map(status => (
              <div key={status} className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl p-4 text-center">
                <div className="text-2xl font-bold text-[var(--text-primary)]">{statusCounts[status] || 0}</div>
                <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-1">{status}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="font-bold text-lg text-[var(--text-primary)]">Top consumo de facturas</h2>
          <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-3xl overflow-hidden p-2">
            {topByUsage.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] p-4">Sin consumo registrado todavía</p>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {topByUsage.map(c => (
                  <li key={c.id} className="p-3">
                    <button onClick={() => selectCompany(c.id)} className="w-full text-left hover:bg-[var(--surface-2)]/50 p-2 rounded-xl transition-colors flex justify-between items-center">
                      <span className="text-sm font-bold text-[var(--text-primary)] truncate">{c.nombreComercial}</span>
                      <span className="text-sm font-bold text-[var(--brand)] flex-shrink-0 ml-2">{formatNumber(c.currentInvoiceUsage)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <h2 className="font-bold text-lg text-[var(--text-primary)] pt-2">Estado del SRI</h2>
          <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-3xl p-5 space-y-3">
            <button
              onClick={handleCheckSri}
              disabled={checkingSri}
              className="w-full bg-[var(--surface-2)] hover:bg-zinc-700 text-zinc-200 font-bold py-2 rounded-xl text-xs uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {checkingSri ? <Loader size={14} className="animate-spin" /> : <Activity size={14} />}
              {checkingSri ? 'Verificando...' : 'Verificar estado del SRI'}
            </button>
            {sriStatus && !sriStatus.error && (
              <div className="space-y-2">
                {sriStatus.services.map(s => (
                  <div key={s.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-zinc-400">
                      {s.reachable ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-red-500" />}
                      {s.name}
                    </span>
                    <span className={s.reachable ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                      {s.reachable ? `${s.latencyMs}ms` : 'Sin respuesta'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {sriStatus?.error && <p className="text-xs text-red-400">{sriStatus.error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
