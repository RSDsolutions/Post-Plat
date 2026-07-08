import React, { useState, useEffect } from 'react';
import { Search, Plus, Minus, Trash2, LogOut, DollarSign, ShoppingCart, Send } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchData, createInvoice, createInvoiceDetail, getBillingConfig, getNextInvoiceSequential, fetchCompanyById, findOrCreateCustomer } from '../../lib/supabaseHelpers.js';
import { formatUSD } from '../../lib/format.js';
import { generateAccessKey } from '../../lib/invoiceUtils.js';

export default function POSInterface() {
  const { currentUser, logout, showToast } = useStore();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [showPayment, setShowPayment] = useState(false);
  const [transactionID, setTransactionID] = useState(null);
  const [lastInvoiceInfo, setLastInvoiceInfo] = useState(null);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [taxRate, setTaxRate] = useState(12);
  const [showInvoiceType, setShowInvoiceType] = useState(false);
  const [invoiceType, setInvoiceType] = useState(null); // 'final' o 'factura'
  const [invoiceData, setInvoiceData] = useState({
    identificationType: 'ruc', // 'ruc' o 'cedula'
    identification: '',
    razonSocial: '',
    email: '',
    phone: '',
    address: ''
  });

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const [data, billingConfig] = await Promise.all([
          fetchData('products', {
            filter: { column: 'company_id', value: currentUser.company_id }
          }),
          getBillingConfig(currentUser.company_id)
        ]);
        setProducts(data || []);

        // Tax rate must come from billing_configs - it's the same rate actually
        // submitted to the SRI (see api/sri/submit-invoice.js). A separate
        // localStorage-cached rate (StoreSettings) could drift out of sync and
        // corrupt the VAT extraction for price_includes_vat products.
        setTaxRate(billingConfig.taxRate || 12);
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

  // Calculate prices, handling both price_includes_vat cases
  const getPriceBase = (product) => {
    if (product.price_includes_vat) {
      return product.sale_price / (1 + taxRate / 100);
    }
    return product.sale_price;
  };

  const subtotal = cart.reduce((sum, item) => {
    const basePriceItem = getPriceBase(item) * item.quantity;
    return sum + basePriceItem;
  }, 0);

  const discount = subtotal * (discountPercent / 100);
  const taxableAmount = subtotal - discount;
  const tax = taxableAmount * (taxRate / 100);
  const total = taxableAmount + tax;

  const handleCheckout = () => {
    if (cart.length === 0) {
      showToast('warning', 'Carrito vacío');
      return;
    }
    setShowInvoiceType(true);
  };

  const handleSelectInvoiceType = (type) => {
    setInvoiceType(type);
    if (type === 'final') {
      setShowInvoiceType(false);
      setShowPayment(true);
    } else {
      // Mostrar formulario para ingresar datos de factura
      setInvoiceData({
        identificationType: 'ruc',
        identification: '',
        razonSocial: '',
        email: '',
        phone: '',
        address: ''
      });
    }
  };

  const handleConfirmInvoiceData = () => {
    if (!invoiceData.identification || !invoiceData.razonSocial) {
      const idType = invoiceData.identificationType === 'ruc' ? 'RUC' : 'Cédula';
      showToast('error', `${idType} y Razón Social son requeridos`);
      return;
    }
    setShowInvoiceType(false);
    setShowPayment(true);
  };

  const completeSale = async () => {
    try {
      // Load billing config and company (for RUC) needed to generate the SRI access key
      const [billingConfig, company] = await Promise.all([
        getBillingConfig(currentUser.company_id),
        fetchCompanyById(currentUser.company_id)
      ]);

      // Get next sequential number
      const sequential = await getNextInvoiceSequential(currentUser.company_id);

      // Calculate totals
      const subtotalAmount = subtotal;
      const discountAmount = discount;
      const taxAmount = tax;
      const totalAmount = total;

      const establishment = billingConfig.establishment || '001';
      const pointOfSale = billingConfig.pointOfSale || '001';

      // Generate SRI-compliant invoice number: Establecimiento-PuntoVenta-Secuencial
      const invoiceNumber = `${establishment.padStart(3, '0')}-${pointOfSale.padStart(3, '0')}-${String(sequential).padStart(9, '0')}`;

      // Generate SRI access key (clave de acceso) - the code the store manager approves
      const accessKey = generateAccessKey({
        issueDate: new Date().toISOString(),
        ruc: company.ruc,
        environment: billingConfig.environment,
        establishment,
        pointOfSale,
        sequential
      });

      // If invoicing with identification, find or create the customer record
      let customerId = null;
      if (invoiceType === 'factura') {
        customerId = await findOrCreateCustomer(currentUser.company_id, {
          identification_type: invoiceData.identificationType,
          identification_number: invoiceData.identification,
          name: invoiceData.razonSocial,
          email: invoiceData.email,
          phone: invoiceData.phone,
          address: invoiceData.address
        });
      }

      // Create invoice record
      const invoice = await createInvoice({
        company_id: currentUser.company_id,
        user_id: currentUser.id,
        invoice_number: invoiceNumber,
        invoice_type: 'factura',
        access_key: accessKey,
        subtotal_amount: subtotalAmount,
        discount_amount: discountAmount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        payment_method: paymentMethod,
        customer_id: customerId,
        notes: invoiceType === 'factura'
          ? `Cliente: ${invoiceData.razonSocial} | ${invoiceData.identificationType === 'ruc' ? 'RUC' : 'Cédula'}: ${invoiceData.identification}`
          : 'Consumidor Final'
      });

      // Create invoice details for each cart item
      for (const item of cart) {
        // Use the tax-exclusive base price (same as the on-screen totals below),
        // never the raw sale_price - if the product's price already includes VAT,
        // taxing sale_price again here double-charges IVA on every line item.
        const baseUnitPrice = getPriceBase(item);
        const itemDiscount = baseUnitPrice * item.quantity * (discountPercent / 100);
        const itemSubtotal = baseUnitPrice * item.quantity - itemDiscount;
        const itemTax = itemSubtotal * (billingConfig.taxRate / 100);

        await createInvoiceDetail({
          invoice_id: invoice.id,
          product_id: item.id,
          product_code: item.code,
          product_name: item.name,
          quantity: item.quantity,
          unit_price: baseUnitPrice,
          discount_percent: discountPercent,
          discount_amount: itemDiscount,
          subtotal: itemSubtotal,
          tax_rate: billingConfig.taxRate || taxRate,
          tax_amount: itemTax,
          total: itemSubtotal + itemTax
        });
      }

      setTransactionID(invoice.id);
      setLastInvoiceInfo({ invoiceNumber, accessKey });
      const typeLabel = invoiceType === 'final' ? 'consumidor final' : 'factura';
      showToast('success', `${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} creada: ${invoiceNumber}`);

      setTimeout(() => {
        setCart([]);
        setInvoiceData({
          identificationType: 'ruc',
          identification: '',
          razonSocial: '',
          email: '',
          phone: '',
          address: ''
        });
        setInvoiceType(null);
        setPaymentMethod('cash');
        setDiscountPercent(0);
        setShowPayment(false);
        setTransactionID(null);
        setLastInvoiceInfo(null);
      }, 4000);
    } catch (error) {
      console.error('Error creating invoice:', error);
      showToast('error', error.message || 'Error al procesar la venta');
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
              <h1 className="text-2xl font-bold">🏪 PUNTO DE VENTA</h1>
              <p className="text-blue-100 text-sm">{currentUser?.name}</p>
            </div>
            <button
              onClick={logout}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-bold"
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
                  className="bg-zinc-900 border border-zinc-800 hover:border-blue-500 rounded-xl p-3 transition-all hover:shadow-lg hover:shadow-blue-500/20 group cursor-pointer"
                >
                  <div className="mb-2">
                    <div className="text-sm font-bold text-zinc-100 line-clamp-2 group-hover:text-blue-400">
                      {product.name}
                    </div>
                    <div className="text-xs text-zinc-500 font-mono">{product.code}</div>
                  </div>
                  <div className="space-y-1 border-t border-zinc-800 pt-2">
                    <div className="text-lg font-bold text-emerald-400">{formatUSD(product.sale_price)}</div>
                    <div className="text-xs text-zinc-400 mb-1">
                      {product.price_includes_vat !== false ? 'Con IVA' : 'Sin IVA'}
                    </div>
                    <div className={`text-xs font-bold ${product.quantity > 10 ? 'text-emerald-400' : product.quantity > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                      Stock: {product.quantity}
                    </div>
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
            {cart.length} artículos | Total items: {cart.reduce((sum, item) => sum + item.quantity, 0)}
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
              <div key={item.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 hover:border-emerald-500/30 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-bold text-zinc-100 text-sm">{item.name}</div>
                    <div className="text-xs text-zinc-500">{formatUSD(item.sale_price)} c/u</div>
                    <div className="text-xs text-zinc-600">{item.price_includes_vat !== false ? '✓ Con IVA' : '✗ Sin IVA'}</div>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="text-red-500 hover:text-red-400 p-1"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex items-center gap-2 mb-2">
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
                      {formatUSD(getPriceBase(item) * item.quantity)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Discount Section */}
        {cart.length > 0 && (
          <div className="border-t border-zinc-800 p-4 bg-zinc-950/50">
            <label className="block text-xs font-bold text-zinc-400 mb-2">Descuento %</label>
            <input
              type="number"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
              min="0"
              max="100"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm"
            />
          </div>
        )}

        {/* Totals */}
        <div className="border-t border-zinc-800 p-4 space-y-3 bg-zinc-950/50">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-zinc-400">
              <span>Subtotal:</span>
              <span>{formatUSD(subtotal)}</span>
            </div>
            {discountPercent > 0 && (
              <div className="flex justify-between text-red-400">
                <span>Descuento ({discountPercent}%):</span>
                <span>-{formatUSD(discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-zinc-400">
              <span>IVA ({taxRate}%):</span>
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-6 lg:p-8 w-[95vw] sm:w-[90vw] md:w-full max-w-3xl max-h-[95vh] overflow-y-auto">
            <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-4 sm:mb-6">Confirmar Pago</h3>

            <div className="space-y-4 sm:space-y-6">
              {/* Total Display */}
              <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 p-4 sm:p-6 rounded-xl border border-emerald-500">
                <div className="text-xs sm:text-sm text-emerald-100 mb-1">Total a cobrar</div>
                <div className="text-4xl sm:text-5xl font-bold text-white">{formatUSD(total)}</div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs sm:text-sm font-bold text-zinc-300 mb-2 sm:mb-3">Método de Pago</label>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {[
                    { value: 'cash', label: 'Efectivo', icon: '💵' },
                    { value: 'card', label: 'Tarjeta', icon: '💳' },
                    { value: 'transfer', label: 'Transferencia', icon: '🏦' }
                  ].map(method => (
                    <button
                      key={method.value}
                      onClick={() => setPaymentMethod(method.value)}
                      className={`py-2 sm:py-3 px-2 sm:px-4 rounded-lg font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
                        paymentMethod === method.value
                          ? 'bg-emerald-600 text-white shadow-lg'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      <span className="block sm:inline">{method.icon}</span>
                      <span className="hidden sm:inline ml-1">{method.label}</span>
                      <span className="sm:hidden text-xs">{method.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Customer Info - Show based on invoice type */}
              {invoiceType === 'final' ? (
                <div className="border-t border-zinc-800 pt-6">
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <h4 className="font-bold text-blue-300 mb-2">Tipo de Venta</h4>
                    <p className="text-sm text-blue-200">👤 Consumidor Final</p>
                  </div>
                </div>
              ) : invoiceType === 'factura' ? (
                <div className="border-t border-zinc-800 pt-6">
                  <h4 className="font-bold text-zinc-100 mb-4">Datos de la Factura</h4>
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 space-y-3">
                    <div>
                      <div className="text-xs font-bold text-zinc-400">
                        {invoiceData.identificationType === 'ruc' ? 'RUC' : 'Cédula'}
                      </div>
                      <div className="text-sm text-emerald-300 font-mono">{invoiceData.identification}</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-zinc-400">
                        {invoiceData.identificationType === 'ruc' ? 'Razón Social' : 'Nombre'}
                      </div>
                      <div className="text-sm text-emerald-300">{invoiceData.razonSocial}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-bold text-zinc-400">Email</div>
                        <div className="text-xs text-emerald-200">{invoiceData.email || '-'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-zinc-400">Teléfono</div>
                        <div className="text-xs text-emerald-200">{invoiceData.phone || '-'}</div>
                      </div>
                    </div>
                    {invoiceData.address && (
                      <div>
                        <div className="text-xs font-bold text-zinc-400">Dirección</div>
                        <div className="text-xs text-emerald-200">{invoiceData.address}</div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}


              {/* Transaction ID Display */}
              {transactionID && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 text-center">
                  <div className="flex items-center justify-center mb-3">
                    <span className="text-4xl">✅</span>
                  </div>
                  <div className="text-base sm:text-lg text-emerald-100 mb-2 font-bold">¡Venta completada exitosamente!</div>
                  <div className="text-xs sm:text-sm text-emerald-200 mb-4">
                    {invoiceType === 'final' ? 'Consumidor Final' : `${invoiceData.razonSocial}`}
                  </div>
                  <div className="bg-emerald-950/50 rounded p-3 mb-3">
                    <div className="text-xs text-emerald-300 mb-1">Número de Factura</div>
                    <div className="text-base sm:text-lg font-bold text-emerald-300 font-mono break-all">{lastInvoiceInfo?.invoiceNumber}</div>
                  </div>
                  {lastInvoiceInfo?.accessKey && (
                    <div className="bg-emerald-950/50 rounded p-3 mb-3">
                      <div className="text-xs text-emerald-300 mb-1">Clave de Acceso SRI</div>
                      <div className="text-[10px] sm:text-xs font-bold text-emerald-300 font-mono break-all">{lastInvoiceInfo.accessKey}</div>
                    </div>
                  )}
                  <div className="text-xs text-emerald-300">Pendiente de aprobación por el gerente</div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 sm:gap-3 pt-4 sm:pt-6 border-t border-zinc-800 flex-col sm:flex-row">
                <button
                  onClick={() => setShowPayment(false)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2 sm:py-3 rounded-lg transition-colors text-sm sm:text-base"
                >
                  Cancelar
                </button>
                <button
                  onClick={completeSale}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 sm:py-3 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
                >
                  <Send size={16} className="sm:w-[18px] sm:h-[18px]" />
                  Confirmar Pago
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Type Selection Modal */}
      {showInvoiceType && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-2xl">
            <h3 className="text-2xl font-bold text-white mb-6">Tipo de Venta</h3>

            {invoiceType === null ? (
              <div className="space-y-4">
                <p className="text-zinc-300 mb-6">¿Cómo deseas procesar esta venta?</p>

                <div className="grid grid-cols-2 gap-4">
                  {/* Consumidor Final */}
                  <button
                    onClick={() => handleSelectInvoiceType('final')}
                    className="bg-blue-600/20 border-2 border-blue-500 hover:bg-blue-600/30 rounded-xl p-6 transition-all"
                  >
                    <div className="text-2xl mb-2">👤</div>
                    <h4 className="font-bold text-blue-300 mb-2">Consumidor Final</h4>
                    <p className="text-xs text-blue-200">Sin factura formal, venta simple</p>
                  </button>

                  {/* Con Factura */}
                  <button
                    onClick={() => handleSelectInvoiceType('factura')}
                    className="bg-emerald-600/20 border-2 border-emerald-500 hover:bg-emerald-600/30 rounded-xl p-6 transition-all"
                  >
                    <div className="text-2xl mb-2">📋</div>
                    <h4 className="font-bold text-emerald-300 mb-2">Con Factura</h4>
                    <p className="text-xs text-emerald-200">Factura formal con RUC</p>
                  </button>
                </div>
              </div>
            ) : invoiceType === 'factura' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Tipo de Identificación *</label>
                  <div className="flex gap-3 mb-3">
                    <button
                      onClick={() => setInvoiceData({...invoiceData, identificationType: 'ruc', identification: ''})}
                      className={`flex-1 py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                        invoiceData.identificationType === 'ruc'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      RUC
                    </button>
                    <button
                      onClick={() => setInvoiceData({...invoiceData, identificationType: 'cedula', identification: ''})}
                      className={`flex-1 py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                        invoiceData.identificationType === 'cedula'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      Cédula
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">
                    {invoiceData.identificationType === 'ruc' ? 'RUC (13 dígitos)' : 'Cédula (10 dígitos)'} *
                  </label>
                  <input
                    type="text"
                    maxLength={invoiceData.identificationType === 'ruc' ? '13' : '10'}
                    placeholder={invoiceData.identificationType === 'ruc' ? '1706111505001' : '1234567890'}
                    value={invoiceData.identification}
                    onChange={(e) => setInvoiceData({...invoiceData, identification: e.target.value})}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Razón Social / Nombre *</label>
                  <input
                    type="text"
                    placeholder={invoiceData.identificationType === 'ruc' ? 'Nombre de la empresa' : 'Nombre completo'}
                    value={invoiceData.razonSocial}
                    onChange={(e) => setInvoiceData({...invoiceData, razonSocial: e.target.value})}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">Email</label>
                    <input
                      type="email"
                      placeholder="empresa@example.com"
                      value={invoiceData.email}
                      onChange={(e) => setInvoiceData({...invoiceData, email: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">Teléfono</label>
                    <input
                      type="tel"
                      placeholder="+593..."
                      value={invoiceData.phone}
                      onChange={(e) => setInvoiceData({...invoiceData, phone: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Dirección</label>
                  <input
                    type="text"
                    placeholder="Calle principal 123"
                    value={invoiceData.address}
                    onChange={(e) => setInvoiceData({...invoiceData, address: e.target.value})}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setInvoiceType(null)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2 rounded-lg transition-colors"
                  >
                    Atrás
                  </button>
                  <button
                    onClick={handleConfirmInvoiceData}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg transition-colors"
                  >
                    Continuar
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
