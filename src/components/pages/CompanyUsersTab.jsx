import React, { useState, useEffect } from 'react';
import { Plus, Key, MapPin, Loader, UserCog, Ban, CheckCircle2 } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import {
  fetchCompanyUsers, fetchBranches, createCompanyUser, createCompanyGerente,
  updateUserBranch, adminResetUserPassword, adminSetUserActive
} from '../../lib/supabaseHelpers.js';
import { generateTempPassword } from '../../lib/password.js';
import { checkLimit, limitReachedMessage } from '../../lib/planLimits.js';
import { formatDate } from '../../lib/dates.js';
import Modal from '../ui/Modal.jsx';

const EMPTY_CAJERO = { name: '', email: '', phone: '', role: 'vendedor', branchId: '' };
const EMPTY_GERENTE = { name: '', email: '' };
const ROLE_LABELS = { gerente: 'Gerente', vendedor: 'Vendedor', operario: 'Operario', contador: 'Contador' };

function credentialsMessage(name, email, password, emailStatus) {
  const emailNote = emailStatus === 'sent'
    ? 'Ya se le envió por correo.'
    : 'No se pudo enviar el correo automático - compártela tú por un canal seguro.';
  return `Credenciales de "${name}" (cópialas ahora, no se vuelven a mostrar):\n\n${email} / ${password}\n\n${emailNote}`;
}

// Admin-side user management for a single company - creates the gerente if
// missing, adds/manages cajeros, and resets password / activates-deactivates
// any of them. Every mutation goes through the same service-role endpoints
// used elsewhere (api/admin/*), so passwords get emailed and the underlying
// RPCs stay unreachable with just the public anon key.
export default function CompanyUsersTab({ company }) {
  const { currentUser, showToast, openConfirm, plans, addActivityEvent } = useStore();
  const plan = plans.find(p => p.id === company.planId);

  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState(null);

  const [showAddCajero, setShowAddCajero] = useState(false);
  const [newCajero, setNewCajero] = useState(EMPTY_CAJERO);
  const [creatingCajero, setCreatingCajero] = useState(false);

  const [showAddGerente, setShowAddGerente] = useState(false);
  const [newGerente, setNewGerente] = useState(EMPTY_GERENTE);
  const [creatingGerente, setCreatingGerente] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [u, b] = await Promise.all([fetchCompanyUsers(company.id), fetchBranches(company.id)]);
      setUsers(u);
      setBranches(b);
    } catch (error) {
      console.error('Error loading company users:', error);
      showToast('error', 'Error al cargar los usuarios de la empresa');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id]);

  const gerente = users.find(u => u.role === 'gerente');
  const cajeros = users.filter(u => u.role === 'vendedor' || u.role === 'operario' || u.role === 'contador');
  const activeUserCount = users.filter(u => u.is_active).length;

  const closeAddCajero = () => { setShowAddCajero(false); setNewCajero(EMPTY_CAJERO); };

  const handleAddCajero = async () => {
    const name = newCajero.name.trim();
    const email = newCajero.email.trim();
    const needsBranch = newCajero.role !== 'contador';
    if (!name || !email) { showToast('error', 'Nombre y correo son requeridos'); return; }
    if (needsBranch && !newCajero.branchId) { showToast('error', 'Selecciona la sucursal donde trabajará este usuario'); return; }
    const limitCheck = checkLimit('users', plan, activeUserCount);
    if (!limitCheck.ok) { showToast('error', limitReachedMessage(limitCheck, plan?.name)); return; }

    setCreatingCajero(true);
    try {
      const tempPassword = generateTempPassword();
      const result = await createCompanyUser({
        callerId: currentUser.id,
        companyId: company.id,
        email,
        password: tempPassword,
        name,
        role: newCajero.role,
        phone: newCajero.phone.trim(),
        branchId: needsBranch ? newCajero.branchId : null
      });
      closeAddCajero();
      await load();
      await addActivityEvent(`Usuario ${ROLE_LABELS[newCajero.role] || newCajero.role} creado`, company.id, company.nombreComercial, `${name} (${email})`);
      openConfirm('Usuario creado', credentialsMessage(name, email, tempPassword, result?.emailStatus), () => {});
    } catch (error) {
      console.error('Error creating cashier:', error);
      showToast('error', error.message || 'Error al crear el usuario');
    } finally {
      setCreatingCajero(false);
    }
  };

  const closeAddGerente = () => { setShowAddGerente(false); setNewGerente(EMPTY_GERENTE); };

  const handleAddGerente = async () => {
    const name = newGerente.name.trim();
    const email = newGerente.email.trim();
    if (!name || !email) { showToast('error', 'Nombre y correo son requeridos'); return; }

    setCreatingGerente(true);
    try {
      const tempPassword = generateTempPassword();
      const result = await createCompanyGerente({
        adminId: currentUser.id,
        companyId: company.id,
        email,
        password: tempPassword,
        name
      });
      closeAddGerente();
      await load();
      await addActivityEvent('Usuario Gerente creado', company.id, company.nombreComercial, `${name} (${email})`);
      openConfirm('Gerente creado', credentialsMessage(name, email, tempPassword, result?.emailStatus), () => {});
    } catch (error) {
      console.error('Error creating gerente:', error);
      showToast('error', error.message || 'Error al crear el gerente');
    } finally {
      setCreatingGerente(false);
    }
  };

  const handleResetPassword = async (user) => {
    setBusyUserId(user.id);
    try {
      const tempPassword = generateTempPassword();
      const result = await adminResetUserPassword({ adminId: currentUser.id, companyId: company.id, userId: user.id, newPassword: tempPassword });
      openConfirm('Contraseña restablecida', credentialsMessage(user.name, user.email, tempPassword, result?.emailStatus), () => {});
    } catch (error) {
      console.error('Error resetting password:', error);
      showToast('error', error.message || 'Error al restablecer la contraseña');
    } finally {
      setBusyUserId(null);
    }
  };

  const doToggleActive = async (user, activate) => {
    setBusyUserId(user.id);
    try {
      await adminSetUserActive({ adminId: currentUser.id, companyId: company.id, userId: user.id, isActive: activate });
      showToast('success', `"${user.name}" ${activate ? 'activado' : 'desactivado'}`);
      await load();
    } catch (error) {
      console.error('Error updating user status:', error);
      showToast('error', error.message || 'Error al actualizar el usuario');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleToggleActive = (user) => {
    if (!user.is_active) { doToggleActive(user, true); return; }
    openConfirm('Desactivar usuario', `¿Desactivar a "${user.name}"? No podrá iniciar sesión hasta que lo reactives.`, () => doToggleActive(user, false));
  };

  const handleReassignBranch = async (cajero, branchId) => {
    setBusyUserId(cajero.id);
    try {
      await updateUserBranch({ companyId: company.id, userId: cajero.id, branchId: branchId || null });
      showToast('success', `Sucursal de "${cajero.name}" actualizada`);
      await load();
    } catch (error) {
      console.error('Error reassigning branch:', error);
      showToast('error', error.message || 'Error al reasignar la sucursal');
    } finally {
      setBusyUserId(null);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-[var(--text-muted)] flex items-center justify-center gap-2"><Loader size={16} className="animate-spin" /> Cargando usuarios...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-base font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2 mb-4">Gerente</h3>
        {gerente ? (
          <div className="bg-[var(--surface-0)]/50 border border-[var(--border-subtle)] rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-bold text-[var(--text-primary)]">{gerente.name}</div>
              <div className="text-sm text-[var(--text-muted)]">{gerente.email}</div>
              <div className="text-xs text-[var(--text-faint)] mt-1">
                {gerente.last_login ? `Último acceso: ${formatDate(gerente.last_login)}` : 'Nunca ha iniciado sesión'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider ${gerente.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>
                {gerente.is_active ? 'Activo' : 'Inactivo'}
              </span>
              <button
                onClick={() => handleResetPassword(gerente)}
                disabled={busyUserId === gerente.id}
                className="flex items-center gap-1.5 bg-[var(--surface-2)] hover:bg-[var(--brand)] hover:text-zinc-950 text-[var(--text-primary)] text-xs font-bold px-3 py-2 rounded-xl transition-colors disabled:opacity-50"
              >
                {busyUserId === gerente.id ? <Loader size={13} className="animate-spin" /> : <Key size={13} />} Restablecer contraseña
              </button>
              <button
                onClick={() => handleToggleActive(gerente)}
                disabled={busyUserId === gerente.id}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-colors disabled:opacity-50 ${gerente.is_active ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}
              >
                {gerente.is_active ? <Ban size={13} /> : <CheckCircle2 size={13} />} {gerente.is_active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-amber-300">Esta empresa no tiene un usuario gerente activo. Sin uno, nadie puede iniciar sesión en su panel.</p>
            <button
              onClick={() => setShowAddGerente(true)}
              className="flex items-center gap-2 bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-zinc-950 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors shrink-0"
            >
              <UserCog size={14} /> Crear gerente
            </button>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 mb-4">
          <h3 className="text-base font-bold text-[var(--text-primary)]">Usuarios ({cajeros.length}{plan?.usersLimit != null ? ` / ${plan.usersLimit}` : ''})</h3>
          <button
            onClick={() => setShowAddCajero(true)}
            className="flex items-center gap-1.5 bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-zinc-950 font-bold px-3 py-1.5 rounded-xl text-xs uppercase tracking-wider transition-colors"
          >
            <Plus size={14} /> Agregar usuario
          </button>
        </div>

        {!loading && branches.length === 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-4">
            <p className="text-xs font-medium text-amber-300">Esta empresa no tiene sucursales configuradas todavía - se necesita al menos una para poder asignar cajeros (el contador no necesita sucursal).</p>
          </div>
        )}

        {cajeros.length === 0 ? (
          <div className="bg-[var(--surface-0)]/50 border border-[var(--border-subtle)] rounded-2xl p-8 text-center text-sm text-[var(--text-muted)]">
            Aún no hay cajeros ni contadores registrados.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {cajeros.map(c => (
              <div key={c.id} className="bg-[var(--surface-0)]/50 border border-[var(--border-subtle)] rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-[var(--text-primary)] truncate">{c.name}</div>
                    <div className="text-sm text-[var(--text-muted)] truncate">{c.email}</div>
                    <div className="text-[10px] text-[var(--brand)] mt-1 font-bold uppercase tracking-wider">{ROLE_LABELS[c.role] || c.role}</div>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded uppercase ${c.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>
                    {c.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                {c.role !== 'contador' && (
                  <div className="mt-3">
                    <label className="flex items-center gap-1 text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">
                      <MapPin size={11} /> Sucursal
                    </label>
                    <select
                      value={c.branch_id || ''}
                      onChange={(e) => handleReassignBranch(c, e.target.value)}
                      disabled={busyUserId === c.id}
                      className={`w-full bg-[var(--surface-0)] border rounded-lg px-2 py-1.5 text-sm ${c.branch_id ? 'text-[var(--text-primary)] border-[var(--border-subtle)]' : 'text-amber-400 border-amber-500/40'}`}
                    >
                      <option value="">Sin asignar</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                )}

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleResetPassword(c)}
                    disabled={busyUserId === c.id}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[var(--surface-2)] hover:bg-[var(--brand)] hover:text-zinc-950 text-[var(--text-primary)] text-xs font-bold py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {busyUserId === c.id ? <Loader size={13} className="animate-spin" /> : <Key size={13} />} Contraseña
                  </button>
                  <button
                    onClick={() => handleToggleActive(c)}
                    disabled={busyUserId === c.id}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg transition-colors disabled:opacity-50 ${c.is_active ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}
                  >
                    {c.is_active ? <Ban size={13} /> : <CheckCircle2 size={13} />} {c.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddCajero && (
        <Modal
          title="Agregar usuario"
          onClose={closeAddCajero}
          footer={
            <>
              <button onClick={closeAddCajero} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors">Cancelar</button>
              <button
                onClick={handleAddCajero}
                disabled={creatingCajero}
                className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-zinc-950 font-bold px-6 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {creatingCajero && <Loader size={14} className="animate-spin" />} Crear usuario
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Nombre completo *</label>
              <input type="text" value={newCajero.name} onChange={e => setNewCajero({ ...newCajero, name: e.target.value })}
                className="w-full bg-[var(--surface-0)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Correo electrónico *</label>
              <input type="email" value={newCajero.email} onChange={e => setNewCajero({ ...newCajero, email: e.target.value })}
                className="w-full bg-[var(--surface-0)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Rol *</label>
              <select value={newCajero.role} onChange={e => setNewCajero({ ...newCajero, role: e.target.value, branchId: e.target.value === 'contador' ? '' : newCajero.branchId })}
                className="w-full bg-[var(--surface-0)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]">
                <option value="vendedor">Vendedor</option>
                <option value="operario">Operario</option>
                <option value="contador">Contador</option>
              </select>
            </div>
            {newCajero.role !== 'contador' ? (
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Sucursal *</label>
                <select value={newCajero.branchId} onChange={e => setNewCajero({ ...newCajero, branchId: e.target.value })}
                  className="w-full bg-[var(--surface-0)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]">
                  <option value="">Selecciona una sucursal</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">El contador es a nivel empresa, no necesita sucursal.</p>
            )}
            <div>
              <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Teléfono</label>
              <input type="tel" value={newCajero.phone} onChange={e => setNewCajero({ ...newCajero, phone: e.target.value })}
                className="w-full bg-[var(--surface-0)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <p className="text-xs text-blue-300">La contraseña temporal se genera automáticamente y se envía por correo. También se muestra aquí al finalizar, por si el envío falla.</p>
            </div>
          </div>
        </Modal>
      )}

      {showAddGerente && (
        <Modal
          title="Crear usuario gerente"
          onClose={closeAddGerente}
          footer={
            <>
              <button onClick={closeAddGerente} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors">Cancelar</button>
              <button
                onClick={handleAddGerente}
                disabled={creatingGerente}
                className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-zinc-950 font-bold px-6 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {creatingGerente && <Loader size={14} className="animate-spin" />} Crear gerente
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Nombre completo *</label>
              <input type="text" value={newGerente.name} onChange={e => setNewGerente({ ...newGerente, name: e.target.value })}
                className="w-full bg-[var(--surface-0)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Correo electrónico *</label>
              <input type="email" value={newGerente.email} onChange={e => setNewGerente({ ...newGerente, email: e.target.value })}
                className="w-full bg-[var(--surface-0)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]" />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
