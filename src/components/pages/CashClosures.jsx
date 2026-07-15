import React, { useState, useEffect, useMemo } from 'react';
import { Loader, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchCashClosures, fetchBranches, fetchCompanyUsers } from '../../lib/supabaseHelpers.js';
import { formatCellValue } from '../../lib/reportsHelpers.js';
import { downloadReportCsv } from '../../lib/csvExport.js';
import { totalOf, hasAnyDifference } from '../../lib/cashClosureHelpers.js';
import { formatUSD } from '../../lib/format.js';

const CSV_COLUMNS = [
  { key: 'closed_at', label: 'Fecha', format: 'datetime' },
  { key: 'branch', label: 'Sucursal' },
  { key: 'pos', label: 'Punto de Venta' },
  { key: 'cashier', label: 'Cajero' },
  { key: 'expected', label: 'Esperado', format: 'usd' },
  { key: 'counted', label: 'Contado', format: 'usd' },
  { key: 'difference', label: 'Diferencia', format: 'usd' },
  { key: 'notes', label: 'Notas' }
];

// Vista de lectura para gerente/contador dentro de Contabilidad - historial
// filtrable, diferencias resaltadas, export CSV. Sin edición: los cierres
// son inmutables (RLS no tiene política de UPDATE), esta pantalla nunca
// intenta escribir.
export default function CashClosures() {
  const { currentUser, showToast, can } = useStore();
  const [closures, setClosures] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (!currentUser?.company_id) return;
    setLoading(true);
    Promise.all([
      fetchCashClosures(currentUser.company_id),
      fetchBranches(currentUser.company_id),
      fetchCompanyUsers(currentUser.company_id)
    ]).then(([closureData, branchData, userData]) => {
      setClosures(closureData);
      setBranches(branchData || []);
      setUsers((userData || []).filter(u => u.role === 'vendedor' || u.role === 'operario'));
    }).catch(error => {
      console.error('Error loading cash closures:', error);
      showToast('error', 'Error al cargar el historial de cierres');
    }).finally(() => setLoading(false));
  }, [currentUser?.company_id]);

  const rows = useMemo(() => {
    return closures
      .filter(c => branchFilter === 'all' || c.branch_id === branchFilter)
      .filter(c => userFilter === 'all' || c.user_id === userFilter)
      .filter(c => !startDate || new Date(c.closed_at) >= new Date(`${startDate}T00:00:00`))
      .filter(c => !endDate || new Date(c.closed_at) <= new Date(`${endDate}T23:59:59`))
      .map(c => ({
        id: c.id,
        closed_at: c.closed_at,
        branch: c.branches?.name || '-',
        pos: c.point_of_sales?.nombre || '-',
        cashier: c.users?.name || '-',
        expected: totalOf(c.expected_totals),
        counted: totalOf(c.counted_totals),
        difference: totalOf(c.difference),
        hasDifference: hasAnyDifference(c.difference),
        notes: c.notes || ''
      }));
  }, [closures, branchFilter, userFilter, startDate, endDate]);

  const handleExportCsv = () => {
    if (rows.length === 0) { showToast('warning', 'No hay cierres para exportar con estos filtros'); return; }
    downloadReportCsv(`Cierres_de_Caja_${new Date().toISOString().slice(0, 10)}.csv`, CSV_COLUMNS, rows);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold text-panel-text">Historial de Cierres de Caja</h2>
        {can('accounting.export') && (
          <button onClick={handleExportCsv} className="flex items-center gap-2 bg-panel-surface-2 hover:bg-panel-text/10 text-panel-text text-sm font-bold px-4 py-2 rounded-lg transition-colors">
            <FileSpreadsheet size={16} /> CSV
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="bg-panel-bg border border-panel-border rounded-lg px-3 py-2 text-sm text-panel-text">
          <option value="all">Todas las sucursales</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={userFilter} onChange={e => setUserFilter(e.target.value)} className="bg-panel-bg border border-panel-border rounded-lg px-3 py-2 text-sm text-panel-text">
          <option value="all">Todos los cajeros</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-panel-bg border border-panel-border rounded-lg px-3 py-2 text-sm text-panel-text" />
        <span className="text-panel-text-muted self-center text-sm">a</span>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-panel-bg border border-panel-border rounded-lg px-3 py-2 text-sm text-panel-text" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader className="animate-spin text-panel-text-muted" size={28} /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-panel-border">
                <th className="px-3 py-2 text-left text-xs font-bold uppercase text-panel-text-muted">Fecha</th>
                <th className="px-3 py-2 text-left text-xs font-bold uppercase text-panel-text-muted">Sucursal</th>
                <th className="px-3 py-2 text-left text-xs font-bold uppercase text-panel-text-muted">POS</th>
                <th className="px-3 py-2 text-left text-xs font-bold uppercase text-panel-text-muted">Cajero</th>
                <th className="px-3 py-2 text-right text-xs font-bold uppercase text-panel-text-muted">Esperado</th>
                <th className="px-3 py-2 text-right text-xs font-bold uppercase text-panel-text-muted">Contado</th>
                <th className="px-3 py-2 text-right text-xs font-bold uppercase text-panel-text-muted">Diferencia</th>
                <th className="px-3 py-2 text-left text-xs font-bold uppercase text-panel-text-muted">Notas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={`border-b border-panel-border ${r.hasDifference ? 'bg-panel-warning/5' : ''}`}>
                  <td className="px-3 py-2 text-panel-text-muted">{formatCellValue(r.closed_at, 'datetime')}</td>
                  <td className="px-3 py-2 text-panel-text">{r.branch}</td>
                  <td className="px-3 py-2 text-panel-text">{r.pos}</td>
                  <td className="px-3 py-2 text-panel-text">{r.cashier}</td>
                  <td className="px-3 py-2 text-right text-panel-text">{formatUSD(r.expected)}</td>
                  <td className="px-3 py-2 text-right text-panel-text">{formatUSD(r.counted)}</td>
                  <td className={`px-3 py-2 text-right font-bold flex items-center justify-end gap-1 ${r.hasDifference ? 'text-panel-warning' : 'text-panel-success'}`}>
                    {r.hasDifference && <AlertTriangle size={12} />}
                    {r.difference > 0 ? '+' : ''}{formatUSD(r.difference)}
                  </td>
                  <td className="px-3 py-2 text-panel-text-muted text-xs max-w-xs truncate" title={r.notes}>{r.notes}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-panel-text-muted">Sin cierres de caja con estos filtros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
