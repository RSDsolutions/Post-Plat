import React, { useState, useEffect } from 'react';
import { FileText, Save, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { saveBillingConfig, getBillingConfig, getPaymentMethods, fetchCompanyById } from '../../lib/supabaseHelpers.js';
import { validateRUC } from '../../lib/invoiceUtils.js';

export default function BillingConfiguration() {
  const { currentUser, showToast } = useStore();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [company, setCompany] = useState(null);

  const [config, setConfig] = useState({
    establishment: '001',
    pointOfSale: '001',
    environment: 'production',
    sriUsername: '',
    sriPassword: '',
    sriTestMode: true,
    currentSequential: 1,
    accountingRegime: 'general',
    taxRate: 12.00,
    receiptFooterText: '',
    autoSendSRI: false,
    phone: '',
    email: '',
    address: '',
    ruc: '',
    razonSocial: '',
    nombreComercial: '',
    llevaContabilidad: false
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // Load company data
        const companyData = await fetchCompanyById(currentUser.company_id);
        setCompany(companyData);

        // Load billing config
        const billingConfig = await getBillingConfig(currentUser.company_id);
        setConfig(prev => ({
          ...prev,
          ...billingConfig,
          ruc: companyData.ruc || '',
          razonSocial: companyData.razon_social || '',
          nombreComercial: companyData.nombre_comercial || '',
          llevaContabilidad: companyData.lleva_contabilidad || false,
          phone: billingConfig.phone || companyData.phone || '',
          email: billingConfig.email || companyData.email || '',
          address: billingConfig.address || companyData.address || ''
        }));

        // Load payment methods
        const methods = await getPaymentMethods();
        setPaymentMethods(methods);
      } catch (error) {
        console.error('Error loading data:', error);
        showToast('error', 'Error al cargar configuración');
      } finally {
        setLoading(false);
      }
    };

    if (currentUser?.company_id) {
      loadData();
    }
  }, [currentUser, showToast]);

  const handleSave = async () => {
    try {
      setSaving(true);

      // Validaciones
      if (!config.ruc) {
        showToast('error', 'RUC requerido');
        return;
      }

      if (!validateRUC(config.ruc)) {
        showToast('error', 'RUC inválido (debe ser 13 dígitos, ej: 1706111505001)');
        return;
      }

      if (!config.razonSocial || !config.nombreComercial) {
        showToast('error', 'Razón social y nombre comercial son requeridos');
        return;
      }

      if (!config.phone || !config.email || !config.address) {
        showToast('error', 'Teléfono, email y dirección son requeridos');
        return;
      }

      // Si es en ambiente de producción y usa SRI, validar credenciales
      if (config.environment === 'production' && config.autoSendSRI) {
        if (!config.sriUsername || !config.sriPassword) {
          showToast('error', 'Usuario y contraseña del SRI son requeridos para envío automático');
          return;
        }
      }

      // Guardar en Supabase
      await saveBillingConfig(currentUser.company_id, config);

      showToast('success', 'Configuración de facturación guardada correctamente');
    } catch (error) {
      console.error('Error saving:', error);
      showToast('error', error.message || 'Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader className="animate-spin" size={48} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <FileText className="text-emerald-500" size={32} />
        <h1 className="text-4xl font-bold text-zinc-100">Configuración de Facturación Electrónica</h1>
      </div>

      {/* Warning */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="text-amber-500 flex-shrink-0 mt-1" size={20} />
        <div>
          <h3 className="font-bold text-amber-400">Información Importante</h3>
          <p className="text-sm text-amber-300 mt-1">
            Los datos aquí configurados deben ser precisos y válidos ante el SRI. Cualquier error puede causar rechazo de facturas.
          </p>
        </div>
      </div>

      {/* Identification Data */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <CheckCircle size={24} className="text-blue-500" />
          Identificación Tributaria
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">RUC (13 dígitos) *</label>
            <input
              type="text"
              maxLength="13"
              placeholder="1723456789001"
              value={config.ruc}
              onChange={(e) => setConfig({...config, ruc: e.target.value})}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 font-mono"
            />
            {config.ruc && validateRUC(config.ruc) && (
              <p className="text-xs text-emerald-400 mt-1">✓ RUC válido</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">Regimen Contable</label>
            <select
              value={config.accountingRegime}
              onChange={(e) => setConfig({...config, accountingRegime: e.target.value})}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
            >
              <option value="general">General</option>
              <option value="special">Régimen Especial</option>
              <option value="micro">Microempresa</option>
              <option value="rimpe">RIMPE</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">Razón Social *</label>
            <input
              type="text"
              placeholder="Mi Empresa S.A."
              value={config.razonSocial}
              onChange={(e) => setConfig({...config, razonSocial: e.target.value})}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">Nombre Comercial *</label>
            <input
              type="text"
              placeholder="Mi Tienda"
              value={config.nombreComercial}
              onChange={(e) => setConfig({...config, nombreComercial: e.target.value})}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-2">Dirección Comercial *</label>
          <input
            type="text"
            placeholder="Calle Principal 123, Piso 2"
            value={config.address}
            onChange={(e) => setConfig({...config, address: e.target.value})}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">Teléfono *</label>
            <input
              type="tel"
              placeholder="+593 2 1234567"
              value={config.phone}
              onChange={(e) => setConfig({...config, phone: e.target.value})}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">Email *</label>
            <input
              type="email"
              placeholder="info@empresa.com"
              value={config.email}
              onChange={(e) => setConfig({...config, email: e.target.value})}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="llevaContabilidad"
            checked={config.llevaContabilidad}
            onChange={(e) => setConfig({...config, llevaContabilidad: e.target.checked})}
            className="w-4 h-4 rounded"
          />
          <label htmlFor="llevaContabilidad" className="text-sm text-zinc-300">
            La empresa lleva contabilidad formal
          </label>
        </div>
      </div>

      {/* Punto de Venta Configuration */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-bold text-zinc-100">Punto de Venta</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">Establecimiento (3 dígitos)</label>
            <input
              type="text"
              maxLength="3"
              placeholder="001"
              value={config.establishment}
              onChange={(e) => setConfig({...config, establishment: e.target.value})}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">Punto de Venta (3 dígitos)</label>
            <input
              type="text"
              maxLength="3"
              placeholder="001"
              value={config.pointOfSale}
              onChange={(e) => setConfig({...config, pointOfSale: e.target.value})}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-2">Secuencial Actual</label>
          <input
            type="number"
            min="1"
            value={config.currentSequential}
            onChange={(e) => setConfig({...config, currentSequential: parseInt(e.target.value) || 1})}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white font-mono"
          />
          <p className="text-xs text-zinc-500 mt-1">
            Próxima factura será: {config.ruc}-{config.establishment}-{config.pointOfSale}-{String(config.currentSequential).padStart(9, '0')}
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-2">Tasa IVA (%)</label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={config.taxRate}
            onChange={(e) => setConfig({...config, taxRate: parseFloat(e.target.value) || 12})}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
          />
        </div>
      </div>

      {/* SRI Configuration */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-bold text-zinc-100">Configuración del SRI</h2>

        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-2">Ambiente</label>
          <select
            value={config.environment}
            onChange={(e) => setConfig({...config, environment: e.target.value})}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
          >
            <option value="production">Producción (Real)</option>
            <option value="test">Pruebas (Test)</option>
          </select>
          <p className="text-xs text-zinc-500 mt-1">
            {config.environment === 'production'
              ? '⚠️ Ambiente real: las facturas se enviarán al SRI'
              : '✓ Ambiente de pruebas: no genera obligación legal'}
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="autoSendSRI"
            checked={config.autoSendSRI}
            onChange={(e) => setConfig({...config, autoSendSRI: e.target.checked})}
            className="w-4 h-4 rounded"
          />
          <label htmlFor="autoSendSRI" className="text-sm text-zinc-300">
            Enviar facturas automáticamente al SRI
          </label>
        </div>

        {config.autoSendSRI && config.environment === 'production' && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3 space-y-3">
            <p className="text-xs text-amber-400 font-bold">⚠️ Requiere credenciales SRI para envío automático</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2">Usuario SRI *</label>
                <input
                  type="text"
                  placeholder="RFC@empresa.com"
                  value={config.sriUsername}
                  onChange={(e) => setConfig({...config, sriUsername: e.target.value})}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-white placeholder-zinc-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2">Contraseña SRI *</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={config.sriPassword}
                  onChange={(e) => setConfig({...config, sriPassword: e.target.value})}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-white placeholder-zinc-500"
                />
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-2">Pie de Recibo (Opcional)</label>
          <textarea
            placeholder="Ej: Gracias por su compra. Retenciones según LRTI."
            value={config.receiptFooterText}
            onChange={(e) => setConfig({...config, receiptFooterText: e.target.value})}
            rows="3"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
          />
        </div>
      </div>

      {/* Métodos de Pago */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-bold text-zinc-100">Métodos de Pago Disponibles</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {paymentMethods.map(method => (
            <div key={method.id} className="bg-zinc-950 rounded p-2 text-center border border-zinc-800">
              <div className="font-bold text-sm text-zinc-100">{method.name}</div>
              <div className="text-xs text-zinc-500">(SRI: {method.sri_code})</div>
            </div>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving || loading}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        <Save size={20} />
        {saving ? 'Guardando...' : 'Guardar Configuración de Facturación'}
      </button>

      {/* Info Box */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <h3 className="font-bold text-blue-400 mb-2">¿Necesitas Ayuda?</h3>
        <ul className="text-xs text-blue-300 space-y-1">
          <li>• El RUC debe tener exactamente 13 dígitos (ej: 1706111505001)</li>
          <li>• El SRI es quien valida finalmente el RUC cuando envíes facturas</li>
          <li>• Los datos aquí configurados aparecerán en todas las facturas</li>
          <li>• Puedes cambiar la configuración en cualquier momento</li>
          <li>• En ambiente de pruebas, las facturas NO se envían al SRI</li>
          <li>• El secuencial se incrementa automáticamente con cada factura</li>
          <li>• Copia tu RUC directamente desde la consulta del SRI para evitar errores</li>
        </ul>
      </div>
    </div>
  );
}
