import React from 'react';
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import { useStore } from '../../store/useStore.js';

export default function Toast() {
  const { toasts, dismissToast } = useStore();

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2 pointer-events-none">
      {toasts.map((toast) => {
        let Icon = Info;
        let bg = 'bg-blue-50';
        let border = 'border-blue-200';
        let text = 'text-blue-800';
        let iconColor = 'text-blue-500';

        if (toast.type === 'success') {
          Icon = CheckCircle;
          bg = 'bg-green-50';
          border = 'border-green-200';
          text = 'text-green-800';
          iconColor = 'text-green-500';
        } else if (toast.type === 'warning') {
          Icon = AlertTriangle;
          bg = 'bg-amber-50';
          border = 'border-amber-200';
          text = 'text-amber-800';
          iconColor = 'text-amber-500';
        } else if (toast.type === 'error') {
          Icon = XCircle;
          bg = 'bg-red-50';
          border = 'border-red-200';
          text = 'text-red-800';
          iconColor = 'text-red-500';
        }

        return (
          <div 
            key={toast.id}
            className={`pointer-events-auto flex w-full max-w-sm overflow-hidden bg-white rounded-lg shadow-lg border p-4 transition-transform duration-300 transform translate-y-0 opacity-100`}
          >
            <div className="flex items-start w-full">
              <div className="flex-shrink-0">
                <Icon className={`h-5 w-5 ${iconColor}`} />
              </div>
              <div className="ml-3 w-0 flex-1 pt-0.5">
                <p className="text-sm font-medium text-gray-900">{toast.message}</p>
              </div>
              <div className="ml-4 flex-shrink-0 flex">
                <button
                  className="bg-white rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none"
                  onClick={() => dismissToast(toast.id)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
