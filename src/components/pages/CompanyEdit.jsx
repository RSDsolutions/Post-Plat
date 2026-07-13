import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore.js';

export default function CompanyEdit() {
  const { editCompanyId, closeEditCompany, saveEditCompany, companies } = useStore();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (editCompanyId) {
      const comp = companies.find(c => c.id === editCompanyId);
      if (comp) {
        setData({
          razonSocial: comp.razonSocial,
          nombreComercial: comp.nombreComercial,
          address: comp.address,
          llevaContabilidad: comp.llevaContabilidad,
          regimen: comp.regimen,
          environment: comp.environment
        });
      }
    }
  }, [editCompanyId, companies]);

  if (!editCompanyId || !data) return null;
  const company = companies.find(c => c.id === editCompanyId);

  const handleSave = () => {
    saveEditCompany(editCompanyId, data);
  };

  const setField = (k, v) => setData(prev => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-0)]/80 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 min-h-screen py-10">
        <div className="bg-[var(--surface-1)] rounded-3xl shadow-2xl shadow-black/50 border border-[var(--border-subtle)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex justify-between items-center bg-[var(--surface-0)]/50">
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Editar Empresa: {company.nombreComercial}</h2>
            <button onClick={closeEditCompany} className="text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-white px-3 py-1 rounded-lg transition-colors">Cancelar</button>
          </div>

          <div className="p-6 space-y-8 text-zinc-300">
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2">Datos fiscales</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">RUC</label>
                  <input type="text" value={company.ruc} disabled className="w-full border border-[var(--border-subtle)] bg-[var(--surface-1)]/50 rounded-2xl px-4 py-2 text-sm text-[var(--text-muted)]" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mt-2">El RUC no puede modificarse. Contacte a soporte si hay un error.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Régimen</label>
                  <select value={data.regimen} onChange={e => setField('regimen', e.target.value)} className="w-full border border-[var(--border-subtle)] bg-[var(--surface-0)] text-[var(--text-primary)] rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]">
                    <option value="General">General</option>
                    <option value="RIMPE emprendedor">RIMPE emprendedor</option>
                    <option value="RIMPE negocio popular">RIMPE negocio popular</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Razón social</label>
                  <input type="text" value={data.razonSocial} onChange={e => setField('razonSocial', e.target.value)} className="w-full border border-[var(--border-subtle)] bg-[var(--surface-0)] text-[var(--text-primary)] rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Nombre comercial</label>
                  <input type="text" value={data.nombreComercial} onChange={e => setField('nombreComercial', e.target.value)} className="w-full border border-[var(--border-subtle)] bg-[var(--surface-0)] text-[var(--text-primary)] rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Dirección matriz</label>
                  <input type="text" value={data.address} onChange={e => setField('address', e.target.value)} className="w-full border border-[var(--border-subtle)] bg-[var(--surface-0)] text-[var(--text-primary)] rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" />
                </div>
                <div className="md:col-span-2 flex items-center space-x-3 mt-2">
                  <input type="checkbox" id="contabilidad-edit" checked={data.llevaContabilidad} onChange={e => setField('llevaContabilidad', e.target.checked)} className="h-4 w-4 text-[var(--brand)] focus:ring-[var(--brand)] border-[var(--border-subtle)] bg-[var(--surface-0)] rounded" />
                  <label htmlFor="contabilidad-edit" className="text-sm font-bold text-zinc-300">Obligado a llevar contabilidad</label>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2">Ambiente SRI</h3>
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2 bg-[var(--surface-0)]/50 p-3 rounded-2xl border border-[var(--border-subtle)] cursor-pointer flex-1">
                  <input type="radio" name="env-edit" value="Pruebas" checked={data.environment === 'Pruebas'} onChange={() => setField('environment', 'Pruebas')} className="text-[var(--brand)]" />
                  <span className="text-sm font-bold text-[var(--text-primary)]">Pruebas</span>
                </label>
                <label className="flex items-center space-x-2 bg-[var(--surface-0)]/50 p-3 rounded-2xl border border-[var(--border-subtle)] cursor-pointer flex-1">
                  <input type="radio" name="env-edit" value="Produccion" checked={data.environment === 'Produccion'} onChange={() => setField('environment', 'Produccion')} className="text-[var(--brand)]" />
                  <span className="text-sm font-bold text-[var(--text-primary)]">Producción</span>
                </label>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
                <p className="text-xs font-medium text-blue-300">
                  Sucursales, puntos de venta, secuenciales y el certificado de firma electrónica los administra el propio cliente desde su panel ("Sucursales" y "Facturación SRI"). Aquí solo se gestionan datos de identidad fiscal y la suscripción.
                </p>
              </div>
            </section>
          </div>

          <div className="px-6 py-4 bg-[var(--surface-0)]/50 border-t border-[var(--border-subtle)] flex justify-end space-x-3">
            <button onClick={closeEditCompany} className="text-[var(--text-muted)] hover:text-white font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors border border-[var(--border-subtle)]">Cancelar</button>
            <button onClick={handleSave} className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-zinc-950 font-bold px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors shadow-sm">Guardar cambios</button>
          </div>
        </div>
      </div>
    </div>
  );
}
