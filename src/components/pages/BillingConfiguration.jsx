import React, { useState, useEffect, useRef } from 'react';
import { FileText, Save, AlertCircle, CheckCircle, Loader, Upload, ShieldCheck } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { saveBillingConfig, getBillingConfig, getPaymentMethods, fetchCompanyById, uploadSriCertificate } from '../../lib/supabaseHelpers.js';
import { validateRUC } from '../../lib/invoiceUtils.js';
import { validateP12Certificate } from '../../lib/certValidation.js';

export default function BillingConfiguration() {
  const { currentUser, showToast } = useStore();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [company, setCompany] = useState(null);
  const loadedCompanyIdRef = useRef(null);

  const [config, setConfig] = useState({
    establishment: '001',
    pointOfSale: '001',
    environment: 'production',
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
    llevaContabilidad: false,
    certStoragePath: null,
    certUploadedAt: null
  });

  const [certFile, setCertFile] = useState(null);
  const [certPassword, setCertPassword] = useState('');
  const [uploadingCert, setUploadingCert] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // Load company data
        const companyData = await fetchCompanyById(currentUser.company_id);
        setCompany(companyData);

        // Load billing config
        const billingConfig = await getBillingConfig(currentUser.company_id);

        // Merge: company data has priority for identification fields
        // billing_config provides SRI/POS-specific settings
        setConfig({
          ruc: companyData.ruc || '',
          razonSocial: companyData.razon_social || '',
          nombreComercial: companyData.nombre_comercial || '',
          llevaContabilidad: companyData.lleva_contabilidad || false,
          phone: companyData.telefono_facturacion || companyData.phone || billingConfig.phone || '',
          email: companyData.email_facturacion || companyData.email || billingConfig.email || '',
          address: companyData.direccion || companyData.address || billingConfig.address || '',
          establishment: billingConfig.establishment || '001',
          pointOfSale: billingConfig.pointOfSale || '001',
          environment: billingConfig.environment || 'production',
          sriTestMode: billingConfig.sriTestMode !== false,
          currentSequential: billingConfig.currentSequential || 1,
          accountingRegime: billingConfig.accountingRegime || 'general',
          taxRate: billingConfig.taxRate || 12.00,
          receiptFooterText: billingConfig.receiptFooterText || '',
          autoSendSRI: billingConfig.autoSendSRI || false,
          certStoragePath: billingConfig.certStoragePath || null,
          certUploadedAt: billingConfig.certUploadedAt || null
        });

        // Load payment methods
        const methods = await getPaymentMethods();
        setPaymentMethods(methods);

        // Mark company as loaded to avoid re-loading
        loadedCompanyIdRef.current = currentUser.company_id;
      } catch (error) {
        console.error('Error loading data:', error);
        showToast('error', 'Error al cargar configuración');
      } finally {
        setLoading(false);
      }
    };

    // Only load if company_id changed
    if (currentUser?.company_id && loadedCompanyIdRef.current !== currentUser.company_id) {
      loadData();
    }
  }, [currentUser?.company_id, showToast]);

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

      // Guardar en Supabase
      await saveBillingConfig(currentUser.company_id, config);

      showToast('success', 'Configuración de facturación guardada correctamente');

      // Recargar datos desde la BD para asegurar consistencia
      const updatedCompany = await fetchCompanyById(currentUser.company_id);
      const updatedBillingConfig = await getBillingConfig(currentUser.company_id);

      setCompany(updatedCompany);
      setConfig({
        ruc: updatedCompany.ruc || '',
        razonSocial: updatedCompany.razon_social || '',
        nombreComercial: updatedCompany.nombre_comercial || '',
        llevaContabilidad: updatedCompany.lleva_contabilidad || false,
        phone: updatedCompany.telefono_facturacion || updatedCompany.phone || updatedBillingConfig.phone || '',
        email: updatedCompany.email_facturacion || updatedCompany.email || updatedBillingConfig.email || '',
        address: updatedCompany.direccion || updatedCompany.address || updatedBillingConfig.address || '',
        establishment: updatedBillingConfig.establishment || '001',
        pointOfSale: updatedBillingConfig.pointOfSale || '001',
        environment: updatedBillingConfig.environment || 'production',
        sriTestMode: updatedBillingConfig.sriTestMode !== false,
        currentSequential: updatedBillingConfig.currentSequential || 1,
        accountingRegime: updatedBillingConfig.accountingRegime || 'general',
        taxRate: updatedBillingConfig.taxRate || 12.00,
        receiptFooterText: updatedBillingConfig.receiptFooterText || '',
        autoSendSRI: updatedBillingConfig.autoSendSRI || false,
        certStoragePath: updatedBillingConfig.certStoragePath || null,
        certUploadedAt: updatedBillingConfig.certUploadedAt || null
      });
    } catch (error) {
      console.error('Error saving:', error);
      showToast('error', error.message || 'Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadCert = async () => {
    if (!certFile) {
      showToast('error', 'Selecciona el archivo .p12 del certificado');
      return;
    }
    if (!certPassword) {
      showToast('error', 'Ingresa la contraseña del certificado');
      return;
    }

    try {
      setUploadingCert(true);

      // Validate the file + password actually parse as a valid, currently-valid
      // .p12 with a private key before uploading it anywhere
      const certInfo = await validateP12Certificate(certFile, certPassword);

      const result = await uploadSriCertificate(currentUser.company_id, certFile, certPassword);
      setConfig(prev => ({
        ...prev,
        certStoragePath: result.certStoragePath,
        certUploadedAt: result.certUploadedAt,
        certHolderName: certInfo.commonName,
        certExpiresAt: certInfo.notAfter
      }));
      setCertFile(null);
      setCertPassword('');
      showToast('success', `Certificado válido de "${certInfo.commonName}" cargado correctamente`);
    } catch (error) {
      console.error('Error uploading certificate:', error);
      showToast('error', error.message || 'Error al subir el certificado');
    } finally {
      setUploadingCert(false);
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

      {/* Certificado de Firma Electrónica */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <ShieldCheck size={24} className="text-emerald-500" />
          Certificado de Firma Electrónica
        </h2>
        <p className="text-xs text-zinc-500">
          Necesario para firmar y enviar facturas electrónicas reales al SRI. Debe ser un archivo .p12 emitido por una entidad certificadora autorizada (Banco Central, Security Data, ANF, etc.)
        </p>

        {config.certStoragePath ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 flex items-center gap-3">
            <CheckCircle className="text-emerald-400" size={20} />
            <div>
              <div className="text-sm font-bold text-emerald-300">Certificado cargado y validado</div>
              {config.certHolderName && (
                <div className="text-xs text-emerald-300">Titular: {config.certHolderName}</div>
              )}
              {config.certExpiresAt && (
                <div className="text-xs text-emerald-400">Vence: {new Date(config.certExpiresAt).toLocaleDateString()}</div>
              )}
              <div className="text-xs text-emerald-400">
                {config.certUploadedAt ? `Subido: ${new Date(config.certUploadedAt).toLocaleString()}` : ''}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-xs text-amber-400 font-bold">⚠️ Aún no has cargado un certificado. No podrás enviar facturas reales al SRI hasta hacerlo.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">Archivo del certificado (.p12 / .pfx)</label>
            <input
              type="file"
              accept=".p12,.pfx"
              onChange={(e) => setCertFile(e.target.files?.[0] || null)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:bg-zinc-700 file:text-zinc-200 file:text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">Contraseña del certificado</label>
            <input
              type="password"
              placeholder="••••••••"
              value={certPassword}
              onChange={(e) => setCertPassword(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
            />
          </div>
        </div>

        <button
          onClick={handleUploadCert}
          disabled={uploadingCert || !certFile}
          className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800/50 disabled:text-zinc-600 disabled:cursor-not-allowed text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
        >
          <Upload size={16} />
          {uploadingCert ? 'Subiendo...' : config.certStoragePath ? 'Reemplazar Certificado' : 'Subir Certificado'}
        </button>
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
