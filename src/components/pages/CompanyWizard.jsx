import React, { useState } from 'react';
import { useStore } from '../../store/useStore.js';
import Modal from '../ui/Modal.jsx';
import { validateRUC } from '../../lib/ruc.js';
import { DEMO_DATE, formatDate } from '../../lib/dates.js';

export default function CompanyWizard() {
  const { wizardStep, setWizardStep, wizardData, setWizardData, submitWizard, closeWizard, plans } = useStore();
  const [errors, setErrors] = useState({});
  const [cajeroDraft, setCajeroDraft] = useState({ name: '', email: '', role: 'vendedor' });
  const cajeros = wizardData.cajeros || [];

  const addCajero = () => {
    const name = cajeroDraft.name.trim();
    const email = cajeroDraft.email.trim();
    if (!name || !email) { setErrors({ cajero: 'Nombre y correo son requeridos' }); return; }
    const emailLower = email.toLowerCase();
    if (emailLower === (wizardData.adminEmail || '').toLowerCase() || cajeros.some(c => c.email.toLowerCase() === emailLower)) {
      setErrors({ cajero: 'Ese correo ya está en uso en esta empresa' });
      return;
    }
    setWizardData({ cajeros: [...cajeros, { name, email, role: cajeroDraft.role }] });
    setCajeroDraft({ name: '', email: '', role: 'vendedor' });
    setErrors({});
  };

  const removeCajero = (idx) => setWizardData({ cajeros: cajeros.filter((_, i) => i !== idx) });

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
    if (wizardStep === 3) {
      if (!wizardData.planId) { setErrors({ planId: 'Debe seleccionar un plan' }); return; }
      if (!wizardData.adminEmail) { setErrors({ adminEmail: 'Correo requerido' }); return; }
    }

    setErrors({});
    if (wizardStep < 4) {
      setWizardStep(wizardStep + 1);
    } else {
      submitWizard();
    }
  };

  const setField = (k, v) => setWizardData({ [k]: v });

  const footer = (
    <div className="flex justify-between w-full">
      {wizardStep > 1 ? (
        <button onClick={() => setWizardStep(wizardStep - 1)} className="text-[var(--text-muted)] hover:text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors border border-[var(--border-subtle)]">
          Atrás
        </button>
      ) : <div />}
      <button onClick={handleNext} className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-zinc-950 font-bold px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors ml-auto">
        {wizardStep === 4 ? 'Crear empresa' : 'Siguiente'}
      </button>
    </div>
  );

  return (
    <Modal title={`Nueva Empresa — Paso ${wizardStep} de 4`} onClose={closeWizard} footer={footer}>
      <div className="mb-6 flex space-x-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={`flex-1 h-2 rounded-full ${wizardStep >= i ? 'bg-[var(--brand)]' : 'bg-[var(--surface-2)]'}`} />
        ))}
      </div>

      {wizardStep === 1 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2">Datos fiscales</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">RUC *</label>
              <input type="text" value={wizardData.ruc || ''} onChange={e => setField('ruc', e.target.value)}
                className={`w-full border ${errors.ruc ? 'border-red-500' : 'border-[var(--border-subtle)]'} bg-[var(--surface-0)] text-[var(--text-primary)] rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] placeholder-zinc-600`} 
                placeholder="13 dígitos terminados en 001" maxLength={13} />
              {errors.ruc && <p className="text-red-500 text-xs mt-1">{errors.ruc}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Régimen</label>
              <select value={wizardData.regimen || 'General'} onChange={e => setField('regimen', e.target.value)}
                className="w-full border border-[var(--border-subtle)] bg-[var(--surface-0)] text-[var(--text-primary)] rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]">
                <option value="General">General</option>
                <option value="RIMPE emprendedor">RIMPE emprendedor</option>
                <option value="RIMPE negocio popular">RIMPE negocio popular</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Razón social *</label>
              <input type="text" value={wizardData.razonSocial || ''} onChange={e => setField('razonSocial', e.target.value)}
                className={`w-full border ${errors.razonSocial ? 'border-red-500' : 'border-[var(--border-subtle)]'} bg-[var(--surface-0)] text-[var(--text-primary)] rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]`} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Nombre comercial *</label>
              <input type="text" value={wizardData.nombreComercial || ''} onChange={e => setField('nombreComercial', e.target.value)}
                className={`w-full border ${errors.nombreComercial ? 'border-red-500' : 'border-[var(--border-subtle)]'} bg-[var(--surface-0)] text-[var(--text-primary)] rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]`} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Dirección matriz *</label>
              <input type="text" value={wizardData.address || ''} onChange={e => setField('address', e.target.value)}
                className={`w-full border ${errors.address ? 'border-red-500' : 'border-[var(--border-subtle)]'} bg-[var(--surface-0)] text-[var(--text-primary)] rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]`} />
            </div>
            <div className="md:col-span-2 flex items-center space-x-3 mt-2">
              <input type="checkbox" id="contabilidad" checked={wizardData.llevaContabilidad || false} onChange={e => setField('llevaContabilidad', e.target.checked)}
                className="h-4 w-4 text-[var(--brand)] focus:ring-[var(--brand)] border-[var(--border-subtle)] bg-[var(--surface-0)] rounded" />
              <label htmlFor="contabilidad" className="text-sm font-bold text-zinc-300">Obligado a llevar contabilidad</label>
            </div>
          </div>
        </div>
      )}

      {wizardStep === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2">Configuración de emisión</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">Ambiente SRI</label>
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2 bg-[var(--surface-0)]/50 p-3 rounded-2xl border border-[var(--border-subtle)] cursor-pointer flex-1">
                  <input type="radio" name="env" value="Pruebas" checked={!wizardData.environment || wizardData.environment === 'Pruebas'} onChange={() => setField('environment', 'Pruebas')} className="text-[var(--brand)]" />
                  <span className="text-sm font-bold text-[var(--text-primary)]">Pruebas</span>
                </label>
                <label className="flex items-center space-x-2 bg-[var(--surface-0)]/50 p-3 rounded-2xl border border-[var(--border-subtle)] cursor-pointer flex-1">
                  <input type="radio" name="env" value="Produccion" checked={wizardData.environment === 'Produccion'} onChange={() => setField('environment', 'Produccion')} className="text-[var(--brand)]" />
                  <span className="text-sm font-bold text-[var(--text-primary)]">Producción</span>
                </label>
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Establecimiento</label>
              <input type="text" value={wizardData.establishment || '001'} onChange={e => setField('establishment', e.target.value)}
                className="w-full border border-[var(--border-subtle)] bg-[var(--surface-0)] text-[var(--text-primary)] rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" maxLength={3} />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Punto de emisión</label>
              <input type="text" value={wizardData.pointOfSale || '001'} onChange={e => setField('pointOfSale', e.target.value)}
                className="w-full border border-[var(--border-subtle)] bg-[var(--surface-0)] text-[var(--text-primary)] rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" maxLength={3} />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Secuencial inicial</label>
              <input type="number" value={wizardData.sequentialStart || 1} onChange={e => setField('sequentialStart', parseInt(e.target.value))}
                className="w-full border border-[var(--border-subtle)] bg-[var(--surface-0)] text-[var(--text-primary)] rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" min={1} />
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
          <h3 className="text-lg font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2">Plan y acceso</h3>
          
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-3">Seleccionar Plan *</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {plans.map(p => (
                <div 
                  key={p.id}
                  onClick={() => setField('planId', p.id)}
                  className={`border rounded-3xl p-5 cursor-pointer transition-all ${wizardData.planId === p.id ? 'border-[var(--brand)] bg-[var(--brand)]/10 ring-1 ring-[var(--brand)]' : 'border-[var(--border-subtle)] bg-[var(--surface-0)]/50 hover:border-zinc-700'}`}
                >
                  <h4 className="font-bold text-[var(--text-primary)]">{p.name}</h4>
                  <div className="text-2xl font-bold text-[var(--text-primary)] my-2">${p.price}</div>
                  <ul className="text-xs font-medium text-[var(--text-muted)] space-y-1">
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
              <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Ciclo de facturación</label>
              <select value={wizardData.billingCycle || 'mensual'} onChange={e => setField('billingCycle', e.target.value)}
                className="w-full border border-[var(--border-subtle)] bg-[var(--surface-0)] text-[var(--text-primary)] rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]">
                <option value="mensual">Mensual</option>
                <option value="anual">Anual (10% descuento)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Fecha de inicio</label>
              <input type="text" value={formatDate(DEMO_DATE)} disabled
                className="w-full border border-[var(--border-subtle)] bg-[var(--surface-1)]/50 rounded-2xl px-4 py-2 text-sm text-[var(--text-muted)]" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Correo del administrador *</label>
              <input type="email" value={wizardData.adminEmail || ''} onChange={e => setField('adminEmail', e.target.value)}
                className={`w-full border ${errors.adminEmail ? 'border-red-500' : 'border-[var(--border-subtle)]'} bg-[var(--surface-0)] text-[var(--text-primary)] rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] placeholder-zinc-600`} 
                placeholder="admin@empresa.com" />
              <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-2">Se enviarán las credenciales de acceso a este correo</p>
            </div>
          </div>
        </div>
      )}

      {wizardStep === 4 && (
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2">Cajeros iniciales (opcional)</h3>
          <p className="text-xs font-medium text-[var(--text-muted)]">Puedes agregar cajeros ahora o hacerlo después desde la ficha de la empresa. Todos quedan asignados a la sucursal matriz que se crea con esta empresa.</p>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Nombre</label>
              <input type="text" value={cajeroDraft.name} onChange={e => setCajeroDraft({ ...cajeroDraft, name: e.target.value })}
                className="w-full border border-[var(--border-subtle)] bg-[var(--surface-0)] text-[var(--text-primary)] rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Correo</label>
              <input type="email" value={cajeroDraft.email} onChange={e => setCajeroDraft({ ...cajeroDraft, email: e.target.value })}
                className="w-full border border-[var(--border-subtle)] bg-[var(--surface-0)] text-[var(--text-primary)] rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Rol</label>
              <select value={cajeroDraft.role} onChange={e => setCajeroDraft({ ...cajeroDraft, role: e.target.value })}
                className="border border-[var(--border-subtle)] bg-[var(--surface-0)] text-[var(--text-primary)] rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]">
                <option value="vendedor">Vendedor</option>
                <option value="operario">Operario</option>
              </select>
            </div>
            <button type="button" onClick={addCajero} className="bg-[var(--surface-2)] hover:bg-[var(--brand)] hover:text-zinc-950 text-[var(--text-primary)] font-bold px-4 py-2 rounded-2xl text-xs uppercase tracking-wider transition-colors">
              Agregar
            </button>
          </div>
          {errors.cajero && <p className="text-red-500 text-xs">{errors.cajero}</p>}

          {cajeros.length > 0 && (
            <ul className="space-y-2">
              {cajeros.map((c, i) => (
                <li key={i} className="flex items-center justify-between bg-[var(--surface-0)]/50 border border-[var(--border-subtle)] rounded-2xl px-4 py-3">
                  <div>
                    <div className="font-bold text-[var(--text-primary)] text-sm">{c.name} <span className="text-[var(--text-muted)] font-medium uppercase text-[10px] ml-2">{c.role}</span></div>
                    <div className="text-xs text-[var(--text-muted)]">{c.email}</div>
                  </div>
                  <button type="button" onClick={() => removeCajero(i)} className="text-red-500 hover:text-red-400 text-xs font-bold uppercase tracking-wider">Quitar</button>
                </li>
              ))}
            </ul>
          )}

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
            <p className="text-xs font-medium text-blue-300">Las contraseñas temporales se generan automáticamente y se envían por correo a cada cajero (también se muestran aquí al finalizar, por si el correo falla).</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
