import React, { useState } from 'react';
import { CreditCard, Edit2, Check } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { formatUSD, formatMRR } from '../../lib/format.js';
import Badge from '../ui/Badge.jsx';
import Table from '../ui/Table.jsx';
import { formatDate } from '../../lib/dates.js';

export default function Subscriptions() {
  const { companies, plans, updatePlan, registerPayment } = useStore();
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [editData, setEditData] = useState({ name: '', price: 0 });

  const activeCompanies = companies.filter(c => c.subscriptionStatus === 'Activa');
  const mrr = formatMRR(companies, plans);

  const handleEditPlan = (plan) => {
    setEditingPlanId(plan.id);
    setEditData({ name: plan.name, price: plan.price });
  };

  const handleSavePlan = (planId) => {
    updatePlan(planId, { name: editData.name, price: Number(editData.price) });
    setEditingPlanId(null);
  };

  const sortedCompanies = [...companies].sort((a, b) => new Date(a.subscriptionRenewal) - new Date(b.subscriptionRenewal));

  return (
    <div className="max-w-7xl mx-auto space-y-6 text-zinc-300">
      <h1 className="text-2xl font-bold text-zinc-100">Suscripciones y planes</h1>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-3xl p-5 flex items-start space-x-4">
        <div className="p-2.5 bg-blue-500/20 rounded-2xl text-blue-400 shrink-0">
          <CreditCard size={24} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-blue-400 mb-1">Tú defines los precios a tus clientes</h3>
          <p className="text-sm text-blue-200/70">
            La plataforma te factura $15.00 por empresa activa y $0.05 por comprobante emitido. Los planes a continuación son lo que tú le cobras a tus clientes.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map(plan => {
          const isEditing = editingPlanId === plan.id;
          return (
              <div key={plan.id} className={`bg-zinc-900 rounded-3xl border ${isEditing ? 'border-[var(--brand)] shadow-lg shadow-[var(--brand)]/10 ring-1 ring-[var(--brand)]' : 'border-zinc-800'} p-6 relative transition-all`}>
              {!isEditing && (
                <button onClick={() => handleEditPlan(plan)} className="absolute top-5 right-5 text-zinc-500 hover:text-[var(--brand)] transition-colors">
                  <Edit2 size={18} />
                </button>
              )}
              
              {isEditing ? (
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Nombre del plan</label>
                    <input type="text" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Precio mensual (USD)</label>
                    <input type="number" value={editData.price} onChange={e => setEditData({...editData, price: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-xl px-3 py-2 font-bold text-lg focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" min={0} />
                  </div>
                  <button onClick={() => handleSavePlan(plan.id)} className="w-full bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-zinc-950 text-sm font-bold uppercase tracking-wider py-2.5 rounded-xl flex items-center justify-center transition-colors">
                    <Check size={16} className="mr-2" strokeWidth={3} /> Guardar
                  </button>
                </div>
              ) : (
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-zinc-100">{plan.name}</h3>
                  <div className="flex items-baseline mt-2">
                    <span className="text-4xl font-black tracking-tight text-zinc-100">{formatUSD(plan.price)}</span>
                    <span className="text-zinc-500 font-medium ml-1">/mes</span>
                  </div>
                </div>
              )}

              <ul className="space-y-3 text-sm text-zinc-400 border-t border-zinc-800/50 pt-5 font-medium">
                <li className="flex items-center"><Check size={16} className="text-emerald-500 mr-2" /> <span>{plan.comprobantesLimit} comprobantes/mes</span></li>
                <li className="flex items-center"><Check size={16} className="text-emerald-500 mr-2" /> <span>{plan.usersLimit} usuarios permitidos</span></li>
                <li className="flex items-center"><Check size={16} className="text-emerald-500 mr-2" /> <span>{plan.branchesLimit} sucursales</span></li>
                {plan.includesLots && <li className="flex items-center"><Check size={16} className="text-emerald-500 mr-2" /> <span>Control de lotes</span></li>}
                {plan.includesProduction && <li className="flex items-center"><Check size={16} className="text-emerald-500 mr-2" /> <span>Módulo de producción</span></li>}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6">
        <h2 className="text-lg font-bold text-zinc-100 mb-4">Ingresos Mensuales Recurrentes estimados: <span className="text-[var(--brand)]">{formatUSD(mrr)}</span></h2>
        <p className="text-sm font-medium text-zinc-400 mb-6">
          {activeCompanies.length} empresas activas: 
          {plans.map((p, i) => {
            const count = activeCompanies.filter(c => c.planId === p.id).length;
            if (count === 0) return null;
            return <span key={p.id} className="text-zinc-300"> {count} × {p.name} ({formatUSD(p.price)}){i < plans.length - 1 ? <span className="text-zinc-600"> +</span> : ''}</span>;
          })}
          <span className="text-zinc-500"> = </span><span className="text-[var(--brand)]">{formatUSD(mrr)} MRR</span>
        </p>
        
        <div className="w-full h-3 rounded-full bg-zinc-950 overflow-hidden flex border border-zinc-800/50">
          {plans.map(p => {
            const count = activeCompanies.filter(c => c.planId === p.id).length;
            if (count === 0) return null;
            const portion = (count * p.price) / mrr * 100;
            return (
              <div key={p.id} style={{ width: `${portion}%`, backgroundColor: '#10b981' }} className="flex items-center justify-center text-xs font-bold text-white overflow-hidden transition-all duration-500">
                {portion > 10 ? p.name : ''}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden">
        <div className="px-6 py-5 border-b border-zinc-800 bg-zinc-950/30">
          <h2 className="text-lg font-bold text-zinc-100">Estado de suscripciones</h2>
        </div>
        <Table 
          columns={['Empresa', 'Plan', 'Ciclo', 'Próximo cobro', 'Estado', 'Acción']}
          data={sortedCompanies}
          renderRow={(company) => {
            const plan = plans.find(p => p.id === company.planId);
            return (
              <tr key={company.id} className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/50 last:border-0">
                <td className="px-5 py-4 font-bold text-zinc-100">{company.nombreComercial}</td>
                <td className="px-5 py-4"><span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{plan?.name}</span></td>
                <td className="px-5 py-4 font-medium text-zinc-300 capitalize">{company.billingCycle}</td>
                <td className="px-5 py-4 font-medium text-zinc-400">{formatDate(company.subscriptionRenewal)}</td>
                <td className="px-5 py-4"><Badge status={company.paymentStatus} /></td>
                <td className="px-5 py-4">
                  <button 
                    onClick={() => registerPayment(company.id)}
                    className="text-sm font-bold uppercase tracking-wider text-[var(--brand)] hover:text-white transition-colors"
                    disabled={company.subscriptionStatus === 'Suspendida'}
                  >
                    Registrar pago
                  </button>
                </td>
              </tr>
            );
          }}
        />
      </div>
    </div>
  );
}
