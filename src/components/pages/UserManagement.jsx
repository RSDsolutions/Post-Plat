import React, { useState, useEffect } from 'react';
import { Users, Plus, X, Key, Loader, MapPin, Lock } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchCompanyUsers, createCompanyUser, resetCashierPassword, fetchBranches, updateUserBranch, fetchCompanyFeatureOverrides } from '../../lib/supabaseHelpers.js';
import { checkLimit, limitReachedMessage, hasFeature } from '../../lib/planLimits.js';
import EmptyState from '../ui/EmptyState.jsx';

const EMPTY_NEW_USER = { name: '', email: '', phone: '', role: 'vendedor', branchId: '', password: '', confirmPassword: '' };
const ROLE_LABELS = { vendedor: 'Vendedor', operario: 'Operario', contador: 'Contador' };

// Antes CashierManagement.jsx (solo vendedor/operario) - la Fase 5 expande
// esta misma pantalla para que el gerente también pueda dar de alta al
// contador de su empresa, sin sucursal (a diferencia de los cajeros).
export default function UserManagement() {
  const { currentUser, showToast, companies, plans } = useStore();
  const [users, setUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const company = companies.find(c => c.id === currentUser?.company_id);
  const plan = plans.find(p => p.id === company?.planId);
  const [featureOverrides, setFeatureOverrides] = useState([]);
  const usuariosEnabled = hasFeature(plan, featureOverrides, 'usuarios');

  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState(EMPTY_NEW_USER);
  const [creating, setCreating] = useState(false);

  const [resetTarget, setResetTarget] = useState(null);
  const [resetForm, setResetForm] = useState({ newPassword: '', confirmPassword: '' });
  const [resetting, setResetting] = useState(false);

  const [reassigningId, setReassigningId] = useState(null);

  const loadData = async () => {
    try {
      const [userList, branchList] = await Promise.all([
        fetchCompanyUsers(currentUser.company_id),
        fetchBranches(currentUser.company_id)
      ]);
      setUsers(userList.filter(u => u.role === 'operario' || u.role === 'vendedor' || u.role === 'contador'));
      setAllUsers(userList);
      setBranches(branchList);
    } catch (error) {
      console.error('Error loading users:', error);
      showToast('error', 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.company_id) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.company_id) {
      fetchCompanyFeatureOverrides(currentUser.company_id).then(setFeatureOverrides).catch(() => {});
    }
  }, [currentUser?.company_id]);

  const closeAddModal = () => {
    setShowAddModal(false);
    setNewUser(EMPTY_NEW_USER);
  };

  const needsBranch = newUser.role !== 'contador';

  const handleAddUser = async () => {
    if (!newUser.name.trim() || !newUser.email.trim()) {
      showToast('error', 'Nombre y correo son requeridos');
      return;
    }
    if (needsBranch && !newUser.branchId) {
      showToast('error', 'Selecciona la sucursal donde trabajará este usuario');
      return;
    }
    if (newUser.password.length < 6) {
      showToast('error', 'La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (newUser.password !== newUser.confirmPassword) {
      showToast('error', 'Las contraseñas no coinciden');
      return;
    }
    const activeUserCount = allUsers.filter(u => u.is_active).length;
    const limitCheck = checkLimit('users', plan, activeUserCount);
    if (!limitCheck.ok) {
      showToast('error', limitReachedMessage(limitCheck, plan?.name));
      return;
    }

    try {
      setCreating(true);
      await createCompanyUser({
        companyId: currentUser.company_id,
        email: newUser.email.trim(),
        password: newUser.password,
        name: newUser.name.trim(),
        role: newUser.role,
        phone: newUser.phone.trim(),
        branchId: needsBranch ? newUser.branchId : null
      });
      showToast('success', `"${newUser.name}" creado. Comparte sus credenciales de forma segura.`);
      closeAddModal();
      await loadData();
    } catch (error) {
      console.error('Error creating user:', error);
      showToast('error', error.message || 'Error al crear el usuario');
    } finally {
      setCreating(false);
    }
  };

  const handleReassignBranch = async (user, branchId) => {
    setReassigningId(user.id);
    try {
      await updateUserBranch({ companyId: currentUser.company_id, userId: user.id, branchId: branchId || null, callerId: currentUser.id });
      showToast('success', `Sucursal de "${user.name}" actualizada`);
      await loadData();
    } catch (error) {
      console.error('Error reassigning branch:', error);
      showToast('error', error.message || 'Error al reasignar la sucursal');
    } finally {
      setReassigningId(null);
    }
  };

  const openResetPassword = (user) => {
    setResetTarget(user);
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

  if (!loading && !usuariosEnabled) {
    return (
      <div className="max-w-7xl mx-auto">
        <EmptyState
          icon={Lock}
          title="Gestión de usuarios no incluida en tu plan"
          description="Actualiza tu plan para administrar cajeros y contadores."
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-panel-text">Usuarios</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2 px-4 rounded-lg transition-colors"
        >
          <Plus size={20} />
          Agregar Usuario
        </button>
      </div>

      {!loading && branches.length === 0 && (
        <div className="bg-panel-warning/10 border border-panel-warning/30 rounded-2xl p-4">
          <p className="text-sm text-panel-warning">Crea primero una sucursal en "Sucursales" antes de agregar cajeros - cada cajero necesita una sucursal asignada para poder facturar (el contador no).</p>
        </div>
      )}

      {loading ? (
        <div className="text-center text-panel-text-muted py-12">Cargando...</div>
      ) : users.length === 0 ? (
        <div className="bg-panel-surface border border-panel-border rounded-2xl p-12 text-center">
          <Users className="mx-auto text-panel-text-muted mb-3" size={40} />
          <p className="text-panel-text-muted">Aún no hay usuarios registrados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {users.map(u => (
            <div key={u.id} className="bg-panel-surface rounded-xl border border-panel-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-panel-text truncate">{u.name}</div>
                  <div className="text-sm text-panel-text-muted truncate">{u.email}</div>
                  {u.phone && <div className="text-xs text-panel-text-muted mt-0.5">{u.phone}</div>}
                  <div className="text-xs text-panel-accent-soft mt-2 font-bold uppercase">{ROLE_LABELS[u.role] || u.role}</div>
                </div>
                <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded uppercase ${u.is_active ? 'bg-panel-success/10 text-panel-success' : 'bg-panel-surface-2 text-panel-text-muted'}`}>
                  {u.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              {u.role !== 'contador' && (
                <div className="mt-3">
                  <label className="flex items-center gap-1 text-[10px] font-bold text-panel-text-muted uppercase mb-1">
                    <MapPin size={11} /> Sucursal
                  </label>
                  <select
                    value={u.branch_id || ''}
                    onChange={(e) => handleReassignBranch(u, e.target.value)}
                    disabled={reassigningId === u.id}
                    className={`w-full bg-panel-surface-2 border rounded px-2 py-1.5 text-sm ${u.branch_id ? 'text-panel-text border-panel-border' : 'text-panel-warning border-panel-warning/40'}`}
                  >
                    <option value="">Sin asignar</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  {!u.branch_id && <p className="text-[10px] text-panel-warning mt-1">No podrá facturar hasta que se le asigne una sucursal</p>}
                </div>
              )}

              <button
                onClick={() => openResetPassword(u)}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-panel-surface-2 hover:bg-panel-text/10 text-panel-text-muted text-xs font-bold py-2 rounded-lg transition-colors"
              >
                <Key size={14} />
                Cambiar Contraseña
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-panel-surface border border-panel-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-panel-text">Agregar Usuario</h2>
              <button onClick={closeAddModal} className="text-panel-text-muted hover:text-panel-text">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-2">Nombre Completo *</label>
                <input
                  type="text"
                  placeholder="Juan Pérez"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-2">Correo Electrónico *</label>
                <input
                  type="email"
                  placeholder="usuario@tutienda.com"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-2">Rol *</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value, branchId: e.target.value === 'contador' ? '' : newUser.branchId })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                >
                  <option value="vendedor">Vendedor</option>
                  <option value="operario">Operario</option>
                  <option value="contador">Contador</option>
                </select>
              </div>

              {needsBranch ? (
                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-2">Sucursal *</label>
                  <select
                    value={newUser.branchId}
                    onChange={(e) => setNewUser({ ...newUser, branchId: e.target.value })}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                  >
                    <option value="">Selecciona una sucursal</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-panel-text-muted mt-1">Define desde qué punto de venta facturará este usuario</p>
                </div>
              ) : (
                <p className="text-xs text-panel-text-muted">El contador es a nivel empresa, no necesita sucursal.</p>
              )}

              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-2">Teléfono (Opcional)</label>
                <input
                  type="tel"
                  placeholder="+593 9 12345678"
                  value={newUser.phone}
                  onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-2">Contraseña *</label>
                  <input
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-2">Confirmar Contraseña *</label>
                  <input
                    type="password"
                    placeholder="Repite la contraseña"
                    value={newUser.confirmPassword}
                    onChange={(e) => setNewUser({ ...newUser, confirmPassword: e.target.value })}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
                  />
                </div>
              </div>

              <div className="bg-panel-accent/10 border border-panel-accent/30 rounded-lg p-3">
                <p className="text-xs text-panel-accent-soft">
                  Si el correo está configurado, se le envían estas credenciales automáticamente. También quedan visibles acá por si el envío falla.
                </p>
              </div>
            </div>

            <div className="flex gap-3 border-t border-panel-border pt-4 mt-6">
              <button
                onClick={closeAddModal}
                className="flex-1 bg-panel-surface-2 hover:bg-panel-text/10 text-panel-text font-bold py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddUser}
                disabled={creating}
                className="flex-1 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {creating ? <Loader size={18} className="animate-spin" /> : <Plus size={18} />}
                {creating ? 'Creando...' : 'Crear Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-panel-surface border border-panel-border rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-panel-text">Cambiar Contraseña</h2>
              <button onClick={() => setResetTarget(null)} className="text-panel-text-muted hover:text-panel-text">
                <X size={24} />
              </button>
            </div>

            <p className="text-sm text-panel-text-muted mb-4">
              Nueva contraseña para <span className="font-bold text-panel-text">{resetTarget.name}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-2">Nueva Contraseña</label>
                <input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={resetForm.newPassword}
                  onChange={(e) => setResetForm({ ...resetForm, newPassword: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-2">Confirmar Contraseña</label>
                <input
                  type="password"
                  placeholder="Repite la contraseña"
                  value={resetForm.confirmPassword}
                  onChange={(e) => setResetForm({ ...resetForm, confirmPassword: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
                />
              </div>
            </div>

            <div className="flex gap-3 border-t border-panel-border pt-4 mt-6">
              <button
                onClick={() => setResetTarget(null)}
                className="flex-1 bg-panel-surface-2 hover:bg-panel-text/10 text-panel-text font-bold py-2 rounded-lg transition-colors"
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
