import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore.js';
import { formatDate } from '../../lib/dates.js';

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
          environment: comp.environment,
          establishment: comp.establishment,
          pointOfSale: comp.pointOfSale,
          sequentialStart: comp.sequentialStart,
          certFilename: comp.cert?.filename || null,
          certExpiresAt: comp.cert ? new Date(comp.cert.expiresAt).toISOString().split('T')[0] : null
        });
      }
    }
  }, [editCompanyId, companies]);

  if (!editCompanyId || !data) return null;
  const company = companies.find(c => c.id === editCompanyId);

  const handleSave = () => {
    saveEditCompany(editCompanyId, {
      ...data,
      cert: data.certFilename ? { filename: data.certFilename, expiresAt: new Date(data.certExpiresAt) } : null
    });
  };

  const setField = (k, v) => setData(prev => ({ ...prev, [k]: v }));

  const handleFileSimulate = () => {
    setField('certFilename', 'certificado-actualizado.p12');
    setField('certExpiresAt', '2026-07-10');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 min-h-screen py-10">
        <div className="bg-zinc-900 rounded-3xl shadow-2xl shadow-black/50 border border-zinc-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
            <h2 className="text-xl font-bold tracking-tight text-zinc-100">Editar Empresa: {company.nombreComercial}</h2>
            <button onClick={closeEditCompany} className="text-zinc-500 hover:bg-zinc-800 hover:text-white px-3 py-1 rounded-lg transition-colors">Cancelar</button>
          </div>

          <div className="p-6 space-y-8 text-zinc-300">
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-zinc-100 border-b border-zinc-800 pb-2">Datos fiscales</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">RUC</label>
                  <input type="text" value={company.ruc} disabled className="w-full border border-zinc-800 bg-zinc-900/50 rounded-2xl px-4 py-2 text-sm text-zinc-500" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mt-2">El RUC no puede modificarse. Contacte a soporte si hay un error.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Régimen</label>
                  <select value={data.regimen} onChange={e => setField('regimen', e.target.value)} className="w-full border border-zinc-800 bg-zinc-950 text-zinc-100 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]">
                    <option value="General">General</option>
                    <option value="RIMPE emprendedor">RIMPE emprendedor</option>
                    <option value="RIMPE negocio popular">RIMPE negocio popular</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Razón social</label>
                  <input type="text" value={data.razonSocial} onChange={e => setField('razonSocial', e.target.value)} className="w-full border border-zinc-800 bg-zinc-950 text-zinc-100 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Nombre comercial</label>
                  <input type="text" value={data.nombreComercial} onChange={e => setField('nombreComercial', e.target.value)} className="w-full border border-zinc-800 bg-zinc-950 text-zinc-100 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Dirección matriz</label>
                  <input type="text" value={data.address} onChange={e => setField('address', e.target.value)} className="w-full border border-zinc-800 bg-zinc-950 text-zinc-100 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" />
                </div>
                <div className="md:col-span-2 flex items-center space-x-3 mt-2">
                  <input type="checkbox" id="contabilidad-edit" checked={data.llevaContabilidad} onChange={e => setField('llevaContabilidad', e.target.checked)} className="h-4 w-4 text-[var(--brand)] focus:ring-[var(--brand)] border-zinc-800 bg-zinc-950 rounded" />
                  <label htmlFor="contabilidad-edit" className="text-sm font-bold text-zinc-300">Obligado a llevar contabilidad</label>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-bold text-zinc-100 border-b border-zinc-800 pb-2">Configuración de emisión</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Ambiente SRI</label>
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-2 bg-zinc-950/50 p-3 rounded-2xl border border-zinc-800 cursor-pointer flex-1">
                      <input type="radio" name="env-edit" value="Pruebas" checked={data.environment === 'Pruebas'} onChange={() => setField('environment', 'Pruebas')} className="text-[var(--brand)]" />
                      <span className="text-sm font-bold text-zinc-100">Pruebas</span>
                    </label>
                    <label className="flex items-center space-x-2 bg-zinc-950/50 p-3 rounded-2xl border border-zinc-800 cursor-pointer flex-1">
                      <input type="radio" name="env-edit" value="Produccion" checked={data.environment === 'Produccion'} onChange={() => setField('environment', 'Produccion')} className="text-[var(--brand)]" />
                      <span className="text-sm font-bold text-zinc-100">Producción</span>
                    </label>
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Establecimiento</label>
                  <input type="text" value={data.establishment} onChange={e => setField('establishment', e.target.value)} className="w-full border border-zinc-800 bg-zinc-950 text-zinc-100 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" maxLength={3} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Punto de emisión</label>
                  <input type="text" value={data.pointOfSale} onChange={e => setField('pointOfSale', e.target.value)} className="w-full border border-zinc-800 bg-zinc-950 text-zinc-100 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" maxLength={3} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Secuencial inicial</label>
                  <input type="number" value={data.sequentialStart} onChange={e => setField('sequentialStart', parseInt(e.target.value))} className="w-full border border-zinc-800 bg-zinc-950 text-zinc-100 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" min={1} />
                </div>

                <div className="md:col-span-2 border border-zinc-800 rounded-3xl p-5 mt-2">
                  <label className="block text-sm font-bold text-zinc-100 mb-3">Certificado de firma (.p12 / .pfx)</label>
                  {!data.certFilename ? (
                    <div className="border-2 border-dashed border-zinc-800 bg-zinc-950/50 rounded-2xl p-6 text-center">
                      <p className="text-sm font-medium text-zinc-500 mb-4">Ningún archivo seleccionado</p>
                      <button onClick={handleFileSimulate} className="border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors">
                        Subir certificado nuevo
                      </button>
                    </div>
                  ) : (
                    <div className="bg-zinc-950/50 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-zinc-100">{data.certFilename}</p>
                        <div className="mt-2">
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Fecha de vencimiento *</label>
                          <input type="date" value={data.certExpiresAt} onChange={e => setField('certExpiresAt', e.target.value)} className="border border-zinc-800 bg-zinc-950 text-zinc-100 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" />
                        </div>
                      </div>
                      <div className="flex flex-col space-y-2 items-end">
                         <button onClick={handleFileSimulate} className="text-[10px] font-bold uppercase tracking-widest text-[var(--brand)] hover:text-white transition-colors">Actualizar certificado .p12</button>
                         <button onClick={() => {setField('certFilename', null); setField('certExpiresAt', null);}} className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-400 transition-colors">Eliminar</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          <div className="px-6 py-4 bg-zinc-950/50 border-t border-zinc-800 flex justify-end space-x-3">
            <button onClick={closeEditCompany} className="text-zinc-500 hover:text-white font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors border border-zinc-800">Cancelar</button>
            <button onClick={handleSave} className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-zinc-950 font-bold px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors shadow-sm">Guardar cambios</button>
          </div>
        </div>
      </div>
    </div>
  );
}
