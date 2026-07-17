import React, { useState, useEffect } from 'react';
import { Truck, Edit2, X, Save, Plus, Search } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchSuppliers, createSupplier, updateSupplier } from '../../lib/supabaseHelpers.js';
import Table from '../ui/Table.jsx';

const TIPO_CONTRIBUYENTE_LABELS = {
  persona_natural: 'Persona Natural',
  sociedad: 'Sociedad',
  rimpe: 'RIMPE'
};

const EMPTY_FORM = { ruc: '', razon_social: '', nombre_comercial: '', direccion: '', telefono: '', email: '', tipo_contribuyente: 'sociedad', es_parte_relacionada: false };

export default function SupplierManagement() {
  const { currentUser, showToast, can } = useStore();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState(EMPTY_FORM);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  const loadSuppliers = async () => {
    try {
      const data = await fetchSuppliers(currentUser.company_id);
      setSuppliers(data);
    } catch (error) {
      console.error('Error:', error);
      showToast('error', 'Error al cargar proveedores');
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await loadSuppliers();
      setLoading(false);
    };
    if (currentUser?.company_id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.company_id]);

  const filtered = suppliers.filter(s => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return s.ruc.toLowerCase().includes(term)
      || s.razon_social.toLowerCase().includes(term)
      || (s.nombre_comercial || '').toLowerCase().includes(term);
  });

  const openEdit = (supplier) => {
    setEditingSupplier(supplier);
    setEditForm({
      ruc: supplier.ruc,
      razon_social: supplier.razon_social,
      nombre_comercial: supplier.nombre_comercial || '',
      direccion: supplier.direccion || '',
      telefono: supplier.telefono || '',
      email: supplier.email || '',
      tipo_contribuyente: supplier.tipo_contribuyente,
      es_parte_relacionada: supplier.es_parte_relacionada || false,
      is_active: supplier.is_active
    });
  };

  const handleAddSupplier = async () => {
    if (!newSupplier.ruc.trim() || !newSupplier.razon_social.trim()) {
      showToast('error', 'Completa los campos requeridos: RUC y Razón Social');
      return;
    }
    try {
      await createSupplier({ company_id: currentUser.company_id, ...newSupplier });
      showToast('success', `Proveedor "${newSupplier.razon_social}" agregado`);
      await loadSuppliers();
      setNewSupplier(EMPTY_FORM);
      setShowAddModal(false);
    } catch (error) {
      console.error('Error creating supplier:', error);
      showToast('error', error.message || 'Error al crear proveedor');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingSupplier) return;
    if (!editForm.razon_social.trim()) {
      showToast('error', 'La razón social es requerida');
      return;
    }
    try {
      await updateSupplier(editingSupplier.id, editForm);
      showToast('success', `Proveedor ${editForm.razon_social} actualizado`);
      await loadSuppliers();
      setEditingSupplier(null);
    } catch (error) {
      console.error('Error updating supplier:', error);
      showToast('error', error.message || 'Error al actualizar proveedor');
    }
  };

  if (!can('suppliers.read')) return null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-panel-text">Proveedores</h1>

      {/* Search & Actions */}
      <div className="flex gap-2 flex-col sm:flex-row">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-panel-text-muted" />
          <input
            type="text"
            placeholder="Buscar por RUC o razón social..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-panel-surface border border-panel-border rounded-lg text-panel-text placeholder-panel-text-muted"
          />
        </div>
        {can('suppliers.write') && (
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus size={20} />
            Agregar Proveedor
          </button>
        )}
      </div>

      {/* Suppliers Table */}
      <div className="bg-panel-surface rounded-2xl border border-panel-border overflow-hidden">
        {!loading ? (
          filtered.length === 0 ? (
            <div className="p-8 text-center text-panel-text-muted flex flex-col items-center gap-2">
              <Truck size={32} className="opacity-50" />
              {suppliers.length === 0 ? 'Todavía no hay proveedores registrados' : 'Ningún proveedor coincide con la búsqueda'}
            </div>
          ) : (
            <Table
              columns={['RUC', 'Razón Social', 'Nombre Comercial', 'Tipo', 'Teléfono', 'Email', 'Estado', 'Editar']}
              data={filtered}
              renderRow={(supplier) => (
                <tr key={supplier.id} className="hover:bg-panel-surface-2">
                  <td className="px-4 py-3 font-mono text-sm text-panel-text-muted">{supplier.ruc}</td>
                  <td className="px-4 py-3 font-bold text-panel-text">{supplier.razon_social}</td>
                  <td className="px-4 py-3 text-sm text-panel-text-muted">{supplier.nombre_comercial || '-'}</td>
                  <td className="px-4 py-3 text-sm text-panel-text-muted">{TIPO_CONTRIBUYENTE_LABELS[supplier.tipo_contribuyente] || supplier.tipo_contribuyente}</td>
                  <td className="px-4 py-3 text-sm text-panel-text-muted">{supplier.telefono || '-'}</td>
                  <td className="px-4 py-3 text-sm text-panel-text-muted">{supplier.email || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${supplier.is_active ? 'bg-panel-success/10 text-panel-success' : 'bg-panel-danger/10 text-panel-danger'}`}>
                      {supplier.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {can('suppliers.write') && (
                      <button
                        onClick={() => openEdit(supplier)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition-colors"
                      >
                        <Edit2 size={14} />
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              )}
            />
          )
        ) : (
          <div className="p-8 text-center text-panel-text-muted">Cargando...</div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-panel-surface border border-panel-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-panel-text">Agregar Proveedor</h2>
              <button onClick={() => setShowAddModal(false)} className="text-panel-text-muted hover:text-panel-text">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-2">RUC (Requerido)</label>
                  <input
                    type="text"
                    placeholder="1790012345001"
                    value={newSupplier.ruc}
                    onChange={(e) => setNewSupplier({ ...newSupplier, ruc: e.target.value })}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-2">Tipo de Contribuyente</label>
                  <select
                    value={newSupplier.tipo_contribuyente}
                    onChange={(e) => setNewSupplier({ ...newSupplier, tipo_contribuyente: e.target.value })}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                  >
                    <option value="persona_natural">Persona Natural</option>
                    <option value="sociedad">Sociedad</option>
                    <option value="rimpe">RIMPE</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-panel-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={newSupplier.es_parte_relacionada}
                  onChange={(e) => setNewSupplier({ ...newSupplier, es_parte_relacionada: e.target.checked })}
                  className="rounded border-panel-border"
                />
                Es parte relacionada (para fines tributarios)
              </label>
              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-2">Razón Social (Requerido)</label>
                <input
                  type="text"
                  placeholder="Nombre legal del proveedor"
                  value={newSupplier.razon_social}
                  onChange={(e) => setNewSupplier({ ...newSupplier, razon_social: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-2">Nombre Comercial</label>
                <input
                  type="text"
                  placeholder="Nombre con el que opera (opcional)"
                  value={newSupplier.nombre_comercial}
                  onChange={(e) => setNewSupplier({ ...newSupplier, nombre_comercial: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-2">Dirección</label>
                <input
                  type="text"
                  value={newSupplier.direccion}
                  onChange={(e) => setNewSupplier({ ...newSupplier, direccion: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-2">Teléfono</label>
                  <input
                    type="text"
                    value={newSupplier.telefono}
                    onChange={(e) => setNewSupplier({ ...newSupplier, telefono: e.target.value })}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-2">Email</label>
                  <input
                    type="email"
                    value={newSupplier.email}
                    onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t border-panel-border pt-4">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 bg-panel-surface-2 hover:bg-panel-text/10 text-panel-text font-bold py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddSupplier}
                className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={18} />
                Agregar Proveedor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingSupplier && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-panel-surface border border-panel-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-panel-text">Editar Proveedor</h2>
              <button onClick={() => setEditingSupplier(null)} className="text-panel-text-muted hover:text-panel-text">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="p-4 bg-panel-bg/50 rounded-lg border border-panel-border">
                <div className="text-xs font-bold text-panel-text-muted mb-1">RUC</div>
                <div className="font-mono text-panel-text">{editForm.ruc}</div>
              </div>

              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-2">Tipo de Contribuyente</label>
                <select
                  value={editForm.tipo_contribuyente}
                  onChange={(e) => setEditForm({ ...editForm, tipo_contribuyente: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                >
                  <option value="persona_natural">Persona Natural</option>
                  <option value="sociedad">Sociedad</option>
                  <option value="rimpe">RIMPE</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-panel-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.es_parte_relacionada}
                  onChange={(e) => setEditForm({ ...editForm, es_parte_relacionada: e.target.checked })}
                  className="rounded border-panel-border"
                />
                Es parte relacionada (para fines tributarios)
              </label>
              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-2">Razón Social</label>
                <input
                  type="text"
                  value={editForm.razon_social}
                  onChange={(e) => setEditForm({ ...editForm, razon_social: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-2">Nombre Comercial</label>
                <input
                  type="text"
                  value={editForm.nombre_comercial}
                  onChange={(e) => setEditForm({ ...editForm, nombre_comercial: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-2">Dirección</label>
                <input
                  type="text"
                  value={editForm.direccion}
                  onChange={(e) => setEditForm({ ...editForm, direccion: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-2">Teléfono</label>
                  <input
                    type="text"
                    value={editForm.telefono}
                    onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-2">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                  />
                </div>
              </div>

              {/* Baja / reactivación */}
              <div className="bg-panel-accent/10 border border-panel-accent/30 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-panel-accent-soft">Estado del proveedor</div>
                    <div className="text-xs text-panel-text-muted mt-1">Un proveedor inactivo no aparece al registrar nuevas compras</div>
                  </div>
                  <button
                    onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
                    className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                      editForm.is_active
                        ? 'bg-panel-accent text-panel-accent-text'
                        : 'bg-panel-surface-2 text-panel-text-muted hover:bg-panel-text/10'
                    }`}
                  >
                    {editForm.is_active ? 'Activo' : 'Inactivo'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t border-panel-border pt-4">
              <button
                onClick={() => setEditingSupplier(null)}
                className="flex-1 bg-panel-surface-2 hover:bg-panel-text/10 text-panel-text font-bold py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Save size={18} />
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
