import React, { useState, useEffect } from 'react';
import { Building2, Plus, X, Loader, MapPin, Phone, CreditCard, Power } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchBranches, createBranch, updateBranch, createPointOfSale, updatePointOfSale } from '../../lib/supabaseHelpers.js';

const EMPTY_BRANCH = { name: '', code: '', establishment: '', address: '', city: '', phone: '' };
const EMPTY_POS = { nombre: '', numero_establecimiento: '', numero_pos: '' };

export default function Branches() {
  const { currentUser, showToast } = useStore();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [branchForm, setBranchForm] = useState(EMPTY_BRANCH);
  const [savingBranch, setSavingBranch] = useState(false);

  const [posBranchId, setPosBranchId] = useState(null);
  const [editingPos, setEditingPos] = useState(null);
  const [posForm, setPosForm] = useState(EMPTY_POS);
  const [savingPos, setSavingPos] = useState(false);

  const loadBranches = async () => {
    try {
      const data = await fetchBranches(currentUser.company_id);
      setBranches(data);
    } catch (error) {
      console.error('Error loading branches:', error);
      showToast('error', 'Error al cargar sucursales');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.company_id) loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const openAddBranch = () => {
    setEditingBranch(null);
    setBranchForm(EMPTY_BRANCH);
    setShowBranchModal(true);
  };

  const openEditBranch = (branch) => {
    setEditingBranch(branch);
    setBranchForm({
      name: branch.name || '',
      code: branch.code || '',
      establishment: branch.establishment || '',
      address: branch.address || '',
      city: branch.city || '',
      phone: branch.phone || ''
    });
    setShowBranchModal(true);
  };

  const handleSaveBranch = async () => {
    if (!branchForm.name.trim() || !branchForm.code.trim() || !branchForm.establishment.trim()) {
      showToast('error', 'Nombre, código y establecimiento son requeridos');
      return;
    }
    if (!/^\d{3}$/.test(branchForm.establishment.trim())) {
      showToast('error', 'El establecimiento debe tener exactamente 3 dígitos (ej: 001)');
      return;
    }

    try {
      setSavingBranch(true);
      if (editingBranch) {
        await updateBranch(editingBranch.id, branchForm);
        showToast('success', `Sucursal "${branchForm.name}" actualizada`);
      } else {
        await createBranch({ companyId: currentUser.company_id, ...branchForm });
        showToast('success', `Sucursal "${branchForm.name}" creada`);
      }
      setShowBranchModal(false);
      await loadBranches();
    } catch (error) {
      console.error('Error saving branch:', error);
      showToast('error', error.message || 'Error al guardar la sucursal');
    } finally {
      setSavingBranch(false);
    }
  };

  const handleToggleBranchActive = async (branch) => {
    try {
      await updateBranch(branch.id, { isActive: !branch.is_active });
      showToast('success', `Sucursal ${branch.is_active ? 'desactivada' : 'activada'}`);
      await loadBranches();
    } catch (error) {
      showToast('error', error.message || 'Error al actualizar la sucursal');
    }
  };

  const openAddPos = (branchId) => {
    const branch = branches.find(b => b.id === branchId);
    setPosBranchId(branchId);
    setEditingPos(null);
    setPosForm({ nombre: '', numero_establecimiento: branch?.establishment || '', numero_pos: '' });
  };

  const openEditPos = (branchId, pos) => {
    setPosBranchId(branchId);
    setEditingPos(pos);
    setPosForm({
      nombre: pos.nombre || '',
      numero_establecimiento: pos.numero_establecimiento || '',
      numero_pos: pos.numero_pos || ''
    });
  };

  const closePosModal = () => {
    setPosBranchId(null);
    setEditingPos(null);
    setPosForm(EMPTY_POS);
  };

  const handleSavePos = async () => {
    if (!posForm.nombre.trim() || !posForm.numero_establecimiento.trim() || !posForm.numero_pos.trim()) {
      showToast('error', 'Nombre, establecimiento y punto de venta son requeridos');
      return;
    }
    if (!/^\d{3}$/.test(posForm.numero_establecimiento.trim()) || !/^\d{3}$/.test(posForm.numero_pos.trim())) {
      showToast('error', 'Establecimiento y punto de venta deben tener exactamente 3 dígitos (ej: 001)');
      return;
    }

    try {
      setSavingPos(true);
      if (editingPos) {
        await updatePointOfSale(editingPos.id, {
          nombre: posForm.nombre,
          numero_establecimiento: posForm.numero_establecimiento,
          numero_pos: posForm.numero_pos
        });
        showToast('success', `Punto de venta "${posForm.nombre}" actualizado`);
      } else {
        await createPointOfSale({
          company_id: currentUser.company_id,
          branch_id: posBranchId,
          nombre: posForm.nombre,
          numero_establecimiento: posForm.numero_establecimiento,
          numero_pos: posForm.numero_pos,
          sequential_start: 1,
          sequential_current: 1,
          status: 'activo',
          is_active: true
        });
        showToast('success', `Punto de venta "${posForm.nombre}" creado`);
      }
      closePosModal();
      await loadBranches();
    } catch (error) {
      console.error('Error saving point of sale:', error);
      showToast('error', error.message || 'Error al guardar el punto de venta');
    } finally {
      setSavingPos(false);
    }
  };

  const handleTogglePosActive = async (pos) => {
    try {
      await updatePointOfSale(pos.id, { is_active: !pos.is_active });
      showToast('success', `Punto de venta ${pos.is_active ? 'desactivado' : 'activado'}`);
      await loadBranches();
    } catch (error) {
      showToast('error', error.message || 'Error al actualizar el punto de venta');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-zinc-100">Sucursales</h1>
          <p className="text-zinc-500 mt-1">Cada punto de venta emite facturas con su propio establecimiento y secuencial ante el SRI</p>
        </div>
        <button
          onClick={openAddBranch}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
        >
          <Plus size={20} />
          Agregar Sucursal
        </button>
      </div>

      {loading ? (
        <div className="text-center text-zinc-500 py-12">Cargando...</div>
      ) : branches.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <Building2 className="mx-auto text-zinc-700 mb-3" size={40} />
          <p className="text-zinc-500">Aún no hay sucursales registradas</p>
        </div>
      ) : (
        <div className="space-y-4">
          {branches.map(branch => (
            <div key={branch.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="p-5 flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                    <Building2 className="text-blue-400" size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-bold text-lg text-zinc-100 truncate">{branch.name}</h2>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase">{branch.code}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${branch.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                        {branch.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-zinc-500">
                      <span className="flex items-center gap-1"><CreditCard size={12} /> Establecimiento {branch.establishment}</span>
                      {branch.address && <span className="flex items-center gap-1"><MapPin size={12} /> {branch.address}{branch.city ? `, ${branch.city}` : ''}</span>}
                      {branch.phone && <span className="flex items-center gap-1"><Phone size={12} /> {branch.phone}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => openEditBranch(branch)}
                    className="text-xs font-bold text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleToggleBranchActive(branch)}
                    className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${branch.is_active ? 'text-red-400 hover:bg-red-500/10' : 'text-emerald-400 hover:bg-emerald-500/10'}`}
                  >
                    <Power size={13} />
                    {branch.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>

              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wide">Puntos de Venta</h3>
                  <button
                    onClick={() => openAddPos(branch.id)}
                    className="flex items-center gap-1 text-xs font-bold text-blue-400 hover:text-blue-300"
                  >
                    <Plus size={14} /> Agregar Punto de Venta
                  </button>
                </div>
                {(branch.point_of_sales || []).length === 0 ? (
                  <p className="text-sm text-zinc-500">Sin puntos de venta - agrega uno para poder facturar desde esta sucursal.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {branch.point_of_sales.map(pos => (
                      <div key={pos.id} className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-bold text-zinc-100 text-sm truncate">{pos.nombre}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0 ${pos.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                            {pos.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-500 font-mono">{pos.numero_establecimiento}-{pos.numero_pos}</div>
                        <div className="text-xs text-zinc-600 mt-0.5">Próximo secuencial: {String(pos.sequential_current || 1).padStart(9, '0')}</div>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => openEditPos(branch.id, pos)}
                            className="flex-1 text-xs font-bold text-zinc-400 hover:text-zinc-200 py-1 rounded hover:bg-zinc-800 transition-colors"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleTogglePosActive(pos)}
                            className={`flex-1 text-xs font-bold py-1 rounded transition-colors ${pos.is_active ? 'text-red-400 hover:bg-red-500/10' : 'text-emerald-400 hover:bg-emerald-500/10'}`}
                          >
                            {pos.is_active ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Branch Modal */}
      {showBranchModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-zinc-100">{editingBranch ? 'Editar Sucursal' : 'Agregar Sucursal'}</h2>
              <button onClick={() => setShowBranchModal(false)} className="text-zinc-500 hover:text-zinc-300">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Nombre *</label>
                  <input
                    type="text"
                    placeholder="Sucursal Norte"
                    value={branchForm.name}
                    onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Código *</label>
                  <input
                    type="text"
                    placeholder="NORTE"
                    value={branchForm.code}
                    onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2">Establecimiento SRI (3 dígitos) *</label>
                <input
                  type="text"
                  maxLength="3"
                  placeholder="001"
                  value={branchForm.establishment}
                  onChange={(e) => setBranchForm({ ...branchForm, establishment: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 font-mono"
                />
                <p className="text-xs text-zinc-500 mt-1">Debe coincidir con el establecimiento registrado ante el SRI para esta ubicación. Dos sucursales pueden compartir el mismo número si así está registrado.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2">Dirección</label>
                <input
                  type="text"
                  placeholder="Av. Principal 123"
                  value={branchForm.address}
                  onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Ciudad</label>
                  <input
                    type="text"
                    placeholder="Quito"
                    value={branchForm.city}
                    onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Teléfono</label>
                  <input
                    type="tel"
                    placeholder="+593 2 1234567"
                    value={branchForm.phone}
                    onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t border-zinc-800 pt-4 mt-6">
              <button
                onClick={() => setShowBranchModal(false)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveBranch}
                disabled={savingBranch}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {savingBranch ? <Loader size={18} className="animate-spin" /> : <Plus size={18} />}
                {savingBranch ? 'Guardando...' : editingBranch ? 'Guardar Cambios' : 'Crear Sucursal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Point of Sale Modal */}
      {posBranchId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-zinc-100">{editingPos ? 'Editar Punto de Venta' : 'Agregar Punto de Venta'}</h2>
              <button onClick={closePosModal} className="text-zinc-500 hover:text-zinc-300">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2">Nombre *</label>
                <input
                  type="text"
                  placeholder="Caja 1"
                  value={posForm.nombre}
                  onChange={(e) => setPosForm({ ...posForm, nombre: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Establecimiento *</label>
                  <input
                    type="text"
                    maxLength="3"
                    placeholder="001"
                    value={posForm.numero_establecimiento}
                    onChange={(e) => setPosForm({ ...posForm, numero_establecimiento: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Punto de Venta *</label>
                  <input
                    type="text"
                    maxLength="3"
                    placeholder="001"
                    value={posForm.numero_pos}
                    onChange={(e) => setPosForm({ ...posForm, numero_pos: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 font-mono"
                  />
                </div>
              </div>
              <p className="text-xs text-zinc-500">
                Puede compartir el mismo establecimiento/punto de venta que otra sucursal, o usar uno distinto, según lo que tengas registrado ante el SRI.
              </p>
            </div>

            <div className="flex gap-3 border-t border-zinc-800 pt-4 mt-6">
              <button
                onClick={closePosModal}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSavePos}
                disabled={savingPos}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {savingPos ? <Loader size={18} className="animate-spin" /> : <Plus size={18} />}
                {savingPos ? 'Guardando...' : editingPos ? 'Guardar Cambios' : 'Crear Punto de Venta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
