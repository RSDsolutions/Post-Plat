import React from 'react';

export default function Badge({ status }) {
  const colors = {
    'Activa': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    'Al día': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    'Pagado': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    'Por vencer': 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    'Pendiente': 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    'Vencida': 'bg-red-500/10 text-red-400 border border-red-500/20',
    'Vencido': 'bg-red-500/10 text-red-400 border border-red-500/20',
    'Suspendida': 'bg-zinc-800 text-zinc-400 border border-zinc-700',
    'Pruebas': 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
    'Produccion': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
  };
  const className = colors[status] || 'bg-zinc-800 text-zinc-400 border border-zinc-700';
  
  return (
    <span className={`inline-flex items-center rounded-full text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider ${className} whitespace-nowrap`}>
      {status}
    </span>
  );
}
