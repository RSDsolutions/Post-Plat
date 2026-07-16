import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, Plus, Minus, Trash2, LogOut, ShoppingCart, Send, Store,
  Banknote, CreditCard, Building2, User, FileText, CheckCircle,
  PauseCircle, Printer, X, Tag, Loader2, UserCheck
} from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { createInvoice, createInvoiceDetail, getBillingConfig, fetchCompanyById, findOrCreateCustomer, findCustomerByIdentification, updateCustomer, resolveCashierPointOfSale, getNextPosSequential, fetchProductStock, adjustProductStock } from '../../lib/supabaseHelpers.js';
import { formatUSD } from '../../lib/format.js';
import { generateAccessKey } from '../../lib/invoiceUtils.js';
import { generateSaleReceipt } from '../../lib/receiptGenerator.js';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo', icon: Banknote },
  { value: 'card', label: 'Tarjeta', icon: CreditCard },
  { value: 'transfer', label: 'Transferencia', icon: Building2 }
];

const EMPTY_INVOICE_DATA = {
  identificationType: 'ruc',
  identification: '',
  razonSocial: '',
  email: '',
  phone: '',
  address: ''
};

export default function POSInterface() {
  const { currentUser, logout, showToast } = useStore();
  const [products, setProducts] = useState([]);
  const [company, setCompany] = useState(null);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [transactionID, setTransactionID] = useState(null);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [taxRate, setTaxRate] = useState(12);
  const [showInvoiceType, setShowInvoiceType] = useState(false);
  const [invoiceType, setInvoiceType] = useState(null); // 'final' o 'factura'
  const [invoiceData, setInvoiceData] = useState(EMPTY_INVOICE_DATA);
  const [customerLookupStatus, setCustomerLookupStatus] = useState('idle'); // idle | checking | found | new
  const [foundCustomer, setFoundCustomer] = useState(null);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', email: '', phone: '', address: '' });
  const [showEditCustomerModal, setShowEditCustomerModal] = useState(false);
  const [editCustomerForm, setEditCustomerForm] = useState({ name: '', email: '', phone: '', address: '' });
  const [heldSales, setHeldSales] = useState([]);
  const [showHeldSales, setShowHeldSales] = useState(false);
  const [lastCompletedSale, setLastCompletedSale] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [posContext, setPosContext] = useState(null); // { branch, pointOfSale } | null
  const [posContextChecked, setPosContextChecked] = useState(false);

  const searchInputRef = useRef(null);
  const heldStorageKey = currentUser?.company_id ? `pos_held_${currentUser.company_id}` : null;

  useEffect(() => {
    const loadData = async () => {
      try {
        // Which branch/point of sale this cashier sells through - resolved
        // from their user record, not chosen in the UI. No branch or no
        // active POS means there's no valid establecimiento/punto de venta
        // to put on an invoice, so selling stays blocked until a gerente
        // assigns one (see the blocking screen below).
        const context = await resolveCashierPointOfSale(currentUser.id);
        setPosContext(context);
        setPosContextChecked(true);

        if (!context) {
          setLoading(false);
          return;
        }

        const [stockData, billingConfig, companyData] = await Promise.all([
          fetchProductStock(currentUser.company_id, context.branch.id),
          getBillingConfig(currentUser.company_id),
          fetchCompanyById(currentUser.company_id)
        ]);
        setProducts(stockData || []);
        // Tax rate must come from billing_configs - it's the same rate actually
        // submitted to the SRI (api/sri/submit-invoice.js). A previously separate
        // localStorage-cached rate could drift out of sync and corrupt VAT
        // extraction for price_includes_vat products.
        setTaxRate(billingConfig.taxRate || 12);
        setCompany(companyData);
      } catch (error) {
        console.error('Error loading data:', error);
        showToast('error', 'Error al cargar productos');
      } finally {
        setLoading(false);
      }
    };

    if (currentUser?.company_id) {
      loadData();
    }
  }, [currentUser, showToast]);

  // Load held sales for this store from localStorage
  useEffect(() => {
    if (!heldStorageKey) return;
    try {
      const saved = localStorage.getItem(heldStorageKey);
      if (saved) setHeldSales(JSON.parse(saved));
    } catch {
      // ignore corrupted local data
    }
  }, [heldStorageKey]);

  const persistHeldSales = (sales) => {
    setHeldSales(sales);
    if (heldStorageKey) {
      try {
        localStorage.setItem(heldStorageKey, JSON.stringify(sales));
      } catch {
        // storage full/unavailable - non-critical
      }
    }
  };

  const categories = useMemo(
    () => ['all', ...new Set(products.map(p => p.category).filter(Boolean))],
    [products]
  );

  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term);
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

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

  const clearCart = () => {
    setCart([]);
    setDiscountPercent(0);
  };

  // A product's own promotional discount (set in Inventario, e.g. "10% off this
  // week") was never applied here - the POS charged the full sale_price
  // regardless. getDiscountedPrice mirrors InventoryManagement.jsx's own math
  // (discount % taken off the sticker price) so both screens agree on what the
  // "real" price of a discounted product is.
  const getDiscountedPrice = (product) => {
    const productDiscount = product.discount || 0;
    return product.sale_price * (1 - productDiscount / 100);
  };

  // Tax-exclusive unit price: sticker price -> product's own promo discount
  // (if any) -> VAT extraction (if price_includes_vat). VAT must be computed
  // on what's actually charged after the discount, not the original sticker.
  const getPriceBase = (product) => {
    const discountedPrice = getDiscountedPrice(product);
    if (product.price_includes_vat) {
      return discountedPrice / (1 + taxRate / 100);
    }
    return discountedPrice;
  };

  const subtotal = cart.reduce((sum, item) => sum + getPriceBase(item) * item.quantity, 0);
  const discount = subtotal * (discountPercent / 100);
  const taxableAmount = subtotal - discount;
  const tax = taxableAmount * (taxRate / 100);
  const total = taxableAmount + tax;

  // Live product-promo savings while shopping (before checkout), so the
  // cashier/customer sees the discount right next to the subtotal instead of
  // only after the sale is completed.
  const cartProductSavings = cart.reduce((sum, item) => {
    if (!item.discount) return sum;
    return sum + (item.sale_price - getDiscountedPrice(item)) * item.quantity;
  }, 0);

  const cashReceivedNum = parseFloat(cashReceived) || 0;
  const change = Math.max(0, cashReceivedNum - total);
  const cashInsufficient = paymentMethod === 'cash' && cashReceivedNum < total;

  // Customer being invoiced: an existing record (read-only, edited only via
  // "Editar Cliente") or the data just entered in the new-customer modal.
  const customerDisplay = customerLookupStatus === 'found' && foundCustomer
    ? foundCustomer
    : { name: invoiceData.razonSocial, email: invoiceData.email, phone: invoiceData.phone, address: invoiceData.address };

  const quickCashAmounts = useMemo(() => {
    if (total <= 0) return [];
    const amounts = new Set([Math.ceil(total * 100) / 100]);
    [5, 10, 20, 50].forEach(denom => {
      const rounded = Math.ceil(total / denom) * denom;
      if (rounded > total) amounts.add(rounded);
    });
    return Array.from(amounts).sort((a, b) => a - b).slice(0, 4);
  }, [total]);

  // Held sales (park a cart to attend another customer, resume later)
  const holdCurrentSale = () => {
    if (cart.length === 0) return;
    const held = {
      id: `hold-${Date.now()}`,
      cart,
      discountPercent,
      heldAt: new Date().toISOString()
    };
    persistHeldSales([...heldSales, held]);
    clearCart();
    showToast('success', 'Venta puesta en espera');
  };

  const resumeHeldSale = (id) => {
    if (cart.length > 0) {
      showToast('warning', 'Finaliza o pon en espera la venta actual antes de retomar otra');
      return;
    }
    const held = heldSales.find(h => h.id === id);
    if (!held) return;
    setCart(held.cart);
    setDiscountPercent(held.discountPercent || 0);
    persistHeldSales(heldSales.filter(h => h.id !== id));
    setShowHeldSales(false);
  };

  const discardHeldSale = (id) => {
    persistHeldSales(heldSales.filter(h => h.id !== id));
  };

  const closeAllModals = () => {
    setShowPayment(false);
    setShowInvoiceType(false);
    setShowHeldSales(false);
    setShowReceiptModal(false);
    setShowNewCustomerModal(false);
    setShowEditCustomerModal(false);
  };

  // Keyboard shortcuts: F2 search, F4 checkout, Esc close modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeAllModals();
        return;
      }
      const tag = document.activeElement?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA';
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F4' && !isTyping) {
        e.preventDefault();
        handleCheckout();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart]);

  const handleCheckout = () => {
    if (cart.length === 0) {
      showToast('warning', 'Carrito vacío');
      return;
    }
    setCashReceived('');
    setShowInvoiceType(true);
  };

  const handleSelectInvoiceType = (type) => {
    setInvoiceType(type);
    if (type === 'final') {
      setShowInvoiceType(false);
      setShowPayment(true);
    } else {
      setInvoiceData(EMPTY_INVOICE_DATA);
      setCustomerLookupStatus('idle');
      setFoundCustomer(null);
    }
  };

  // Looks up an existing customer as soon as the RUC/Cédula reaches its full
  // length. Found -> shown read-only (edited only via "Editar Cliente", which
  // updates the saved record). Not found -> opens a dedicated registration
  // modal instead of leaving editable fields inline, so it's unambiguous
  // whether you're looking at a saved customer or entering a new one.
  const handleIdentificationChange = async (value) => {
    const digitsOnly = value.replace(/\D/g, '');
    const expectedLength = invoiceData.identificationType === 'ruc' ? 13 : 10;

    setInvoiceData(prev => ({ ...prev, identification: digitsOnly, razonSocial: '', email: '', phone: '', address: '' }));
    setFoundCustomer(null);

    if (digitsOnly.length < expectedLength) {
      setCustomerLookupStatus('idle');
      return;
    }

    setCustomerLookupStatus('checking');

    try {
      const existing = await findCustomerByIdentification(currentUser.company_id, digitsOnly);
      if (existing) {
        setFoundCustomer(existing);
        setCustomerLookupStatus('found');
      } else {
        setCustomerLookupStatus('new');
        setNewCustomerForm({ name: '', email: '', phone: '', address: '' });
        setShowNewCustomerModal(true);
      }
    } catch (error) {
      console.error('Error looking up customer:', error);
      setCustomerLookupStatus('idle');
    }
  };

  const handleSaveNewCustomer = () => {
    if (!newCustomerForm.name) {
      showToast('error', 'El nombre del cliente es requerido');
      return;
    }
    setInvoiceData(prev => ({
      ...prev,
      razonSocial: newCustomerForm.name,
      email: newCustomerForm.email,
      phone: newCustomerForm.phone,
      address: newCustomerForm.address
    }));
    setShowNewCustomerModal(false);
  };

  const handleOpenEditCustomer = () => {
    if (!foundCustomer) return;
    setEditCustomerForm({
      name: foundCustomer.name || '',
      email: foundCustomer.email || '',
      phone: foundCustomer.phone || '',
      address: foundCustomer.address || ''
    });
    setShowEditCustomerModal(true);
  };

  const handleSaveEditCustomer = async () => {
    if (!editCustomerForm.name) {
      showToast('error', 'El nombre del cliente es requerido');
      return;
    }
    try {
      const updated = await updateCustomer(foundCustomer.id, editCustomerForm);
      setFoundCustomer(updated);
      setShowEditCustomerModal(false);
      showToast('success', 'Cliente actualizado');
    } catch (error) {
      console.error('Error updating customer:', error);
      showToast('error', error.message || 'Error al actualizar cliente');
    }
  };

  const handleConfirmInvoiceData = () => {
    const idType = invoiceData.identificationType === 'ruc' ? 'RUC' : 'Cédula';
    if (!invoiceData.identification) {
      showToast('error', `${idType} es requerido`);
      return;
    }
    if (customerLookupStatus === 'new' && !invoiceData.razonSocial) {
      showToast('error', 'Registra los datos del cliente para continuar');
      setShowNewCustomerModal(true);
      return;
    }
    if (customerLookupStatus !== 'found' && customerLookupStatus !== 'new') {
      showToast('error', `Ingresa un ${idType} válido`);
      return;
    }
    setShowInvoiceType(false);
    setShowPayment(true);
  };

  const completeSale = async () => {
    if (cashInsufficient) {
      showToast('error', 'El monto recibido es menor al total');
      return;
    }
    if (!posContext) {
      showToast('error', 'No tienes una sucursal o caja asignada. Contacta a tu gerente.');
      return;
    }

    try {
      // Load billing config and company (for RUC) needed to generate the SRI access key
      const [billingConfig, companyData] = await Promise.all([
        getBillingConfig(currentUser.company_id),
        fetchCompanyById(currentUser.company_id)
      ]);

      // Establecimiento/punto de venta/secuencial now come from the cashier's
      // assigned point of sale, not a single company-wide config - each POS
      // owns its own SRI sequential so different branches (or terminals
      // within one) can share or differ in establecimiento/punto de venta.
      const sequential = await getNextPosSequential(posContext.pointOfSale.id);
      const establishmentCode = posContext.pointOfSale.numero_establecimiento;
      const posCode = posContext.pointOfSale.numero_pos;
      const invoiceNumber = `${establishmentCode.padStart(3, '0')}-${posCode.padStart(3, '0')}-${String(sequential).padStart(9, '0')}`;

      const accessKey = generateAccessKey({
        issueDate: new Date().toISOString(),
        ruc: companyData.ruc,
        environment: billingConfig.environment,
        establishment: establishmentCode,
        pointOfSale: posCode,
        sequential
      });

      let customerId = null;
      let customerName = null;
      if (invoiceType === 'factura') {
        if (customerLookupStatus === 'found' && foundCustomer) {
          // Already have the id from the lookup - no need to search again
          customerId = foundCustomer.id;
          customerName = foundCustomer.name;
        } else {
          customerName = invoiceData.razonSocial;
          customerId = await findOrCreateCustomer(currentUser.company_id, {
            identification_type: invoiceData.identificationType,
            identification_number: invoiceData.identification,
            name: invoiceData.razonSocial,
            email: invoiceData.email,
            phone: invoiceData.phone,
            address: invoiceData.address
          });
        }
      }

      // Compute every line FIRST (before creating the invoice header) so the
      // header's subtotal_amount/discount_amount can reflect the TRUE gross
      // amount and TRUE combined discount (product promo + cashier discount),
      // not the silently pre-discounted totals the on-screen `subtotal`/
      // `discount` variables carry. unit_price is the ORIGINAL tax-exclusive
      // sticker price (no discount applied), and discount_percent is the
      // combined discount as one equivalent percentage off that original
      // price - this nets out to the exact same subtotal/tax/total charged,
      // just decomposed in a way that's actually visible in the invoice, the
      // PDF, and the SRI XML instead of hidden inside a lower unit price.
      const lineItems = [];
      let trueGrossSubtotal = 0;
      let trueTotalDiscount = 0;
      let totalProductSavings = 0;

      for (const item of cart) {
        const regularUnitPrice = item.price_includes_vat
          ? item.sale_price / (1 + taxRate / 100)
          : item.sale_price;
        const productDiscountPercent = item.discount || 0;
        const combinedDiscountFraction = 1 - (1 - productDiscountPercent / 100) * (1 - discountPercent / 100);
        const combinedDiscountPercent = combinedDiscountFraction * 100;

        const grossLineAmount = regularUnitPrice * item.quantity;
        const itemDiscount = grossLineAmount * combinedDiscountFraction;
        const itemSubtotal = grossLineAmount - itemDiscount;
        const itemTax = itemSubtotal * (billingConfig.taxRate / 100);
        const itemTotal = itemSubtotal + itemTax;

        trueGrossSubtotal += grossLineAmount;
        trueTotalDiscount += itemDiscount;
        if (productDiscountPercent > 0) {
          totalProductSavings += (item.sale_price - getDiscountedPrice(item)) * item.quantity;
        }

        lineItems.push({
          item, regularUnitPrice, combinedDiscountPercent, itemDiscount,
          itemSubtotal, itemTax, itemTotal
        });
      }

      const invoice = await createInvoice({
        company_id: currentUser.company_id,
        user_id: currentUser.id,
        pos_id: posContext.pointOfSale.id,
        invoice_number: invoiceNumber,
        invoice_type: 'factura',
        access_key: accessKey,
        subtotal_amount: trueGrossSubtotal,
        discount_amount: trueTotalDiscount,
        tax_amount: tax,
        total_amount: total,
        payment_method: paymentMethod,
        customer_id: customerId,
        notes: invoiceType === 'factura'
          ? `Cliente: ${customerName} | ${invoiceData.identificationType === 'ruc' ? 'RUC' : 'Cédula'}: ${invoiceData.identification}`
          : 'Consumidor Final'
      });

      const receiptItems = [];

      for (const { item, regularUnitPrice, combinedDiscountPercent, itemDiscount, itemSubtotal, itemTax, itemTotal } of lineItems) {
        await createInvoiceDetail({
          invoice_id: invoice.id,
          product_id: item.id,
          product_code: item.code,
          product_name: item.name,
          quantity: item.quantity,
          unit_price: regularUnitPrice,
          discount_percent: combinedDiscountPercent,
          discount_amount: itemDiscount,
          subtotal: itemSubtotal,
          tax_rate: billingConfig.taxRate || taxRate,
          tax_amount: itemTax,
          total: itemTotal
        });

        await adjustProductStock({
          productId: item.id,
          branchId: posContext.branch.id,
          delta: -item.quantity,
          movementType: 'venta',
          referenceId: invoice.id,
          referenceType: 'invoice'
        });

        receiptItems.push({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.sale_price,
          discountPercent: item.discount || 0,
          savings: (item.discount || 0) > 0 ? (item.sale_price - getDiscountedPrice(item)) * item.quantity : 0,
          lineTotal: itemTotal
        });
      }

      // Reflect the stock just deducted without waiting for a full reload -
      // adjustProductStock already persisted this server-side per item.
      setProducts(prev => prev.map(p => {
        const cartItem = cart.find(c => c.id === p.id);
        return cartItem ? { ...p, quantity: Math.max(0, p.quantity - cartItem.quantity) } : p;
      }));

      setTransactionID(invoice.id);
      setLastCompletedSale({
        invoiceNumber,
        invoiceType,
        customerName: invoiceType === 'factura' ? customerName : null,
        items: receiptItems,
        subtotal,
        discount,
        productSavings: totalProductSavings,
        // Use the same combined discount actually stored on the invoice
        // (compounds product-promo % and cashier % rather than adding them
        // linearly), so the receipt's total savings always matches what's
        // in the invoice/SRI record - not an approximation that could drift.
        totalSavings: trueTotalDiscount,
        tax,
        taxRate: billingConfig.taxRate || taxRate,
        total,
        paymentMethod,
        cashReceived: paymentMethod === 'cash' ? cashReceivedNum : null,
        change: paymentMethod === 'cash' ? change : null,
        cashierName: currentUser?.name,
        completedAt: new Date().toISOString(),
        sriAuthorized: false
      });

      const typeLabel = invoiceType === 'final' ? 'consumidor final' : 'factura';
      showToast('success', `${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} creada: ${invoiceNumber}`);

      setTimeout(() => {
        clearCart();
        setInvoiceData(EMPTY_INVOICE_DATA);
        setCustomerLookupStatus('idle');
        setFoundCustomer(null);
        setInvoiceType(null);
        setPaymentMethod('cash');
        setCashReceived('');
        setShowPayment(false);
        setTransactionID(null);
      }, 4000);
    } catch (error) {
      console.error('Error creating invoice:', error);
      showToast('error', error.message || 'Error al procesar la venta');
    }
  };

  const downloadLastReceipt = async () => {
    if (!lastCompletedSale) return;
    const doc = await generateSaleReceipt({ sale: lastCompletedSale, company });
    doc.save(`Recibo_${lastCompletedSale.invoiceNumber}.pdf`);
  };

  // No branch/active point of sale resolved for this cashier - there's no
  // valid establecimiento/punto de venta to put on an invoice, so selling
  // stays blocked instead of guessing one.
  if (!loading && posContextChecked && !posContext) {
    return (
      <div className="flex items-center justify-center h-screen bg-pos-bg p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-pos-warning/15 border border-pos-warning/30 flex items-center justify-center mx-auto mb-4">
            <Store className="text-pos-warning" size={28} />
          </div>
          <h2 className="text-xl font-bold text-pos-text mb-2">Sin sucursal asignada</h2>
          <p className="text-pos-text-muted text-sm mb-6">
            Tu usuario no tiene una sucursal o caja activa asignada, así que no puedes facturar todavía. Contacta a tu gerente para que te asigne una desde "Gestión de Cajas".
          </p>
          <button
            onClick={logout}
            className="bg-pos-surface-2 hover:bg-pos-text/10 text-pos-text font-bold py-2 px-6 rounded-lg transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-pos-bg">
      {/* Product Panel */}
      <div className="flex-1 flex flex-col border-r border-pos-border min-w-0">
        {/* Top Bar */}
        <div className="bg-pos-surface border-b border-pos-border px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-pos-accent/15 border border-pos-accent/30 flex items-center justify-center">
                <Store className="text-pos-accent-soft" size={20} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-pos-text leading-tight">Punto de Venta</h1>
                <p className="text-xs text-pos-text-muted">{currentUser?.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHeldSales(true)}
                className="relative bg-pos-surface-2 hover:bg-pos-text/10 text-pos-text px-3 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-bold"
                title="Ventas en espera"
              >
                <PauseCircle size={16} />
                En espera
                {heldSales.length > 0 && (
                  <span className="bg-pos-accent text-pos-accent-text text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                    {heldSales.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => lastCompletedSale ? setShowReceiptModal(true) : null}
                disabled={!lastCompletedSale}
                className="bg-pos-surface-2 hover:bg-pos-text/10 disabled:opacity-40 disabled:cursor-not-allowed text-pos-text px-3 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-bold"
                title="Último comprobante"
              >
                <Printer size={16} />
                Último comprobante
              </button>
              <button
                onClick={logout}
                className="bg-pos-surface-2 hover:bg-pos-danger/20 hover:text-pos-danger text-pos-text px-3 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-bold"
              >
                <LogOut size={16} />
                Salir
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-pos-text-muted" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Buscar producto por nombre o código...  (F2)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-pos-bg border border-pos-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-pos-text placeholder-pos-text-muted focus:outline-none focus:ring-2 focus:ring-pos-accent/50 focus:border-pos-accent"
            />
          </div>

          {/* Category pills */}
          {categories.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <Tag size={14} className="text-pos-text-muted flex-shrink-0" />
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                    categoryFilter === cat
                      ? 'bg-pos-accent text-pos-accent-text'
                      : 'bg-pos-surface-2 text-pos-text-muted hover:bg-pos-text/10'
                  }`}
                >
                  {cat === 'all' ? 'Todas' : cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin inline-block w-10 h-10 border-4 border-pos-accent border-t-transparent rounded-full" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex items-center justify-center h-full text-pos-text-muted text-sm">
              No se encontraron productos
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={product.quantity <= 0}
                  className="pos-card text-left bg-pos-surface border border-pos-border hover:border-pos-accent/50 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl p-3 transition-colors"
                >
                  <div className="mb-2">
                    <div className="text-sm font-bold text-pos-text line-clamp-2">
                      {product.name}
                    </div>
                    <div className="text-xs text-pos-text-muted font-mono">{product.code}</div>
                  </div>
                  <div className="flex items-end justify-between border-t border-pos-border pt-2">
                    <div>
                      {product.discount > 0 ? (
                        <>
                          <div className="text-[10px] text-pos-text-muted line-through">{formatUSD(product.sale_price)}</div>
                          <div className="text-lg font-bold text-pos-danger">{formatUSD(getDiscountedPrice(product))}</div>
                          <div className="text-[10px] text-pos-danger font-bold">-{product.discount}% dto.</div>
                        </>
                      ) : (
                        <>
                          <div className="text-lg font-bold text-pos-success">{formatUSD(product.sale_price)}</div>
                          <div className="text-[10px] text-pos-text-muted">
                            {product.price_includes_vat !== false ? 'IVA incl.' : 'Sin IVA'}
                          </div>
                        </>
                      )}
                    </div>
                    <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      product.quantity > 10 ? 'bg-pos-success/10 text-pos-success' : product.quantity > 0 ? 'bg-pos-warning/10 text-pos-warning' : 'bg-pos-danger/10 text-pos-danger'
                    }`}>
                      {product.quantity > 0 ? `Stock: ${product.quantity}` : 'Agotado'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart Panel */}
      <div className="w-96 bg-pos-surface flex flex-col flex-shrink-0">
        <div className="border-b border-pos-border px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart size={18} className="text-pos-text-muted" />
            <h2 className="text-base font-bold text-pos-text">Carrito</h2>
          </div>
          <div className="text-xs text-pos-text-muted">
            {cart.length} {cart.length === 1 ? 'producto' : 'productos'} · {cart.reduce((sum, item) => sum + item.quantity, 0)} unidades
          </div>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <ShoppingCart size={40} className="text-pos-border mx-auto mb-2" />
                <p className="text-pos-text-muted text-sm">Carrito vacío</p>
              </div>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.id} className="pos-card bg-pos-bg border border-pos-border rounded-lg p-3">
                <div className="flex justify-between items-start mb-2">
                  <div className="min-w-0">
                    <div className="font-bold text-pos-text text-sm truncate">{item.name}</div>
                    {item.discount > 0 ? (
                      <div className="text-xs">
                        <span className="text-pos-text-muted line-through">{formatUSD(item.sale_price)}</span>{' '}
                        <span className="text-pos-danger font-bold">{formatUSD(getDiscountedPrice(item))} c/u</span>
                      </div>
                    ) : (
                      <div className="text-xs text-pos-text-muted">{formatUSD(item.sale_price)} c/u</div>
                    )}
                  </div>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="text-pos-text-muted hover:text-pos-danger p-1 flex-shrink-0"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    className="bg-pos-surface-2 hover:bg-pos-text/10 p-1.5 rounded text-pos-text"
                  >
                    <Minus size={13} />
                  </button>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                    className="w-10 bg-pos-surface-2 border border-pos-border rounded text-center text-sm text-pos-text py-1"
                  />
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    className="bg-pos-surface-2 hover:bg-pos-text/10 p-1.5 rounded text-pos-text"
                  >
                    <Plus size={13} />
                  </button>
                  <div className="flex-1 text-right font-bold text-pos-success text-sm">
                    {formatUSD(getPriceBase(item) * item.quantity)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Discount */}
        {cart.length > 0 && (
          <div className="border-t border-pos-border px-4 py-3">
            <label className="block text-[11px] font-bold text-pos-text-muted mb-1.5 uppercase tracking-wide">Descuento %</label>
            <input
              type="number"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
              min="0"
              max="100"
              className="w-full bg-pos-bg border border-pos-border rounded-lg px-3 py-2 text-pos-text text-sm focus:outline-none focus:ring-2 focus:ring-pos-accent/50"
            />
          </div>
        )}

        {/* Totals */}
        <div className="border-t border-pos-border px-4 py-4 space-y-3">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-pos-text-muted">
              <span>Subtotal</span>
              <span>{formatUSD(subtotal)}</span>
            </div>
            {cartProductSavings > 0 && (
              <div className="flex justify-between text-pos-danger">
                <span>Ahorro en promociones</span>
                <span>-{formatUSD(cartProductSavings)}</span>
              </div>
            )}
            {discountPercent > 0 && (
              <div className="flex justify-between text-pos-danger">
                <span>Descuento adicional ({discountPercent}%)</span>
                <span>-{formatUSD(discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-pos-text-muted">
              <span>IVA ({taxRate}%)</span>
              <span>{formatUSD(tax)}</span>
            </div>
            <div className="pos-total-amount border-t border-pos-border pt-2 flex justify-between font-bold text-lg text-pos-text">
              <span>Total</span>
              <span className="text-pos-success">{formatUSD(total)}</span>
            </div>
            {(cartProductSavings + discount) > 0 && (
              <div className="flex justify-between text-xs font-bold text-pos-danger pt-1">
                <span>¡Estás ahorrando!</span>
                <span>{formatUSD(cartProductSavings + discount)}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={holdCurrentSale}
              disabled={cart.length === 0}
              className="bg-pos-surface-2 hover:bg-pos-text/10 disabled:opacity-30 disabled:cursor-not-allowed text-pos-text font-bold py-3 px-3 rounded-lg transition-colors flex items-center justify-center"
              title="Poner en espera"
            >
              <PauseCircle size={20} />
            </button>
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0}
              className="pos-btn-primary flex-1 bg-pos-accent hover:bg-pos-accent-hover disabled:bg-pos-surface-2 disabled:text-pos-text-muted disabled:cursor-not-allowed text-pos-accent-text font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Send size={18} />
              Cobrar (F4)
            </button>
          </div>
        </div>
      </div>

      {/* Held Sales Modal */}
      {showHeldSales && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-pos-surface border border-pos-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-pos-text flex items-center gap-2">
                <PauseCircle size={22} className="text-pos-warning" />
                Ventas en Espera
              </h3>
              <button onClick={() => setShowHeldSales(false)} className="text-pos-text-muted hover:text-pos-text">
                <X size={22} />
              </button>
            </div>

            {heldSales.length === 0 ? (
              <p className="text-pos-text-muted text-sm text-center py-8">No hay ventas en espera</p>
            ) : (
              <div className="space-y-2">
                {heldSales.map(held => {
                  const heldTotal = held.cart.reduce((sum, item) => sum + item.sale_price * item.quantity, 0);
                  return (
                    <div key={held.id} className="bg-pos-bg border border-pos-border rounded-lg p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-pos-text">
                          {held.cart.length} {held.cart.length === 1 ? 'producto' : 'productos'}
                        </div>
                        <div className="text-xs text-pos-text-muted">
                          {new Date(held.heldAt).toLocaleTimeString()} · {formatUSD(heldTotal)}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => discardHeldSale(held.id)}
                          className="text-pos-danger hover:opacity-80 p-2"
                          title="Descartar"
                        >
                          <Trash2 size={16} />
                        </button>
                        <button
                          onClick={() => resumeHeldSale(held.id)}
                          className="bg-pos-accent hover:bg-pos-accent-hover text-pos-accent-text text-xs font-bold px-3 py-2 rounded-lg"
                        >
                          Retomar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Last Receipt Modal */}
      {showReceiptModal && lastCompletedSale && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-pos-surface border border-pos-border rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-pos-text flex items-center gap-2">
                <Printer size={22} className="text-pos-accent-soft" />
                Último Comprobante
              </h3>
              <button onClick={() => setShowReceiptModal(false)} className="text-pos-text-muted hover:text-pos-text">
                <X size={22} />
              </button>
            </div>

            <div className="bg-pos-bg border border-pos-border rounded-lg p-4 space-y-2 mb-5">
              <div className="flex justify-between text-sm">
                <span className="text-pos-text-muted">No. de factura</span>
                <span className="text-pos-text font-mono font-bold">{lastCompletedSale.invoiceNumber}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-pos-text-muted">Cliente</span>
                <span className="text-pos-text">{lastCompletedSale.customerName || 'Consumidor Final'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-pos-text-muted">Hora</span>
                <span className="text-pos-text">{new Date(lastCompletedSale.completedAt).toLocaleTimeString()}</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t border-pos-border">
                <span className="text-pos-text">Total</span>
                <span className="text-pos-success">{formatUSD(lastCompletedSale.total)}</span>
              </div>
              {lastCompletedSale.totalSavings > 0 && (
                <div className="flex justify-between text-xs font-bold text-pos-danger bg-pos-danger/10 -mx-4 -mb-2 px-4 py-2 rounded-b-lg">
                  <span>Ahorro del cliente</span>
                  <span>{formatUSD(lastCompletedSale.totalSavings)}</span>
                </div>
              )}
            </div>

            <button
              onClick={downloadLastReceipt}
              className="w-full bg-pos-accent hover:bg-pos-accent-hover text-pos-accent-text font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Printer size={18} />
              Descargar Recibo (PDF)
            </button>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-pos-surface border border-pos-border rounded-2xl p-4 sm:p-6 lg:p-8 w-[95vw] sm:w-[90vw] md:w-full max-w-3xl max-h-[95vh] overflow-y-auto">
            <h3 className="text-xl sm:text-2xl font-bold text-pos-text mb-5">Confirmar Pago</h3>

            <div className="space-y-5">
              {/* Total Display */}
              <div className="bg-pos-bg border border-pos-border rounded-xl p-5">
                <div className="text-xs text-pos-text-muted mb-1">Total a cobrar</div>
                <div className="text-4xl sm:text-5xl font-bold text-pos-success">{formatUSD(total)}</div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-bold text-pos-text-muted mb-2 uppercase tracking-wide">Método de Pago</label>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {PAYMENT_METHODS.map(method => {
                    const Icon = method.icon;
                    return (
                      <button
                        key={method.value}
                        onClick={() => { setPaymentMethod(method.value); setCashReceived(''); }}
                        className={`py-3 px-2 rounded-lg font-bold text-xs sm:text-sm transition-colors flex flex-col items-center gap-1.5 ${
                          paymentMethod === method.value
                            ? 'bg-pos-accent text-pos-accent-text'
                            : 'bg-pos-surface-2 text-pos-text-muted hover:bg-pos-text/10'
                        }`}
                      >
                        <Icon size={20} />
                        {method.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cash received / change */}
              {paymentMethod === 'cash' && (
                <div className="bg-pos-bg border border-pos-border rounded-lg p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-pos-text-muted mb-2">Monto Recibido</label>
                    <input
                      type="number"
                      step="0.01"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-pos-surface-2 border border-pos-border rounded-lg px-3 py-2 text-pos-text text-lg font-bold focus:outline-none focus:ring-2 focus:ring-pos-accent/50"
                    />
                  </div>
                  {quickCashAmounts.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {quickCashAmounts.map(amount => (
                        <button
                          key={amount}
                          onClick={() => setCashReceived(String(amount))}
                          className="bg-pos-surface-2 hover:bg-pos-text/10 text-pos-text-muted text-xs font-bold px-3 py-1.5 rounded"
                        >
                          {formatUSD(amount)}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className={`flex justify-between items-center pt-2 border-t border-pos-border ${cashInsufficient && cashReceivedNum > 0 ? 'text-pos-danger' : 'text-pos-text'}`}>
                    <span className="text-sm font-bold">Vuelto</span>
                    <span className="text-xl font-bold">{formatUSD(change)}</span>
                  </div>
                  {cashInsufficient && cashReceivedNum > 0 && (
                    <p className="text-xs text-pos-danger">El monto recibido es menor al total</p>
                  )}
                </div>
              )}

              {/* Customer Info - Show based on invoice type */}
              {invoiceType === 'final' ? (
                <div className="bg-pos-accent/10 border border-pos-accent/30 rounded-lg p-4 flex items-center gap-3">
                  <User size={20} className="text-pos-accent-soft" />
                  <span className="text-sm text-pos-text font-bold">Consumidor Final</span>
                </div>
              ) : invoiceType === 'factura' ? (
                <div className="bg-pos-bg border border-pos-border rounded-lg p-4 space-y-3">
                  <h4 className="font-bold text-pos-text flex items-center gap-2 text-sm">
                    <FileText size={16} className="text-pos-success" />
                    Datos de la Factura
                  </h4>
                  <div>
                    <div className="text-xs font-bold text-pos-text-muted">
                      {invoiceData.identificationType === 'ruc' ? 'RUC' : 'Cédula'}
                    </div>
                    <div className="text-sm text-pos-text font-mono">{invoiceData.identification}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-pos-text-muted">
                      {invoiceData.identificationType === 'ruc' ? 'Razón Social' : 'Nombre'}
                    </div>
                    <div className="text-sm text-pos-text">{customerDisplay.name}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-bold text-pos-text-muted">Email</div>
                      <div className="text-xs text-pos-text-muted">{customerDisplay.email || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-pos-text-muted">Teléfono</div>
                      <div className="text-xs text-pos-text-muted">{customerDisplay.phone || '-'}</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Transaction Success Display */}
              {transactionID && (
                <div className="bg-pos-success/10 border border-pos-success/30 rounded-xl p-6 text-center">
                  <CheckCircle size={40} className="text-pos-success mx-auto mb-3" />
                  <div className="text-base sm:text-lg text-pos-text mb-1 font-bold">¡Venta completada!</div>
                  <div className="text-xs sm:text-sm text-pos-text-muted mb-4">
                    {invoiceType === 'final' ? 'Consumidor Final' : customerDisplay.name}
                  </div>
                  <div className="bg-pos-bg rounded p-3">
                    <div className="text-xs text-pos-success mb-1">Número de Factura</div>
                    <div className="text-base font-bold text-pos-success font-mono break-all">{lastCompletedSale?.invoiceNumber}</div>
                  </div>
                  {lastCompletedSale?.totalSavings > 0 && (
                    <div className="bg-pos-danger/10 border border-pos-danger/30 rounded p-2 mt-3">
                      <span className="text-sm font-bold text-pos-danger">¡Ahorraste {formatUSD(lastCompletedSale.totalSavings)}!</span>
                    </div>
                  )}
                  <div className="text-xs text-pos-success mt-3">Pendiente de aprobación por el gerente</div>
                </div>
              )}

              {/* Action Buttons */}
              {!transactionID && (
                <div className="flex gap-3 pt-2 border-t border-pos-border flex-col sm:flex-row">
                  <button
                    onClick={() => setShowPayment(false)}
                    className="flex-1 bg-pos-surface-2 hover:bg-pos-text/10 text-pos-text font-bold py-3 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={completeSale}
                    disabled={cashInsufficient}
                    className="pos-btn-primary flex-1 bg-pos-accent hover:bg-pos-accent-hover disabled:bg-pos-surface-2 disabled:cursor-not-allowed text-pos-accent-text font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Send size={18} />
                    Confirmar Pago
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invoice Type Selection Modal */}
      {showInvoiceType && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-pos-surface border border-pos-border rounded-2xl p-6 sm:p-8 w-full max-w-2xl">
            <h3 className="text-xl sm:text-2xl font-bold text-pos-text mb-6">Tipo de Venta</h3>

            {invoiceType === null ? (
              <div className="space-y-4">
                <p className="text-pos-text-muted text-sm mb-6">¿Cómo deseas procesar esta venta?</p>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => handleSelectInvoiceType('final')}
                    className="bg-pos-bg border-2 border-pos-border hover:border-pos-accent rounded-xl p-6 transition-colors text-left"
                  >
                    <User className="text-pos-accent-soft mb-3" size={28} />
                    <h4 className="font-bold text-pos-text mb-1">Consumidor Final</h4>
                    <p className="text-xs text-pos-text-muted">Sin factura formal, venta simple</p>
                  </button>

                  <button
                    onClick={() => handleSelectInvoiceType('factura')}
                    className="bg-pos-bg border-2 border-pos-border hover:border-pos-accent rounded-xl p-6 transition-colors text-left"
                  >
                    <FileText className="text-pos-success mb-3" size={28} />
                    <h4 className="font-bold text-pos-text mb-1">Con Factura</h4>
                    <p className="text-xs text-pos-text-muted">Factura formal con RUC o Cédula</p>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-pos-text-muted mb-2">Tipo de Identificación *</label>
                  <div className="flex gap-3 mb-3">
                    <button
                      onClick={() => { setInvoiceData({...invoiceData, identificationType: 'ruc', identification: ''}); setCustomerLookupStatus('idle'); }}
                      className={`flex-1 py-2 px-3 rounded-lg font-bold text-sm transition-colors ${
                        invoiceData.identificationType === 'ruc'
                          ? 'bg-pos-accent text-pos-accent-text'
                          : 'bg-pos-surface-2 text-pos-text-muted hover:bg-pos-text/10'
                      }`}
                    >
                      RUC
                    </button>
                    <button
                      onClick={() => { setInvoiceData({...invoiceData, identificationType: 'cedula', identification: ''}); setCustomerLookupStatus('idle'); }}
                      className={`flex-1 py-2 px-3 rounded-lg font-bold text-sm transition-colors ${
                        invoiceData.identificationType === 'cedula'
                          ? 'bg-pos-accent text-pos-accent-text'
                          : 'bg-pos-surface-2 text-pos-text-muted hover:bg-pos-text/10'
                      }`}
                    >
                      Cédula
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-pos-text-muted mb-2">
                    {invoiceData.identificationType === 'ruc' ? 'RUC (13 dígitos)' : 'Cédula (10 dígitos)'} *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={invoiceData.identificationType === 'ruc' ? '13' : '10'}
                      placeholder={invoiceData.identificationType === 'ruc' ? '1706111505001' : '1234567890'}
                      value={invoiceData.identification}
                      onChange={(e) => handleIdentificationChange(e.target.value)}
                      className="w-full bg-pos-surface-2 border border-pos-border rounded px-3 py-2 pr-9 text-pos-text placeholder-pos-text-muted font-mono"
                    />
                    {customerLookupStatus === 'checking' && (
                      <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-pos-text-muted animate-spin" />
                    )}
                    {customerLookupStatus === 'found' && (
                      <UserCheck size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-pos-success" />
                    )}
                  </div>
                  {customerLookupStatus === 'found' && (
                    <p className="text-xs text-pos-success mt-1.5 flex items-center gap-1">
                      <UserCheck size={12} /> Cliente encontrado - datos cargados automáticamente
                    </p>
                  )}
                  {customerLookupStatus === 'new' && (
                    <p className="text-xs text-pos-accent-soft mt-1.5">Cliente nuevo - completa sus datos</p>
                  )}
                </div>

                {/* Read-only customer summary: found customers are only editable via
                    "Editar Cliente" (updates the saved record); newly registered
                    customers can be corrected by reopening the registration modal. */}
                {(customerLookupStatus === 'found' || (customerLookupStatus === 'new' && invoiceData.razonSocial)) && (
                  <div className="bg-pos-bg border border-pos-border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-pos-text-muted uppercase tracking-wide">Datos del Cliente</span>
                      <button
                        onClick={customerLookupStatus === 'found' ? handleOpenEditCustomer : () => setShowNewCustomerModal(true)}
                        className="text-xs font-bold text-pos-accent-soft hover:opacity-80"
                      >
                        Editar Cliente
                      </button>
                    </div>
                    <div className="text-sm font-bold text-pos-text">{customerDisplay.name}</div>
                    <div className="grid grid-cols-2 gap-3 text-xs text-pos-text-muted">
                      <div>{customerDisplay.email || 'Sin email'}</div>
                      <div>{customerDisplay.phone || 'Sin teléfono'}</div>
                    </div>
                    {customerDisplay.address && <div className="text-xs text-pos-text-muted">{customerDisplay.address}</div>}
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setInvoiceType(null)}
                    className="flex-1 bg-pos-surface-2 hover:bg-pos-text/10 text-pos-text font-bold py-2 rounded-lg transition-colors"
                  >
                    Atrás
                  </button>
                  <button
                    onClick={handleConfirmInvoiceData}
                    disabled={customerLookupStatus !== 'found' && !(customerLookupStatus === 'new' && invoiceData.razonSocial)}
                    className="flex-1 bg-pos-accent hover:bg-pos-accent-hover disabled:bg-pos-surface-2 disabled:text-pos-text-muted disabled:cursor-not-allowed text-pos-accent-text font-bold py-2 rounded-lg transition-colors"
                  >
                    Continuar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Register New Customer Modal */}
      {showNewCustomerModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-pos-surface border border-pos-border rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-pos-text flex items-center gap-2">
                <User size={22} className="text-pos-accent-soft" />
                Registrar Cliente
              </h3>
              <button onClick={() => setShowNewCustomerModal(false)} className="text-pos-text-muted hover:text-pos-text">
                <X size={22} />
              </button>
            </div>

            <div className="bg-pos-accent/10 border border-pos-accent/30 rounded-lg p-3 mb-4">
              <p className="text-xs text-pos-text">
                No se encontró un cliente con {invoiceData.identificationType === 'ruc' ? 'RUC' : 'Cédula'}{' '}
                <span className="font-mono font-bold">{invoiceData.identification}</span>. Regístralo para continuar.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-pos-text-muted mb-2">
                  {invoiceData.identificationType === 'ruc' ? 'Razón Social' : 'Nombre'} *
                </label>
                <input
                  type="text"
                  placeholder={invoiceData.identificationType === 'ruc' ? 'Nombre de la empresa' : 'Nombre completo'}
                  value={newCustomerForm.name}
                  onChange={(e) => setNewCustomerForm({...newCustomerForm, name: e.target.value})}
                  className="w-full bg-pos-surface-2 border border-pos-border rounded px-3 py-2 text-pos-text placeholder-pos-text-muted"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-pos-text-muted mb-2">Email</label>
                  <input
                    type="email"
                    placeholder="cliente@example.com"
                    value={newCustomerForm.email}
                    onChange={(e) => setNewCustomerForm({...newCustomerForm, email: e.target.value})}
                    className="w-full bg-pos-surface-2 border border-pos-border rounded px-3 py-2 text-pos-text placeholder-pos-text-muted text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-pos-text-muted mb-2">Teléfono</label>
                  <input
                    type="tel"
                    placeholder="+593..."
                    value={newCustomerForm.phone}
                    onChange={(e) => setNewCustomerForm({...newCustomerForm, phone: e.target.value})}
                    className="w-full bg-pos-surface-2 border border-pos-border rounded px-3 py-2 text-pos-text placeholder-pos-text-muted text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-pos-text-muted mb-2">Dirección</label>
                <input
                  type="text"
                  placeholder="Calle principal 123"
                  value={newCustomerForm.address}
                  onChange={(e) => setNewCustomerForm({...newCustomerForm, address: e.target.value})}
                  className="w-full bg-pos-surface-2 border border-pos-border rounded px-3 py-2 text-pos-text placeholder-pos-text-muted"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-5">
              <button
                onClick={() => { setShowNewCustomerModal(false); setShowInvoiceType(false); setInvoiceType(null); }}
                className="flex-1 bg-pos-surface-2 hover:bg-pos-text/10 text-pos-text font-bold py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveNewCustomer}
                className="flex-1 bg-pos-accent hover:bg-pos-accent-hover text-pos-accent-text font-bold py-2 rounded-lg transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Existing Customer Modal */}
      {showEditCustomerModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-pos-surface border border-pos-border rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-pos-text flex items-center gap-2">
                <UserCheck size={22} className="text-pos-accent-soft" />
                Editar Cliente
              </h3>
              <button onClick={() => setShowEditCustomerModal(false)} className="text-pos-text-muted hover:text-pos-text">
                <X size={22} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-pos-text-muted mb-2">Nombre *</label>
                <input
                  type="text"
                  value={editCustomerForm.name}
                  onChange={(e) => setEditCustomerForm({...editCustomerForm, name: e.target.value})}
                  className="w-full bg-pos-surface-2 border border-pos-border rounded px-3 py-2 text-pos-text placeholder-pos-text-muted"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-pos-text-muted mb-2">Email</label>
                  <input
                    type="email"
                    value={editCustomerForm.email}
                    onChange={(e) => setEditCustomerForm({...editCustomerForm, email: e.target.value})}
                    className="w-full bg-pos-surface-2 border border-pos-border rounded px-3 py-2 text-pos-text placeholder-pos-text-muted text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-pos-text-muted mb-2">Teléfono</label>
                  <input
                    type="tel"
                    value={editCustomerForm.phone}
                    onChange={(e) => setEditCustomerForm({...editCustomerForm, phone: e.target.value})}
                    className="w-full bg-pos-surface-2 border border-pos-border rounded px-3 py-2 text-pos-text placeholder-pos-text-muted text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-pos-text-muted mb-2">Dirección</label>
                <input
                  type="text"
                  value={editCustomerForm.address}
                  onChange={(e) => setEditCustomerForm({...editCustomerForm, address: e.target.value})}
                  className="w-full bg-pos-surface-2 border border-pos-border rounded px-3 py-2 text-pos-text placeholder-pos-text-muted"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-5">
              <button
                onClick={() => setShowEditCustomerModal(false)}
                className="flex-1 bg-pos-surface-2 hover:bg-pos-text/10 text-pos-text font-bold py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEditCustomer}
                className="flex-1 bg-pos-accent hover:bg-pos-accent-hover text-pos-accent-text font-bold py-2 rounded-lg transition-colors"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
