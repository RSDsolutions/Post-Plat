import React, { useState, useEffect } from 'react';
import { Settings, Save, AlertCircle } from 'lucide-react';
import { useStore } from '../../store/useStore.js';

export default function StoreSettings() {
  const { currentUser, showToast } = useStore();
  const [taxRate, setTaxRate] = useState(12);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const savedTaxRate = localStorage.getItem(`store_tax_${ currentUser?.company_id }`);
    if (savedTaxRate) {
      setTaxRate(parseFloat(savedTaxRate));
    }
  }, [currentUser]);

  const handleSaveTaxRate = async () => {
    setSaving(true);
    try {
      if (taxRate < 0 || taxRate > 100) {
        showToast('error', 'El IVA debe estar entre 0 y 100');
        return;
      }

      localStorage.setItem(`store_tax_${ currentUser?.company_id }`, taxRate.toString());
      showToast('success', `IVA actualizado a ${taxRate}%`);
    } catch (error) {
      console.error('Error saving tax rate:', error);
      showToast('error', 'Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <Settings className="text-blue-500" size={32} />
        <h1 className="text-4xl font-bold text-zinc-100">Configuración de Tienda</h1>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-3 mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <AlertCircle className="text-blue-500 flex-shrink-0 mt-1" size={20} />
          <div>
            <h3 className="font-bold text-blue-400">Configuración de IVA</h3>
            <p className="text-sm text-blue-300 mt-1">
              El IVA configurado aquí se aplicará a todas las ventas en esta tienda
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-zinc-300 mb-3">
            Porcentaje de IVA (%)
          </label>
          <div className="flex items-center gap-4">
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={taxRate}
              onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white text-lg font-bold"
            />
            <span className="text-xl font-bold text-zinc-400">%</span>
          </div>
          <div className="text-xs text-zinc-500 mt-2">
            Rango: 0% a 100%
          </div>
        </div>

        <div className="border-t border-zinc-800 pt-4">
          <h4 className="text-sm font-bold text-zinc-300 mb-3">Vista Previa</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-950 rounded-lg p-3">
              <div className="text-xs text-zinc-500 mb-1">Subtotal</div>
              <div className="text-lg font-bold text-zinc-100">$100.00</div>
            </div>
            <div className="bg-zinc-950 rounded-lg p-3">
              <div className="text-xs text-zinc-500 mb-1">IVA ({taxRate}%)</div>
              <div className="text-lg font-bold text-blue-400">${ (100 * taxRate / 100).toFixed(2) }</div>
            </div>
            <div className="col-span-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
              <div className="text-xs text-emerald-500 mb-1">Total</div>
              <div className="text-2xl font-bold text-emerald-400">${ (100 + 100 * taxRate / 100).toFixed(2) }</div>
            </div>
          </div>
        </div>

        <button
          onClick={handleSaveTaxRate}
          disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 mt-6"
        >
          <Save size={20} />
          {saving ? 'Guardando...' : 'Guardar Configuración'}
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-bold text-zinc-100">Información de Tienda</h2>

        <div>
          <label className="block text-sm font-bold text-zinc-300 mb-2">Nombre de Tienda</label>
          <input
            type="text"
            value={currentUser?.name || ''}
            disabled
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-400 cursor-not-allowed"
          />
          <p className="text-xs text-zinc-500 mt-1">Para cambiar el nombre, contacta al administrador</p>
        </div>

        <div>
          <label className="block text-sm font-bold text-zinc-300 mb-2">ID de Tienda</label>
          <input
            type="text"
            value={currentUser?.company_id || ''}
            disabled
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-400 cursor-not-allowed font-mono text-sm"
          />
        </div>
      </div>
    </div>
  );
}
