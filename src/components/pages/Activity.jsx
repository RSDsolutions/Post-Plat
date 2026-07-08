import React from 'react';
import { Activity as ActivityIcon, AlertTriangle, Info, CheckCircle, X } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import EmptyState from '../ui/EmptyState.jsx';
import { formatDateRelative } from '../../lib/dates.js';

export default function Activity() {
  const { activityLog, alerts, attendAlert, selectCompany } = useStore();

  const openAlerts = alerts.filter(a => !a.attended).sort((a, b) => a.severity === 'danger' ? -1 : 1);
  const attendedAlerts = alerts.filter(a => a.attended);

  return (
    <div className="max-w-7xl mx-auto space-y-6 text-zinc-300">
      <h1 className="text-2xl font-bold text-zinc-100">Actividad y alertas</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-4">
              <h2 className="text-lg font-bold text-zinc-100">Alertas abiertas</h2>
              <span className="bg-red-500/10 text-red-500 border border-red-500/20 py-1 px-3 rounded-full text-xs font-bold tracking-wider">{openAlerts.length}</span>
            </div>
            
            <div className="space-y-4">
              {openAlerts.length > 0 ? openAlerts.map(alert => (
                <div key={alert.id} className={`bg-zinc-950/50 p-4 rounded-2xl border-l-4 flex justify-between items-start transition-all hover:bg-zinc-950/80 ${alert.severity === 'danger' ? 'border-red-500 border border-zinc-800' : 'border-amber-500 border border-zinc-800'}`}>
                  <div className="flex space-x-3">
                    <div className="mt-1">
                      {alert.severity === 'danger' ? <AlertTriangle size={20} className="text-red-500" /> : <Info size={20} className="text-amber-500" />}
                    </div>
                    <div>
                      <button onClick={() => selectCompany(alert.companyId)} className="text-sm font-bold text-zinc-100 hover:text-[var(--brand)] transition-colors">{alert.companyName}</button>
                      <p className="text-sm text-zinc-400 mt-0.5">{alert.message}</p>
                    </div>
                  </div>
                  <button onClick={() => attendAlert(alert.id)} className="text-zinc-600 hover:text-white p-1 rounded-xl hover:bg-zinc-800 transition-colors border border-transparent hover:border-zinc-700" title="Marcar como atendida">
                    <X size={18} />
                  </button>
                </div>
              )) : (
                <EmptyState icon={CheckCircle} title="Sin alertas activas" description="Todo está en orden en las cuentas de tus clientes." />
              )}
            </div>

            {attendedAlerts.length > 0 && (
              <div className="mt-8 pt-6 border-t border-zinc-800 space-y-4">
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Alertas atendidas (recientes)</h3>
                {attendedAlerts.slice(0, 5).map(alert => (
                  <div key={alert.id} className="bg-zinc-950/30 p-3 rounded-2xl border border-zinc-800/50 flex items-start space-x-3 opacity-60 hover:opacity-100 transition-opacity">
                    <CheckCircle size={16} className="text-emerald-500 mt-0.5" />
                    <div>
                      <span className="text-sm font-bold text-zinc-300">{alert.companyName}</span>
                      <p className="text-xs text-zinc-500 font-medium">{alert.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 flex flex-col h-[600px] lg:h-auto lg:min-h-[600px]">
             <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-4">
              <h2 className="text-lg font-bold text-zinc-100">Registro de actividad</h2>
             </div>
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {activityLog.length > 0 ? (
                <div className="relative border-l border-zinc-800 ml-3 space-y-6 pb-4">
                  {activityLog.map((event) => (
                    <div key={event.id} className="relative pl-6">
                      <div className="absolute -left-[7px] top-1.5 w-3.5 h-3.5 bg-zinc-900 rounded-full border-2 border-[var(--brand)]"></div>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--brand)]">{event.action}</span>
                        <span className="text-xs font-medium text-zinc-500">{formatDateRelative(event.date)}</span>
                      </div>
                      <div className="text-sm font-bold text-zinc-100 mb-1">{event.company}</div>
                      <div className="text-sm font-medium text-zinc-400 mb-1.5">{event.detail}</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Por: <span className="text-zinc-400">{event.user}</span></div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={ActivityIcon} title="Sin actividad reciente" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
