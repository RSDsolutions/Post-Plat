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
      <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-zinc-100">Clientes</h1>
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
        <Table
          columns={['Nombre', 'Email', 'Teléfono', 'Crédito Límite', 'Saldo', 'Estado']}
          data={customers}
          renderRow={(c) => (
            <tr key={c.id} className="hover:bg-zinc-800/50">
              <td className="px-4 py-3 font-bold text-zinc-100">{c.name}</td>
              <td className="px-4 py-3 text-zinc-400">{c.email}</td>
              <td className="px-4 py-3 text-zinc-400">{c.phone}</td>
              <td className="px-4 py-3 text-zinc-100">{formatUSD(c.credit_limit)}</td>
              <td className="px-4 py-3 font-bold text-amber-400">{formatUSD(c.current_balance)}</td>
              <td className="px-4 py-3"><span className="text-xs font-bold px-2 py-1 rounded bg-emerald-500/10 text-emerald-400">{c.is_active ? 'Activo' : 'Inactivo'}</span></td>
            </tr>
          )}
        />
      </div>
    </div>
  );
}
