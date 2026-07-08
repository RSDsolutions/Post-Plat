import React, { useState } from 'react';
import { ArrowLeft, Check, X } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import Badge from '../ui/Badge.jsx';
import Tabs from '../ui/Tabs.jsx';
import Modal from '../ui/Modal.jsx';
import { getBrandInitials } from '../../lib/brand.js';
import { formatDate, daysFrom } from '../../lib/dates.js';
import { formatUSD } from '../../lib/format.js';

export default function CompanyDetail() {
  const { companies, plans, selectedCompanyId, setActivePage, companyDetailTab, setCompanyDetailTab, openEditCompany, registerPayment, suspendCompany, reactivateCompany, openConfirm, updatePlan, updateCompanyNotes, showToast, addActivityEvent, recalculateAlerts } = useStore();
  
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [selectedNewPlan, setSelectedNewPlan] = useState('');
  const [notes, setNotes] = useState('');

  const company = companies.find(c => c.id === selectedCompanyId);
  if (!company) return null;

  const plan = plans.find(p => p.id === company.planId);

  const handleNotesSave = () => {
    updateCompanyNotes(company.id, notes);
  };

  React.useEffect(() => {
    setNotes(company.internalNotes || '');
  }, [company.internalNotes, company.id]);

  const handleSuspend = () => {
    if (company.subscriptionStatus === 'Suspendida') {
      openConfirm(
        'Reactivar empresa',
        `¿Estás seguro que deseas reactivar a ${company.nombreComercial}? Su estado de suscripción volverá a ser Activa.`,
        () => reactivateCompany(company.id)
      );
    } else {
      openConfirm(
        'Suspender empresa',
        `Al suspender a ${company.nombreComercial}, no podrán emitir más comprobantes. Se registrará este evento.`,
        (motive, reason) => suspendCompany(company.id, motive, reason)
      );
    }
  };

  const handleChangePlan = () => {
    if (!selectedNewPlan) return;
    const newPlanObj = plans.find(p => p.id === selectedNewPlan);
    
    // Simulate updating company plan
    company.planId = selectedNewPlan; 
    addActivityEvent('Plan modificado', company.nombreComercial, `${plan.name} → ${newPlanObj.name}`);
    recalculateAlerts();
    showToast('success', 'Plan actualizado correctamente.');
    setShowPlanModal(false);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <button 
          onClick={() => setActivePage('companies')}
          className="text-xs uppercase tracking-widest font-bold text-zinc-500 hover:text-zinc-300 flex items-center mb-4 transition-colors"
        >
          <ArrowLeft size={16} className="mr-1" /> Volver a empresas
        </button>
      </div>

      <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-sm p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 font-bold text-xl">
            {getBrandInitials(company.nombreComercial)}
          </div>
          <div>
            <div className="flex items-center space-x-3 mb-1">
              <h1 className="text-2xl font-bold text-zinc-100">{company.nombreComercial}</h1>
              <Badge status={company.subscriptionStatus} />
            </div>
            <p className="text-sm text-zinc-500 font-medium">{company.razonSocial} <span className="text-zinc-700 mx-1">•</span> <span className="font-mono">RUC: {company.ruc}</span></p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={() => showToast('info', 'En el producto real: acceso temporal al panel operativo de la empresa sin revelar su contraseña.')}
            className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors"
          >
            Entrar como soporte
          </button>
          <button 
            onClick={() => openEditCompany(company.id)}
            className="border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors"
          >
            Editar
          </button>
          <button 
            onClick={() => { setSelectedNewPlan(company.planId); setShowPlanModal(true); }}
            className="border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors"
          >
            Cambiar plan
          </button>
          {company.subscriptionStatus !== 'Activa' && company.subscriptionStatus !== 'Suspendida' && (
             <button 
               onClick={() => registerPayment(company.id)}
               className="border border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand)]/10 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors"
             >
               Registrar pago
             </button>
          )}
          <button 
            onClick={handleSuspend}
            className={`${company.subscriptionStatus === 'Suspendida' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20'} border font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors`}
          >
            {company.subscriptionStatus === 'Suspendida' ? 'Reactivar' : 'Suspender'}
          </button>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden">
        <Tabs 
          tabs={[
            { id: 'resumen', label: 'Resumen' },
            { id: 'suscripcion', label: 'Suscripción y Pagos' },
            { id: 'consumo', label: 'Consumo y Límites' },
            { id: 'notas', label: 'Notas internas' }
          ]}
          activeTab={companyDetailTab}
          onTabChange={setCompanyDetailTab}
        />
        
        <div className="p-6 text-zinc-300">
          {companyDetailTab === 'resumen' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="text-base font-bold text-zinc-100 border-b border-zinc-800 pb-2">Datos Fiscales</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="text-zinc-500 font-medium">Razón Social:</div><div className="font-bold text-zinc-100">{company.razonSocial}</div>
                  <div className="text-zinc-500 font-medium">RUC:</div><div className="font-bold text-zinc-100 font-mono">{company.ruc}</div>
                  <div className="text-zinc-500 font-medium">Dirección:</div><div className="font-bold text-zinc-100">{company.address}</div>
                  <div className="text-zinc-500 font-medium">Régimen:</div><div className="font-bold text-zinc-100">{company.regimen}</div>
                  <div className="text-zinc-500 font-medium">Contabilidad:</div><div className="font-bold text-zinc-100">{company.llevaContabilidad ? 'Sí' : 'No'}</div>
                  <div className="text-zinc-500 font-medium">Ambiente SRI:</div><div><Badge status={company.environment} /></div>
                  <div className="text-zinc-500 font-medium">Establecimiento:</div><div className="font-bold text-zinc-100 font-mono">{company.establishment}-{company.pointOfSale}</div>
                </div>
                {company.environment === 'Pruebas' && (
                  <div className="mt-4 bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl">
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-500">Esta empresa opera en ambiente de pruebas. Los comprobantes no tienen validez tributaria.</p>
                  </div>
                )}
              </div>
              
              <div className="space-y-4">
                <h3 className="text-base font-bold text-zinc-100 border-b border-zinc-800 pb-2">Certificado de Firma</h3>
                {company.cert ? (() => {
                  const certDays = daysFrom(company.cert.expiresAt);
                  const color = certDays <= 0 ? 'text-red-400 bg-red-500/10 border-red-500/20' : certDays <= 30 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
                  return (
                    <div className={`p-4 border rounded-2xl ${color}`}>
                      <div className="font-bold mb-1">{company.cert.filename}</div>
                      <div className="text-sm mb-2 opacity-80">Vence: {formatDate(company.cert.expiresAt)}</div>
                      <div className="text-xs font-bold uppercase tracking-widest">
                        {certDays <= 0 ? 'Vencido' : `${certDays} días restantes`}
                      </div>
                    </div>
                  );
                })() : (
                  <p className="text-sm font-medium text-zinc-500">No hay certificado configurado.</p>
                )}
              </div>
            </div>
          )}

          {companyDetailTab === 'suscripcion' && (
            <div className="space-y-6">
               {(company.subscriptionStatus === 'Vencida' || company.subscriptionStatus === 'Suspendida') && (
                  <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-start">
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-red-500 mb-1 uppercase tracking-wider">
                        {company.subscriptionStatus === 'Suspendida' ? 'Empresa suspendida' : 'Suscripción vencida'}
                      </h4>
                      <p className="text-sm text-red-400 font-medium">
                        {company.suspensionInfo?.reason || 'El cliente no ha registrado pagos recientes.'}
                      </p>
                    </div>
                  </div>
               )}

               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className="border border-zinc-800 rounded-3xl p-5 bg-zinc-950/50">
                    <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1">Plan actual</div>
                    <div className="text-xl font-bold text-zinc-100">{plan?.name}</div>
                    <div className="text-sm font-medium text-zinc-500 mt-1">{formatUSD(plan?.price)} / {company.billingCycle}</div>
                 </div>
                 <div className="border border-zinc-800 rounded-3xl p-5 bg-zinc-950/50">
                    <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1">Renovación</div>
                    <div className="text-xl font-bold text-zinc-100">{formatDate(company.subscriptionRenewal)}</div>
                    <div className="text-sm font-medium text-zinc-500 mt-1">({daysFrom(company.subscriptionRenewal)} días)</div>
                 </div>
                 <div className="border border-zinc-800 rounded-3xl p-5 bg-zinc-950/50 flex flex-col justify-center items-start">
                    <div className="mb-3"><Badge status={company.paymentStatus} /></div>
                    <button 
                      onClick={() => registerPayment(company.id)}
                      className="text-xs font-bold uppercase tracking-wider text-[var(--brand)] hover:text-white transition-colors"
                    >
                      Registrar pago manualmente →
                    </button>
                 </div>
               </div>

               <h3 className="text-base font-bold text-zinc-100 border-b border-zinc-800 pb-2 pt-4">Historial de pagos</h3>
               <div className="border border-zinc-800 rounded-2xl overflow-hidden">
                 <table className="w-full text-sm text-left">
                   <thead className="bg-zinc-950/50 text-zinc-500 uppercase text-[10px] tracking-widest border-b border-zinc-800 font-bold">
                     <tr>
                       <th className="px-4 py-3">Fecha</th>
                       <th className="px-4 py-3">Monto</th>
                       <th className="px-4 py-3">Método</th>
                       <th className="px-4 py-3">Estado</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-zinc-800">
                     {company.paymentHistory.map((ph, i) => (
                       <tr key={i} className="hover:bg-zinc-800/50 transition-colors">
                         <td className="px-4 py-3 font-medium">{formatDate(ph.date)}</td>
                         <td className="px-4 py-3 font-bold">{formatUSD(ph.amount)}</td>
                         <td className="px-4 py-3 text-zinc-400">{ph.method}</td>
                         <td className="px-4 py-3"><Badge status={ph.status} /></td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          )}

          {companyDetailTab === 'consumo' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div>
                 <h3 className="text-base font-bold text-zinc-100 border-b border-zinc-800 pb-2 mb-4">Consumo del mes actual</h3>
                 <div className="bg-zinc-950/50 border border-zinc-800 p-5 rounded-3xl mb-6">
                    <div className="flex justify-between text-sm mb-3">
                      <span className="font-bold text-zinc-400">Comprobantes emitidos</span>
                      <span className="font-bold text-zinc-100">{company.monthlyComprobantes} / {plan?.comprobantesLimit}</span>
                    </div>
                    <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                      {plan && (() => {
                        const pct = (company.monthlyComprobantes / plan.comprobantesLimit) * 100;
                        const color = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500';
                        return <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />;
                      })()}
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div className="border border-zinc-800 bg-zinc-950/50 p-5 rounded-3xl text-center">
                     <div className="text-3xl font-bold text-zinc-100">{company.prevMonthComprobantes}</div>
                     <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-2">Mes anterior</div>
                   </div>
                   <div className="border border-zinc-800 bg-zinc-950/50 p-5 rounded-3xl text-center">
                     <div className="text-3xl font-bold text-zinc-100">{company.activeUsers} / {plan?.usersLimit}</div>
                     <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-2">Usuarios activos</div>
                   </div>
                 </div>
               </div>

               <div>
                 <h3 className="text-base font-bold text-zinc-100 border-b border-zinc-800 pb-2 mb-4">Características habilitadas</h3>
                 <ul className="space-y-3">
                   <li className="flex items-center text-sm font-medium">
                     <Check size={18} className="text-emerald-500 mr-3" /> <span>Emisión ilimitada (hasta límite de plan)</span>
                   </li>
                   <li className="flex items-center text-sm font-medium">
                     <Check size={18} className="text-emerald-500 mr-3" /> <span>Reportes básicos</span>
                   </li>
                   <li className="flex items-center text-sm font-medium">
                     {plan?.includesProduction ? <Check size={18} className="text-emerald-500 mr-3" /> : <X size={18} className="text-zinc-600 mr-3" />}
                     <span className={plan?.includesProduction ? 'text-zinc-100' : 'text-zinc-600 line-through'}>Módulo de producción</span>
                   </li>
                   <li className="flex items-center text-sm font-medium">
                     {plan?.includesLots ? <Check size={18} className="text-emerald-500 mr-3" /> : <X size={18} className="text-zinc-600 mr-3" />}
                     <span className={plan?.includesLots ? 'text-zinc-100' : 'text-zinc-600 line-through'}>Control de lotes y fechas</span>
                   </li>
                 </ul>
               </div>
            </div>
          )}

          {companyDetailTab === 'notas' && (
            <div className="space-y-4">
               <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Visible solo para tu equipo. No visible para el cliente.</p>
               <textarea
                 className="w-full border border-zinc-800 bg-zinc-950 text-zinc-100 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] placeholder-zinc-600 min-h-[200px]"
                 placeholder="Escribe notas relevantes, acuerdos o recordatorios sobre este cliente..."
                 value={notes}
                 onChange={(e) => setNotes(e.target.value)}
               />
               <button 
                 onClick={handleNotesSave}
                 className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-zinc-950 font-bold px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors"
               >
                 Guardar notas
               </button>
            </div>
          )}
        </div>
      </div>

      {showPlanModal && (
        <Modal 
          title="Cambiar plan" 
          onClose={() => setShowPlanModal(false)}
          footer={
            <>
              <button onClick={() => setShowPlanModal(false)} className="text-zinc-500 hover:text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors">Cancelar</button>
              <button onClick={handleChangePlan} className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-zinc-950 font-bold px-6 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors">Confirmar cambio</button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm font-medium text-zinc-400">Selecciona el nuevo plan para <span className="font-bold text-zinc-100">{company.nombreComercial}</span>. Se actualizarán los límites inmediatamente.</p>
            <div className="grid grid-cols-1 gap-3">
              {plans.map(p => (
                <div 
                  key={p.id}
                  onClick={() => setSelectedNewPlan(p.id)}
                  className={`border rounded-2xl p-5 cursor-pointer transition-all ${selectedNewPlan === p.id ? 'border-[var(--brand)] bg-[var(--brand)]/10 ring-1 ring-[var(--brand)]' : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-600'}`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-zinc-100">{p.name}</h4>
                      <p className="text-xs font-medium text-zinc-500 mt-1">{formatUSD(p.price)}/mes • {p.comprobantesLimit} comprobantes</p>
                    </div>
                    <div className="text-[var(--brand)]">
                      {selectedNewPlan === p.id && <Check size={20} />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
