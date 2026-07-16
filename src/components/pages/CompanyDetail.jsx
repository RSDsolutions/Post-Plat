import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Download, LogIn, CheckCircle2, Circle, Loader } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import Badge from '../ui/Badge.jsx';
import Tabs from '../ui/Tabs.jsx';
import Modal from '../ui/Modal.jsx';
import PaymentModal from '../ui/PaymentModal.jsx';
import CompanyUsersTab from './CompanyUsersTab.jsx';
import { getBrandInitials } from '../../lib/brand.js';
import { formatDate, daysFrom, buildPaymentSequence } from '../../lib/dates.js';
import { formatUSD } from '../../lib/format.js';
import { computeHealthScore, computeOnboardingChecklist } from '../../lib/healthScore.js';
import {
  fetchFeatureFlags, fetchCompanyFeatureOverrides, setCompanyFeatureOverride, clearCompanyFeatureOverride,
  fetchPayments, fetchOnboardingCounts, fetchCompanyExportBundle
} from '../../lib/supabaseHelpers.js';

const HEALTH_COLORS = {
  Alto: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Medio: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Bajo: 'bg-red-500/10 text-red-400 border-red-500/20'
};

export default function CompanyDetail() {
  const {
    companies, plans, selectedCompanyId, setActivePage, companyDetailTab, setCompanyDetailTab,
    openEditCompany, suspendCompany, reactivateCompany, openConfirm, changeCompanyPlan,
    updateCompanyNotes, updateCompanyCustomPrice, updateCompanyTrialEndsAt, showToast, currentUser,
    impersonateCompany, monthlyInvoiceCounts
  } = useStore();

  const [showPlanModal, setShowPlanModal] = useState(false);
  const [selectedNewPlan, setSelectedNewPlan] = useState('');
  const [notes, setNotes] = useState('');

  const [featureFlags, setFeatureFlags] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [savingFeatureKey, setSavingFeatureKey] = useState(null);

  const [payments, setPayments] = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const [customPriceInput, setCustomPriceInput] = useState('');
  const [trialInput, setTrialInput] = useState('');
  const [onboarding, setOnboarding] = useState(null);
  const [exporting, setExporting] = useState(false);

  const company = companies.find(c => c.id === selectedCompanyId);
  const plan = plans.find(p => p.id === company?.planId);
  // Contado en vivo contra invoices (mismo criterio que el trigger de límite
  // de plan), no companies.monthly_comprobantes/prev_month_comprobantes ya
  // retirados - ver supabase/migrations/20260724_plan_limit_enforcement.sql.
  const invoiceUsage = (company && monthlyInvoiceCounts[company.id]) || { current: 0, previous: 0 };

  const loadPayments = async (companyId) => {
    try {
      setPayments(await fetchPayments(companyId));
    } catch (error) {
      console.error('Error loading payments:', error);
    }
  };

  useEffect(() => {
    if (!company) return;
    setNotes(company.internalNotes || '');
    setCustomPriceInput(company.customPrice != null ? String(company.customPrice) : '');
    setTrialInput(company.trialEndsAt ? company.trialEndsAt.toISOString().slice(0, 10) : '');

    Promise.all([fetchFeatureFlags(), fetchCompanyFeatureOverrides(company.id)])
      .then(([flags, ov]) => { setFeatureFlags(flags); setOverrides(ov); })
      .catch(error => console.error('Error loading feature flags:', error));

    loadPayments(company.id);

    fetchOnboardingCounts(company.id)
      .then(setOnboarding)
      .catch(error => console.error('Error loading onboarding counts:', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  if (!company) return null;

  const handleNotesSave = () => {
    updateCompanyNotes(company.id, notes);
  };

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
    changeCompanyPlan(company.id, selectedNewPlan);
    setShowPlanModal(false);
  };

  const handleToggleFeature = async (flagKey, effective) => {
    setSavingFeatureKey(flagKey);
    try {
      await setCompanyFeatureOverride({ companyId: company.id, featureKey: flagKey, enabled: !effective, adminId: currentUser?.id });
      setOverrides(await fetchCompanyFeatureOverrides(company.id));
    } catch (error) {
      console.error('Error toggling feature:', error);
      showToast('error', error.message || 'Error al actualizar la funcionalidad');
    } finally {
      setSavingFeatureKey(null);
    }
  };

  const handleResetFeature = async (flagKey) => {
    setSavingFeatureKey(flagKey);
    try {
      await clearCompanyFeatureOverride(company.id, flagKey);
      setOverrides(await fetchCompanyFeatureOverrides(company.id));
    } catch (error) {
      console.error('Error resetting feature override:', error);
      showToast('error', error.message || 'Error al restaurar la funcionalidad');
    } finally {
      setSavingFeatureKey(null);
    }
  };

  const handleSaveCustomPrice = () => {
    const trimmed = customPriceInput.trim();
    const value = trimmed === '' ? null : parseFloat(trimmed);
    updateCompanyCustomPrice(company.id, Number.isFinite(value) ? value : null);
  };

  const handleSaveTrial = () => {
    const value = trialInput ? new Date(`${trialInput}T23:59:59`) : null;
    updateCompanyTrialEndsAt(company.id, value);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const bundle = await fetchCompanyExportBundle(company.id);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${company.nombreComercial.replace(/\s+/g, '_')}_export_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('success', 'Datos exportados');
    } catch (error) {
      console.error('Error exporting company data:', error);
      showToast('error', error.message || 'Error al exportar los datos');
    } finally {
      setExporting(false);
    }
  };

  const paymentSequence = buildPaymentSequence(payments, company.subscriptionRenewal);
  const health = computeHealthScore(company, plan, invoiceUsage);
  const checklist = onboarding ? computeOnboardingChecklist({ certUploaded: company.certUploaded, ...onboarding }) : null;
  const checklistDone = checklist ? checklist.every(i => i.done) : false;

  const prorationInfo = (() => {
    if (!selectedNewPlan || selectedNewPlan === company.planId || !company.subscriptionRenewal) return null;
    const newPlan = plans.find(p => p.id === selectedNewPlan);
    if (!newPlan) return null;
    const daysRemaining = Math.max(0, daysFrom(company.subscriptionRenewal));
    const currentPrice = company.customPrice ?? (plan?.price || 0);
    const diff = ((newPlan.price - currentPrice) / 30) * daysRemaining;
    return { daysRemaining, diff };
  })();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <button
          onClick={() => setActivePage('companies')}
          className="text-xs uppercase tracking-widest font-bold text-[var(--text-muted)] hover:text-zinc-300 flex items-center mb-4 transition-colors"
        >
          <ArrowLeft size={16} className="mr-1" /> Volver a empresas
        </button>
      </div>

      <div className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border-subtle)] shadow-sm p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-[var(--surface-2)] border border-zinc-700 flex items-center justify-center text-zinc-400 font-bold text-xl">
            {getBrandInitials(company.nombreComercial)}
          </div>
          <div>
            <div className="flex items-center space-x-3 mb-1 flex-wrap gap-y-1">
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">{company.nombreComercial}</h1>
              <Badge status={company.subscriptionStatus} />
              <span className={`inline-flex items-center rounded-full text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider border ${HEALTH_COLORS[health.level]}`} title={health.reasons.join(' · ') || 'Sin señales negativas'}>
                Salud: {health.level}
              </span>
            </div>
            <p className="text-sm text-[var(--text-muted)] font-medium">{company.razonSocial} <span className="text-zinc-700 mx-1">•</span> <span className="font-mono">RUC: {company.ruc}</span></p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            {exporting ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
            Exportar datos
          </button>
          <button
            onClick={() => impersonateCompany(company.id)}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors"
          >
            <LogIn size={14} />
            Ver como cliente
          </button>
          <button
            onClick={() => openEditCompany(company.id)}
            className="border border-zinc-700 bg-[var(--surface-2)] text-zinc-300 hover:bg-zinc-700 hover:text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors"
          >
            Editar
          </button>
          <button
            onClick={() => { setSelectedNewPlan(company.planId); setShowPlanModal(true); }}
            className="border border-zinc-700 bg-[var(--surface-2)] text-zinc-300 hover:bg-zinc-700 hover:text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors"
          >
            Cambiar plan
          </button>
          <button
            onClick={() => setShowPaymentModal(true)}
            className="border border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand)]/10 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors"
          >
            Registrar pago
          </button>
          <button
            onClick={handleSuspend}
            className={`${company.subscriptionStatus === 'Suspendida' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20'} border font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors`}
          >
            {company.subscriptionStatus === 'Suspendida' ? 'Reactivar' : 'Suspender'}
          </button>
        </div>
      </div>

      <div className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border-subtle)] overflow-hidden">
        <Tabs
          tabs={[
            { id: 'resumen', label: 'Resumen' },
            { id: 'usuarios', label: 'Usuarios' },
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
                <h3 className="text-base font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2">Datos Fiscales</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="text-[var(--text-muted)] font-medium">Razón Social:</div><div className="font-bold text-[var(--text-primary)]">{company.razonSocial}</div>
                  <div className="text-[var(--text-muted)] font-medium">RUC:</div><div className="font-bold text-[var(--text-primary)] font-mono">{company.ruc}</div>
                  <div className="text-[var(--text-muted)] font-medium">Dirección:</div><div className="font-bold text-[var(--text-primary)]">{company.address}</div>
                  <div className="text-[var(--text-muted)] font-medium">Régimen:</div><div className="font-bold text-[var(--text-primary)]">{company.regimen}</div>
                  <div className="text-[var(--text-muted)] font-medium">Contabilidad:</div><div className="font-bold text-[var(--text-primary)]">{company.llevaContabilidad ? 'Sí' : 'No'}</div>
                  <div className="text-[var(--text-muted)] font-medium">Ambiente SRI:</div><div><Badge status={company.environment} /></div>
                  <div className="text-[var(--text-muted)] font-medium">Sucursales:</div><div className="font-bold text-[var(--text-primary)]">{company.branches} configurada{company.branches === 1 ? '' : 's'}</div>
                </div>
                {company.environment === 'Pruebas' && (
                  <div className="mt-4 bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl">
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-500">Esta empresa opera en ambiente de pruebas. Los comprobantes no tienen validez tributaria.</p>
                  </div>
                )}

                <h3 className="text-base font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2 pt-2">Certificado de Firma</h3>
                {company.certUploaded ? (
                  <div className="p-4 border rounded-2xl text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                    <div className="font-bold mb-1">Certificado cargado</div>
                    {company.certUploadedAt && (
                      <div className="text-sm opacity-80">Subido: {formatDate(company.certUploadedAt)}</div>
                    )}
                    <p className="text-xs opacity-70 mt-2">La fecha de vencimiento la administra el cliente desde su propio panel (Facturación SRI).</p>
                  </div>
                ) : (
                  <p className="text-sm font-medium text-[var(--text-muted)]">El cliente aún no ha cargado su certificado de firma. Lo hace desde su propio panel (Facturación SRI).</p>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="text-base font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2">Onboarding</h3>
                {!checklist ? (
                  <p className="text-sm text-[var(--text-muted)]">Cargando...</p>
                ) : checklistDone ? (
                  <div className="p-4 border rounded-2xl text-emerald-400 bg-emerald-500/10 border-emerald-500/20 flex items-center gap-2">
                    <CheckCircle2 size={18} />
                    <span className="font-bold text-sm">Onboarding completo</span>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {checklist.map(item => (
                      <li key={item.key} className="flex items-center gap-2 text-sm">
                        {item.done ? <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" /> : <Circle size={16} className="text-[var(--text-faint)] flex-shrink-0" />}
                        <span className={item.done ? 'text-zinc-300' : 'text-[var(--text-muted)]'}>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {health.reasons.length > 0 && (
                  <>
                    <h3 className="text-base font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2 pt-2">Señales de salud</h3>
                    <ul className="space-y-1.5">
                      {health.reasons.map((r, i) => (
                        <li key={i} className="text-sm text-amber-400 flex items-start gap-2">
                          <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" /> {r}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}

          {companyDetailTab === 'usuarios' && (
            <CompanyUsersTab company={company} />
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
                 <div className="border border-[var(--border-subtle)] rounded-3xl p-5 bg-[var(--surface-0)]/50">
                    <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest mb-1">Plan actual</div>
                    <div className="text-xl font-bold text-[var(--text-primary)]">{plan?.name}</div>
                    <div className="text-sm font-medium text-[var(--text-muted)] mt-1">
                      {formatUSD(company.customPrice ?? plan?.price)} / {plan?.billingCycle || 'mensual'}
                      {company.customPrice != null && <span className="ml-1 text-[10px] text-[var(--brand)] uppercase font-bold">Precio especial</span>}
                    </div>
                 </div>
                 <div className="border border-[var(--border-subtle)] rounded-3xl p-5 bg-[var(--surface-0)]/50">
                    <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest mb-1">Renovación</div>
                    <div className="text-xl font-bold text-[var(--text-primary)]">{formatDate(company.subscriptionRenewal)}</div>
                    <div className="text-sm font-medium text-[var(--text-muted)] mt-1">({daysFrom(company.subscriptionRenewal)} días)</div>
                 </div>
                 <div className="border border-[var(--border-subtle)] rounded-3xl p-5 bg-[var(--surface-0)]/50 flex flex-col justify-center items-start">
                    <div className="mb-3"><Badge status={company.paymentStatus} /></div>
                    <button
                      onClick={() => setShowPaymentModal(true)}
                      className="text-xs font-bold uppercase tracking-wider text-[var(--brand)] hover:text-white transition-colors"
                    >
                      Registrar pago →
                    </button>
                 </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="border border-[var(--border-subtle)] rounded-3xl p-5 bg-[var(--surface-0)]/50">
                   <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest mb-2">Precio especial (pisa el precio de lista)</div>
                   <div className="flex gap-2">
                     <input
                       type="number"
                       step="0.01"
                       placeholder={plan ? String(plan.price) : '0.00'}
                       value={customPriceInput}
                       onChange={(e) => setCustomPriceInput(e.target.value)}
                       className="w-full bg-[var(--surface-1)] border border-zinc-700 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]"
                     />
                     <button onClick={handleSaveCustomPrice} className="bg-[var(--surface-2)] hover:bg-zinc-700 text-zinc-200 font-bold px-3 rounded-lg text-xs uppercase whitespace-nowrap">Guardar</button>
                   </div>
                   <p className="text-[11px] text-[var(--text-faint)] mt-1.5">Deja vacío y guarda para volver al precio de lista del plan.</p>
                 </div>
                 <div className="border border-[var(--border-subtle)] rounded-3xl p-5 bg-[var(--surface-0)]/50">
                   <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest mb-2">Fin del período de prueba</div>
                   <div className="flex gap-2">
                     <input
                       type="date"
                       value={trialInput}
                       onChange={(e) => setTrialInput(e.target.value)}
                       className="w-full bg-[var(--surface-1)] border border-zinc-700 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]"
                     />
                     <button onClick={handleSaveTrial} className="bg-[var(--surface-2)] hover:bg-zinc-700 text-zinc-200 font-bold px-3 rounded-lg text-xs uppercase whitespace-nowrap">Guardar</button>
                   </div>
                   <p className="text-[11px] text-[var(--text-faint)] mt-1.5">Deja vacío y guarda para quitar el trial.</p>
                 </div>
               </div>

               <h3 className="text-base font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2 pt-4">Historial de pagos</h3>
               <div className="border border-[var(--border-subtle)] rounded-2xl overflow-hidden">
                 <table className="w-full text-sm text-left">
                   <thead className="bg-[var(--surface-0)]/50 text-[var(--text-muted)] uppercase text-[10px] tracking-widest border-b border-[var(--border-subtle)] font-bold">
                     <tr>
                       <th className="px-4 py-3">#</th>
                       <th className="px-4 py-3">Fecha</th>
                       <th className="px-4 py-3">Período cubierto</th>
                       <th className="px-4 py-3">Monto</th>
                       <th className="px-4 py-3">Método</th>
                       <th className="px-4 py-3">Referencia</th>
                       <th className="px-4 py-3">Estado</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-[var(--border-subtle)]">
                     {payments.length === 0 ? (
                       <tr><td colSpan={7} className="px-4 py-6 text-center text-[var(--text-muted)]">Sin pagos registrados todavía</td></tr>
                     ) : paymentSequence.slice().reverse().map((p) => (
                       <tr key={p.id} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                         <td className="px-4 py-3 text-[var(--text-faint)] font-mono">#{p.sequence}</td>
                         <td className="px-4 py-3 font-medium">{formatDate(p.periodStart)}</td>
                         <td className="px-4 py-3 text-[var(--text-muted)] text-xs">
                           {p.periodEnd ? `${formatDate(p.periodStart)} → ${formatDate(p.periodEnd)}` : '—'}
                         </td>
                         <td className="px-4 py-3 font-bold">{formatUSD(p.amount)}</td>
                         <td className="px-4 py-3 text-zinc-400">{p.payment_method}</td>
                         <td className="px-4 py-3 text-[var(--text-muted)] font-mono text-xs">{p.reference || '—'}</td>
                         <td className="px-4 py-3 capitalize">{p.status}</td>
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
                 <h3 className="text-base font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2 mb-4">Consumo del mes actual</h3>
                 <div className="bg-[var(--surface-0)]/50 border border-[var(--border-subtle)] p-5 rounded-3xl mb-6">
                    <div className="flex justify-between text-sm mb-3">
                      <span className="font-bold text-zinc-400">Comprobantes emitidos</span>
                      <span className="font-bold text-[var(--text-primary)]">{invoiceUsage.current} / {plan?.comprobantesLimit ?? 'Sin límite'}</span>
                    </div>
                    <div className="w-full h-2.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
                      {plan?.comprobantesLimit && (() => {
                        const pct = (invoiceUsage.current / plan.comprobantesLimit) * 100;
                        const color = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500';
                        return <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />;
                      })()}
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div className="border border-[var(--border-subtle)] bg-[var(--surface-0)]/50 p-5 rounded-3xl text-center">
                     <div className="text-3xl font-bold text-[var(--text-primary)]">{invoiceUsage.previous}</div>
                     <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-2">Mes anterior</div>
                   </div>
                   <div className="border border-[var(--border-subtle)] bg-[var(--surface-0)]/50 p-5 rounded-3xl text-center">
                     <div className="text-3xl font-bold text-[var(--text-primary)]">{company.activeUsers} / {plan?.usersLimit ?? '—'}</div>
                     <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-2">Usuarios activos</div>
                   </div>
                   <div className="border border-[var(--border-subtle)] bg-[var(--surface-0)]/50 p-5 rounded-3xl text-center">
                     <div className="text-3xl font-bold text-[var(--text-primary)]">{company.branches} / {plan?.branchesLimit ?? '—'}</div>
                     <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-2">Sucursales</div>
                   </div>
                   <div className="border border-[var(--border-subtle)] bg-[var(--surface-0)]/50 p-5 rounded-3xl text-center">
                     <div className="text-3xl font-bold text-[var(--text-primary)]">{plan?.productsLimit ?? '—'}</div>
                     <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-2">Límite de productos</div>
                   </div>
                 </div>
               </div>

               <div>
                 <h3 className="text-base font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2 mb-4">Funcionalidades</h3>
                 {featureFlags.length === 0 ? (
                   <p className="text-sm font-medium text-[var(--text-muted)]">Cargando catálogo de funcionalidades...</p>
                 ) : (
                   <ul className="space-y-2">
                     {featureFlags.map(flag => {
                       const override = overrides.find(o => o.feature_key === flag.key);
                       const fromPlan = plan?.features?.includes(flag.key) || false;
                       const effective = override ? override.enabled : fromPlan;
                       const saving = savingFeatureKey === flag.key;
                       return (
                         <li key={flag.key} className="flex items-center justify-between gap-3 border border-[var(--border-subtle)] bg-[var(--surface-0)]/50 rounded-2xl px-4 py-3">
                           <div className="min-w-0">
                             <div className="flex items-center gap-2 flex-wrap">
                               <span className="text-sm font-bold text-[var(--text-primary)]">{flag.label}</span>
                               <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${override ? 'bg-[var(--brand)]/15 text-[var(--brand)]' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>
                                 {override ? 'Personalizado' : 'Plan'}
                               </span>
                             </div>
                             {flag.description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{flag.description}</p>}
                             {override && (
                               <button onClick={() => handleResetFeature(flag.key)} disabled={saving} className="text-[10px] font-bold text-[var(--text-muted)] hover:text-zinc-300 uppercase mt-1">
                                 Restaurar valor del plan
                               </button>
                             )}
                           </div>
                           <button
                             onClick={() => handleToggleFeature(flag.key, effective)}
                             disabled={saving}
                             className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${effective ? 'bg-emerald-500' : 'bg-zinc-700'} disabled:opacity-50`}
                           >
                             <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${effective ? 'translate-x-5' : 'translate-x-0.5'}`} />
                           </button>
                         </li>
                       );
                     })}
                   </ul>
                 )}
               </div>
            </div>
          )}

          {companyDetailTab === 'notas' && (
            <div className="space-y-4">
               <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">Visible solo para tu equipo. No visible para el cliente.</p>
               <textarea
                 className="w-full border border-[var(--border-subtle)] bg-[var(--surface-0)] text-[var(--text-primary)] rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] placeholder-zinc-600 min-h-[200px]"
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
              <button onClick={() => setShowPlanModal(false)} className="text-[var(--text-muted)] hover:text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors">Cancelar</button>
              <button onClick={handleChangePlan} className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-zinc-950 font-bold px-6 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors">Confirmar cambio</button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm font-medium text-zinc-400">Selecciona el nuevo plan para <span className="font-bold text-[var(--text-primary)]">{company.nombreComercial}</span>. Se actualizarán los límites inmediatamente.</p>
            <div className="grid grid-cols-1 gap-3">
              {plans.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedNewPlan(p.id)}
                  className={`border rounded-2xl p-5 cursor-pointer transition-all ${selectedNewPlan === p.id ? 'border-[var(--brand)] bg-[var(--brand)]/10 ring-1 ring-[var(--brand)]' : 'border-[var(--border-subtle)] bg-[var(--surface-0)]/50 hover:border-zinc-600'}`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-[var(--text-primary)]">{p.name}</h4>
                      <p className="text-xs font-medium text-[var(--text-muted)] mt-1">{formatUSD(p.price)}/mes • {p.comprobantesLimit} comprobantes</p>
                    </div>
                    <div className="text-[var(--brand)]">
                      {selectedNewPlan === p.id && <Check size={20} />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {prorationInfo && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
                <p className="text-xs text-blue-300">
                  Quedan <span className="font-bold">{prorationInfo.daysRemaining} días</span> del ciclo actual.
                  {prorationInfo.diff > 0
                    ? ` Diferencia proporcional a favor de POST-PLAT: ${formatUSD(prorationInfo.diff)}.`
                    : prorationInfo.diff < 0
                    ? ` Diferencia proporcional a favor del cliente: ${formatUSD(Math.abs(prorationInfo.diff))}.`
                    : ' Sin diferencia proporcional.'}
                  {' '}Informativo — no se cobra ni se acredita automáticamente, coordínalo manualmente si aplica.
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {showPaymentModal && (
        <PaymentModal
          company={company}
          onClose={() => { setShowPaymentModal(false); loadPayments(company.id); }}
        />
      )}
    </div>
  );
}
