import React, { useState, useEffect, useMemo } from 'react';
import { LogOut, Receipt, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchInvoicesForReports, fetchCashClosures } from '../../lib/supabaseHelpers.js';
import { computeDateRange, formatCellValue } from '../../lib/reportsHelpers.js';
import { buildSalesLedger, buildSriReconciliation } from '../../lib/accountingHelpers.js';
import { totalOf, hasAnyDifference } from '../../lib/cashClosureHelpers.js';
import { formatUSD } from '../../lib/format.js';

const KPI_TEXT_CLASSES = {
  emerald: 'text-panel-success',
  blue: 'text-panel-accent-soft',
  amber: 'text-panel-warning',
  purple: 'text-[var(--kpi-purple)]',
  pink: 'text-[var(--kpi-pink)]'
};

// Vista inicial del contador al hacer login - resumen contable del mes en
// curso en vez del dashboard comercial del gerente (StoreManagerDashboard.jsx).
// Reutiliza los mismos helpers que Contabilidad (buildSalesLedger,
// buildSriReconciliation) y la misma query fetchInvoicesForReports - no
// duplica ningún cálculo ni consulta nueva, solo los acota al mes en curso.
export default function AccountantDashboard() {
  const { currentUser, logout, setActivePage } = useStore();
  const [invoices, setInvoices] = useState([]);
  const [closures, setClosures] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser?.company_id) return;
    const { start, end } = computeDateRange('month');
    setLoading(true);
    Promise.all([
      fetchInvoicesForReports(currentUser.company_id, start.toISOString(), end.toISOString()),
      fetchCashClosures(currentUser.company_id)
    ]).then(([invs, closureData]) => {
      setInvoices(invs);
      setClosures(closureData.slice(0, 5));
    }).catch(error => console.error('Error loading accountant dashboard:', error))
      .finally(() => setLoading(false));
  }, [currentUser?.company_id]);

  const ledger = useMemo(() => buildSalesLedger(invoices, []), [invoices]);
  const reconciliation = useMemo(() => buildSriReconciliation(invoices), [invoices]);

  return (
    <div className="min-h-screen bg-panel-bg">
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-4 sm:p-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold truncate">📊 Resumen Contable</h1>
            <p className="text-purple-100 mt-1 truncate">Contador: {currentUser?.name} · Mes en curso</p>
          </div>
          <button
            onClick={logout}
            className="bg-red-600 hover:bg-red-700 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg flex items-center justify-center gap-2 font-bold transition-colors whitespace-nowrap"
          >
            <LogOut size={20} />
            <span className="hidden sm:inline">Cerrar sesión</span>
            <span className="sm:hidden">Salir</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        {loading ? (
          <p className="text-panel-text-muted text-center py-12">Cargando...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {ledger.kpis.map((kpi, i) => (
                <div key={i} className="bg-panel-surface border border-panel-border rounded-2xl p-5 min-w-0">
                  <div className="text-xs text-panel-text-muted uppercase tracking-wide font-medium mb-2 truncate">{kpi.label}</div>
                  <div className={`text-xl font-bold truncate ${KPI_TEXT_CLASSES[kpi.accent] || 'text-panel-text'}`}>{formatCellValue(kpi.value, kpi.format)}</div>
                </div>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <div className="bg-panel-surface border border-panel-border rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-panel-text">Comprobantes por Estado</h2>
                  <button onClick={() => setActivePage('accounting')} className="text-xs font-bold text-[var(--kpi-purple)] hover:opacity-80 flex items-center gap-1">
                    <Receipt size={14} /> Ver Contabilidad
                  </button>
                </div>
                <div className="space-y-2">
                  {ledger.byStatus.map(s => (
                    <div key={s.status} className="flex justify-between text-sm">
                      <span className="text-panel-text-muted">{s.status}</span>
                      <span className="font-bold text-panel-text">{s.count}</span>
                    </div>
                  ))}
                </div>
                {!reconciliation.allClear && (
                  <div className="mt-4 flex items-center gap-2 bg-panel-warning/10 border border-panel-warning/20 rounded-lg p-3 text-xs text-panel-warning">
                    <AlertTriangle size={14} /> {reconciliation.pending.length} comprobante(s) fuera de estado autorizada este mes
                  </div>
                )}
              </div>

              <div className="bg-panel-surface border border-panel-border rounded-2xl p-6">
                <h2 className="text-lg font-bold text-panel-text mb-4">Últimos Cierres de Caja</h2>
                <div className="space-y-3">
                  {closures.length > 0 ? closures.map(c => (
                    <div key={c.id} className={`flex items-center justify-between p-3 rounded-lg border ${hasAnyDifference(c.difference) ? 'bg-panel-warning/5 border-panel-warning/20' : 'bg-panel-bg/50 border-panel-border/50'}`}>
                      <div>
                        <div className="text-sm font-bold text-panel-text">{c.users?.name || '-'}</div>
                        <div className="text-xs text-panel-text-muted">{formatCellValue(c.closed_at, 'datetime')} · {c.branches?.name}</div>
                      </div>
                      <div className={`text-sm font-bold ${hasAnyDifference(c.difference) ? 'text-panel-warning' : 'text-panel-success'}`}>
                        {formatUSD(totalOf(c.counted_totals))}
                      </div>
                    </div>
                  )) : (
                    <p className="text-panel-text-muted text-sm text-center py-6">Sin cierres de caja todavía</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
