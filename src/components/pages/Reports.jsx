import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, Package, Users, Building2, Boxes, Receipt, LayoutGrid,
  Loader, FileSpreadsheet, FileText, MapPin, Lock
} from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchData, fetchInvoicesForReports, fetchCompanyById, fetchCompanyUsers, fetchBranches, fetchProductStock, fetchProductStockAllBranches, fetchCompanyFeatureOverrides } from '../../lib/supabaseHelpers.js';
import {
  DATE_PRESETS, computeDateRange, formatDateRangeLabel,
  buildReportDataset, buildReport, formatCellValue, REPORT_TABS
} from '../../lib/reportsHelpers.js';
import { downloadReportCsv } from '../../lib/csvExport.js';
import { generateReportPdf } from '../../lib/reportPdfGenerator.js';
import { TrendLineChart, DonutChart, BarList } from '../ui/ReportCharts.jsx';
import { hasFeature } from '../../lib/planLimits.js';
import EmptyState from '../ui/EmptyState.jsx';

const TAB_ICONS = { overview: LayoutGrid, sales: TrendingUp, products: Package, customers: Users, cashiers: Building2, inventory: Boxes, tax: Receipt };
const CHART_HEADINGS = {
  overview: 'Tendencia de Ingresos',
  sales: 'Ingresos por Método de Pago',
  products: 'Top Productos por Ingresos',
  customers: 'Top Clientes por Gasto',
  cashiers: 'Ranking de Cajeros',
  inventory: 'Valor de Inventario por Categoría',
  tax: 'Facturas por Estado'
};
const BAR_ACCENTS = { products: 'blue', customers: 'pink', cashiers: 'purple' };
const KPI_TEXT_CLASSES = { emerald: 'text-emerald-400', blue: 'text-blue-400', amber: 'text-amber-400', purple: 'text-purple-400', pink: 'text-pink-400', red: 'text-red-400' };

export default function Reports() {
  const { currentUser, showToast, companies, plans, can } = useStore();
  const [datePreset, setDatePreset] = useState('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [company, setCompany] = useState(null);
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [rawData, setRawData] = useState({ invoices: [], products: [], users: [], stockRows: [] });
  const [featureOverrides, setFeatureOverrides] = useState([]);

  const ownCompany = companies.find(c => c.id === currentUser?.company_id);
  const plan = plans.find(p => p.id === ownCompany?.planId);
  const reportsEnabled = hasFeature(plan, featureOverrides, 'reportes');

  useEffect(() => {
    if (currentUser?.company_id) {
      fetchCompanyFeatureOverrides(currentUser.company_id).then(setFeatureOverrides).catch(() => {});
    }
  }, [currentUser?.company_id]);

  const { start, end } = useMemo(() => computeDateRange(datePreset, customStart, customEnd), [datePreset, customStart, customEnd]);
  const dateRangeLabel = useMemo(() => formatDateRangeLabel(start, end), [start, end]);

  useEffect(() => {
    if (currentUser?.company_id) {
      fetchBranches(currentUser.company_id).then(setBranches).catch(() => {});
    }
  }, [currentUser?.company_id]);

  useEffect(() => {
    if (!currentUser?.company_id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchInvoicesForReports(currentUser.company_id, start ? start.toISOString() : null, end ? end.toISOString() : null),
      fetchData('products', { filter: { column: 'company_id', value: currentUser.company_id } }),
      fetchCompanyUsers(currentUser.company_id),
      fetchCompanyById(currentUser.company_id),
      selectedBranchId === 'all'
        ? fetchProductStockAllBranches(currentUser.company_id)
        : fetchProductStock(currentUser.company_id, selectedBranchId)
    ]).then(([invoices, products, users, companyData, stockRows]) => {
      if (cancelled) return;
      // point_of_sales is embedded on each invoice (see fetchInvoicesForReports) -
      // filter by branch client-side, consistent with how every other report
      // filter in this view already works (fetch once, derive many).
      const scopedInvoices = selectedBranchId === 'all'
        ? invoices
        : invoices.filter(inv => inv.point_of_sales?.branch_id === selectedBranchId);
      setRawData({ invoices: scopedInvoices, products: products || [], users: users || [], stockRows: stockRows || [] });
      setCompany(companyData);
    }).catch(error => {
      console.error('Error loading reports data:', error);
      showToast('error', 'Error al cargar los datos de reportes');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.company_id, start?.getTime(), end?.getTime(), selectedBranchId]);

  const dataset = useMemo(() => buildReportDataset(rawData), [rawData]);
  const report = useMemo(() => buildReport(activeTab, dataset), [activeTab, dataset]);
  const activeTabMeta = REPORT_TABS.find(t => t.id === activeTab);

  const handleExportCsv = () => {
    if (!report.table || report.table.rows.length === 0) {
      showToast('warning', 'No hay datos para exportar en este período');
      return;
    }
    const filename = `Reporte_${activeTabMeta.label.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadReportCsv(filename, report.table.columns, report.table.rows);
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await generateReportPdf({ company, title: activeTabMeta.label, dateRangeLabel, report });
    } catch (error) {
      console.error('Error generating report PDF:', error);
      showToast('error', 'Error al generar el PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  if (!loading && !reportsEnabled) {
    return (
      <div className="max-w-7xl mx-auto">
        <EmptyState
          icon={Lock}
          title="Reportes no incluido en tu plan"
          description="Actualiza tu plan para acceder a reportes avanzados con gráficos y exportación a PDF/CSV."
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tighter uppercase text-zinc-100">Reportes</h1>
        <p className="text-zinc-500 mt-1">Análisis completo de ventas, productos, clientes, cajeros e inventario</p>
      </div>

      {/* Date range filter */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-wrap items-center gap-2">
        {DATE_PRESETS.map(p => (
          <button
            key={p.id}
            onClick={() => setDatePreset(p.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              datePreset === p.id ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent'
            }`}
          >
            {p.label}
          </button>
        ))}
        {datePreset === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              max={customEnd || undefined}
              onChange={e => setCustomStart(e.target.value)}
              className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
            />
            <span className="text-zinc-500 text-sm">a</span>
            <input
              type="date"
              value={customEnd}
              min={customStart || undefined}
              onChange={e => setCustomEnd(e.target.value)}
              className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
            />
          </div>
        )}
        <div className="ml-auto text-xs text-zinc-500 font-medium">{dateRangeLabel}</div>
      </div>

      {/* Branch filter */}
      {branches.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-wrap items-center gap-2">
          <MapPin size={16} className="text-zinc-500 flex-shrink-0" />
          <button
            onClick={() => setSelectedBranchId('all')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              selectedBranchId === 'all' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent'
            }`}
          >
            Todas las sucursales
          </button>
          {branches.map(b => (
            <button
              key={b.id}
              onClick={() => setSelectedBranchId(b.id)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                selectedBranchId === b.id ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-zinc-800">
        {REPORT_TABS.map(tab => {
          const Icon = TAB_ICONS[tab.id] || LayoutGrid;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-bold border-b-2 transition-colors ${
                active ? 'text-blue-400 border-blue-500 bg-zinc-900' : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-zinc-900/50'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'inventory' && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
          <p className="text-sm text-blue-400">
            Este reporte muestra el inventario actual de la sucursal seleccionada arriba y no depende del rango de fechas.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader className="animate-spin text-zinc-600" size={32} />
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {report.kpis.map((kpi, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 min-w-0">
                <div className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-2 truncate">{kpi.label}</div>
                <div className={`text-2xl font-bold truncate ${KPI_TEXT_CLASSES[kpi.accent] || 'text-zinc-100'}`} title={formatCellValue(kpi.value, kpi.format)}>
                  {formatCellValue(kpi.value, kpi.format)}
                </div>
              </div>
            ))}
          </div>

          {/* Chart */}
          {report.chart && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-zinc-100 mb-5">{CHART_HEADINGS[activeTab] || 'Visualización'}</h2>
              {report.chart.type === 'trend' && (
                <TrendLineChart data={report.chart.data} accent="emerald" formatValue={(v) => formatCellValue(v, report.chart.valueFormat)} />
              )}
              {report.chart.type === 'donut' && (
                <DonutChart
                  data={report.chart.data}
                  formatValue={(v) => formatCellValue(v, report.chart.valueFormat)}
                  centerLabel={{
                    label: 'Total',
                    value: formatCellValue(report.chart.data.reduce((s, d) => s + (d.value || 0), 0), report.chart.valueFormat)
                  }}
                />
              )}
              {report.chart.type === 'bars' && (
                <BarList data={report.chart.data} accent={BAR_ACCENTS[activeTab] || 'emerald'} />
              )}
            </div>
          )}

          {/* Table + exports */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="p-6 pb-4 flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-bold text-zinc-100">{report.table.title}</h2>
              {can('reports.export') && (
                <div className="flex gap-2">
                  <button
                    onClick={handleExportCsv}
                    className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-bold px-4 py-2 rounded-lg transition-colors"
                  >
                    <FileSpreadsheet size={16} />
                    CSV
                  </button>
                  <button
                    onClick={handleExportPdf}
                    disabled={exportingPdf}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
                  >
                    {exportingPdf ? <Loader size={16} className="animate-spin" /> : <FileText size={16} />}
                    PDF
                  </button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto px-6 pb-6">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {report.table.columns.map(col => (
                      <th
                        key={col.key}
                        className={`py-3 px-3 text-xs font-bold text-zinc-500 uppercase tracking-wide whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.table.rows.length === 0 ? (
                    <tr>
                      <td colSpan={report.table.columns.length} className="text-center py-10 text-zinc-500">
                        Sin datos para este período
                      </td>
                    </tr>
                  ) : report.table.rows.map((row, i) => (
                    <tr key={i} className={`border-b border-zinc-800/50 ${i % 2 === 1 ? 'bg-zinc-950/40' : ''}`}>
                      {report.table.columns.map(col => (
                        <td
                          key={col.key}
                          className={`py-2.5 px-3 text-zinc-300 whitespace-nowrap ${col.align === 'right' ? 'text-right font-mono' : 'text-left'}`}
                        >
                          {formatCellValue(row[col.key], col.format)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {report.table.totals && report.table.rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-zinc-700 font-bold text-zinc-100">
                      {report.table.columns.map((col, i) => (
                        <td key={col.key} className={`py-3 px-3 whitespace-nowrap ${col.align === 'right' ? 'text-right font-mono' : 'text-left'}`}>
                          {report.table.totals[col.key] !== undefined ? formatCellValue(report.table.totals[col.key], col.format) : (i === 0 ? 'TOTAL' : '')}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
