import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore.js';
import { fetchData } from '../../lib/supabaseHelpers.js';
import Table from '../ui/Table.jsx';
import { formatUSD } from '../../lib/format.js';

export default function CustomerManagement() {
  const { currentUser } = useStore();
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchData('customers', {
          filter: { column: 'company_id', value: currentUser.company_id }
        });
        setCustomers(data || []);
      } catch (e) { console.error(e); }
    };
    if (currentUser?.company_id) load();
  }, [currentUser]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-panel-text">Clientes</h1>
      <div className="bg-panel-surface rounded-2xl border border-panel-border overflow-hidden">
        <Table
          columns={['Nombre', 'Email', 'Teléfono', 'Crédito Límite', 'Saldo', 'Estado']}
          data={customers}
          renderRow={(c) => (
            <tr key={c.id} className="hover:bg-panel-surface-2">
              <td className="px-4 py-3 font-bold text-panel-text">{c.name}</td>
              <td className="px-4 py-3 text-panel-text-muted">{c.email}</td>
              <td className="px-4 py-3 text-panel-text-muted">{c.phone}</td>
              <td className="px-4 py-3 text-panel-text">{formatUSD(c.credit_limit)}</td>
              <td className="px-4 py-3 font-bold text-panel-warning">{formatUSD(c.current_balance)}</td>
              <td className="px-4 py-3"><span className="text-xs font-bold px-2 py-1 rounded bg-panel-success/10 text-panel-success">{c.is_active ? 'Activo' : 'Inactivo'}</span></td>
            </tr>
          )}
        />
      </div>
    </div>
  );
}
