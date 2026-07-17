import React, { useState, useEffect, useMemo } from 'react';
import { Loader, FileSpreadsheet, AlertTriangle, CreditCard, X, Save, Wallet } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchAccountsPayable, createAccountsPayablePayment, getPaymentMethods } from '../../lib/supabaseHelpers.js';
import { downloadReportCsv } from '../../lib/csvExport.js';
import { formatUSD } from '../../lib/format.js';

const DOC_TYPE_LABELS = {
  factura_compra: 'Factura de Compra',
  liquidacion_compra: 'Liquidación de Compra',
  nota_venta: 'Nota de Venta'
};

const STATUS_LABELS = {
  vencida: 'Vencida',
  por_vencer: 'Por Vencer',
  pagada: 'Pagada'
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromISO, toISO) {
  const from = new Date(`${fromISO}T00:00:00`);
  const to = new Date(`${toISO}T00:00:00`);
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

// Deriva el estado visible (vencida/por_vencer/pagada) a partir de la
// cuenta real - "vencida" NUNCA se guarda en la base (ver migración de la
// Fase 1: depende de la fecha de hoy, no de un evento, así que se calcula
// siempre en la consulta para que nunca quede desincronizado).
function deriveDisplayStatus(account) {
  if (account.status === 'pagada') return 'pagada';
  if (!account.due_date) return 'por_vencer';
  return account.due_date < todayISO() ? 'vencida' : 'por_vencer';
}

export default function AccountsPayable() {
  const { currentUser, showToast, can } = useStore();
  const [accounts, setAccounts] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');

  const [payingAccount, setPayingAccount] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentMethodId: '', paymentDate: todayISO(), notes: '' });
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const loadAll = async () => {
    try {
      const [accountList, methodList] = await Promise.all([
        fetchAccountsPayable(currentUser.company_id),
        getPaymentMethods()
      ]);
      setAccounts(accountList);
      setPaymentMethods(methodList);
    } catch (error) {
      console.error('Error:', error);
      showToast('error', 'Error al cargar cuentas por pagar');
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await loadAll();
      setLoading(false);
    };
    if (currentUser?.company_id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.company_id]);

  // Saldo restante = original_amount - suma de pagos, calculado acá, nunca
  // guardado - mismo principio que el kardex de inventario en Ventas.
  const rows = useMemo(() => {
    return accounts.map(a => {
      const payments = a.accounts_payable_payments || [];
      const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      const remaining = parseFloat(a.original_amount) - totalPaid;
      const displayStatus = deriveDisplayStatus(a);
      const daysOverdue = displayStatus === 'vencida' ? daysBetween(a.due_date, todayISO()) : null;
      return { ...a, totalPaid, remaining, displayStatus, daysOverdue, payments };
    });
  }, [accounts]);

  const suppliersInList = useMemo(() => {
    const map = new Map();
    accounts.forEach(a => { if (a.suppliers) map.set(a.supplier_id, a.suppliers.razon_social); });
    return Array.from(map.entries());
  }, [accounts]);

  const filteredRows = rows
    .filter(r => statusFilter === 'all' || r.displayStatus === statusFilter)
    .filter(r => supplierFilter === 'all' || r.supplier_id === supplierFilter);

  // Antigüedad de saldos: solo cuentas realmente vencidas (pendiente/parcial
  // con fecha de vencimiento pasada) - sobre la lista completa, no la
  // filtrada, es un resumen fijo de la empresa.
  const agingBuckets = useMemo(() => {
    const buckets = { '0-30': 0, '31-60': 0, '61+': 0 };
    rows.filter(r => r.displayStatus === 'vencida').forEach(r => {
      if (r.daysOverdue <= 30) buckets['0-30'] += r.remaining;
      else if (r.daysOverdue <= 60) buckets['31-60'] += r.remaining;
      else buckets['61+'] += r.remaining;
    });
    return buckets;
  }, [rows]);

  const totals = useMemo(() => ({
    porVencer: rows.filter(r => r.displayStatus === 'por_vencer').reduce((s, r) => s + r.remaining, 0),
    vencida: rows.filter(r => r.displayStatus === 'vencida').reduce((s, r) => s + r.remaining, 0)
  }), [rows]);

  const openPayment = (account) => {
    setPayingAccount(account);
    setPaymentForm({ amount: account.remaining.toFixed(2), paymentMethodId: paymentMethods[0]?.id || '', paymentDate: todayISO(), notes: '' });
  };

  const handleSubmitPayment = async () => {
    const amount = parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) { showToast('error', 'Ingresa un monto mayor a 0'); return; }
    if (!paymentForm.paymentMethodId) { showToast('error', 'Selecciona una forma de pago'); return; }
    // Aviso (no bloqueo) si el pago sobrepasa el saldo - el criterio de
    // aceptación de esta fase pide avisar, no impedirlo (puede ser un
    // redondeo o un pago intencional de más).
    if (amount > payingAccount.remaining + 0.01) {
      const proceed = window.confirm(
        `Este pago ($${amount.toFixed(2)}) es mayor al saldo pendiente ($${payingAccount.remaining.toFixed(2)}). ¿Registrarlo de todas formas?`
      );
      if (!proceed) return;
    }

    setSubmittingPayment(true);
    try {
      await createAccountsPayablePayment({
        accountsPayableId: payingAccount.id,
        amount,
        paymentMethodId: paymentForm.paymentMethodId,
        paymentDate: paymentForm.paymentDate,
        notes: paymentForm.notes.trim() || null,
        createdBy: currentUser.id
      });
      showToast('success', `Pago de ${formatUSD(amount)} registrado`);
      setPayingAccount(null);
      await loadAll();
    } catch (error) {
      console.error('Error registering payment:', error);
      showToast('error', error.message || 'Error al registrar el pago');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleExportCsv = () => {
    if (filteredRows.length === 0) { showToast('warning', 'No hay cuentas por pagar para exportar con estos filtros'); return; }
    const columns = [
      { key: 'supplier', label: 'Proveedor' },
      { key: 'document', label: 'Documento' },
      { key: 'due_date', label: 'Vencimiento' },
      { key: 'original', label: 'Monto Original', format: 'usd' },
      { key: 'paid', label: 'Pagado', format: 'usd' },
      { key: 'remaining', label: 'Saldo', format: 'usd' },
      { key: 'status', label: 'Estado' }
    ];
    const csvRows = filteredRows.map(r => ({
      supplier: r.suppliers?.razon_social || '',
      document: r.purchases?.supplier_document_number || '',
      due_date: r.due_date || 'Sin fecha',
      original: r.original_amount,
      paid: r.totalPaid,
      remaining: r.remaining,
      status: STATUS_LABELS[r.displayStatus]
    }));
    downloadReportCsv(`Cuentas_por_Pagar_${todayISO()}.csv`, columns, csvRows);
  };

  if (!can('accounts_payable.read')) return null;

  if (loading) {
    return <div className="max-w-6xl mx-auto p-8 text-center text-panel-text-muted">Cargando...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-panel-text">Cuentas por Pagar</h1>
        {can('accounts_payable.read') && (
          <button onClick={handleExportCsv} className="flex items-center gap-2 bg-panel-surface-2 hover:bg-panel-text/10 text-panel-text text-sm font-bold px-4 py-2 rounded-lg transition-colors">
            <FileSpreadsheet size={16} /> CSV
          </button>
        )}
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-panel-surface rounded-xl border border-panel-border p-4">
          <div className="text-sm text-panel-text-muted">Por Vencer</div>
          <div className="text-3xl font-bold text-panel-text">{formatUSD(totals.porVencer)}</div>
        </div>
        <div className="bg-panel-surface rounded-xl border border-panel-border p-4">
          <div className="text-sm text-panel-text-muted">Vencida</div>
          <div className="text-3xl font-bold text-panel-danger">{formatUSD(totals.vencida)}</div>
        </div>
        <div className="bg-panel-surface rounded-xl border border-panel-border p-4">
          <div className="text-sm text-panel-text-muted flex items-center gap-1"><Wallet size={14} /> Total Pendiente</div>
          <div className="text-3xl font-bold text-panel-accent-soft">{formatUSD(totals.porVencer + totals.vencida)}</div>
        </div>
      </div>

      {/* Antigüedad de saldos */}
      {totals.vencida > 0 && (
        <div className="bg-panel-surface rounded-2xl border border-panel-border p-4">
          <h3 className="font-bold text-panel-text-muted mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-panel-danger" /> Antigüedad de Saldos Vencidos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-panel-bg/50 border border-panel-border rounded-lg p-3">
              <div className="text-xs text-panel-text-muted">0-30 días</div>
              <div className="text-xl font-bold text-panel-text">{formatUSD(agingBuckets['0-30'])}</div>
            </div>
            <div className="bg-panel-bg/50 border border-panel-border rounded-lg p-3">
              <div className="text-xs text-panel-text-muted">31-60 días</div>
              <div className="text-xl font-bold text-panel-warning">{formatUSD(agingBuckets['31-60'])}</div>
            </div>
            <div className="bg-panel-bg/50 border border-panel-border rounded-lg p-3">
              <div className="text-xs text-panel-text-muted">61+ días</div>
              <div className="text-xl font-bold text-panel-danger">{formatUSD(agingBuckets['61+'])}</div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-panel-surface border border-panel-border rounded-lg px-3 py-2 text-sm text-panel-text">
          <option value="all">Todos los estados</option>
          <option value="vencida">Vencida</option>
          <option value="por_vencer">Por vencer</option>
          <option value="pagada">Pagada</option>
        </select>
        <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} className="bg-panel-surface border border-panel-border rounded-lg px-3 py-2 text-sm text-panel-text">
          <option value="all">Todos los proveedores</option>
          {suppliersInList.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      {/* Listado */}
      <div className="bg-panel-surface rounded-2xl border border-panel-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-panel-border">
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-panel-text-muted">Proveedor</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-panel-text-muted">Documento</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-panel-text-muted">Vencimiento</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase text-panel-text-muted">Original</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase text-panel-text-muted">Pagado</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase text-panel-text-muted">Saldo</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-panel-text-muted">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-panel-text-muted">Pagar</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(r => (
                <tr key={r.id} className="border-b border-panel-border hover:bg-panel-surface-2">
                  <td className="px-4 py-3 font-bold text-panel-text">{r.suppliers?.razon_social}</td>
                  <td className="px-4 py-3 font-mono text-xs text-panel-text-muted">
                    {r.purchases?.supplier_document_number}
                    <div className="text-[10px] text-panel-text-muted opacity-70">{DOC_TYPE_LABELS[r.purchases?.purchase_doc_type] || ''}</div>
                  </td>
                  <td className="px-4 py-3 text-panel-text-muted">{r.due_date || 'Sin fecha'}</td>
                  <td className="px-4 py-3 text-right text-panel-text">{formatUSD(r.original_amount)}</td>
                  <td className="px-4 py-3 text-right text-panel-success">{formatUSD(r.totalPaid)}</td>
                  <td className="px-4 py-3 text-right font-bold text-panel-text">{formatUSD(r.remaining)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                      r.displayStatus === 'pagada' ? 'bg-panel-success/10 text-panel-success'
                        : r.displayStatus === 'vencida' ? 'bg-panel-danger/10 text-panel-danger'
                          : 'bg-panel-warning/10 text-panel-warning'
                    }`}>
                      {STATUS_LABELS[r.displayStatus]}{r.daysOverdue ? ` (${r.daysOverdue}d)` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {can('accounts_payable.write') && r.displayStatus !== 'pagada' && (
                      <button
                        onClick={() => openPayment(r)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-panel-accent/20 hover:bg-panel-accent/30 text-panel-accent-soft rounded text-xs font-bold transition-colors"
                      >
                        <CreditCard size={14} /> Pagar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-panel-text-muted">Sin cuentas por pagar con estos filtros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de pago */}
      {payingAccount && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-panel-surface border border-panel-border rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-panel-text">Registrar Pago</h2>
              <button onClick={() => setPayingAccount(null)} className="text-panel-text-muted hover:text-panel-text"><X size={22} /></button>
            </div>

            <div className="mb-4 p-3 bg-panel-bg/50 rounded-lg border border-panel-border">
              <div className="font-bold text-panel-text">{payingAccount.suppliers?.razon_social}</div>
              <div className="text-xs text-panel-text-muted">{payingAccount.purchases?.supplier_document_number}</div>
              <div className="text-sm text-panel-text-muted mt-1">
                Saldo pendiente: <span className="font-bold text-panel-text">{formatUSD(payingAccount.remaining)}</span>
              </div>
              {payingAccount.payments.length > 0 && (
                <div className="mt-2 pt-2 border-t border-panel-border">
                  <div className="text-[10px] font-bold text-panel-text-muted uppercase mb-1">Pagos anteriores</div>
                  {payingAccount.payments.map(p => (
                    <div key={p.id} className="text-xs text-panel-text-muted flex justify-between">
                      <span>{p.payment_date} - {p.payment_methods?.name || ''}</span>
                      <span>{formatUSD(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 mb-6">
              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-2">Monto</label>
                <input
                  type="number" min="0" step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-2">Forma de Pago</label>
                <select
                  value={paymentForm.paymentMethodId}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethodId: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                >
                  {paymentMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-2">Fecha</label>
                <input
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-2">Notas (Opcional)</label>
                <input
                  type="text"
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                />
              </div>
            </div>

            <div className="flex gap-3 border-t border-panel-border pt-4">
              <button onClick={() => setPayingAccount(null)} className="flex-1 bg-panel-surface-2 hover:bg-panel-text/10 text-panel-text font-bold py-2 rounded-lg transition-colors">Cancelar</button>
              <button
                onClick={handleSubmitPayment}
                disabled={submittingPayment}
                className="flex-1 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {submittingPayment ? <Loader size={18} className="animate-spin" /> : <Save size={18} />}
                Registrar Pago
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
