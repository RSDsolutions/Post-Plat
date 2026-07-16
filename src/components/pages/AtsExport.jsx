import React, { useState, useMemo } from 'react';
import JSZip from 'jszip';
import { Loader, FileDown, AlertTriangle, FileWarning } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchInvoicesForReports, fetchPurchasesForReports, fetchCompanyById } from '../../lib/supabaseHelpers.js';
import { buildAtsSummary, COD_SUSTENTO_OPTIONS } from '../../lib/atsHelpers.js';
import { buildAtsXml, atsFileName } from '../../lib/atsXmlBuilder.js';
import { formatUSD } from '../../lib/format.js';

const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function AtsExport() {
  const { currentUser, showToast, can } = useStore();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [rawInvoices, setRawInvoices] = useState(null);
  const [rawPurchases, setRawPurchases] = useState(null);
  const [company, setCompany] = useState(null);
  const [codSustentoByPurchaseId, setCodSustentoByPurchaseId] = useState({});
  const [downloading, setDownloading] = useState(false);

  const handleGenerate = async () => {
    if (!currentUser?.company_id) return;
    setLoading(true);
    try {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
      const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

      const [invoices, purchases, companyData] = await Promise.all([
        fetchInvoicesForReports(currentUser.company_id, start.toISOString(), end.toISOString()),
        fetchPurchasesForReports(currentUser.company_id, startStr, endStr),
        fetchCompanyById(currentUser.company_id)
      ]);

      setRawInvoices(invoices);
      setRawPurchases(purchases);
      setCompany(companyData);
      setCodSustentoByPurchaseId(Object.fromEntries(purchases.map(p => [p.id, '01'])));
    } catch (error) {
      console.error('Error generando ATS:', error);
      showToast('error', 'Error al cargar los datos del período');
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    if (!rawInvoices || !rawPurchases || !company) return null;
    return buildAtsSummary({ company, year, month, invoices: rawInvoices, purchases: rawPurchases, codSustentoByPurchaseId });
  }, [rawInvoices, rawPurchases, company, year, month, codSustentoByPurchaseId]);

  const totalRetenidoIva = useMemo(() => summary ? summary.compras.reduce((s, c) => s + c.valorRetBienes, 0) : 0, [summary]);
  const totalRetenidoRenta = useMemo(() => summary
    ? summary.compras.reduce((s, c) => s + c.airDetalle.reduce((s2, a) => s2 + a.valRetAir, 0), 0)
    : 0, [summary]);

  const handleDownload = async () => {
    if (!summary) return;
    setDownloading(true);
    try {
      const xml = buildAtsXml(summary);
      const filename = atsFileName(year, month);
      const zip = new JSZip();
      zip.file(filename, xml);
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, filename.replace('.xml', '.zip'));
    } catch (error) {
      console.error('Error generando el archivo ATS:', error);
      showToast('error', 'Error al generar el archivo ATS');
    } finally {
      setDownloading(false);
    }
  };

  if (!can('reports.export')) return null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tighter uppercase text-panel-text">ATS - Anexo Transaccional Simplificado</h1>
        <p className="text-panel-text-muted mt-1">Genera el archivo mensual para declarar ante el SRI vía DIMM Formularios</p>
      </div>

      <div className="bg-panel-warning/10 border border-panel-warning/30 rounded-2xl p-4 flex gap-3">
        <FileWarning size={20} className="text-panel-warning flex-shrink-0 mt-0.5" />
        <p className="text-sm text-panel-text">
          Este archivo se reconstruyó a partir del esquema oficial del SRI, pero incluye simplificaciones documentadas
          (retención de IVA sin desglose bienes/servicios, código de sustento sugerido por defecto, sin exportaciones/
          fideicomisos/tarjetas de crédito). <strong>Revísalo con tu contador antes de declararlo</strong> — no lo presentes
          al SRI sin esa revisión.
        </p>
      </div>

      <div className="bg-panel-surface border border-panel-border rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-panel-text-muted uppercase tracking-wide font-medium mb-1">Mes</label>
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="bg-panel-bg border border-panel-border rounded-lg px-3 py-2 text-sm text-panel-text"
          >
            {MONTH_LABELS.map((label, i) => <option key={i} value={i + 1}>{label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-panel-text-muted uppercase tracking-wide font-medium mb-1">Año</label>
          <input
            type="number"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="bg-panel-bg border border-panel-border rounded-lg px-3 py-2 text-sm text-panel-text w-24"
          />
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="flex items-center gap-2 bg-panel-accent hover:bg-panel-accent/90 disabled:opacity-60 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
        >
          {loading ? <Loader size={16} className="animate-spin" /> : null}
          Generar Vista Previa
        </button>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: 'Total Ventas del Período', value: formatUSD(summary.header.totalVentas), accent: 'text-panel-success' },
              { label: 'Compras Registradas', value: summary.compras.length, accent: 'text-panel-accent-soft' },
              { label: 'Retenido IVA (compras)', value: formatUSD(totalRetenidoIva), accent: 'text-[var(--kpi-purple)]' },
              { label: 'Retenido Renta (compras)', value: formatUSD(totalRetenidoRenta), accent: 'text-panel-warning' },
              { label: 'Documentos Anulados', value: summary.anulados.length, accent: 'text-panel-danger' }
            ].map((kpi, i) => (
              <div key={i} className="bg-panel-surface border border-panel-border rounded-2xl p-5 min-w-0">
                <div className="text-xs text-panel-text-muted uppercase tracking-wide font-medium mb-2 truncate">{kpi.label}</div>
                <div className={`text-2xl font-bold truncate ${kpi.accent}`}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {summary.incompleteCount > 0 && (
            <div className="bg-panel-danger/10 border border-panel-danger/30 rounded-2xl p-4 flex gap-3">
              <AlertTriangle size={20} className="text-panel-danger flex-shrink-0 mt-0.5" />
              <p className="text-sm text-panel-text">
                {summary.incompleteCount} compra(s) del período no se incluyeron en el ATS porque les falta el número de
                documento del proveedor en formato 001-001-000000001 o la clave de acceso — sin eso el campo autorización
                del comprobante quedaría vacío, que el SRI no acepta. Complétalas en Registro de Compras y vuelve a generar.
              </p>
            </div>
          )}

          <div className="bg-panel-surface border border-panel-border rounded-2xl overflow-hidden">
            <div className="p-6 pb-4 flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-bold text-panel-text">Compras del Período — código de sustento</h2>
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
              >
                {downloading ? <Loader size={16} className="animate-spin" /> : <FileDown size={16} />}
                Descargar ATS (ZIP)
              </button>
            </div>
            <div className="overflow-x-auto px-6 pb-6">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-panel-border">
                    <th className="py-3 px-3 text-xs font-bold text-panel-text-muted uppercase tracking-wide text-left">Proveedor</th>
                    <th className="py-3 px-3 text-xs font-bold text-panel-text-muted uppercase tracking-wide text-left">Documento</th>
                    <th className="py-3 px-3 text-xs font-bold text-panel-text-muted uppercase tracking-wide text-right">Total</th>
                    <th className="py-3 px-3 text-xs font-bold text-panel-text-muted uppercase tracking-wide text-left">Código de Sustento</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.compras.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-10 text-panel-text-muted">Sin compras exportables en este período</td></tr>
                  ) : rawPurchases.filter(p => p.status !== 'anulada' && p.supplier_access_key).map(p => (
                    <tr key={p.id} className="border-b border-panel-border/50">
                      <td className="py-2.5 px-3 text-panel-text">{p.suppliers?.razon_social || '-'}</td>
                      <td className="py-2.5 px-3 text-panel-text font-mono">{p.supplier_document_number}</td>
                      <td className="py-2.5 px-3 text-panel-text text-right font-mono">{formatUSD(p.total)}</td>
                      <td className="py-2.5 px-3">
                        <select
                          value={codSustentoByPurchaseId[p.id] || '01'}
                          onChange={e => setCodSustentoByPurchaseId(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="bg-panel-bg border border-panel-border rounded-lg px-2 py-1 text-xs text-panel-text w-full max-w-md"
                        >
                          {COD_SUSTENTO_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
