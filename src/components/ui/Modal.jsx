import React from 'react';
import { X } from 'lucide-react';

export default function Modal({ title, children, onClose, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative bg-[var(--surface-1)] rounded-3xl shadow-2xl shadow-black/50 border border-[var(--border-subtle)] w-full max-w-2xl my-auto flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] shrink-0">
          <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">{title}</h2>
          {onClose && (
            <button onClick={onClose} className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] rounded-full transition-colors">
              <X size={20} />
            </button>
          )}
        </div>
        <div className="p-6 overflow-y-auto flex-1 text-[var(--text-muted)]">
          {children}
        </div>
        {footer && (
          <div className="px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--surface-0)]/50 rounded-b-3xl flex justify-end gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
