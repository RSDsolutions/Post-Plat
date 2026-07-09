import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { useStore } from '../../store/useStore.js';

export default function ConfirmDialog() {
  const { confirmDialog, closeConfirm } = useStore();
  const [reason, setReason] = useState('falta_pago');
  const [otherReason, setOtherReason] = useState('');

  if (!confirmDialog) return null;

  const isSuspend = confirmDialog.title.toLowerCase().includes('suspender');

  const handleConfirm = () => {
    if (isSuspend) {
      const finalReason = reason === 'otro' ? otherReason : (reason === 'falta_pago' ? 'Falta de pago' : 'Solicitud del cliente');
      confirmDialog.onConfirm(reason, finalReason);
    } else {
      confirmDialog.onConfirm();
    }
    closeConfirm();
  };

  const footer = (
    <>
      <button onClick={closeConfirm} className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 font-medium px-4 py-2 rounded-lg text-sm">
        Cancelar
      </button>
      <button onClick={handleConfirm} className={`${isSuspend ? 'bg-red-600 hover:bg-red-700' : 'bg-[var(--brand)] hover:bg-[var(--brand-dark)]'} text-white font-medium px-4 py-2 rounded-lg text-sm`}>
        Confirmar
      </button>
    </>
  );

  return (
    <Modal title={confirmDialog.title} onClose={closeConfirm} footer={footer}>
      <p className="text-zinc-400 mb-4 whitespace-pre-line">{confirmDialog.message}</p>

      {isSuspend && (
        <div className="space-y-3 mt-4">
          <label className="block text-sm font-medium text-zinc-300">Motivo de suspensión</label>
          <select
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent"
          >
            <option value="falta_pago">Falta de pago</option>
            <option value="solicitud_cliente">Solicitud del cliente</option>
            <option value="otro">Otro</option>
          </select>
          {reason === 'otro' && (
            <textarea
              value={otherReason}
              onChange={e => setOtherReason(e.target.value)}
              placeholder="Especifique el motivo..."
              className="w-full bg-zinc-950 border border-zinc-700 text-zinc-100 placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent mt-2"
              rows={3}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
