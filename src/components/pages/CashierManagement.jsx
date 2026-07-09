import React, { useState, useEffect } from 'react';
import { Users, Plus, X, Key, Loader, MapPin } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchCompanyUsers, createCashierUser, resetCashierPassword, fetchBranches, updateUserBranch } from '../../lib/supabaseHelpers.js';

const EMPTY_NEW_CASHIER = { name: '', email: '', phone: '', role: 'vendedor', branchId: '', password: '', confirmPassword: '' };

export default function CashierManagement() {
  const { currentUser, showToast } = useStore();
  const [cashiers, setCashiers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newCashier, setNewCashier] = useState(EMPTY_NEW_CASHIER);
  const [creating, setCreating] = useState(false);

  const [resetTarget, setResetTarget] = useState(null);
  const [resetForm, setResetForm] = useState({ newPassword: '', confirmPassword: '' });
  const [resetting, setResetting] = useState(false);

  const [reassigningId, setReassigningId] = useState(null);

  const loadData = async () => {
    try {
      const [users, branchList] = await Promise.all([
        fetchCompanyUsers(currentUser.company_id),
        fetchBranches(currentUser.company_id)
      ]);
      setCashiers(users.filter(u => u.role === 'operario' || u.role === 'vendedor'));
      setBranches(branchList);
    } catch (error) {
      console.error('Error loading cashiers:', error);
      showToast('error', 'Error al cargar cajeros');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.company_id) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const closeAddModal = () => {
    setShowAddModal(false);
    setNewCashier(EMPTY_NEW_CASHIER);
  };

  const handleAddCashier = async () => {
    if (!newCashier.name.trim() || !newCashier.email.trim()) {
      showToast('error', 'Nombre y correo son requeridos');
      return;
    }
    if (!newCashier.branchId) {
      showToast('error', 'Selecciona la sucursal donde trabajará este cajero');
      return;
    }
    if (newCashier.password.length < 6) {
      showToast('error', 'La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (newCashier.password !== newCashier.confirmPassword) {
      showToast('error', 'Las contraseñas no coinciden');
      return;
    }

    try {
      setCreating(true);
      await createCashierUser({
        companyId: currentUser.company_id,
        email: newCashier.email.trim(),
        password: newCashier.password,
        name: newCashier.name.trim(),
        role: newCashier.role,
        phone: newCashier.phone.trim(),
        branchId: newCashier.branchId
      });
      showToast('success', `Cajero "${newCashier.name}" creado. Comparte sus credenciales de forma segura.`);
      closeAddModal();
      await loadData();
    } catch (error) {
      console.error('Error creating cashier:', error);
      showToast('error', error.message || 'Error al crear el cajero');
    } finally {
      setCreating(false);
    }
  };

  const handleReassignBranch = async (cashier, branchId) => {
    setReassigningId(cashier.id);
    try {
      await updateUserBranch({ companyId: currentUser.company_id, userId: cashier.id, branchId: branchId || null });
      showToast('success', `Sucursal de "${cashier.name}" actualizada`);
      await loadData();
    } catch (error) {
      console.error('Error reassigning branch:', error);
      showToast('error', error.message || 'Error al reasignar la sucursal');
    } finally {
      setReassigningId(null);
    }
  };

  const openResetPassword = (cashier) => {
    setResetTarget(cashier);
    setResetForm({ newPassword: '', confirmPassword: '' });
  };

  const handleResetPassword = async () => {
    if (resetForm.newPassword.length < 6) {
      showToast('error', 'La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (resetForm.newPassword !== resetForm.confirmPassword) {
      showToast('error', 'Las contraseñas no coinciden');
      return;
    }

    try {
      setResetting(true);
      await resetCashierPassword({
        companyId: currentUser.company_id,
        userId: resetTarget.id,
        newPassword: resetForm.newPassword
      });
      showToast('success', `Contraseña de "${resetTarget.name}" actualizada`);
      setResetTarget(null);
    } catch (error) {
      console.error('Error resetting password:', error);
      showToast('error', error.message || 'Error al cambiar la contraseña');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-zinc-100">Gestión de Cajas</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
        >
          <Plus size={20} />
          Agregar Cajero
        </button>
      </div>

      {!loading && branches.length === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
          <p className="text-sm text-amber-400">Crea primero una sucursal en "Sucursales" antes de agregar cajeros - cada cajero necesita una sucursal asignada para poder facturar.</p>
        </div>
      )}

      {loading ? (
        <div className="text-center text-zinc-500 py-12">Cargando...</div>
      ) : cashiers.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <Users className="mx-auto text-zinc-700 mb-3" size={40} />
          <p className="text-zinc-500">Aún no hay cajeros registrados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cashiers.map(c => (
            <div key={c.id} className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-zinc-100 truncate">{c.name}</div>
                  <div className="text-sm text-zinc-500 truncate">{c.email}</div>
                  {c.phone && <div className="text-xs text-zinc-600 mt-0.5">{c.phone}</div>}
                  <div className="text-xs text-blue-400 mt-2 font-bold uppercase">{c.role}</div>
                </div>
                <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded uppercase ${c.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                  {c.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              <div className="mt-3">
                <label className="flex items-center gap-1 text-[10px] font-bold text-zinc-500 uppercase mb-1">
                  <MapPin size={11} /> Sucursal
                </label>
                <select
                  value={c.branch_id || ''}
                  onChange={(e) => handleReassignBranch(c, e.target.value)}
                  disabled={reassigningId === c.id}
                  className={`w-full bg-zinc-800 border rounded px-2 py-1.5 text-sm ${c.branch_id ? 'text-zinc-200 border-zinc-700' : 'text-amber-400 border-amber-500/40'}`}
                >
                  <option value="">Sin asignar</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                {!c.branch_id && <p className="text-[10px] text-amber-400 mt-1">No podrá facturar hasta que se le asigne una sucursal</p>}
              </div>

              <button
                onClick={() => openResetPassword(c)}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold py-2 rounded-lg transition-colors"
              >
                <Key size={14} />
                Cambiar Contraseña
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Cashier Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-zinc-100">Agregar Cajero</h2>
              <button onClick={closeAddModal} className="text-zinc-500 hover:text-zinc-300">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2">Nombre Completo *</label>
                <input
                  type="text"
                  placeholder="Juan Pérez"
                  value={newCashier.name}
                  onChange={(e) => setNewCashier({ ...newCashier, name: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2">Correo Electrónico *</label>
                <input
                  type="email"
                  placeholder="cajero@tutienda.com"
                  value={newCashier.email}
                  onChange={(e) => setNewCashier({ ...newCashier, email: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                />
                <p className="text-xs text-zinc-500 mt-1">Será su usuario para entrar al POS</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2">Sucursal *</label>
                <select
                  value={newCashier.branchId}
                  onChange={(e) => setNewCashier({ ...newCashier, branchId: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                >
                  <option value="">Selecciona una sucursal</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500 mt-1">Define desde qué punto de venta facturará este cajero</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Teléfono (Opcional)</label>
                  <input
                    type="tel"
                    placeholder="+593 9 12345678"
                    value={newCashier.phone}
                    onChange={(e) => setNewCashier({ ...newCashier, phone: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Rol *</label>
                  <select
                    value={newCashier.role}
                    onChange={(e) => setNewCashier({ ...newCashier, role: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                  >
                    <option value="vendedor">Vendedor</option>
                    <option value="operario">Operario</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Contraseña *</label>
                  <input
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={newCashier.password}
                    onChange={(e) => setNewCashier({ ...newCashier, password: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Confirmar Contraseña *</label>
                  <input
                    type="password"
                    placeholder="Repite la contraseña"
                    value={newCashier.confirmPassword}
                    onChange={(e) => setNewCashier({ ...newCashier, confirmPassword: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                  />
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <p className="text-xs text-blue-300">
                  Comparte estas credenciales directamente con el cajero. Aún no hay envío automático de correo, así que anótalas antes de continuar.
                </p>
              </div>
            </div>

            <div className="flex gap-3 border-t border-zinc-800 pt-4 mt-6">
              <button
                onClick={closeAddModal}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddCashier}
                disabled={creating}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {creating ? <Loader size={18} className="animate-spin" /> : <Plus size={18} />}
                {creating ? 'Creando...' : 'Crear Cajero'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-zinc-100">Cambiar Contraseña</h2>
              <button onClick={() => setResetTarget(null)} className="text-zinc-500 hover:text-zinc-300">
                <X size={24} />
              </button>
            </div>

            <p className="text-sm text-zinc-400 mb-4">
              Nueva contraseña para <span className="font-bold text-zinc-200">{resetTarget.name}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2">Nueva Contraseña</label>
                <input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={resetForm.newPassword}
                  onChange={(e) => setResetForm({ ...resetForm, newPassword: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2">Confirmar Contraseña</label>
                <input
                  type="password"
                  placeholder="Repite la contraseña"
                  value={resetForm.confirmPassword}
                  onChange={(e) => setResetForm({ ...resetForm, confirmPassword: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                />
              </div>
            </div>

            <div className="flex gap-3 border-t border-zinc-800 pt-4 mt-6">
              <button
                onClick={() => setResetTarget(null)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resetting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {resetting ? <Loader size={18} className="animate-spin" /> : <Key size={18} />}
                {resetting ? 'Guardando...' : 'Actualizar Contraseña'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
