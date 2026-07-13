import React, { useState } from 'react';
import { AlertTriangle, Loader } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import Modal from './Modal.jsx';
import Badge from './Badge.jsx';
import { computeNextRenewal, formatDate, daysFrom } from '../../lib/dates.js';
import { formatUSD } from '../../lib/format.js';

const PAYMENT_METHODS = ['Transferencia bancaria', 'Efectivo', 'Tarjeta', 'Cheque', 'Otro'];

// Every "Registrar pago" entry point in the admin opens this - no more blind
// one-click calls straight to the store action. Always shows current status,
// what the payment will cost, and exactly what renewal date results, so
// paying an already-current company is a deliberate prepay decision (with
// its own visible warning) instead of an unexplained repeatable button.
export default function PaymentModal({ company: lockedCompany, onClose }) {
  const { companies, plans, registerPayment, showToast } = useStore();
  const [selectedCompanyId, setSelectedCompanyId] = useState(lockedCompany?.id || '');
  const [periods, setPeriods] = useState(1);
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const company = lockedCompany || companies.find(c => c.id === selectedCompanyId);
  const plan = plans.find(p => p.id === company?.planId);

  const unitPrice = company ? (company.customPrice ?? plan?.price ?? 0) : 0;
  const totalAmount = unitPrice * periods;
  const baseCycleDays = plan?.billingCycle === 'anual' ? 365 : 30;
  const newRenewal = company ? computeNextRenewal(company.subscriptionRenewal, baseCycleDays * periods) : null;
  const daysRemaining = company?.subscriptionRenewal ? daysFrom(company.subscriptionRenewal) : null;
  const isEarlyPayment = company?.subscriptionStatus === 'Activa' && daysRemaining !== null && daysRemaining > 5;

  const handleConfirm = async () => {
    if (!company) return;
    setSubmitting(true);
    try {
      await registerPayment(company.id, { method, reference: reference.trim() || null, periods });
      onClose();
    } catch (error) {
      showToast('error', error.message || 'Error al registrar el pago');
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <>
      <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors">
        Cancelar
      </button>
      <button
        onClick={handleConfirm}
        disabled={!company || submitting}
        className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-zinc-950 font-bold px-6 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        {submitting && <Loader size={14} className="animate-spin" />}
        {company ? `Registrar pago de ${formatUSD(totalAmount)}` : 'Registrar pago'}
      </button>
    </>
  );

  return (
    <Modal title="Registrar pago" onClose={onClose} footer={footer}>
      <div className="space-y-4">
        {!lockedCompany && (
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Empresa</label>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">Selecciona una empresa</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.nombreComercial}</option>)}
            </select>
          </div>
        )}

        {company && (
          <>
            <div className="grid grid-cols-3 gap-3 bg-zinc-950/50 border border-zinc-800 rounded-2xl p-4">
              <div>
                <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1">Plan</div>
                <div className="text-sm font-bold text-zinc-100">{plan?.name || '—'}</div>
                <div className="text-xs text-zinc-500">{formatUSD(unitPrice)} / {plan?.billingCycle || 'mensual'}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1">Vence</div>
                <div className="text-sm font-bold text-zinc-100">{company.subscriptionRenewal ? formatDate(company.subscriptionRenewal) : '—'}</div>
                {daysRemaining !== null && (
                  <div className="text-xs text-zinc-500">{daysRemaining >= 0 ? `en ${daysRemaining} días` : `vencida hace ${Math.abs(daysRemaining)} días`}</div>
                )}
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1">Estado</div>
                <Badge status={company.subscriptionStatus} />
              </div>
            </div>

            {isEarlyPayment && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">Esta empresa ya está al día ({daysRemaining} días restantes). Este pago es un adelanto y sumará períodos completos a partir de su fecha de vencimiento actual, no desde hoy.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Períodos a cubrir</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={periods}
                  onChange={(e) => setPeriods(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
                />
                <p className="text-[10px] text-zinc-600 mt-1">{periods} × {plan?.billingCycle === 'anual' ? 'año' : 'mes'}{periods > 1 ? 'es' : ''}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Monto</label>
                <div className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 font-bold">
                  {formatUSD(totalAmount)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Método</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100">
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Referencia (opcional)</label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="N° de transferencia, etc."
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600"
                />
              </div>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
              <p className="text-xs text-emerald-300">
                Nueva fecha de renovación: <span className="font-bold">{newRenewal ? formatDate(newRenewal) : '—'}</span>
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
