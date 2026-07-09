import React from 'react';

export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-[var(--surface-1)] rounded-3xl border border-dashed border-[var(--border-subtle)]">
      <div className="p-3 bg-[var(--surface-2)] rounded-xl text-[var(--text-muted)] mb-4">
        <Icon size={24} />
      </div>
      <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">{title}</h3>
      {description && <p className="text-xs font-medium text-[var(--text-muted)] max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
