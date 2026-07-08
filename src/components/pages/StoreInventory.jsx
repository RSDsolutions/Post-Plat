import React, { useState, useEffect } from 'react';
import { Package, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchData } from '../../lib/supabaseHelpers.js';
import Table from '../ui/Table.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { formatUSD } from '../../lib/format.js';

export default function StoreInventory() {
  const { currentUser, showToast } = useStore();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoading(true);
        const data = await fetchData('products', {
          filter: { column: 'company_id', value: currentUser.company_id }
        });
        setProducts(data || []);
      } catch (error) {
        console.error('Error loading products:', error);
        showToast('error', 'Error al cargar los productos');
      } finally {
        setLoading(false);
      }
    };

    if (currentUser?.company_id) {
      loadProducts();
    }
  }, [currentUser, showToast]);

  const lowStockProducts = products.filter(p => p.quantity <= p.min_stock);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-4xl font-bold tracking-tighter uppercase text-zinc-100">Inventario</h1>

      {lowStockProducts.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-4 flex items-start gap-4">
          <AlertTriangle size={24} className="text-amber-500 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-bold text-amber-500 mb-1">Productos con stock bajo</h3>
            <p className="text-sm text-amber-400">
              {lowStockProducts.length} producto(s) requieren reorden
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6">
          <div className="text-sm text-zinc-500 mb-2">Total de productos</div>
          <div className="text-3xl font-bold text-zinc-100">{products.length}</div>
        </div>
        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6">
          <div className="text-sm text-zinc-500 mb-2">Stock total</div>
          <div className="text-3xl font-bold text-emerald-400">
            {products.reduce((sum, p) => sum + (p.quantity || 0), 0)} unidades
          </div>
        </div>
        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6">
          <div className="text-sm text-zinc-500 mb-2">Stock bajo</div>
          <div className="text-3xl font-bold text-amber-400">{lowStockProducts.length}</div>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden">
        {!loading && products.length > 0 ? (
          <Table
            columns={['Producto', 'Código', 'Stock', 'Precio', 'Categoría', 'Estado']}
            data={products}
            renderRow={(product) => {
              const isLowStock = product.quantity <= product.min_stock;
              return (
                <tr key={product.id} className="hover:bg-zinc-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-bold text-zinc-100">{product.name}</div>
                    <div className="text-xs text-zinc-500">{product.description}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-zinc-400">{product.code}</td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-zinc-100">{product.quantity}</div>
                    <div className="text-xs text-zinc-500">Min: {product.min_stock}</div>
                  </td>
                  <td className="px-4 py-3 font-bold text-zinc-100">{formatUSD(product.sale_price)}</td>
                  <td className="px-4 py-3 text-sm text-zinc-400">{product.category}</td>
                  <td className="px-4 py-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      isLowStock
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-emerald-500/10 text-emerald-400'
                    }`}>
                      {isLowStock ? 'Bajo stock' : 'Normal'}
                    </span>
                  </td>
                </tr>
              );
            }}
          />
        ) : loading ? (
          <div className="p-8 text-center text-zinc-500">
            <div className="animate-spin inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mb-4" />
            <p>Cargando inventario...</p>
          </div>
        ) : (
          <EmptyState
            icon={Package}
            title="Sin productos"
            description="Tu empresa aún no tiene productos configurados."
          />
        )}
      </div>
    </div>
  );
}
