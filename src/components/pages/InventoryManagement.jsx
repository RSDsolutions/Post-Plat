import React, { useState, useEffect } from 'react';
import { Package, AlertTriangle, Edit2, Tag, Percent, X, Save, Info, Plus, Trash2, Loader, MapPin } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { createProduct, updateProduct, deleteProduct, getBillingConfig, fetchBranches, fetchProductStock, fetchProductStockAllBranches, upsertProductStock } from '../../lib/supabaseHelpers.js';
import Table from '../ui/Table.jsx';
import { formatUSD } from '../../lib/format.js';

const ALL_BRANCHES = 'all';

export default function InventoryManagement() {
  const { currentUser, showToast } = useStore();
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProduct, setNewProduct] = useState({
    code: '',
    name: '',
    category: '',
    quantity: 0,
    minStock: 10,
    costPrice: 0,
    salePrice: 0,
    priceIncludesVat: true,
    discount: 0,
    promotion: ''
  });
  const [taxRate, setTaxRate] = useState(12);

  const isAllBranches = selectedBranchId === ALL_BRANCHES;

  const loadProducts = async (branchId) => {
    try {
      const data = branchId === ALL_BRANCHES
        ? await fetchProductStockAllBranches(currentUser.company_id)
        : await fetchProductStock(currentUser.company_id, branchId);
      setProducts(data || []);
    } catch (error) {
      console.error('Error:', error);
      showToast('error', 'Error al cargar inventario');
    }
  };

  useEffect(() => {
    const loadInitial = async () => {
      try {
        const [branchList, billingConfig] = await Promise.all([
          fetchBranches(currentUser.company_id),
          getBillingConfig(currentUser.company_id)
        ]);
        setBranches(branchList);
        // Tax rate must match billing_configs - it's the same rate actually
        // submitted to the SRI (api/sri/submit-invoice.js) and used by the POS.
        setTaxRate(billingConfig.taxRate || 12);
        setSelectedBranchId(branchList[0]?.id || ALL_BRANCHES);
      } catch (error) {
        console.error('Error:', error);
        showToast('error', 'Error al cargar sucursales');
      }
    };

    if (currentUser?.company_id) loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  useEffect(() => {
    const load = async () => {
      if (!selectedBranchId) return;
      setLoading(true);
      await loadProducts(selectedBranchId);
      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  const categories = [...new Set(products.map(p => p.category))];
  const filtered = filterCategory === 'all' ? products : products.filter(p => p.category === filterCategory);
  const lowStock = filtered.filter(p => p.quantity <= p.min_stock);
  const totalValue = filtered.reduce((sum, p) => sum + (p.sale_price * p.quantity), 0);

  const openEdit = (product) => {
    setEditingProduct(product);
    setEditForm({
      costPrice: product.cost_price || 0,
      salePrice: product.sale_price,
      priceIncludesVat: product.price_includes_vat !== false,
      discount: product.discount || 0,
      promotion: product.promotion || '',
      quantity: product.quantity,
      minStock: product.min_stock
    });
  };

  const getPriceWithoutVat = (price, includesVat) => {
    if (!includesVat) return price;
    return price / (1 + taxRate / 100);
  };

  const getPriceWithVat = (price, includesVat) => {
    if (includesVat) return price;
    return price * (1 + taxRate / 100);
  };

  const handleAddProduct = async () => {
    if (isAllBranches) {
      showToast('error', 'Selecciona una sucursal específica para agregar productos');
      return;
    }
    if (!newProduct.code || !newProduct.name || !newProduct.category) {
      showToast('error', 'Completa los campos requeridos: Código, Nombre y Categoría');
      return;
    }

    if (parseFloat(newProduct.salePrice) <= 0) {
      showToast('error', 'El precio debe ser mayor a 0');
      return;
    }

    try {
      await createProduct({
        code: newProduct.code,
        name: newProduct.name,
        category: newProduct.category,
        company_id: currentUser.company_id,
        branchId: selectedBranchId,
        quantity: parseInt(newProduct.quantity) || 0,
        minStock: parseInt(newProduct.minStock) || 10,
        costPrice: parseFloat(newProduct.costPrice) || 0,
        salePrice: parseFloat(newProduct.salePrice),
        priceIncludesVat: newProduct.priceIncludesVat,
        discount: parseFloat(newProduct.discount) || 0,
        promotion: newProduct.promotion
      });

      showToast('success', `Producto "${newProduct.name}" agregado al inventario`);
      await loadProducts(selectedBranchId);

      setNewProduct({
        code: '',
        name: '',
        category: '',
        quantity: 0,
        minStock: 10,
        costPrice: 0,
        salePrice: 0,
        priceIncludesVat: true,
        discount: 0,
        promotion: ''
      });
      setShowAddModal(false);
    } catch (error) {
      console.error('Error creating product:', error);
      showToast('error', error.message || 'Error al crear producto');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingProduct) return;

    try {
      await updateProduct(editingProduct.id, {
        costPrice: parseFloat(editForm.costPrice) || 0,
        salePrice: parseFloat(editForm.salePrice),
        priceIncludesVat: editForm.priceIncludesVat,
        discount: parseFloat(editForm.discount),
        promotion: editForm.promotion
      });

      if (!isAllBranches) {
        await upsertProductStock({
          productId: editingProduct.id,
          branchId: selectedBranchId,
          quantity: parseInt(editForm.quantity),
          minStock: parseInt(editForm.minStock)
        });
      }

      await loadProducts(selectedBranchId);
      showToast('success', `Producto ${editingProduct.name} actualizado`);
      setEditingProduct(null);
    } catch (error) {
      console.error('Error updating product:', error);
      showToast('error', error.message || 'Error al actualizar producto');
    }
  };

  const getDiscountedPrice = (price, discount) => {
    return price - (price * discount / 100);
  };

  const handleDeleteProduct = async (productId, productName) => {
    if (window.confirm(`¿Eliminar producto "${productName}"? Esto lo elimina de todas las sucursales.`)) {
      try {
        await deleteProduct(productId);
        await loadProducts(selectedBranchId);
        showToast('success', `Producto ${productName} eliminado`);
      } catch (error) {
        console.error('Error deleting product:', error);
        showToast('error', 'Error al eliminar producto');
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-zinc-100">Gestión de Inventario</h1>

      {/* Branch selector */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-wrap items-center gap-2">
        <MapPin size={16} className="text-zinc-500 flex-shrink-0" />
        <button
          onClick={() => setSelectedBranchId(ALL_BRANCHES)}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
            isAllBranches ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent'
          }`}
        >
          Todas las sucursales
        </button>
        {branches.map(b => (
          <button
            key={b.id}
            onClick={() => setSelectedBranchId(b.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              selectedBranchId === b.id ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent'
            }`}
          >
            {b.name}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-500">Total Productos</div>
          <div className="text-3xl font-bold text-zinc-100">{filtered.length}</div>
        </div>
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-500">Stock Total {isAllBranches && '(todas)'}</div>
          <div className="text-3xl font-bold text-emerald-400">{filtered.reduce((sum, p) => sum + p.quantity, 0)}</div>
        </div>
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-500">Valor Inventario</div>
          <div className="text-3xl font-bold text-blue-400">{formatUSD(totalValue)}</div>
        </div>
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-500">Stock Bajo</div>
          <div className="text-3xl font-bold text-amber-400">{lowStock.length}</div>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-500 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-amber-500">{lowStock.length} Producto(s) con Stock Bajo</h3>
              <p className="text-sm text-amber-400">Requieren reorden urgente</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter & Actions */}
      <div className="flex gap-2 flex-col sm:flex-row">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100"
        >
          <option value="all">Todas las categorías</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <button
          onClick={() => isAllBranches ? showToast('warning', 'Selecciona una sucursal específica para agregar productos') : setShowAddModal(true)}
          disabled={isAllBranches}
          title={isAllBranches ? 'Selecciona una sucursal específica primero' : ''}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus size={20} />
          Agregar Producto
        </button>
      </div>

      {/* Products Table */}
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
        {!loading ? (
          <Table
            columns={['Código', 'Producto', 'Categoría', 'Stock', 'Precio', 'Descuento', 'Promoción', 'Editar', 'Eliminar']}
            data={filtered}
            renderRow={(product) => {
              const isLowStock = product.quantity <= product.min_stock;
              const discount = product.discount || 0;
              const finalPrice = getDiscountedPrice(product.sale_price, discount);
              return (
                <tr key={product.id} className="hover:bg-zinc-800/50">
                  <td className="px-4 py-3 font-mono text-sm text-zinc-400">{product.code}</td>
                  <td className="px-4 py-3 font-bold text-zinc-100">{product.name}</td>
                  <td className="px-4 py-3 text-sm text-zinc-400">{product.category}</td>
                  <td className="px-4 py-3">
                    <div className={`font-bold ${isLowStock ? 'text-amber-400' : 'text-zinc-100'}`}>{product.quantity}</div>
                    <div className="text-xs text-zinc-500">Mín: {product.min_stock}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-zinc-100">{formatUSD(product.sale_price)}</div>
                    {discount > 0 && (
                      <div className="text-xs text-emerald-400 font-bold">{formatUSD(finalPrice)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {discount > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs font-bold">
                        <Percent size={14} />
                        {discount}%
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500">Sin descuento</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {product.promotion ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-pink-500/20 text-pink-400 rounded text-xs font-bold truncate max-w-32">
                        <Tag size={14} />
                        {product.promotion}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500">Sin promoción</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openEdit(product)}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition-colors"
                    >
                      <Edit2 size={14} />
                      Editar
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDeleteProduct(product.id, product.name)}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold transition-colors"
                    >
                      <Trash2 size={14} />
                      Eliminar
                    </button>
                  </td>
                </tr>
              );
            }}
          />
        ) : (
          <div className="p-8 text-center text-zinc-500">Cargando...</div>
        )}
      </div>

      {/* Edit Modal */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-zinc-100">Editar Producto</h2>
              <button
                onClick={() => setEditingProduct(null)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {/* Product Info */}
              <div className="p-4 bg-zinc-950/50 rounded-lg border border-zinc-800">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-bold text-zinc-500 mb-1">Nombre</div>
                    <div className="font-bold text-zinc-100">{editingProduct.name}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-zinc-500 mb-1">Código</div>
                    <div className="font-mono text-zinc-100">{editingProduct.code}</div>
                  </div>
                </div>
              </div>

              {/* Stock Management */}
              <div className="space-y-3">
                <h3 className="font-bold text-zinc-300 flex items-center gap-2">
                  <MapPin size={16} />
                  Stock {isAllBranches ? '' : `- ${branches.find(b => b.id === selectedBranchId)?.name || ''}`}
                </h3>
                {isAllBranches ? (
                  <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                    Estás viendo "Todas las sucursales". Selecciona una sucursal específica arriba para editar su stock.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 mb-2">Cantidad Actual</label>
                      <input
                        type="number"
                        min="0"
                        value={editForm.quantity}
                        onChange={(e) => setEditForm({...editForm, quantity: e.target.value})}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 mb-2">Stock Mínimo</label>
                      <input
                        type="number"
                        min="0"
                        value={editForm.minStock}
                        onChange={(e) => setEditForm({...editForm, minStock: e.target.value})}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Pricing */}
              <div className="space-y-3">
                <h3 className="font-bold text-zinc-300">Precio</h3>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Precio de Costo ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.costPrice}
                    onChange={(e) => setEditForm({...editForm, costPrice: e.target.value})}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                  />
                  <p className="text-xs text-zinc-500 mt-1">Lo que te cuesta a ti adquirir el producto (para calcular margen)</p>
                </div>

                {/* Price Includes VAT Toggle */}
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Info size={16} className="text-blue-400" />
                    <label className="text-xs font-bold text-blue-400">¿El precio incluye IVA?</label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditForm({...editForm, priceIncludesVat: true})}
                      className={`flex-1 py-2 px-3 rounded font-bold text-sm transition-all ${
                        editForm.priceIncludesVat
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      Sí, incluye IVA
                    </button>
                    <button
                      onClick={() => setEditForm({...editForm, priceIncludesVat: false})}
                      className={`flex-1 py-2 px-3 rounded font-bold text-sm transition-all ${
                        !editForm.priceIncludesVat
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      No, sin IVA
                    </button>
                  </div>
                  <p className="text-xs text-blue-300 mt-2">
                    {editForm.priceIncludesVat
                      ? `El precio ingresado ya contiene el IVA del ${taxRate}%`
                      : `El IVA del ${taxRate}% se agregará al precio ingresado`}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">
                    {editForm.priceIncludesVat ? 'Precio Final (con IVA)' : 'Precio Base (sin IVA)'} ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.salePrice}
                    onChange={(e) => setEditForm({...editForm, salePrice: e.target.value})}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                  />
                </div>

                {/* Price Preview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-zinc-950/50 rounded border border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-500 font-bold">Precio sin IVA</div>
                    <div className="text-lg font-bold text-zinc-100">
                      {formatUSD(getPriceWithoutVat(parseFloat(editForm.salePrice) || 0, editForm.priceIncludesVat))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 font-bold">Precio con IVA ({taxRate}%)</div>
                    <div className="text-lg font-bold text-emerald-400">
                      {formatUSD(getPriceWithVat(parseFloat(editForm.salePrice) || 0, editForm.priceIncludesVat))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Discount */}
              <div className="space-y-3">
                <h3 className="font-bold text-zinc-300 flex items-center gap-2">
                  <Percent size={18} />
                  Descuento
                </h3>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Porcentaje de Descuento (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={editForm.discount}
                    onChange={(e) => setEditForm({...editForm, discount: e.target.value})}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                  />
                  {editForm.discount > 0 && (
                    <div className="mt-2 p-2 bg-emerald-500/10 border border-emerald-500/30 rounded text-sm text-emerald-400">
                      Precio con descuento: <span className="font-bold">{formatUSD(getDiscountedPrice(parseFloat(editForm.salePrice), parseFloat(editForm.discount)))}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Promotion */}
              <div className="space-y-3">
                <h3 className="font-bold text-zinc-300 flex items-center gap-2">
                  <Tag size={18} />
                  Promoción
                </h3>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Descripción de Promoción</label>
                  <input
                    type="text"
                    placeholder="Ej: Compre 2 y lleve 3, Black Friday, etc"
                    value={editForm.promotion}
                    onChange={(e) => setEditForm({...editForm, promotion: e.target.value})}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                  />
                  <p className="text-xs text-zinc-500 mt-1">Ej: "Compre 2 lleve 3", "Black Friday 50%", "Promoción Flash"</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 border-t border-zinc-800 pt-4">
              <button
                onClick={() => setEditingProduct(null)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Save size={18} />
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-zinc-100">Agregar Nuevo Producto</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X size={24} />
              </button>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4 flex items-center gap-2">
              <MapPin size={16} className="text-blue-400 flex-shrink-0" />
              <p className="text-xs text-blue-300">
                Se agregará a <span className="font-bold">{branches.find(b => b.id === selectedBranchId)?.name}</span> con la cantidad inicial indicada. Otras sucursales lo verán con stock 0 hasta que ajustes su inventario ahí.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              {/* Basic Info */}
              <div className="space-y-3">
                <h3 className="font-bold text-zinc-300">Información Básica</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">Código (Requerido)</label>
                    <input
                      type="text"
                      placeholder="SKU-001"
                      value={newProduct.code}
                      onChange={(e) => setNewProduct({...newProduct, code: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">Nombre (Requerido)</label>
                    <input
                      type="text"
                      placeholder="Nombre del producto"
                      value={newProduct.name}
                      onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Categoría (Requerido)</label>
                  <input
                    type="text"
                    placeholder="Ej: Electrónica, Ropa, Alimentos..."
                    value={newProduct.category}
                    onChange={(e) => setNewProduct({...newProduct, category: e.target.value})}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                  />
                </div>
              </div>

              {/* Stock Management */}
              <div className="space-y-3">
                <h3 className="font-bold text-zinc-300">Stock</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">Cantidad Inicial</label>
                    <input
                      type="number"
                      min="0"
                      value={newProduct.quantity}
                      onChange={(e) => setNewProduct({...newProduct, quantity: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">Stock Mínimo</label>
                    <input
                      type="number"
                      min="1"
                      value={newProduct.minStock}
                      onChange={(e) => setNewProduct({...newProduct, minStock: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div className="space-y-3">
                <h3 className="font-bold text-zinc-300">Precio</h3>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Precio de Costo ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newProduct.costPrice}
                    onChange={(e) => setNewProduct({...newProduct, costPrice: e.target.value})}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                  />
                  <p className="text-xs text-zinc-500 mt-1">Lo que te cuesta a ti adquirir el producto (para calcular margen)</p>
                </div>

                {/* Price Includes VAT Toggle */}
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Info size={16} className="text-blue-400" />
                    <label className="text-xs font-bold text-blue-400">¿El precio incluye IVA?</label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setNewProduct({...newProduct, priceIncludesVat: true})}
                      className={`flex-1 py-2 px-3 rounded font-bold text-sm transition-all ${
                        newProduct.priceIncludesVat
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      Sí, incluye IVA
                    </button>
                    <button
                      onClick={() => setNewProduct({...newProduct, priceIncludesVat: false})}
                      className={`flex-1 py-2 px-3 rounded font-bold text-sm transition-all ${
                        !newProduct.priceIncludesVat
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      No, sin IVA
                    </button>
                  </div>
                  <p className="text-xs text-blue-300 mt-2">
                    {newProduct.priceIncludesVat
                      ? `El precio ingresado ya contiene el IVA del ${taxRate}%`
                      : `El IVA del ${taxRate}% se agregará al precio ingresado`}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">
                    {newProduct.priceIncludesVat ? 'Precio Final (con IVA)' : 'Precio Base (sin IVA)'} ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newProduct.salePrice}
                    onChange={(e) => setNewProduct({...newProduct, salePrice: e.target.value})}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                  />
                </div>

                {/* Price Preview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-zinc-950/50 rounded border border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-500 font-bold">Precio sin IVA</div>
                    <div className="text-lg font-bold text-zinc-100">
                      {formatUSD(getPriceWithoutVat(parseFloat(newProduct.salePrice) || 0, newProduct.priceIncludesVat))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 font-bold">Precio con IVA ({taxRate}%)</div>
                    <div className="text-lg font-bold text-emerald-400">
                      {formatUSD(getPriceWithVat(parseFloat(newProduct.salePrice) || 0, newProduct.priceIncludesVat))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Discount */}
              <div className="space-y-3">
                <h3 className="font-bold text-zinc-300 flex items-center gap-2">
                  <Percent size={18} />
                  Descuento (Opcional)
                </h3>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Porcentaje de Descuento (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={newProduct.discount}
                    onChange={(e) => setNewProduct({...newProduct, discount: e.target.value})}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                  />
                  {parseFloat(newProduct.discount) > 0 && (
                    <div className="mt-2 p-2 bg-emerald-500/10 border border-emerald-500/30 rounded text-sm text-emerald-400">
                      Precio con descuento: <span className="font-bold">{formatUSD(getDiscountedPrice(parseFloat(newProduct.salePrice), parseFloat(newProduct.discount)))}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Promotion */}
              <div className="space-y-3">
                <h3 className="font-bold text-zinc-300 flex items-center gap-2">
                  <Tag size={18} />
                  Promoción (Opcional)
                </h3>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Descripción de Promoción</label>
                  <input
                    type="text"
                    placeholder="Ej: Compre 2 y lleve 3, Black Friday, etc"
                    value={newProduct.promotion}
                    onChange={(e) => setNewProduct({...newProduct, promotion: e.target.value})}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                  />
                  <p className="text-xs text-zinc-500 mt-1">Ej: "Compre 2 lleve 3", "Black Friday 50%", "Promoción Flash"</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 border-t border-zinc-800 pt-4">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddProduct}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={18} />
                Agregar Producto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
