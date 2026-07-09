import React from 'react';

export default function Table({ columns, data, renderRow }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-[var(--surface-0)]/50 text-[var(--text-muted)] uppercase text-[10px] tracking-widest border-b border-[var(--border-subtle)] font-bold">
          <tr>
            {columns.map((col, i) => (
              <th key={i} className="px-4 py-3 font-medium">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {data.map((item, i) => renderRow(item, i))}
        </tbody>
      </table>
    </div>
  );
}
