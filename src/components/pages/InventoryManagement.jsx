import React, { useState, useEffect } from 'react';
import { Package, AlertTriangle, Edit2, Tag, Percent, X, Save, Info, Plus, Trash2, Loader, MapPin, Lock } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { createProduct, updateProduct, deleteProduct, getBillingConfig, fetchBranches, fetchProductStock, fetchProductStockAllBranches, upsertProductStock, fetchCompanyFeatureOverrides } from '../../lib/supabaseHelpers.js';
import Table from '../ui/Table.jsx';
import { formatUSD } from '../../lib/format.js';
import { checkLimit, limitReachedMessage, hasFeature } from '../../lib/planLimits.js';

const ALL_BRANCHES = 'all';

export default function InventoryManagement() {
  const { currentUser, showToast, companies, plans, can } = useStore();
  const company = companies.find(c => c.id === currentUser?.company_id);
  const plan = plans.find(p => p.id === company?.planId);
  const [featureOverrides, setFeatureOverrides] = useState([]);
  const multiSucursalEnabled = hasFeature(plan, featureOverrides, 'inventario');
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
    if (currentUser?.company_id) {
      fetchCompanyFeatureOverrides(currentUser.company_id).then(setFeatureOverrides).catch(() => {});
    }
  }, [currentUser?.company_id]);

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
    const limitCheck = checkLimit('products', plan, products.length);
    if (!limitCheck.ok) {
      showToast('error', limitReachedMessage(limitCheck, plan?.name));
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
      <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-panel-text">Gestión de Inventario</h1>

      {/* Branch selector */}
      <div className="bg-panel-surface border border-panel-border rounded-2xl p-4 flex flex-wrap items-center gap-2">
        <MapPin size={16} className="text-panel-text-muted flex-shrink-0" />
        <button
          onClick={() => multiSucursalEnabled ? setSelectedBranchId(ALL_BRANCHES) : showToast('warning', 'La vista de inventario multi-sucursal no está incluida en tu plan')}
          title={multiSucursalEnabled ? '' : 'No incluido en tu plan'}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
            isAllBranches ? 'bg-panel-accent/20 text-panel-accent-soft border border-panel-accent/40' : multiSucursalEnabled ? 'text-panel-text-muted hover:text-panel-text hover:bg-panel-text/10 border border-transparent' : 'text-panel-text-muted/60 border border-transparent cursor-not-allowed'
          }`}
        >
          Todas las sucursales {!multiSucursalEnabled && <Lock size={11} className="inline ml-1 -mt-0.5" />}
        </button>
        {branches.map(b => (
          <button
            key={b.id}
            onClick={() => setSelectedBranchId(b.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              selectedBranchId === b.id ? 'bg-panel-accent/20 text-panel-accent-soft border border-panel-accent/40' : 'text-panel-text-muted hover:text-panel-text hover:bg-panel-text/10 border border-transparent'
            }`}
          >
            {b.name}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-panel-surface rounded-xl border border-panel-border p-4">
          <div className="text-sm text-panel-text-muted">Total Productos</div>
          <div className="text-3xl font-bold text-panel-text">{filtered.length}</div>
        </div>
        <div className="bg-panel-surface rounded-xl border border-panel-border p-4">
          <div className="text-sm text-panel-text-muted">Stock Total {isAllBranches && '(todas)'}</div>
          <div className="text-3xl font-bold text-panel-success">{filtered.reduce((sum, p) => sum + p.quantity, 0)}</div>
        </div>
        <div className="bg-panel-surface rounded-xl border border-panel-border p-4">
          <div className="text-sm text-panel-text-muted">Valor Inventario</div>
          <div className="text-3xl font-bold text-panel-accent-soft">{formatUSD(totalValue)}</div>
        </div>
        <div className="bg-panel-surface rounded-xl border border-panel-border p-4">
          <div className="text-sm text-panel-text-muted">Stock Bajo</div>
          <div className="text-3xl font-bold text-panel-warning">{lowStock.length}</div>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <div className="bg-panel-warning/10 border border-panel-warning/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-panel-warning flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-panel-warning">{lowStock.length} Producto(s) con Stock Bajo</h3>
              <p className="text-sm text-panel-warning">Requieren reorden urgente</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter & Actions */}
      <div className="flex gap-2 flex-col sm:flex-row">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-panel-surface border border-panel-border rounded-lg px-4 py-2 text-panel-text"
        >
          <option value="all">Todas las categorías</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        {can('products.write') && (
          <button
            onClick={() => isAllBranches ? showToast('warning', 'Selecciona una sucursal específica para agregar productos') : setShowAddModal(true)}
            disabled={isAllBranches}
            title={isAllBranches ? 'Selecciona una sucursal específica primero' : ''}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus size={20} />
            Agregar Producto
          </button>
        )}
      </div>

      {/* Products Table */}
      <div className="bg-panel-surface rounded-2xl border border-panel-border overflow-hidden">
        {!loading ? (
          <Table
            columns={['Código', 'Producto', 'Categoría', 'Stock', 'Precio', 'Descuento', 'Promoción', 'Editar', 'Eliminar']}
            data={filtered}
            renderRow={(product) => {
              const isLowStock = product.quantity <= product.min_stock;
              const discount = product.discount || 0;
              const finalPrice = getDiscountedPrice(product.sale_price, discount);
              return (
                <tr key={product.id} className="hover:bg-panel-surface-2">
                  <td className="px-4 py-3 font-mono text-sm text-panel-text-muted">{product.code}</td>
                  <td className="px-4 py-3 font-bold text-panel-text">{product.name}</td>
                  <td className="px-4 py-3 text-sm text-panel-text-muted">{product.category}</td>
                  <td className="px-4 py-3">
                    <div className={`font-bold ${isLowStock ? 'text-panel-warning' : 'text-panel-text'}`}>{product.quantity}</div>
                    <div className="text-xs text-panel-text-muted">Mín: {product.min_stock}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-panel-text">{formatUSD(product.sale_price)}</div>
                    {discount > 0 && (
                      <div className="text-xs text-panel-success font-bold">{formatUSD(finalPrice)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {discount > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-panel-success/20 text-panel-success rounded text-xs font-bold">
                        <Percent size={14} />
                        {discount}%
                      </span>
                    ) : (
                      <span className="text-xs text-panel-text-muted">Sin descuento</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {product.promotion ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--kpi-pink)]/20 text-[var(--kpi-pink)] rounded text-xs font-bold truncate max-w-32">
                        <Tag size={14} />
                        {product.promotion}
                      </span>
                    ) : (
                      <span className="text-xs text-panel-text-muted">Sin promoción</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {can('products.write') && (
                      <button
                        onClick={() => openEdit(product)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition-colors"
                      >
                        <Edit2 size={14} />
                        Editar
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {can('products.write') && (
                      <button
                        onClick={() => handleDeleteProduct(product.id, product.name)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold transition-colors"
                      >
                        <Trash2 size={14} />
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              );
            }}
          />
        ) : (
          <div className="p-8 text-center text-panel-text-muted">Cargando...</div>
        )}
      </div>

      {/* Edit Modal */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-panel-surface border border-panel-border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-panel-text">Editar Producto</h2>
              <button
                onClick={() => setEditingProduct(null)}
                className="text-panel-text-muted hover:text-panel-text"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {/* Product Info */}
              <div className="p-4 bg-panel-bg/50 rounded-lg border border-panel-border">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-bold text-panel-text-muted mb-1">Nombre</div>
                    <div className="font-bold text-panel-text">{editingProduct.name}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-panel-text-muted mb-1">Código</div>
                    <div className="font-mono text-panel-text">{editingProduct.code}</div>
                  </div>
                </div>
              </div>

              {/* Stock Management */}
              <div className="space-y-3">
                <h3 className="font-bold text-panel-text-muted flex items-center gap-2">
                  <MapPin size={16} />
                  Stock {isAllBranches ? '' : `- ${branches.find(b => b.id === selectedBranchId)?.name || ''}`}
                </h3>
                {isAllBranches ? (
                  <p className="text-xs text-panel-warning bg-panel-warning/10 border border-panel-warning/30 rounded-lg p-3">
                    Estás viendo "Todas las sucursales". Selecciona una sucursal específica arriba para editar su stock.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-panel-text-muted mb-2">Cantidad Actual</label>
                      <input
                        type="number"
                        min="0"
                        value={editForm.quantity}
                        onChange={(e) => setEditForm({...editForm, quantity: e.target.value})}
                        className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-panel-text-muted mb-2">Stock Mínimo</label>
                      <input
                        type="number"
                        min="0"
                        value={editForm.minStock}
                        onChange={(e) => setEditForm({...editForm, minStock: e.target.value})}
                        className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Pricing */}
              <div className="space-y-3">
                <h3 className="font-bold text-panel-text-muted">Precio</h3>

                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-2">Precio de Costo ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.costPrice}
                    onChange={(e) => setEditForm({...editForm, costPrice: e.target.value})}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                  />
                  <p className="text-xs text-panel-text-muted mt-1">Lo que te cuesta a ti adquirir el producto (para calcular margen)</p>
                </div>

                {/* Price Includes VAT Toggle */}
                <div className="bg-panel-accent/10 border border-panel-accent/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Info size={16} className="text-panel-accent-soft" />
                    <label className="text-xs font-bold text-panel-accent-soft">¿El precio incluye IVA?</label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditForm({...editForm, priceIncludesVat: true})}
                      className={`flex-1 py-2 px-3 rounded font-bold text-sm transition-all ${
                        editForm.priceIncludesVat
                          ? 'bg-panel-accent text-panel-accent-text'
                          : 'bg-panel-surface-2 text-panel-text-muted hover:bg-panel-text/10'
                      }`}
                    >
                      Sí, incluye IVA
                    </button>
                    <button
                      onClick={() => setEditForm({...editForm, priceIncludesVat: false})}
                      className={`flex-1 py-2 px-3 rounded font-bold text-sm transition-all ${
                        !editForm.priceIncludesVat
                          ? 'bg-panel-accent text-panel-accent-text'
                          : 'bg-panel-surface-2 text-panel-text-muted hover:bg-panel-text/10'
                      }`}
                    >
                      No, sin IVA
                    </button>
                  </div>
                  <p className="text-xs text-panel-accent-soft mt-2">
                    {editForm.priceIncludesVat
                      ? `El precio ingresado ya contiene el IVA del ${taxRate}%`
                      : `El IVA del ${taxRate}% se agregará al precio ingresado`}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-2">
                    {editForm.priceIncludesVat ? 'Precio Final (con IVA)' : 'Precio Base (sin IVA)'} ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.salePrice}
                    onChange={(e) => setEditForm({...editForm, salePrice: e.target.value})}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                  />
                </div>

                {/* Price Preview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-panel-bg/50 rounded border border-panel-border">
                  <div>
                    <div className="text-xs text-panel-text-muted font-bold">Precio sin IVA</div>
                    <div className="text-lg font-bold text-panel-text">
                      {formatUSD(getPriceWithoutVat(parseFloat(editForm.salePrice) || 0, editForm.priceIncludesVat))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-panel-text-muted font-bold">Precio con IVA ({taxRate}%)</div>
                    <div className="text-lg font-bold text-panel-success">
                      {formatUSD(getPriceWithVat(parseFloat(editForm.salePrice) || 0, editForm.priceIncludesVat))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Discount */}
              <div className="space-y-3">
                <h3 className="font-bold text-panel-text-muted flex items-center gap-2">
                  <Percent size={18} />
                  Descuento
                </h3>
                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-2">Porcentaje de Descuento (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={editForm.discount}
                    onChange={(e) => setEditForm({...editForm, discount: e.target.value})}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                  />
                  {editForm.discount > 0 && (
                    <div className="mt-2 p-2 bg-panel-success/10 border border-panel-success/30 rounded text-sm text-panel-success">
                      Precio con descuento: <span className="font-bold">{formatUSD(getDiscountedPrice(parseFloat(editForm.salePrice), parseFloat(editForm.discount)))}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Promotion */}
              <div className="space-y-3">
                <h3 className="font-bold text-panel-text-muted flex items-center gap-2">
                  <Tag size={18} />
                  Promoción
                </h3>
                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-2">Descripción de Promoción</label>
                  <input
                    type="text"
                    placeholder="Ej: Compre 2 y lleve 3, Black Friday, etc"
                    value={editForm.promotion}
                    onChange={(e) => setEditForm({...editForm, promotion: e.target.value})}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
                  />
                  <p className="text-xs text-panel-text-muted mt-1">Ej: "Compre 2 lleve 3", "Black Friday 50%", "Promoción Flash"</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 border-t border-panel-border pt-4">
              <button
                onClick={() => setEditingProduct(null)}
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

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-panel-surface border border-panel-border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-panel-text">Agregar Nuevo Producto</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-panel-text-muted hover:text-panel-text"
              >
                <X size={24} />
              </button>
            </div>

            <div className="bg-panel-accent/10 border border-panel-accent/30 rounded-lg p-3 mb-4 flex items-center gap-2">
              <MapPin size={16} className="text-panel-accent-soft flex-shrink-0" />
              <p className="text-xs text-panel-accent-soft">
                Se agregará a <span className="font-bold">{branches.find(b => b.id === selectedBranchId)?.name}</span> con la cantidad inicial indicada. Otras sucursales lo verán con stock 0 hasta que ajustes su inventario ahí.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              {/* Basic Info */}
              <div className="space-y-3">
                <h3 className="font-bold text-panel-text-muted">Información Básica</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-panel-text-muted mb-2">Código (Requerido)</label>
                    <input
                      type="text"
                      placeholder="SKU-001"
                      value={newProduct.code}
                      onChange={(e) => setNewProduct({...newProduct, code: e.target.value})}
                      className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-panel-text-muted mb-2">Nombre (Requerido)</label>
                    <input
                      type="text"
                      placeholder="Nombre del producto"
                      value={newProduct.name}
                      onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                      className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-2">Categoría (Requerido)</label>
                  <input
                    type="text"
                    placeholder="Ej: Electrónica, Ropa, Alimentos..."
                    value={newProduct.category}
                    onChange={(e) => setNewProduct({...newProduct, category: e.target.value})}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
                  />
                </div>
              </div>

              {/* Stock Management */}
              <div className="space-y-3">
                <h3 className="font-bold text-panel-text-muted">Stock</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-panel-text-muted mb-2">Cantidad Inicial</label>
                    <input
                      type="number"
                      min="0"
                      value={newProduct.quantity}
                      onChange={(e) => setNewProduct({...newProduct, quantity: e.target.value})}
                      className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-panel-text-muted mb-2">Stock Mínimo</label>
                    <input
                      type="number"
                      min="1"
                      value={newProduct.minStock}
                      onChange={(e) => setNewProduct({...newProduct, minStock: e.target.value})}
                      className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                    />
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div className="space-y-3">
                <h3 className="font-bold text-panel-text-muted">Precio</h3>

                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-2">Precio de Costo ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newProduct.costPrice}
                    onChange={(e) => setNewProduct({...newProduct, costPrice: e.target.value})}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                  />
                  <p className="text-xs text-panel-text-muted mt-1">Lo que te cuesta a ti adquirir el producto (para calcular margen)</p>
                </div>

                {/* Price Includes VAT Toggle */}
                <div className="bg-panel-accent/10 border border-panel-accent/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Info size={16} className="text-panel-accent-soft" />
                    <label className="text-xs font-bold text-panel-accent-soft">¿El precio incluye IVA?</label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setNewProduct({...newProduct, priceIncludesVat: true})}
                      className={`flex-1 py-2 px-3 rounded font-bold text-sm transition-all ${
                        newProduct.priceIncludesVat
                          ? 'bg-panel-accent text-panel-accent-text'
                          : 'bg-panel-surface-2 text-panel-text-muted hover:bg-panel-text/10'
                      }`}
                    >
                      Sí, incluye IVA
                    </button>
                    <button
                      onClick={() => setNewProduct({...newProduct, priceIncludesVat: false})}
                      className={`flex-1 py-2 px-3 rounded font-bold text-sm transition-all ${
                        !newProduct.priceIncludesVat
                          ? 'bg-panel-accent text-panel-accent-text'
                          : 'bg-panel-surface-2 text-panel-text-muted hover:bg-panel-text/10'
                      }`}
                    >
                      No, sin IVA
                    </button>
                  </div>
                  <p className="text-xs text-panel-accent-soft mt-2">
                    {newProduct.priceIncludesVat
                      ? `El precio ingresado ya contiene el IVA del ${taxRate}%`
                      : `El IVA del ${taxRate}% se agregará al precio ingresado`}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-2">
                    {newProduct.priceIncludesVat ? 'Precio Final (con IVA)' : 'Precio Base (sin IVA)'} ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newProduct.salePrice}
                    onChange={(e) => setNewProduct({...newProduct, salePrice: e.target.value})}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                  />
                </div>

                {/* Price Preview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-panel-bg/50 rounded border border-panel-border">
                  <div>
                    <div className="text-xs text-panel-text-muted font-bold">Precio sin IVA</div>
                    <div className="text-lg font-bold text-panel-text">
                      {formatUSD(getPriceWithoutVat(parseFloat(newProduct.salePrice) || 0, newProduct.priceIncludesVat))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-panel-text-muted font-bold">Precio con IVA ({taxRate}%)</div>
                    <div className="text-lg font-bold text-panel-success">
                      {formatUSD(getPriceWithVat(parseFloat(newProduct.salePrice) || 0, newProduct.priceIncludesVat))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Discount */}
              <div className="space-y-3">
                <h3 className="font-bold text-panel-text-muted flex items-center gap-2">
                  <Percent size={18} />
                  Descuento (Opcional)
                </h3>
                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-2">Porcentaje de Descuento (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={newProduct.discount}
                    onChange={(e) => setNewProduct({...newProduct, discount: e.target.value})}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                  />
                  {parseFloat(newProduct.discount) > 0 && (
                    <div className="mt-2 p-2 bg-panel-success/10 border border-panel-success/30 rounded text-sm text-panel-success">
                      Precio con descuento: <span className="font-bold">{formatUSD(getDiscountedPrice(parseFloat(newProduct.salePrice), parseFloat(newProduct.discount)))}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Promotion */}
              <div className="space-y-3">
                <h3 className="font-bold text-panel-text-muted flex items-center gap-2">
                  <Tag size={18} />
                  Promoción (Opcional)
                </h3>
                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-2">Descripción de Promoción</label>
                  <input
                    type="text"
                    placeholder="Ej: Compre 2 y lleve 3, Black Friday, etc"
                    value={newProduct.promotion}
                    onChange={(e) => setNewProduct({...newProduct, promotion: e.target.value})}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
                  />
                  <p className="text-xs text-panel-text-muted mt-1">Ej: "Compre 2 lleve 3", "Black Friday 50%", "Promoción Flash"</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 border-t border-panel-border pt-4">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 bg-panel-surface-2 hover:bg-panel-text/10 text-panel-text font-bold py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddProduct}
                className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
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
