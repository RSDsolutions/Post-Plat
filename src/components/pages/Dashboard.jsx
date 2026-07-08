import React from 'react';
import { Building2, DollarSign, Clock, Bell, AlertTriangle, Info, ArrowRight, CheckCircle } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import MetricCard from '../ui/MetricCard.jsx';
import Badge from '../ui/Badge.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { formatUSD, formatMRR } from '../../lib/format.js';
import { formatDateRelative } from '../../lib/dates.js';

export default function Dashboard() {
  const { companies, plans, alerts, selectCompany, setActivePage } = useStore();

  const activeCompanies = companies.filter(c => c.subscriptionStatus === 'Activa').length;
  const mrr = formatMRR(companies, plans);
  const expiringSubs = companies.filter(c => c.subscriptionStatus === 'Por vencer').length;
  const openAlerts = alerts.filter(a => !a.attended);

  const recentCompanies = [...companies].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3);
  const topAlerts = [...openAlerts].sort((a, b) => a.severity === 'danger' ? -1 : 1).slice(0, 5);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-4xl font-bold tracking-tighter uppercase text-zinc-100">Inicio</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={Building2} label="Empresas activas" value={activeCompanies} color="brand" />
        <MetricCard icon={DollarSign} label="Ingresos MRR" value={formatUSD(mrr)} color="green" />
        <MetricCard icon={Clock} label="Suscripciones por vencer" value={expiringSubs} color="amber" />
        <MetricCard icon={Bell} label="Alertas abiertas" value={openAlerts.length} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="font-bold text-lg text-zinc-100 mb-2">Requiere Atención</h2>
          {topAlerts.length > 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden p-2">
              <ul className="divide-y divide-zinc-800">
                {topAlerts.map(alert => (
                  <li key={alert.id} className="p-4 hover:bg-zinc-800/50 transition-colors rounded-2xl">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <div className="mt-0.5">
                          {alert.severity === 'danger' ? (
                            <AlertTriangle size={18} className="text-red-500" />
                          ) : (
                            <Info size={18} className="text-amber-500" />
                          )}
                        </div>
                        <div>
                          <button 
                            onClick={() => selectCompany(alert.companyId)}
                            className="text-sm font-bold text-zinc-100 hover:text-[var(--brand)] transition-colors"
                          >
                            {alert.companyName}
                          </button>
                          <p className="text-xs text-zinc-500 mt-0.5">{alert.message}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => selectCompany(alert.companyId)}
                        className="text-xs font-bold text-[var(--brand)] hover:text-[var(--brand-dark)] flex items-center uppercase tracking-wider"
                      >
                        Ver detalle <ArrowRight size={14} className="ml-1" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyState icon={CheckCircle} title="Todo en orden" description="Sin alertas pendientes que requieran atención inmediata." />
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-lg text-zinc-100">Últimas Empresas</h2>
            <button 
              onClick={() => setActivePage('companies')}
              className="text-xs font-bold text-zinc-500 hover:text-[var(--brand)] uppercase tracking-widest transition-colors"
            >
              Ver todas
            </button>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden p-2">
            <ul className="divide-y divide-zinc-800">
              {recentCompanies.map(company => {
                const plan = plans.find(p => p.id === company.planId);
                return (
                  <li key={company.id} className="p-2">
                    <div className="flex justify-between items-start hover:bg-zinc-800/50 p-2 rounded-2xl transition-colors">
                      <div>
                        <button 
                          onClick={() => selectCompany(company.id)}
                          className="text-sm font-bold text-zinc-100 hover:text-[var(--brand)] block text-left transition-colors"
                        >
                          {company.nombreComercial}
                        </button>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">{plan?.name}</span>
                          <span className="text-zinc-700">•</span>
                          <span className="text-[10px] text-zinc-600">{formatDateRelative(company.createdAt)}</span>
                        </div>
                      </div>
                      <Badge status={company.subscriptionStatus} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
