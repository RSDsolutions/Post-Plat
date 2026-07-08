import React from 'react';
import { useStore } from '../../store/useStore.js';

export default function StoreSettings() {
  const { currentUser } = useStore();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-4xl font-bold text-zinc-100">Configuración</h1>
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 space-y-4">
        <div>
          <label className="block text-sm font-bold text-zinc-300 mb-2">Información Actual</label>
          <div className="bg-zinc-950 p-4 rounded-lg space-y-2">
            <div className="flex justify-between"><span className="text-zinc-500">Nombre:</span><span className="text-zinc-100">{currentUser?.name}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Email:</span><span className="text-zinc-100">{currentUser?.email}</span></div>
          </div>
        </div>
        <div><h3 className="font-bold text-zinc-100 mb-3">Configuración</h3>
          <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg">Cambiar Contraseña</button>
        </div>
      </div>
    </div>
  );
}
