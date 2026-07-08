import React, { useState, useEffect } from 'react';
import { Package, AlertTriangle, TrendingDown } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchData } from '../../lib/supabaseHelpers.js';
import Table from '../ui/Table.jsx';
import { formatUSD } from '../../lib/format.js';

export default function InventoryManagement() {
  const { currentUser, showToast } = useStore();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const data = await fetchData('products', {
          filter: { column: 'company_id', value: currentUser.company_id }
        });
        setProducts(data || []);
      } catch (error) {
        console.error('Error:', error);
        showToast('error', 'Error al cargar inventario');
      } finally {
        setLoading(false);
      }
    };

    if (currentUser?.company_id) loadProducts();
  }, [currentUser, showToast]);

  const categories = [...new Set(products.map(p => p.category))];
  const filtered = filterCategory === 'all' ? products : products.filter(p => p.category === filterCategory);
  const lowStock = filtered.filter(p => p.quantity <= p.min_stock);
  const totalValue = filtered.reduce((sum, p) => sum + (p.sale_price * p.quantity), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-4xl font-bold text-zinc-100">Gestión de Inventario</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-500">Total Productos</div>
          <div className="text-3xl font-bold text-zinc-100">{filtered.length}</div>
        </div>
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-500">Stock Total</div>
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

      {/* Filter */}
      <div className="flex gap-2">
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
      </div>

      {/* Products Table */}
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
        {!loading ? (
          <Table
            columns={['Código', 'Producto', 'Categoría', 'Stock', 'Precio', 'Valor Total', 'Estado']}
            data={filtered}
            renderRow={(product) => {
              const isLowStock = product.quantity <= product.min_stock;
              const value = product.quantity * product.sale_price;
              return (
                <tr key={product.id} className="hover:bg-zinc-800/50">
                  <td className="px-4 py-3 font-mono text-sm text-zinc-400">{product.code}</td>
                  <td className="px-4 py-3 font-bold text-zinc-100">{product.name}</td>
                  <td className="px-4 py-3 text-sm text-zinc-400">{product.category}</td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-zinc-100">{product.quantity}</div>
                    <div className="text-xs text-zinc-500">Mín: {product.min_stock}</div>
                  </td>
                  <td className="px-4 py-3 font-bold text-zinc-100">{formatUSD(product.sale_price)}</td>
                  <td className="px-4 py-3 font-bold text-emerald-400">{formatUSD(value)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      isLowStock ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                    }`}>
                      {isLowStock ? 'Bajo' : 'Normal'}
                    </span>
                  </td>
                </tr>
              );
            }}
          />
        ) : (
          <div className="p-8 text-center text-zinc-500">Cargando...</div>
        )}
      </div>
    </div>
  );
}
