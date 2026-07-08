import React from 'react';

export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-zinc-900 rounded-3xl border border-dashed border-zinc-800">
      <div className="p-3 bg-zinc-800 rounded-xl text-zinc-500 mb-4">
        <Icon size={24} />
      </div>
      <h3 className="text-sm font-bold text-zinc-100 mb-1">{title}</h3>
      {description && <p className="text-xs font-medium text-zinc-500 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
