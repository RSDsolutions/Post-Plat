import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchData } from '../../lib/supabaseHelpers.js';

export default function CashierManagement() {
  const { currentUser } = useStore();
  const [cashiers, setCashiers] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchData('users', {
          filter: { column: 'company_id', value: currentUser.company_id }
        });
        setCashiers(data?.filter(u => u.role === 'operario' || u.role === 'vendedor') || []);
      } catch (e) { console.error(e); }
    };
    if (currentUser?.company_id) load();
  }, [currentUser]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-4xl font-bold text-zinc-100">Gestión de Cajas</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cashiers.map(c => (
          <div key={c.id} className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
            <div className="font-bold text-zinc-100">{c.name}</div>
            <div className="text-sm text-zinc-500">{c.email}</div>
            <div className="text-xs text-blue-400 mt-2 font-bold uppercase">{c.role}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
