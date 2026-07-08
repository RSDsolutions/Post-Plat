import React, { useState, useEffect } from 'react';
import { Plus, FileText } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchData } from '../../lib/supabaseHelpers.js';
import Table from '../ui/Table.jsx';
import Badge from '../ui/Badge.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { formatUSD } from '../../lib/format.js';
import { formatDate } from '../../lib/dates.js';

export default function StoreSales() {
  const { currentUser, showToast } = useStore();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadInvoices = async () => {
      try {
        setLoading(true);
        const data = await fetchData('invoices', {
          filter: { column: 'company_id', value: currentUser.company_id },
          orderBy: { column: 'issue_date', ascending: false }
        });
        setInvoices(data || []);
      } catch (error) {
        console.error('Error loading invoices:', error);
        showToast('error', 'Error al cargar las facturas');
      } finally {
        setLoading(false);
      }
    };

    if (currentUser?.company_id) {
      loadInvoices();
    }
  }, [currentUser, showToast]);

  const handleNewInvoice = () => {
    showToast('info', 'Función de crear factura en desarrollo');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-4xl font-bold tracking-tighter uppercase text-zinc-100">Mis Ventas</h1>
        <button
          onClick={handleNewInvoice}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-2xl text-sm flex items-center shrink-0 w-fit transition-colors"
        >
          <Plus size={18} className="mr-2" /> Nueva factura
        </button>
      </div>

      <div className="bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden">
        {!loading && invoices.length > 0 ? (
          <Table
            columns={['Factura', 'Fecha', 'Monto', 'Estado', 'Acciones']}
            data={invoices}
            renderRow={(invoice) => (
              <tr key={invoice.id} className="hover:bg-zinc-800/50 transition-colors">
                <td className="px-4 py-3 font-bold text-zinc-100">{invoice.invoice_number}</td>
                <td className="px-4 py-3 text-sm text-zinc-400">{formatDate(new Date(invoice.issue_date))}</td>
                <td className="px-4 py-3 font-bold text-zinc-100">{formatUSD(invoice.total_amount)}</td>
                <td className="px-4 py-3">
                  <Badge status={invoice.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-xs font-bold uppercase tracking-wider text-emerald-500 hover:text-emerald-400 transition-colors">
                    Ver detalles
                  </button>
                </td>
              </tr>
            )}
          />
        ) : loading ? (
          <div className="p-8 text-center text-zinc-500">
            <div className="animate-spin inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mb-4" />
            <p>Cargando facturas...</p>
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="Sin facturas"
            description="Crea tu primera factura para comenzar a registrar tus ventas."
          />
        )}
      </div>

      <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6">
        <h2 className="text-lg font-bold text-zinc-100 mb-4">Resumen de Ventas</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zinc-950/50 p-4 rounded-xl">
            <div className="text-sm text-zinc-500 mb-1">Total de ventas</div>
            <div className="text-2xl font-bold text-emerald-400">
              {formatUSD(invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0))}
            </div>
          </div>
          <div className="bg-zinc-950/50 p-4 rounded-xl">
            <div className="text-sm text-zinc-500 mb-1">Facturas emitidas</div>
            <div className="text-2xl font-bold text-blue-400">{invoices.length}</div>
          </div>
          <div className="bg-zinc-950/50 p-4 rounded-xl">
            <div className="text-sm text-zinc-500 mb-1">Promedio por factura</div>
            <div className="text-2xl font-bold text-amber-400">
              {formatUSD(invoices.length > 0 ? invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0) / invoices.length : 0)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
