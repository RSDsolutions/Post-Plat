import React, { useState } from 'react';
import { useStore } from '../../store/useStore.js';
import Modal from '../ui/Modal.jsx';
import { validateRUC } from '../../lib/ruc.js';
import { DEMO_DATE, formatDate } from '../../lib/dates.js';

export default function CompanyWizard() {
  const { wizardStep, setWizardStep, wizardData, setWizardData, submitWizard, closeWizard, plans } = useStore();
  const [errors, setErrors] = useState({});

  const handleNext = () => {
    if (wizardStep === 1) {
      if (!wizardData.ruc) { setErrors({ ruc: 'El RUC es requerido' }); return; }
      const val = validateRUC(wizardData.ruc);
      if (!val.valid) { setErrors({ ruc: val.error }); return; }
      if (!wizardData.razonSocial) { setErrors({ razonSocial: 'La razón social es requerida' }); return; }
      if (!wizardData.nombreComercial) { setErrors({ nombreComercial: 'El nombre comercial es requerido' }); return; }
      if (!wizardData.address) { setErrors({ address: 'La dirección es requerida' }); return; }
    }
    if (wizardStep === 2) {
      if (!wizardData.establishment) { setErrors({ establishment: 'Requerido' }); return; }
      if (!wizardData.pointOfSale) { setErrors({ pointOfSale: 'Requerido' }); return; }
    }
    
    setErrors({});
    if (wizardStep < 3) {
      setWizardStep(wizardStep + 1);
    } else {
      if (!wizardData.planId) { setErrors({ planId: 'Debe seleccionar un plan' }); return; }
      if (!wizardData.adminEmail) { setErrors({ adminEmail: 'Correo requerido' }); return; }
      submitWizard();
    }
  };

  const setField = (k, v) => setWizardData({ [k]: v });

  const footer = (
    <div className="flex justify-between w-full">
      {wizardStep > 1 ? (
        <button onClick={() => setWizardStep(wizardStep - 1)} className="text-zinc-500 hover:text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors border border-zinc-800">
          Atrás
        </button>
      ) : <div />}
      <button onClick={handleNext} className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-zinc-950 font-bold px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors ml-auto">
        {wizardStep === 3 ? 'Crear empresa' : 'Siguiente'}
      </button>
    </div>
  );

  return (
    <Modal title={`Nueva Empresa — Paso ${wizardStep} de 3`} onClose={closeWizard} footer={footer}>
      <div className="mb-6 flex space-x-2">
        {[1, 2, 3].map(i => (
          <div key={i} className={`flex-1 h-2 rounded-full ${wizardStep >= i ? 'bg-[var(--brand)]' : 'bg-zinc-800'}`} />
        ))}
      </div>

      {wizardStep === 1 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-zinc-100 border-b border-zinc-800 pb-2">Datos fiscales</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">RUC *</label>
              <input type="text" value={wizardData.ruc || ''} onChange={e => setField('ruc', e.target.value)}
                className={`w-full border ${errors.ruc ? 'border-red-500' : 'border-zinc-800'} bg-zinc-950 text-zinc-100 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] placeholder-zinc-600`} 
                placeholder="13 dígitos terminados en 001" maxLength={13} />
              {errors.ruc && <p className="text-red-500 text-xs mt-1">{errors.ruc}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Régimen</label>
              <select value={wizardData.regimen || 'General'} onChange={e => setField('regimen', e.target.value)}
                className="w-full border border-zinc-800 bg-zinc-950 text-zinc-100 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]">
                <option value="General">General</option>
                <option value="RIMPE emprendedor">RIMPE emprendedor</option>
                <option value="RIMPE negocio popular">RIMPE negocio popular</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Razón social *</label>
              <input type="text" value={wizardData.razonSocial || ''} onChange={e => setField('razonSocial', e.target.value)}
                className={`w-full border ${errors.razonSocial ? 'border-red-500' : 'border-zinc-800'} bg-zinc-950 text-zinc-100 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]`} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Nombre comercial *</label>
              <input type="text" value={wizardData.nombreComercial || ''} onChange={e => setField('nombreComercial', e.target.value)}
                className={`w-full border ${errors.nombreComercial ? 'border-red-500' : 'border-zinc-800'} bg-zinc-950 text-zinc-100 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]`} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Dirección matriz *</label>
              <input type="text" value={wizardData.address || ''} onChange={e => setField('address', e.target.value)}
                className={`w-full border ${errors.address ? 'border-red-500' : 'border-zinc-800'} bg-zinc-950 text-zinc-100 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]`} />
            </div>
            <div className="md:col-span-2 flex items-center space-x-3 mt-2">
              <input type="checkbox" id="contabilidad" checked={wizardData.llevaContabilidad || false} onChange={e => setField('llevaContabilidad', e.target.checked)}
                className="h-4 w-4 text-[var(--brand)] focus:ring-[var(--brand)] border-zinc-800 bg-zinc-950 rounded" />
              <label htmlFor="contabilidad" className="text-sm font-bold text-zinc-300">Obligado a llevar contabilidad</label>
            </div>
          </div>
        </div>
      )}

      {wizardStep === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-zinc-100 border-b border-zinc-800 pb-2">Configuración de emisión</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Ambiente SRI</label>
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2 bg-zinc-950/50 p-3 rounded-2xl border border-zinc-800 cursor-pointer flex-1">
                  <input type="radio" name="env" value="Pruebas" checked={!wizardData.environment || wizardData.environment === 'Pruebas'} onChange={() => setField('environment', 'Pruebas')} className="text-[var(--brand)]" />
                  <span className="text-sm font-bold text-zinc-100">Pruebas</span>
                </label>
                <label className="flex items-center space-x-2 bg-zinc-950/50 p-3 rounded-2xl border border-zinc-800 cursor-pointer flex-1">
                  <input type="radio" name="env" value="Produccion" checked={wizardData.environment === 'Produccion'} onChange={() => setField('environment', 'Produccion')} className="text-[var(--brand)]" />
                  <span className="text-sm font-bold text-zinc-100">Producción</span>
                </label>
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Establecimiento</label>
              <input type="text" value={wizardData.establishment || '001'} onChange={e => setField('establishment', e.target.value)}
                className="w-full border border-zinc-800 bg-zinc-950 text-zinc-100 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" maxLength={3} />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Punto de emisión</label>
              <input type="text" value={wizardData.pointOfSale || '001'} onChange={e => setField('pointOfSale', e.target.value)}
                className="w-full border border-zinc-800 bg-zinc-950 text-zinc-100 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" maxLength={3} />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Secuencial inicial</label>
              <input type="number" value={wizardData.sequentialStart || 1} onChange={e => setField('sequentialStart', parseInt(e.target.value))}
                className="w-full border border-zinc-800 bg-zinc-950 text-zinc-100 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" min={1} />
            </div>

            <div className="md:col-span-2 bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
              <p className="text-xs font-medium text-blue-300">
                Esto crea la sucursal y el punto de venta iniciales del cliente. El certificado de firma electrónica lo carga el propio cliente desde su panel ("Facturación SRI") - no se sube aquí.
              </p>
            </div>
          </div>
        </div>
      )}

      {wizardStep === 3 && (
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-zinc-100 border-b border-zinc-800 pb-2">Plan y acceso</h3>
          
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">Seleccionar Plan *</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {plans.map(p => (
                <div 
                  key={p.id}
                  onClick={() => setField('planId', p.id)}
                  className={`border rounded-3xl p-5 cursor-pointer transition-all ${wizardData.planId === p.id ? 'border-[var(--brand)] bg-[var(--brand)]/10 ring-1 ring-[var(--brand)]' : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'}`}
                >
                  <h4 className="font-bold text-zinc-100">{p.name}</h4>
                  <div className="text-2xl font-bold text-zinc-100 my-2">${p.price}</div>
                  <ul className="text-xs font-medium text-zinc-500 space-y-1">
                    <li>• {p.comprobantesLimit} comp/mes</li>
                    <li>• {p.usersLimit} usuarios</li>
                  </ul>
                </div>
              ))}
            </div>
            {errors.planId && <p className="text-red-500 text-xs mt-1">{errors.planId}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Ciclo de facturación</label>
              <select value={wizardData.billingCycle || 'mensual'} onChange={e => setField('billingCycle', e.target.value)}
                className="w-full border border-zinc-800 bg-zinc-950 text-zinc-100 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]">
                <option value="mensual">Mensual</option>
                <option value="anual">Anual (10% descuento)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Fecha de inicio</label>
              <input type="text" value={formatDate(DEMO_DATE)} disabled
                className="w-full border border-zinc-800 bg-zinc-900/50 rounded-2xl px-4 py-2 text-sm text-zinc-500" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Correo del administrador *</label>
              <input type="email" value={wizardData.adminEmail || ''} onChange={e => setField('adminEmail', e.target.value)}
                className={`w-full border ${errors.adminEmail ? 'border-red-500' : 'border-zinc-800'} bg-zinc-950 text-zinc-100 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] placeholder-zinc-600`} 
                placeholder="admin@empresa.com" />
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-2">Se enviarán las credenciales de acceso a este correo (simulado en la demo)</p>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
