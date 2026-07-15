import React, { useState, useEffect, useMemo } from 'react';
import { Lock, Loader, AlertCircle, CheckCircle2, LogOut } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import {
  resolveCashierPointOfSale, resolveClosurePeriodStart, fetchInvoicesForClosure, createCashClosure
} from '../../lib/supabaseHelpers.js';
import { PAYMENT_METHOD_LABELS } from '../../lib/reportsHelpers.js';
import { computeExpectedTotals, computeDifference, totalOf, hasAnyDifference, PAYMENT_METHOD_KEYS } from '../../lib/cashClosureHelpers.js';
import { formatUSD } from '../../lib/format.js';

export default function POSSettings() {
  const { currentUser, showToast, logout } = useStore();
  const [posContext, setPosContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openedAt, setOpenedAt] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [counted, setCounted] = useState(() => PAYMENT_METHOD_KEYS.reduce((acc, k) => { acc[k] = ''; return acc; }, {}));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const context = await resolveCashierPointOfSale(currentUser.id);
      setPosContext(context);
      if (!context) return;

      const since = await resolveClosurePeriodStart(currentUser.id, context.pointOfSale.id);
      setOpenedAt(since);
      const invs = await fetchInvoicesForClosure(currentUser.id, context.pointOfSale.id, since);
      setInvoices(invs);
    } catch (error) {
      console.error('Error loading cash closure data:', error);
      showToast('error', 'Error al cargar los datos del cierre de caja');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const expectedTotals = useMemo(() => computeExpectedTotals(invoices), [invoices]);
  const expectedTotal = totalOf(expectedTotals);
  const countedTotals = useMemo(() => {
    const t = {};
    PAYMENT_METHOD_KEYS.forEach(k => { t[k] = parseFloat(counted[k]) || 0; });
    return t;
  }, [counted]);
  const countedTotal = totalOf(countedTotals);
  const difference = useMemo(() => computeDifference(expectedTotals, countedTotals), [expectedTotals, countedTotals]);
  const totalDifference = countedTotal - expectedTotal;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const result = await createCashClosure({
        companyId: currentUser.company_id,
        branchId: posContext.branch.id,
        pointOfSaleId: posContext.pointOfSale.id,
        userId: currentUser.id,
        openedAt,
        expectedTotals,
        countedTotals,
        difference,
        notes
      });
      setLastResult(result);
      showToast('success', 'Cierre de caja registrado');
      setCounted(PAYMENT_METHOD_KEYS.reduce((acc, k) => { acc[k] = ''; return acc; }, {}));
      setNotes('');
      await load();
    } catch (error) {
      console.error('Error creating cash closure:', error);
      showToast('error', error.message || 'Error al registrar el cierre de caja');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-pos-bg flex items-center justify-center">
        <Loader className="animate-spin text-pos-text-muted" size={32} />
      </div>
    );
  }

  if (!posContext) {
    return (
      <div className="min-h-screen bg-pos-bg flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <Lock className="mx-auto text-pos-text-muted mb-4" size={40} />
          <p className="text-pos-text font-bold">No tienes una sucursal o punto de venta asignado.</p>
          <p className="text-pos-text-muted text-sm mt-2">Contacta a tu gerente para poder cerrar caja.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pos-bg text-pos-text p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cerrar Caja</h1>
          <p className="text-pos-text-muted text-sm">{posContext.branch.name} · {posContext.pointOfSale.nombre}</p>
        </div>
        <button onClick={logout} className="flex items-center gap-2 text-pos-text-muted hover:text-pos-danger text-sm">
          <LogOut size={16} /> Salir
        </button>
      </div>

      {lastResult && (
        <div className={`rounded-2xl p-4 border ${hasAnyDifference(lastResult.difference) ? 'bg-pos-warning/10 border-pos-warning/30' : 'bg-pos-success/10 border-pos-success/30'}`}>
          <div className="flex items-center gap-2 font-bold">
            {hasAnyDifference(lastResult.difference) ? <AlertCircle className="text-pos-warning" size={18} /> : <CheckCircle2 className="text-pos-success" size={18} />}
            <span className={hasAnyDifference(lastResult.difference) ? 'text-pos-warning' : 'text-pos-success'}>
              Último cierre: {formatUSD(totalOf(lastResult.counted_totals))} contado, diferencia {formatUSD(totalOf(lastResult.difference))}
            </span>
          </div>
        </div>
      )}

      <div className="bg-pos-surface border border-pos-border rounded-2xl p-5">
        <h2 className="text-sm font-bold text-pos-text-muted uppercase mb-3">Ventas del turno (desde {new Date(openedAt).toLocaleString('es-EC')})</h2>
        <p className="text-xs text-pos-text-muted mb-4">{invoices.length} factura{invoices.length === 1 ? '' : 's'}</p>
        <div className="space-y-2">
          {PAYMENT_METHOD_KEYS.map(k => (
            <div key={k} className="flex justify-between text-sm">
              <span className="text-pos-text-muted">{PAYMENT_METHOD_LABELS[k]}</span>
              <span className="font-bold text-pos-text">{formatUSD(expectedTotals[k])}</span>
            </div>
          ))}
          <div className="flex justify-between text-base pt-2 border-t border-pos-border">
            <span className="font-bold text-pos-text-muted">Total esperado</span>
            <span className="font-bold text-pos-success">{formatUSD(expectedTotal)}</span>
          </div>
        </div>
      </div>

      <div className="bg-pos-surface border border-pos-border rounded-2xl p-5">
        <h2 className="text-sm font-bold text-pos-text-muted uppercase mb-3">Contado por el cajero</h2>
        <div className="space-y-3">
          {PAYMENT_METHOD_KEYS.map(k => (
            <div key={k} className="flex items-center justify-between gap-3">
              <label className="text-sm text-pos-text-muted flex-1">{PAYMENT_METHOD_LABELS[k]}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={counted[k]}
                onChange={e => setCounted({ ...counted, [k]: e.target.value })}
                placeholder="0.00"
                className="w-32 bg-pos-bg border border-pos-border rounded-lg px-3 py-2 text-right text-pos-text"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-pos-border space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-pos-text-muted">Total contado</span>
            <span className="font-bold text-pos-text">{formatUSD(countedTotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-pos-text-muted">Diferencia</span>
            <span className={`font-bold ${Math.abs(totalDifference) < 0.01 ? 'text-pos-success' : totalDifference > 0 ? 'text-pos-warning' : 'text-pos-danger'}`}>
              {totalDifference > 0 ? '+' : ''}{formatUSD(totalDifference)}
            </span>
          </div>
        </div>

        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notas (opcional) - explica cualquier diferencia"
          className="w-full mt-4 bg-pos-bg border border-pos-border rounded-lg px-3 py-2 text-sm text-pos-text resize-none"
          rows={2}
        />

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full mt-4 bg-pos-accent hover:bg-pos-accent-hover disabled:opacity-60 text-pos-accent-text font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? <Loader size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          {submitting ? 'Registrando...' : 'Registrar cierre de caja'}
        </button>
        <p className="text-xs text-pos-text-muted mt-2 text-center">Una vez registrado, el cierre no se puede editar - las correcciones se anotan en el siguiente cierre.</p>
      </div>
    </div>
  );
}
