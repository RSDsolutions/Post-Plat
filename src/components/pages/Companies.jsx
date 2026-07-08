import React from 'react';
import { Plus, Building2 } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import Badge from '../ui/Badge.jsx';
import Table from '../ui/Table.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { daysFrom } from '../../lib/dates.js';

export default function Companies() {
  const { companies, plans, companySearch, setCompanySearch, companyStatusFilter, setCompanyStatusFilter, companyPlanFilter, setCompanyPlanFilter, openWizard, selectCompany, globalSearch } = useStore();

  const filtered = companies.filter(c => {
    const search = (companySearch || globalSearch).toLowerCase();
    const matchesSearch = c.nombreComercial.toLowerCase().includes(search) || c.ruc.includes(search);
    const matchesStatus = companyStatusFilter === 'all' || c.subscriptionStatus === companyStatusFilter;
    const matchesPlan = companyPlanFilter === 'all' || c.planId === companyPlanFilter;
    return matchesSearch && matchesStatus && matchesPlan;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-4xl font-bold tracking-tighter uppercase text-zinc-100">Empresas</h1>
        <button 
          onClick={openWizard}
          className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-zinc-950 font-bold px-6 py-3 rounded-2xl text-sm flex items-center shrink-0 w-fit transition-colors"
        >
          <Plus size={18} className="mr-2" /> Nueva empresa
        </button>
      </div>

      <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-4 flex flex-col md:flex-row gap-4">
        <input
          type="text"
          placeholder="Buscar por nombre o RUC..."
          value={companySearch}
          onChange={(e) => setCompanySearch(e.target.value)}
          className="flex-1 border border-zinc-800 bg-zinc-950 text-zinc-100 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] placeholder-zinc-500"
        />
        <div className="flex items-center space-x-2 overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
          <span className="text-xs uppercase tracking-widest font-bold text-zinc-500 whitespace-nowrap mr-2">Estado:</span>
          {['all', 'Activa', 'Por vencer', 'Vencida', 'Suspendida'].map(status => (
            <button
              key={status}
              onClick={() => setCompanyStatusFilter(status)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                companyStatusFilter === status 
                  ? 'bg-zinc-100 text-zinc-950' 
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'
              }`}
            >
              {status === 'all' ? 'Todas' : status}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden">
        {filtered.length > 0 ? (
          <Table 
            columns={['Empresa', 'RUC', 'Plan', 'Estado', 'Comprobantes/mes', 'Cert. firma', 'Acciones']}
            data={filtered}
            renderRow={(company) => {
              const plan = plans.find(p => p.id === company.planId);
              const pct = plan ? (company.monthlyComprobantes / plan.comprobantesLimit) * 100 : 0;
              const certDays = company.cert ? daysFrom(company.cert.expiresAt) : null;
              
              return (
                <tr key={company.id} className="hover:bg-zinc-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <button onClick={() => selectCompany(company.id)} className="text-left group block">
                      <div className="text-sm font-bold text-zinc-100 group-hover:text-[var(--brand)] transition-colors">{company.nombreComercial}</div>
                      <div className="text-xs text-zinc-500 truncate max-w-[200px]">{company.razonSocial}</div>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-zinc-400">{company.ruc}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {plan?.name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge status={company.subscriptionStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-zinc-100 font-bold">{company.monthlyComprobantes}</div>
                    <div className="w-24 h-1.5 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                      <div className={`h-full rounded-full ${pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {company.cert ? (
                      <div>
                        <div className={`text-sm font-bold ${certDays <= 0 ? 'text-red-500' : certDays <= 30 ? 'text-amber-500' : 'text-emerald-500'}`}>
                          {certDays <= 0 ? 'Vencido' : `${certDays} días`}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-zinc-600 font-medium">Sin cert.</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button 
                      onClick={() => selectCompany(company.id)}
                      className="text-[10px] uppercase tracking-wider font-bold text-[var(--brand)] hover:text-white transition-colors whitespace-nowrap"
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              );
            }}
          />
        ) : (
          <EmptyState icon={Building2} title="No se encontraron empresas" description="Ajusta los filtros de búsqueda o crea una nueva empresa." />
        )}
      </div>
    </div>
  );
}
