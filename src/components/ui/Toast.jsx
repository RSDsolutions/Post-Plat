import React from 'react';
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import { useStore } from '../../store/useStore.js';

const TOAST_STYLES = {
  info: { Icon: Info, border: 'border-blue-500/30', icon: 'text-blue-400' },
  success: { Icon: CheckCircle, border: 'border-emerald-500/30', icon: 'text-emerald-400' },
  warning: { Icon: AlertTriangle, border: 'border-amber-500/30', icon: 'text-amber-400' },
  error: { Icon: XCircle, border: 'border-red-500/30', icon: 'text-red-400' }
};

export default function Toast() {
  const { toasts, dismissToast } = useStore();

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const { Icon, border, icon } = TOAST_STYLES[toast.type] || TOAST_STYLES.info;

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 w-full bg-[var(--surface-1)] border ${border} rounded-xl shadow-lg p-4`}
          >
            <Icon className={`${icon} flex-shrink-0`} size={20} />
            <p className="flex-1 min-w-0 text-sm font-medium text-[var(--text-primary)] break-words">{toast.message}</p>
            <button
              onClick={() => dismissToast(toast.id)}
              className="flex-shrink-0 text-[var(--text-muted)] hover:text-zinc-300 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
