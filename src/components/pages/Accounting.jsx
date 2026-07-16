import React, { useState, useEffect, useMemo } from 'react';
import { Archive, Loader, MapPin, FileSpreadsheet, FileText, RefreshCw, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchInvoicesForReports, fetchBranches, fetchCompanyById, reconcileInvoiceStatus, fetchLastSriRetrySweep } from '../../lib/supabaseHelpers.js';
import { DATE_PRESETS, computeDateRange, formatDateRangeLabel, formatCellValue } from '../../lib/reportsHelpers.js';
import { buildSalesLedger, buildSriReconciliation } from '../../lib/accountingHelpers.js';
import { downloadReportCsv } from '../../lib/csvExport.js';
import { generateReportPdf } from '../../lib/reportPdfGenerator.js';
import { downloadInvoicesXmlZip } from '../../lib/invoiceXmlExport.js';
import Tabs from '../ui/Tabs.jsx';
import CashClosures from './CashClosures.jsx';

const KPI_TEXT_CLASSES = {
  emerald: 'text-panel-success',
  blue: 'text-panel-accent-soft',
  amber: 'text-panel-warning',
  purple: 'text-[var(--kpi-purple)]',
  pink: 'text-[var(--kpi-pink)]',
  red: 'text-panel-danger'
};

const ALL_ACCOUNTING_TABS = [
  { id: 'ledger', label: 'Libro de Ventas', permission: null },
  { id: 'reconciliation', label: 'Conciliación SRI', permission: null },
  { id: 'cashClosures', label: 'Cierres de Caja', permission: 'cash_closure.read' },
  { id: 'xml', label: 'Descarga de XML', permission: null }
];

export default function Accounting() {
  const { currentUser, showToast, can } = useStore();
  const ACCOUNTING_TABS = ALL_ACCOUNTING_TABS.filter(t => !t.permission || can(t.permission));
  const [tab, setTab] = useState('ledger');
  const [datePreset, setDatePreset] = useState('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [branches, setBranches] = useState([]);
  const [company, setCompany] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileProgress, setReconcileProgress] = useState(null);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [lastSweep, setLastSweep] = useState(null);

  const { start, end } = useMemo(() => computeDateRange(datePreset, customStart, customEnd), [datePreset, customStart, customEnd]);
  const dateRangeLabel = useMemo(() => formatDateRangeLabel(start, end), [start, end]);

  useEffect(() => {
    if (currentUser?.company_id) {
      fetchBranches(currentUser.company_id).then(setBranches).catch(() => {});
      fetchCompanyById(currentUser.company_id).then(setCompany).catch(() => {});
      fetchLastSriRetrySweep().then(setLastSweep).catch(() => {});
    }
  }, [currentUser?.company_id]);

  const loadInvoices = () => {
    if (!currentUser?.company_id) return;
    setLoading(true);
    fetchInvoicesForReports(currentUser.company_id, start ? start.toISOString() : null, end ? end.toISOString() : null)
      .then(data => setInvoices(data || []))
      .catch(() => showToast('error', 'Error al cargar las facturas del período'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.company_id, start?.getTime(), end?.getTime()]);

  const scopedInvoices = useMemo(() => {
    if (selectedBranchId === 'all') return invoices;
    return invoices.filter(inv => inv.point_of_sales?.branch_id === selectedBranchId);
  }, [invoices, selectedBranchId]);

  const ledger = useMemo(() => buildSalesLedger(scopedInvoices, branches), [scopedInvoices, branches]);
  const reconciliation = useMemo(() => buildSriReconciliation(scopedInvoices), [scopedInvoices]);

  const handleExportCsv = () => {
    if (ledger.table.rows.length === 0) { showToast('warning', 'No hay datos para exportar en este período'); return; }
    downloadReportCsv(`Libro_de_Ventas_${new Date().toISOString().slice(0, 10)}.csv`, ledger.table.columns, ledger.table.rows);
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await generateReportPdf({ company, title: 'Libro de Ventas', dateRangeLabel, report: ledger });
    } catch (error) {
      console.error('Error generating ledger PDF:', error);
      showToast('error', 'Error al generar el PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  // Recorre en serie (no en paralelo) las devueltas reconsultables, con
  // feedback de progreso - ver api/sri/reconcile-invoice.js para por qué esto
  // reemplaza el api/sri/status.js que pedía la spec original (ese endpoint
  // no reconsulta comprobantes, solo hace ping a las URLs del SRI).
  const handleReconcileAll = async () => {
    const targets = reconciliation.pending.filter(p => p.reconcilable);
    if (targets.length === 0) {
      showToast('info', 'No hay facturas devueltas con clave de acceso para reconsultar');
      return;
    }
    setReconciling(true);
    setReconcileProgress({ done: 0, total: targets.length });
    let authorizedCount = 0;
    for (let i = 0; i < targets.length; i++) {
      try {
        const result = await reconcileInvoiceStatus({ invoiceId: targets[i].id });
        if (result.status === 'autorizada') authorizedCount++;
      } catch (error) {
        console.error('Error reconciling invoice:', error);
      }
      setReconcileProgress({ done: i + 1, total: targets.length });
    }
    setReconciling(false);
    setReconcileProgress(null);
    showToast('success', `Reconsulta terminada: ${authorizedCount} de ${targets.length} ahora autorizada${authorizedCount === 1 ? '' : 's'}`);
    loadInvoices();
  };

  const handleDownloadZip = async () => {
    setDownloadingZip(true);
    try {
      const count = await downloadInvoicesXmlZip(scopedInvoices, `comprobantes-${datePreset}-${new Date().toISOString().slice(0, 10)}.zip`);
      showToast('success', `ZIP generado con ${count} comprobante${count === 1 ? '' : 's'} autorizado${count === 1 ? '' : 's'}`);
    } catch (error) {
      showToast('error', error.message || 'Error al generar el ZIP');
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tighter uppercase text-panel-text">Contabilidad</h1>
        <p className="text-panel-text-muted mt-1">Libro de ventas, conciliación SRI y descarga de comprobantes</p>
      </div>

      <div className="bg-panel-surface border border-panel-border rounded-2xl p-4 flex flex-wrap items-center gap-2">
        {DATE_PRESETS.map(p => (
          <button
            key={p.id}
            onClick={() => setDatePreset(p.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              datePreset === p.id ? 'bg-panel-accent/20 text-panel-accent-soft border border-panel-accent/40' : 'text-panel-text-muted hover:text-panel-text hover:bg-panel-text/10 border border-transparent'
            }`}
          >
            {p.label}
          </button>
        ))}
        {datePreset === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customStart} max={customEnd || undefined} onChange={e => setCustomStart(e.target.value)} className="bg-panel-bg border border-panel-border rounded-lg px-3 py-2 text-sm text-panel-text" />
            <span className="text-panel-text-muted text-sm">a</span>
            <input type="date" value={customEnd} min={customStart || undefined} onChange={e => setCustomEnd(e.target.value)} className="bg-panel-bg border border-panel-border rounded-lg px-3 py-2 text-sm text-panel-text" />
          </div>
        )}
        <div className="ml-auto text-xs text-panel-text-muted font-medium">{dateRangeLabel}</div>
      </div>

      {branches.length > 1 && (
        <div className="bg-panel-surface border border-panel-border rounded-2xl p-4 flex flex-wrap items-center gap-2">
          <MapPin size={16} className="text-panel-text-muted flex-shrink-0" />
          <button onClick={() => setSelectedBranchId('all')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${selectedBranchId === 'all' ? 'bg-panel-accent/20 text-panel-accent-soft border border-panel-accent/40' : 'text-panel-text-muted hover:text-panel-text hover:bg-panel-text/10 border border-transparent'}`}>
            Todas las sucursales
          </button>
          {branches.map(b => (
            <button key={b.id} onClick={() => setSelectedBranchId(b.id)} className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${selectedBranchId === b.id ? 'bg-panel-accent/20 text-panel-accent-soft border border-panel-accent/40' : 'text-panel-text-muted hover:text-panel-text hover:bg-panel-text/10 border border-transparent'}`}>
              {b.name}
            </button>
          ))}
        </div>
      )}

      <div className="bg-panel-surface border border-panel-border rounded-2xl overflow-hidden">
        <Tabs tabs={ACCOUNTING_TABS} activeTab={tab} onTabChange={setTab} />

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader className="animate-spin text-panel-text-muted" size={32} />
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {tab === 'ledger' && (
              <>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <h2 className="text-lg font-bold text-panel-text">Libro de Ventas Mensual</h2>
                  {can('accounting.export') && (
                    <div className="flex gap-2">
                      <button onClick={handleExportCsv} className="flex items-center gap-2 bg-panel-surface-2 hover:bg-panel-text/10 text-panel-text text-sm font-bold px-4 py-2 rounded-lg transition-colors">
                        <FileSpreadsheet size={16} /> CSV
                      </button>
                      <button onClick={handleExportPdf} disabled={exportingPdf} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
                        {exportingPdf ? <Loader size={16} className="animate-spin" /> : <FileText size={16} />} PDF
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {ledger.kpis.map((kpi, i) => (
                    <div key={i} className="bg-panel-bg border border-panel-border rounded-2xl p-5 min-w-0">
                      <div className="text-xs text-panel-text-muted uppercase tracking-wide font-medium mb-2 truncate">{kpi.label}</div>
                      <div className={`text-xl font-bold truncate ${KPI_TEXT_CLASSES[kpi.accent] || 'text-panel-text'}`}>{formatCellValue(kpi.value, kpi.format)}</div>
                    </div>
                  ))}
                </div>

                {ledger.creditNotesCount > 0 && (
                  <div className="bg-[var(--kpi-purple)]/10 border border-[var(--kpi-purple)]/20 rounded-2xl p-4 text-sm text-[var(--kpi-purple)]">
                    Los totales de arriba ya restan {ledger.creditNotesCount} nota{ledger.creditNotesCount === 1 ? '' : 's'} de crédito del período.
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-panel-bg border border-panel-border rounded-2xl p-5">
                    <h3 className="text-sm font-bold text-panel-text-muted mb-3">Por forma de pago</h3>
                    <div className="space-y-2">
                      {ledger.byPaymentMethod.map(r => (
                        <div key={r.method} className="flex justify-between text-sm">
                          <span className="text-panel-text-muted">{r.method}</span>
                          <span className="font-bold text-panel-text">{formatCellValue(r.total, 'usd')}</span>
                        </div>
                      ))}
                      {ledger.byPaymentMethod.length === 0 && <p className="text-xs text-panel-text-muted">Sin datos en este período</p>}
                    </div>
                  </div>
                  <div className="bg-panel-bg border border-panel-border rounded-2xl p-5">
                    <h3 className="text-sm font-bold text-panel-text-muted mb-3">Por sucursal</h3>
                    <div className="space-y-2">
                      {ledger.byBranch.map(r => (
                        <div key={r.branch} className="flex justify-between text-sm">
                          <span className="text-panel-text-muted">{r.branch}</span>
                          <span className="font-bold text-panel-text">{formatCellValue(r.total, 'usd')}</span>
                        </div>
                      ))}
                      {ledger.byBranch.length === 0 && <p className="text-xs text-panel-text-muted">Sin datos en este período</p>}
                    </div>
                  </div>
                </div>

                <div className="bg-panel-bg border border-panel-border rounded-2xl p-5">
                  <h3 className="text-sm font-bold text-panel-text-muted mb-3">Comprobantes por estado</h3>
                  <div className="flex flex-wrap gap-4">
                    {ledger.byStatus.map(s => (
                      <div key={s.status} className="text-sm">
                        <span className="text-panel-text-muted">{s.status}: </span>
                        <span className="font-bold text-panel-text">{s.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-panel-border">
                        {ledger.table.columns.map(c => (
                          <th key={c.key} className={`px-3 py-2 text-xs font-bold uppercase text-panel-text-muted ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.table.rows.map((row, i) => (
                        <tr key={i} className="border-b border-panel-border hover:bg-panel-surface-2">
                          {ledger.table.columns.map(c => (
                            <td key={c.key} className={`px-3 py-2 text-panel-text ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{formatCellValue(row[c.key], c.format)}</td>
                          ))}
                        </tr>
                      ))}
                      {ledger.table.rows.length === 0 && (
                        <tr><td colSpan={ledger.table.columns.length} className="px-3 py-8 text-center text-panel-text-muted">Sin facturas en este período</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {tab === 'reconciliation' && (
              <>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <h2 className="text-lg font-bold text-panel-text">Conciliación SRI</h2>
                  {can('invoices.resend_sri') && (
                    <button
                      onClick={handleReconcileAll}
                      disabled={reconciling}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
                    >
                      {reconciling ? <Loader size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                      {reconciling && reconcileProgress ? `Reconsultando ${reconcileProgress.done}/${reconcileProgress.total}...` : 'Reconsultar estados'}
                    </button>
                  )}
                </div>

                <div className="bg-panel-surface-2/50 border border-panel-border rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs text-panel-text-muted">
                  <Clock size={14} className="flex-shrink-0" />
                  {lastSweep ? (
                    <span>Último barrido automático: <span className="text-panel-text font-medium">{formatCellValue(lastSweep.created_at, 'datetime')}</span> — {lastSweep.description}</span>
                  ) : (
                    <span>Todavía no se registró ningún barrido automático de reintentos para esta empresa.</span>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-panel-success/10 border border-panel-success/20 rounded-2xl p-5">
                    <div className="flex items-center gap-2 text-panel-success mb-2"><CheckCircle2 size={16} /><span className="text-xs font-bold uppercase">Autorizadas</span></div>
                    <div className="text-2xl font-bold text-panel-success">{reconciliation.counts.autorizada || 0}</div>
                  </div>
                  <div className="bg-panel-danger/10 border border-panel-danger/20 rounded-2xl p-5">
                    <div className="flex items-center gap-2 text-panel-danger mb-2"><AlertTriangle size={16} /><span className="text-xs font-bold uppercase">Devueltas</span></div>
                    <div className="text-2xl font-bold text-panel-danger">{reconciliation.counts.devuelta || 0}</div>
                  </div>
                  <div className="bg-panel-warning/10 border border-panel-warning/20 rounded-2xl p-5">
                    <div className="flex items-center gap-2 text-panel-warning mb-2"><Clock size={16} /><span className="text-xs font-bold uppercase">Pendientes</span></div>
                    <div className="text-2xl font-bold text-panel-warning">{reconciliation.counts.borrador || 0}</div>
                  </div>
                  <div className="bg-panel-surface-2/50 border border-panel-border rounded-2xl p-5">
                    <div className="text-xs font-bold uppercase text-panel-text-muted mb-2">Anuladas</div>
                    <div className="text-2xl font-bold text-panel-text">{reconciliation.counts.anulada || 0}</div>
                  </div>
                </div>

                {reconciliation.allClear ? (
                  <div className="bg-panel-success/10 border border-panel-success/20 rounded-2xl p-6 text-center">
                    <CheckCircle2 className="mx-auto text-panel-success mb-2" size={28} />
                    <p className="text-panel-success font-bold">Todas las ventas del período están autorizadas o anuladas.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-panel-border">
                          <th className="px-3 py-2 text-left text-xs font-bold uppercase text-panel-text-muted">Factura</th>
                          <th className="px-3 py-2 text-left text-xs font-bold uppercase text-panel-text-muted">Fecha</th>
                          <th className="px-3 py-2 text-left text-xs font-bold uppercase text-panel-text-muted">Estado</th>
                          <th className="px-3 py-2 text-left text-xs font-bold uppercase text-panel-text-muted">Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reconciliation.pending.map(p => (
                          <tr key={p.id} className="border-b border-panel-border">
                            <td className="px-3 py-2 text-panel-text font-mono text-xs">{p.invoiceNumber}</td>
                            <td className="px-3 py-2 text-panel-text-muted">{formatCellValue(p.date, 'datetime')}</td>
                            <td className="px-3 py-2 text-panel-text">{p.status}</td>
                            <td className="px-3 py-2 text-panel-text-muted text-xs max-w-md truncate" title={p.reason}>{p.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {tab === 'cashClosures' && <CashClosures />}

            {tab === 'xml' && (
              <>
                <h2 className="text-lg font-bold text-panel-text">Descarga de XML autorizados</h2>
                <p className="text-sm text-panel-text-muted">
                  Genera un .zip con el XML de cada factura autorizada del período y sucursal seleccionados arriba, nombrado con su clave de acceso, más un resumen.csv.
                </p>
                {can('invoices.export') ? (
                  <button
                    onClick={handleDownloadZip}
                    disabled={downloadingZip}
                    className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-bold px-5 py-3 rounded-lg transition-colors"
                  >
                    {downloadingZip ? <Loader size={18} className="animate-spin" /> : <Archive size={18} />}
                    {downloadingZip ? 'Generando ZIP...' : 'Descargar ZIP'}
                  </button>
                ) : (
                  <p className="text-sm text-panel-text-muted">No tienes permiso para exportar comprobantes.</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
