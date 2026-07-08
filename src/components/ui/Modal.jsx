import React from 'react';
import { X } from 'lucide-react';

export default function Modal({ title, children, onClose, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative bg-zinc-900 rounded-3xl shadow-2xl shadow-black/50 border border-zinc-800 w-full max-w-2xl my-auto flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-xl font-bold tracking-tight text-zinc-100">{title}</h2>
          {onClose && (
            <button onClick={onClose} className="p-2 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 rounded-full transition-colors">
              <X size={20} />
            </button>
          )}
        </div>
        <div className="p-6 overflow-y-auto flex-1 text-zinc-300">
          {children}
        </div>
        {footer && (
          <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-950/50 rounded-b-3xl flex justify-end gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
