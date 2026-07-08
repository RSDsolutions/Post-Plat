import React from 'react';

export default function MetricCard({ icon: Icon, label, value, color }) {
  const colorStyles = {
    brand: 'bg-[var(--brand)]/20 text-[var(--brand)]',
    green: 'bg-emerald-500/20 text-emerald-400',
    amber: 'bg-amber-500/20 text-amber-400',
    red: 'bg-red-500/20 text-red-400'
  };
  const iconClass = colorStyles[color] || 'bg-zinc-800 text-zinc-400';

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col justify-between h-full">
      <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-2">{label}</div>
      <div className="flex items-end justify-between">
        <div className="text-3xl font-bold text-zinc-100">{value}</div>
        <div className={`p-2 rounded-xl flex items-center justify-center ${iconClass}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}
