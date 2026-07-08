import React, { useState, useEffect } from 'react';
import { Search, Plus, Minus, Trash2, LogOut, Clock, DollarSign, ShoppingCart } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchData } from '../../lib/supabaseHelpers.js';
import { formatUSD } from '../../lib/format.js';

export default function POSInterface() {
  const { currentUser, logout, showToast } = useStore();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [customerEmail, setCustomerEmail] = useState('');
  const [showPayment, setShowPayment] = useState(false);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const data = await fetchData('products', {
          filter: { column: 'company_id', value: currentUser.company_id }
        });
        setProducts(data || []);
      } catch (error) {
        console.error('Error loading products:', error);
        showToast('error', 'Error al cargar productos');
      } finally {
        setLoading(false);
      }
    };

    if (currentUser?.company_id) {
      loadProducts();
    }
  }, [currentUser, showToast]);

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addToCart = (product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      if (existing.quantity < product.quantity) {
        setCart(cart.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        ));
      } else {
        showToast('warning', 'Stock insuficiente');
      }
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      const product = products.find(p => p.id === productId);
      if (quantity <= product.quantity) {
        setCart(cart.map(item =>
          item.id === productId ? { ...item, quantity } : item
        ));
      } else {
        showToast('warning', 'Stock insuficiente');
      }
    }
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.sale_price * item.quantity), 0);
  const tax = subtotal * 0.12;
  const total = subtotal + tax;

  const handleCheckout = () => {
    if (cart.length === 0) {
      showToast('warning', 'Carrito vacío');
      return;
    }
    setShowPayment(true);
  };

  const completeSale = async () => {
    try {
      showToast('success', 'Venta completada exitosamente');
      setCart([]);
      setCustomerEmail('');
      setShowPayment(false);
    } catch (error) {
      showToast('error', 'Error al procesar la venta');
    }
  };

  return (
    <div className="flex h-screen bg-zinc-950">
      {/* Product Panel */}
      <div className="flex-1 flex flex-col border-r border-zinc-800">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">PUNTO DE VENTA</h1>
              <p className="text-blue-100 text-sm">{currentUser?.name}</p>
            </div>
            <button
              onClick={logout}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <LogOut size={18} />
              Cerrar sesión
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-100" />
            <input
              type="text"
              placeholder="Buscar producto por nombre o código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-2 text-white placeholder-blue-100 focus:outline-none focus:ring-2 focus:ring-white"
            />
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="bg-zinc-900 border border-zinc-800 hover:border-blue-500 rounded-xl p-3 transition-all hover:shadow-lg hover:shadow-blue-500/20 group"
                >
                  <div className="mb-2">
                    <div className="text-sm font-bold text-zinc-100 line-clamp-2 group-hover:text-blue-400">
                      {product.name}
                    </div>
                    <div className="text-xs text-zinc-500 font-mono">{product.code}</div>
                  </div>
                  <div className="space-y-1 border-t border-zinc-800 pt-2">
                    <div className="text-lg font-bold text-emerald-400">{formatUSD(product.sale_price)}</div>
                    <div className="text-xs text-zinc-500">Stock: {product.quantity}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart Panel */}
      <div className="w-96 bg-zinc-900 border-l border-zinc-800 flex flex-col">
        {/* Cart Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 p-4 text-white">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart size={24} />
            <h2 className="text-xl font-bold">Carrito</h2>
          </div>
          <div className="text-sm text-emerald-100">
            {cart.length} artículos
          </div>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {cart.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <ShoppingCart size={48} className="text-zinc-700 mx-auto mb-2" />
                <p className="text-zinc-500">Carrito vacío</p>
              </div>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-bold text-zinc-100 text-sm">{item.name}</div>
                    <div className="text-xs text-zinc-500">{formatUSD(item.sale_price)} c/u</div>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="text-red-500 hover:text-red-400 p-1"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    className="bg-zinc-800 hover:bg-zinc-700 p-1 rounded text-zinc-300"
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                    className="w-10 bg-zinc-800 border border-zinc-700 rounded text-center text-sm text-zinc-100"
                  />
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    className="bg-zinc-800 hover:bg-zinc-700 p-1 rounded text-zinc-300"
                  >
                    <Plus size={14} />
                  </button>
                  <div className="flex-1 text-right">
                    <div className="font-bold text-emerald-400 text-sm">
                      {formatUSD(item.sale_price * item.quantity)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals */}
        <div className="border-t border-zinc-800 p-4 space-y-3 bg-zinc-950/50">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-zinc-400">
              <span>Subtotal:</span>
              <span>{formatUSD(subtotal)}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>IVA (12%):</span>
              <span>{formatUSD(tax)}</span>
            </div>
            <div className="border-t border-zinc-800 pt-2 flex justify-between font-bold text-lg text-emerald-400">
              <span>Total:</span>
              <span>{formatUSD(total)}</span>
            </div>
          </div>

          {/* Checkout Button */}
          <button
            onClick={handleCheckout}
            disabled={cart.length === 0}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <DollarSign size={20} />
            Procesar Pago
          </button>
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full mx-4">
            <h3 className="text-2xl font-bold text-white mb-6">Confirmar Pago</h3>

            <div className="space-y-4 mb-6">
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <div className="text-sm text-zinc-500 mb-1">Total a cobrar</div>
                <div className="text-4xl font-bold text-emerald-400">{formatUSD(total)}</div>
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-300 mb-2">Método de pago</label>
                <div className="grid grid-cols-3 gap-2">
                  {['cash', 'card', 'transfer'].map(method => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`py-2 rounded-lg font-bold text-sm transition-colors ${
                        paymentMethod === method
                          ? 'bg-emerald-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      {method === 'cash' ? 'Efectivo' : method === 'card' ? 'Tarjeta' : 'Transferencia'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-300 mb-2">Email del cliente (opcional)</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowPayment(false)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={completeSale}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg transition-colors"
              >
                Confirmar Pago
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
