import React, { useState, useEffect } from 'react';
import { Palette, Check } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { getBrandInitials, applyBrandColors } from '../../lib/brand.js';

export default function BrandConfig() {
  const { brand, setBrand, showToast } = useStore();
  
  const [localName, setLocalName] = useState(brand.name);
  const [localColor, setLocalColor] = useState(brand.color);

  useEffect(() => {
    setLocalName(brand.name);
    setLocalColor(brand.color);
  }, [brand]);

  const colors = [
    { hex: '#2563eb', label: 'Azul' },
    { hex: '#16a34a', label: 'Verde' },
    { hex: '#7c3aed', label: 'Morado' },
    { hex: '#dc2626', label: 'Rojo' },
    { hex: '#ea580c', label: 'Naranja' },
    { hex: '#0891b2', label: 'Cyan' },
    { hex: '#475569', label: 'Gris Oscuro' }
  ];

  const handleSave = () => {
    setBrand(localName, localColor);
    applyBrandColors(localColor);
    showToast('success', 'Marca actualizada. El panel se ha rebrandado.');
  };

  const initials = getBrandInitials(localName || 'Partner');

  return (
    <div className="max-w-3xl mx-auto space-y-6 text-zinc-300">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Mi marca</h1>

      <div className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border-subtle)] shadow-xl overflow-hidden">
        <div className="p-8 space-y-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-6 sm:space-y-0 sm:space-x-8">
            <div className="shrink-0">
              <div 
                className="w-28 h-28 rounded-3xl text-zinc-950 flex items-center justify-center font-black text-4xl shadow-lg shadow-black/20 transition-all duration-300 border border-white/10"
                style={{ backgroundColor: localColor }}
              >
                {initials}
              </div>
            </div>
            <div className="flex-1 space-y-3 w-full">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">Nombre comercial del partner</label>
                <input 
                  type="text" 
                  value={localName} 
                  onChange={e => setLocalName(e.target.value)}
                  className="w-full max-w-md bg-[var(--surface-0)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-300"
                  style={{ '--tw-ring-color': localColor }}
                />
              </div>
              <p className="text-xs font-medium text-[var(--text-muted)]">Este nombre aparecerá en la barra superior y en las comunicaciones con tus clientes.</p>
            </div>
          </div>

          <div className="border-t border-[var(--border-subtle)] pt-8">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-4 flex items-center">
              <Palette size={16} className="mr-2" /> Color principal
            </label>
            <div className="flex flex-wrap gap-4">
              {colors.map(color => (
                <button
                  key={color.hex}
                  onClick={() => setLocalColor(color.hex)}
                  className={`relative w-14 h-14 rounded-2xl flex items-center justify-center transition-all hover:scale-110 ${localColor === color.hex ? 'ring-2 ring-offset-4 ring-offset-zinc-900 scale-110 shadow-lg border border-white/20' : 'border border-[var(--border-subtle)]/50 shadow-sm hover:border-white/20'}`}
                  style={{ backgroundColor: color.hex, '--tw-ring-color': color.hex }}
                  title={color.label}
                >
                  {localColor === color.hex && <Check size={24} className="text-zinc-950" strokeWidth={3} />}
                </button>
              ))}
            </div>
            <div className="mt-8 bg-[var(--brand)]/5 p-5 rounded-3xl border border-[var(--brand)]/20">
              <p className="text-sm text-zinc-300 font-medium leading-relaxed">Al guardar, todo el panel (botones, enlaces, alertas activas y fondos de marca) adoptará este color instantáneamente, demostrando el motor de marca blanca.</p>
            </div>
          </div>
        </div>

        <div className="px-8 py-5 bg-[var(--surface-0)]/50 border-t border-[var(--border-subtle)] flex justify-end">
          <button 
            onClick={handleSave}
            className="text-zinc-950 font-bold px-8 py-3 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 shadow-lg shadow-black/20"
            style={{ backgroundColor: localColor }}
            onMouseEnter={e => e.target.style.filter = 'brightness(1.1)'}
            onMouseLeave={e => e.target.style.filter = 'none'}
          >
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
