import React from 'react';

export default function Table({ columns, data, renderRow }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-zinc-950/50 text-zinc-500 uppercase text-[10px] tracking-widest border-b border-zinc-800 font-bold">
          <tr>
            {columns.map((col, i) => (
              <th key={i} className="px-4 py-3 font-medium">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {data.map((item, i) => renderRow(item, i))}
        </tbody>
      </table>
    </div>
  );
}
