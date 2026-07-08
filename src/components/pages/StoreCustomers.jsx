import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchData } from '../../lib/supabaseHelpers.js';
import Table from '../ui/Table.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { formatUSD } from '../../lib/format.js';

export default function StoreCustomers() {
  const { currentUser, showToast } = useStore();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        setLoading(true);
        const data = await fetchData('customers', {
          filter: { column: 'company_id', value: currentUser.company_id }
        });
        setCustomers(data || []);
      } catch (error) {
        console.error('Error loading customers:', error);
        showToast('error', 'Error al cargar los clientes');
      } finally {
        setLoading(false);
      }
    };

    if (currentUser?.company_id) {
      loadCustomers();
    }
  }, [currentUser, showToast]);

  const totalCredit = customers.reduce((sum, c) => sum + (c.credit_limit || 0), 0);
  const totalUsed = customers.reduce((sum, c) => sum + (c.current_balance || 0), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-4xl font-bold tracking-tighter uppercase text-zinc-100">Clientes</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6">
          <div className="text-sm text-zinc-500 mb-2">Total de clientes</div>
          <div className="text-3xl font-bold text-zinc-100">{customers.length}</div>
        </div>
        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6">
          <div className="text-sm text-zinc-500 mb-2">Crédito total disponible</div>
          <div className="text-3xl font-bold text-emerald-400">{formatUSD(totalCredit)}</div>
        </div>
        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6">
          <div className="text-sm text-zinc-500 mb-2">Crédito usado</div>
          <div className="text-3xl font-bold text-amber-400">{formatUSD(totalUsed)}</div>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden">
        {!loading && customers.length > 0 ? (
          <Table
            columns={['Nombre', 'Identificación', 'Teléfono', 'Email', 'Crédito', 'Usado', 'Estado']}
            data={customers}
            renderRow={(customer) => {
              const creditUsagePercent = customer.credit_limit ?
                (customer.current_balance / customer.credit_limit) * 100 : 0;
              const creditColor = creditUsagePercent > 80 ? 'text-red-400' :
                                 creditUsagePercent > 50 ? 'text-amber-400' : 'text-emerald-400';
              return (
                <tr key={customer.id} className="hover:bg-zinc-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-bold text-zinc-100">{customer.name}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-zinc-400">
                    {customer.identification_number}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-400">{customer.phone}</td>
                  <td className="px-4 py-3 text-sm text-zinc-400">{customer.email}</td>
                  <td className="px-4 py-3 font-bold text-zinc-100">
                    {formatUSD(customer.credit_limit)}
                  </td>
                  <td className={`px-4 py-3 font-bold ${creditColor}`}>
                    {formatUSD(customer.current_balance)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      customer.is_active
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-zinc-800/50 text-zinc-500'
                    }`}>
                      {customer.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                </tr>
              );
            }}
          />
        ) : loading ? (
          <div className="p-8 text-center text-zinc-500">
            <div className="animate-spin inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mb-4" />
            <p>Cargando clientes...</p>
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="Sin clientes"
            description="Tu empresa aún no tiene clientes registrados."
          />
        )}
      </div>
    </div>
  );
}
