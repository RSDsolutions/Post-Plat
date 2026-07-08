import React, { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchData } from '../../lib/supabaseHelpers.js';
import Table from '../ui/Table.jsx';
import Badge from '../ui/Badge.jsx';
import { formatUSD } from '../../lib/format.js';

export default function InvoiceManagement() {
  const { currentUser } = useStore();
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchData('invoices', {
          filter: { column: 'company_id', value: currentUser.company_id },
          orderBy: { column: 'issue_date', ascending: false }
        });
        setInvoices(data || []);
      } catch (e) { console.error(e); }
    };
    if (currentUser?.company_id) load();
  }, [currentUser]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-4xl font-bold text-zinc-100">Gestión de Facturas</h1>
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
        <Table
          columns={['Factura', 'Fecha', 'Monto', 'IVA', 'Total', 'Estado']}
          data={invoices}
          renderRow={(inv) => (
            <tr key={inv.id} className="hover:bg-zinc-800/50">
              <td className="px-4 py-3 font-bold text-zinc-100">{inv.invoice_number}</td>
              <td className="px-4 py-3 text-zinc-400">{new Date(inv.issue_date).toLocaleDateString()}</td>
              <td className="px-4 py-3 text-zinc-100">{formatUSD(inv.subtotal)}</td>
              <td className="px-4 py-3 text-zinc-100">{formatUSD(inv.tax_amount)}</td>
              <td className="px-4 py-3 font-bold text-emerald-400">{formatUSD(inv.total_amount)}</td>
              <td className="px-4 py-3"><Badge status={inv.status} /></td>
            </tr>
          )}
        />
      </div>
    </div>
  );
}
