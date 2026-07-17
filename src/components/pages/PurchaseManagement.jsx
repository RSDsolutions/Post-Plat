import React, { useState, useEffect, useMemo } from 'react';
import { ShoppingBag, Plus, Trash2, X, Save, Receipt, FileCheck2, Loader, UploadCloud, Download, ShieldCheck } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import {
  fetchSuppliers, createSupplier, fetchBranches, fetchRetentionConcepts,
  createPurchaseWithDetails, fetchPurchases, submitRetentionToSri, getNextDocumentSequential,
  uploadSupplierInvoiceXml, downloadSupplierInvoiceXml, verifySupplierDocument
} from '../../lib/supabaseHelpers.js';
import { parseSupplierInvoiceXml } from '../../lib/supplierXmlParser.js';
import { formatUSD } from '../../lib/format.js';
import Table from '../ui/Table.jsx';

const DOC_TYPE_LABELS = {
  factura_compra: 'Factura de Compra',
  liquidacion_compra: 'Liquidación de Compra',
  nota_venta: 'Nota de Venta'
};

const EMPTY_LINE = { description: '', quantity: 1, unit_price: 0, discount: 0, iva_rate: 12 };
const EMPTY_SUPPLIER_FORM = { ruc: '', razon_social: '', tipo_contribuyente: 'sociedad' };

function round2(n) {
  return Math.round((parseFloat(n) || 0) * 100) / 100;
}

function lineSubtotal(line) {
  return (parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0) - (parseFloat(line.discount) || 0);
}

export default function PurchaseManagement() {
  const { currentUser, showToast, can } = useStore();
  const [suppliers, setSuppliers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [retentionConcepts, setRetentionConcepts] = useState([]);
  const [recentPurchases, setRecentPurchases] = useState([]);
  const [submittingRetentionId, setSubmittingRetentionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [purchaseDocType, setPurchaseDocType] = useState('factura_compra');
  const [supplierDocumentNumber, setSupplierDocumentNumber] = useState('');
  const [supplierAccessKey, setSupplierAccessKey] = useState('');
  const [documentDate, setDocumentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [retentions, setRetentions] = useState([]);
  const [source, setSource] = useState('manual');
  const [xmlFilePath, setXmlFilePath] = useState(null);
  const [importingXml, setImportingXml] = useState(false);
  const [verifyingSri, setVerifyingSri] = useState(false);
  const [sriVerifyResult, setSriVerifyResult] = useState(null);

  const [showQuickSupplier, setShowQuickSupplier] = useState(false);
  const [quickSupplierForm, setQuickSupplierForm] = useState(EMPTY_SUPPLIER_FORM);

  const [showAddRetention, setShowAddRetention] = useState(false);
  const [retentionConceptId, setRetentionConceptId] = useState('');
  const [retentionTypeToAdd, setRetentionTypeToAdd] = useState('renta');
  const [retentionPercentToAdd, setRetentionPercentToAdd] = useState('');

  const loadAll = async () => {
    try {
      const [supplierList, branchList, conceptList, purchaseList] = await Promise.all([
        fetchSuppliers(currentUser.company_id),
        fetchBranches(currentUser.company_id),
        fetchRetentionConcepts(),
        fetchPurchases(currentUser.company_id)
      ]);
      setSuppliers(supplierList);
      setBranches(branchList);
      setRetentionConcepts(conceptList);
      setRecentPurchases(purchaseList.slice(0, 10));
    } catch (error) {
      console.error('Error:', error);
      showToast('error', 'Error al cargar datos de compras');
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await loadAll();
      setLoading(false);
    };
    if (currentUser?.company_id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.company_id]);

  const totals = useMemo(() => {
    const subtotal_0 = lines.filter(l => (parseFloat(l.iva_rate) || 0) === 0).reduce((s, l) => s + lineSubtotal(l), 0);
    const subtotal_iva = lines.filter(l => (parseFloat(l.iva_rate) || 0) > 0).reduce((s, l) => s + lineSubtotal(l), 0);
    const iva_amount = lines.reduce((s, l) => s + lineSubtotal(l) * ((parseFloat(l.iva_rate) || 0) / 100), 0);
    return { subtotal_0: round2(subtotal_0), subtotal_iva: round2(subtotal_iva), iva_amount: round2(iva_amount), total: round2(subtotal_0 + subtotal_iva + iva_amount) };
  }, [lines]);

  const retentionsComputed = useMemo(() => {
    return retentions.map(r => {
      const base = r.retention_type === 'iva' ? totals.iva_amount : (totals.subtotal_0 + totals.subtotal_iva);
      const amount = round2(base * ((parseFloat(r.retention_percentage) || 0) / 100));
      return { ...r, retention_base: base, retention_amount: amount };
    });
  }, [retentions, totals]);

  const totalRetained = round2(retentionsComputed.reduce((s, r) => s + r.retention_amount, 0));
  const netToPay = round2(totals.total - totalRetained);

  const selectedConcept = retentionConcepts.find(c => c.id === retentionConceptId);

  useEffect(() => {
    if (!selectedConcept) return;
    if (retentionTypeToAdd === 'renta') setRetentionPercentToAdd(String(selectedConcept.porcentaje_renta_sugerido ?? 0));
    else setRetentionPercentToAdd(String(selectedConcept.porcentaje_iva_sugerido ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retentionConceptId, retentionTypeToAdd]);

  const updateLine = (index, field, value) => {
    setLines(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l));
  };
  const addLine = () => setLines(prev => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (index) => setLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);

  const handleQuickAddSupplier = async () => {
    if (!quickSupplierForm.ruc.trim() || !quickSupplierForm.razon_social.trim()) {
      showToast('error', 'RUC y Razón Social son requeridos');
      return;
    }
    try {
      const created = await createSupplier({ company_id: currentUser.company_id, ...quickSupplierForm });
      showToast('success', `Proveedor "${created.razon_social}" agregado`);
      setSuppliers(prev => [...prev, created].sort((a, b) => a.razon_social.localeCompare(b.razon_social)));
      setSupplierId(created.id);
      setQuickSupplierForm(EMPTY_SUPPLIER_FORM);
      setShowQuickSupplier(false);
    } catch (error) {
      showToast('error', error.message || 'Error al crear proveedor');
    }
  };

  const handleAddRetention = () => {
    if (!retentionConceptId) {
      showToast('error', 'Selecciona un concepto de retención');
      return;
    }
    if (retentionTypeToAdd === 'iva' && !selectedConcept?.aplica_iva) {
      showToast('error', 'Este concepto no tiene retención de IVA');
      return;
    }
    setRetentions(prev => [...prev, {
      tempId: `${Date.now()}-${Math.random()}`,
      retention_type: retentionTypeToAdd,
      retention_concept_id: retentionConceptId,
      retention_percentage: parseFloat(retentionPercentToAdd) || 0
    }]);
    setShowAddRetention(false);
    setRetentionConceptId('');
    setRetentionPercentToAdd('');
  };

  const removeRetention = (tempId) => setRetentions(prev => prev.filter(r => r.tempId !== tempId));

  const resetForm = () => {
    setSupplierId(''); setBranchId(''); setPurchaseDocType('factura_compra');
    setSupplierDocumentNumber(''); setSupplierAccessKey('');
    setDocumentDate(new Date().toISOString().slice(0, 10)); setDueDate('');
    setLines([{ ...EMPTY_LINE }]); setRetentions([]);
    setSource('manual'); setXmlFilePath(null); setSriVerifyResult(null);
  };

  const handleImportXml = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo después
    if (!file) return;

    setImportingXml(true);
    setSriVerifyResult(null);
    try {
      const xmlText = await file.text();
      const parsed = parseSupplierInvoiceXml(xmlText);
      const uploadedPath = await uploadSupplierInvoiceXml(currentUser.company_id, file);

      const existingSupplier = suppliers.find(s => s.ruc === parsed.supplierRuc);
      if (existingSupplier) {
        setSupplierId(existingSupplier.id);
      } else {
        setSupplierId('');
        setQuickSupplierForm({ ruc: parsed.supplierRuc, razon_social: parsed.supplierRazonSocial, tipo_contribuyente: 'sociedad' });
        setShowQuickSupplier(true);
        showToast('warning', `No existe un proveedor con RUC ${parsed.supplierRuc} - complétalo para continuar`);
      }

      setPurchaseDocType(parsed.purchaseDocType);
      setSupplierDocumentNumber(parsed.documentNumber);
      setSupplierAccessKey(parsed.accessKey || '');
      if (parsed.documentDate) setDocumentDate(parsed.documentDate);
      setLines(parsed.lines.map(l => ({
        description: l.description, quantity: l.quantity, unit_price: l.unit_price, discount: l.discount, iva_rate: l.iva_rate
      })));
      setSource('xml_import');
      setXmlFilePath(uploadedPath);

      showToast('success', `XML importado: ${parsed.lines.length} línea(s). Revisa los datos antes de guardar.`);
    } catch (error) {
      console.error('Error importing XML:', error);
      showToast('error', error.message || 'Error al importar el XML');
    } finally {
      setImportingXml(false);
    }
  };

  const handleVerifySri = async () => {
    if (!supplierAccessKey.trim()) return;
    setVerifyingSri(true);
    setSriVerifyResult(null);
    try {
      const result = await verifySupplierDocument(supplierAccessKey.trim());
      setSriVerifyResult(result);
      if (!result.found) {
        showToast('error', 'El SRI no tiene ningún comprobante con esta clave de acceso');
      } else if (result.estado !== 'AUTORIZADO') {
        showToast('warning', `El comprobante NO está autorizado (estado: ${result.estado})`);
      } else {
        showToast('success', 'El comprobante está autorizado por el SRI');
      }
    } catch (error) {
      console.error('Error verifying SRI document:', error);
      showToast('error', error.message || 'Error al verificar ante el SRI');
    } finally {
      setVerifyingSri(false);
    }
  };

  const handleDownloadXml = async (purchase) => {
    try {
      const blob = await downloadSupplierInvoiceXml(purchase.xml_file_path);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = purchase.xml_file_path.split('/').pop();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading XML:', error);
      showToast('error', error.message || 'Error al descargar el XML');
    }
  };

  const handleSave = async () => {
    if (!supplierId) { showToast('error', 'Selecciona un proveedor'); return; }
    if (!supplierDocumentNumber.trim()) { showToast('error', 'Indica el número del documento del proveedor'); return; }
    if (lines.some(l => !l.description.trim() || (parseFloat(l.unit_price) || 0) <= 0)) {
      showToast('error', 'Cada línea necesita descripción y un precio mayor a 0');
      return;
    }
    if (totals.total <= 0) { showToast('error', 'El total de la compra debe ser mayor a 0'); return; }

    setSaving(true);
    try {
      await createPurchaseWithDetails({
        header: {
          company_id: currentUser.company_id,
          branch_id: branchId || null,
          supplier_id: supplierId,
          purchase_doc_type: purchaseDocType,
          supplier_document_number: supplierDocumentNumber.trim(),
          supplier_access_key: supplierAccessKey.trim() || null,
          document_date: documentDate,
          due_date: dueDate || null,
          subtotal_0: totals.subtotal_0,
          subtotal_iva: totals.subtotal_iva,
          iva_amount: totals.iva_amount,
          total: totals.total,
          source,
          xml_file_path: xmlFilePath,
          created_by: currentUser.id
        },
        lines: lines.map(l => ({
          description: l.description, quantity: parseFloat(l.quantity) || 0, unit_price: parseFloat(l.unit_price) || 0,
          discount: parseFloat(l.discount) || 0, iva_rate: parseFloat(l.iva_rate) || 0, subtotal: round2(lineSubtotal(l))
        })),
        retentions: retentionsComputed.map(r => ({
          retention_type: r.retention_type, retention_concept_id: r.retention_concept_id,
          retention_percentage: r.retention_percentage, retention_base: r.retention_base, retention_amount: r.retention_amount
        }))
      });

      showToast('success', `Compra registrada. Saldo neto a pagar: ${formatUSD(netToPay)}`);
      resetForm();
      await loadAll();
    } catch (error) {
      console.error('Error saving purchase:', error);
      showToast('error', error.message || 'Error al registrar la compra');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitRetention = async (purchase) => {
    setSubmittingRetentionId(purchase.id);
    try {
      // El punto de emisión y su secuencial se resuelven acá, con la
      // sesión real del gerente (mismo patrón que la nota de crédito) - el
      // de la sucursal de la compra si tiene, si no el primero disponible.
      const branchPos = branches.find(b => b.id === purchase.branch_id)?.point_of_sales?.[0];
      const anyPos = branches.flatMap(b => b.point_of_sales || [])[0];
      const pos = branchPos || anyPos;
      if (!pos) {
        showToast('error', 'No hay ningún punto de venta configurado para emitir la retención');
        return;
      }
      const sequential = await getNextDocumentSequential(pos.id, 'comprobante_retencion');
      const result = await submitRetentionToSri(purchase.id, pos.id, sequential);
      showToast('success', `Comprobante de retención autorizado (clave de acceso: ${result.accessKey})`);
      await loadAll();
    } catch (error) {
      console.error('Error submitting retention:', error);
      showToast('error', error.message || 'Error al emitir el comprobante de retención');
    } finally {
      setSubmittingRetentionId(null);
    }
  };

  if (!can('purchases.read')) return null;

  if (loading) {
    return <div className="max-w-6xl mx-auto p-8 text-center text-panel-text-muted">Cargando...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-panel-text">Registro de Compras</h1>
        <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold cursor-pointer transition-colors ${importingXml ? 'bg-panel-surface-2 text-panel-text-muted cursor-wait' : 'bg-panel-accent/20 hover:bg-panel-accent/30 text-panel-accent-soft'}`}>
          {importingXml ? <Loader size={16} className="animate-spin" /> : <UploadCloud size={16} />}
          {importingXml ? 'Importando...' : 'Cargar XML del proveedor'}
          <input type="file" accept=".xml" onChange={handleImportXml} disabled={importingXml} className="hidden" />
        </label>
      </div>

      <div className="bg-panel-surface rounded-2xl border border-panel-border p-6 space-y-6">
        {source === 'xml_import' && (
          <div className="bg-panel-accent/10 border border-panel-accent/30 rounded-lg p-3 flex items-center gap-2">
            <FileCheck2 size={16} className="text-panel-accent-soft flex-shrink-0" />
            <p className="text-xs text-panel-accent-soft">
              Datos precargados desde un XML del proveedor - revísalos antes de guardar. El archivo original queda guardado para consultarlo después.
            </p>
          </div>
        )}
        {/* Proveedor y documento */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-panel-text-muted mb-2">Proveedor (Requerido)</label>
            <div className="flex gap-2">
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="flex-1 bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
              >
                <option value="">Selecciona un proveedor...</option>
                {suppliers.filter(s => s.is_active).map(s => (
                  <option key={s.id} value={s.id}>{s.razon_social} ({s.ruc})</option>
                ))}
              </select>
              {can('suppliers.write') && (
                <button
                  onClick={() => setShowQuickSupplier(true)}
                  title="Alta rápida de proveedor"
                  className="bg-panel-accent/20 hover:bg-panel-accent/30 text-panel-accent-soft rounded px-3 py-2 transition-colors"
                >
                  <Plus size={18} />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-panel-text-muted mb-2">Sucursal (Opcional)</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
            >
              <option value="">Sin sucursal específica</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-panel-text-muted mb-2">Tipo de Documento</label>
            <select
              value={purchaseDocType}
              onChange={(e) => setPurchaseDocType(e.target.value)}
              className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
            >
              {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-panel-text-muted mb-2">Número (Requerido)</label>
            <input
              type="text"
              placeholder="001-001-000000123"
              value={supplierDocumentNumber}
              onChange={(e) => setSupplierDocumentNumber(e.target.value)}
              className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-panel-text-muted mb-2">Fecha del Documento</label>
            <input
              type="date"
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
              className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-panel-text-muted mb-2">Clave de Acceso (Opcional)</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="49 dígitos"
                value={supplierAccessKey}
                onChange={(e) => { setSupplierAccessKey(e.target.value); setSriVerifyResult(null); }}
                className="flex-1 bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
              />
              {supplierAccessKey.trim().length === 49 && (
                <button
                  type="button"
                  onClick={handleVerifySri}
                  disabled={verifyingSri}
                  title="Verificar ante el SRI"
                  className="bg-panel-accent/20 hover:bg-panel-accent/30 disabled:opacity-50 text-panel-accent-soft rounded px-3 flex items-center justify-center transition-colors"
                >
                  {verifyingSri ? <Loader size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                </button>
              )}
            </div>
            {sriVerifyResult && (
              <p className={`text-xs mt-1 font-bold ${sriVerifyResult.found && sriVerifyResult.estado === 'AUTORIZADO' ? 'text-panel-success' : 'text-panel-danger'}`}>
                {sriVerifyResult.found
                  ? `SRI: ${sriVerifyResult.estado}${sriVerifyResult.fechaAutorizacion ? ' - ' + sriVerifyResult.fechaAutorizacion : ''}`
                  : 'El SRI no tiene ningún comprobante con esta clave de acceso'}
              </p>
            )}
          </div>
        </div>

        {/* Líneas de detalle */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-panel-text-muted">Detalle</h3>
            <button
              onClick={addLine}
              className="text-xs font-bold text-panel-accent-soft hover:underline flex items-center gap-1"
            >
              <Plus size={14} /> Agregar línea
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_80px_100px_90px_90px_100px_36px] gap-2 items-center bg-panel-bg/50 border border-panel-border rounded-lg p-2">
                <input
                  type="text"
                  placeholder="Descripción"
                  value={line.description}
                  onChange={(e) => updateLine(i, 'description', e.target.value)}
                  className="bg-panel-surface-2 border border-panel-border rounded px-2 py-1.5 text-sm text-panel-text placeholder-panel-text-muted"
                />
                <input
                  type="number" min="0" step="0.01" placeholder="Cant."
                  value={line.quantity}
                  onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                  className="bg-panel-surface-2 border border-panel-border rounded px-2 py-1.5 text-sm text-panel-text"
                />
                <input
                  type="number" min="0" step="0.01" placeholder="P. Unit."
                  value={line.unit_price}
                  onChange={(e) => updateLine(i, 'unit_price', e.target.value)}
                  className="bg-panel-surface-2 border border-panel-border rounded px-2 py-1.5 text-sm text-panel-text"
                />
                <input
                  type="number" min="0" step="0.01" placeholder="Desc."
                  value={line.discount}
                  onChange={(e) => updateLine(i, 'discount', e.target.value)}
                  className="bg-panel-surface-2 border border-panel-border rounded px-2 py-1.5 text-sm text-panel-text"
                />
                <select
                  value={line.iva_rate}
                  onChange={(e) => updateLine(i, 'iva_rate', e.target.value)}
                  className="bg-panel-surface-2 border border-panel-border rounded px-2 py-1.5 text-sm text-panel-text"
                >
                  <option value="0">0% IVA</option>
                  <option value="12">12% IVA</option>
                  <option value="15">15% IVA</option>
                </select>
                <div className="text-sm font-bold text-panel-text text-right pr-1">{formatUSD(round2(lineSubtotal(line)))}</div>
                <button onClick={() => removeLine(i)} className="text-panel-danger hover:opacity-80 flex justify-center">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Retenciones */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-panel-text-muted">Retenciones</h3>
            <button
              onClick={() => setShowAddRetention(true)}
              className="text-xs font-bold text-panel-accent-soft hover:underline flex items-center gap-1"
            >
              <Plus size={14} /> Agregar retención
            </button>
          </div>

          {showAddRetention && (
            <div className="bg-panel-accent/10 border border-panel-accent/30 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-1">Concepto</label>
                  <select
                    value={retentionConceptId}
                    onChange={(e) => setRetentionConceptId(e.target.value)}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-2 py-1.5 text-sm text-panel-text"
                  >
                    <option value="">Selecciona...</option>
                    {retentionConcepts.map(c => <option key={c.id} value={c.id}>{c.codigo_sri} - {c.descripcion}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-1">Tipo</label>
                  <select
                    value={retentionTypeToAdd}
                    onChange={(e) => setRetentionTypeToAdd(e.target.value)}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-2 py-1.5 text-sm text-panel-text"
                  >
                    <option value="renta">Renta</option>
                    <option value="iva" disabled={!selectedConcept?.aplica_iva}>IVA{!selectedConcept?.aplica_iva ? ' (no aplica)' : ''}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-panel-text-muted mb-1">Porcentaje (%)</label>
                  <input
                    type="number" min="0" max="100" step="0.01"
                    value={retentionPercentToAdd}
                    onChange={(e) => setRetentionPercentToAdd(e.target.value)}
                    className="w-full bg-panel-surface-2 border border-panel-border rounded px-2 py-1.5 text-sm text-panel-text"
                  />
                  <p className="text-[10px] text-panel-text-muted mt-1">Precargado del catálogo - editable si el SRI cambió la tabla</p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAddRetention(false)} className="text-xs font-bold text-panel-text-muted px-3 py-1.5">Cancelar</button>
                <button onClick={handleAddRetention} className="text-xs font-bold bg-panel-accent text-panel-accent-text px-3 py-1.5 rounded">Agregar</button>
              </div>
            </div>
          )}

          {retentionsComputed.length === 0 ? (
            <p className="text-sm text-panel-text-muted">Sin retenciones aplicadas.</p>
          ) : (
            <div className="space-y-2">
              {retentionsComputed.map(r => {
                const concept = retentionConcepts.find(c => c.id === r.retention_concept_id);
                return (
                  <div key={r.tempId} className="flex items-center justify-between bg-panel-bg/50 border border-panel-border rounded-lg p-3">
                    <div>
                      <div className="text-sm font-bold text-panel-text">
                        {r.retention_type === 'iva' ? 'Retención de IVA' : 'Retención de Renta'} - {r.retention_percentage}%
                      </div>
                      <div className="text-xs text-panel-text-muted">{concept?.codigo_sri} {concept?.descripcion}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-bold text-panel-danger">-{formatUSD(r.retention_amount)}</div>
                      <button onClick={() => removeRetention(r.tempId)} className="text-panel-text-muted hover:text-panel-danger">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Vencimiento y totales */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-panel-text-muted mb-2">Fecha de Vencimiento (Opcional)</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
            />
          </div>
          <div className="bg-panel-bg/50 border border-panel-border rounded-lg p-4 space-y-1">
            <div className="flex justify-between text-sm"><span className="text-panel-text-muted">Subtotal 0%</span><span className="text-panel-text">{formatUSD(totals.subtotal_0)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-panel-text-muted">Subtotal gravado</span><span className="text-panel-text">{formatUSD(totals.subtotal_iva)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-panel-text-muted">IVA</span><span className="text-panel-text">{formatUSD(totals.iva_amount)}</span></div>
            <div className="flex justify-between text-sm font-bold border-t border-panel-border pt-1"><span className="text-panel-text">Total</span><span className="text-panel-text">{formatUSD(totals.total)}</span></div>
            {totalRetained > 0 && (
              <div className="flex justify-between text-sm text-panel-danger"><span>Retenciones</span><span>-{formatUSD(totalRetained)}</span></div>
            )}
            <div className="flex justify-between text-base font-bold border-t border-panel-border pt-1"><span className="text-panel-text">Saldo neto a pagar</span><span className="text-panel-success">{formatUSD(netToPay)}</span></div>
          </div>
        </div>

        {can('purchases.write') && (
          <div className="flex justify-end border-t border-panel-border pt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold py-2 px-6 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Save size={18} />
              {saving ? 'Guardando...' : 'Registrar Compra'}
            </button>
          </div>
        )}
      </div>

      {/* Alta rápida de proveedor */}
      {showQuickSupplier && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-panel-surface border border-panel-border rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-panel-text">Alta Rápida de Proveedor</h2>
              <button onClick={() => setShowQuickSupplier(false)} className="text-panel-text-muted hover:text-panel-text"><X size={22} /></button>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-1">RUC</label>
                <input
                  type="text"
                  value={quickSupplierForm.ruc}
                  onChange={(e) => setQuickSupplierForm({ ...quickSupplierForm, ruc: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-1">Razón Social</label>
                <input
                  type="text"
                  value={quickSupplierForm.razon_social}
                  onChange={(e) => setQuickSupplierForm({ ...quickSupplierForm, razon_social: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-panel-text-muted mb-1">Tipo de Contribuyente</label>
                <select
                  value={quickSupplierForm.tipo_contribuyente}
                  onChange={(e) => setQuickSupplierForm({ ...quickSupplierForm, tipo_contribuyente: e.target.value })}
                  className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
                >
                  <option value="persona_natural">Persona Natural</option>
                  <option value="sociedad">Sociedad</option>
                  <option value="rimpe">RIMPE</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowQuickSupplier(false)} className="flex-1 bg-panel-surface-2 hover:bg-panel-text/10 text-panel-text font-bold py-2 rounded-lg transition-colors">Cancelar</button>
              <button onClick={handleQuickAddSupplier} className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2 rounded-lg transition-colors">Agregar</button>
            </div>
          </div>
        </div>
      )}

      {/* Compras recientes */}
      <div className="bg-panel-surface rounded-2xl border border-panel-border overflow-hidden">
        <div className="p-4 border-b border-panel-border flex items-center gap-2">
          <Receipt size={16} className="text-panel-text-muted" />
          <h3 className="font-bold text-panel-text">Compras Recientes</h3>
        </div>
        {recentPurchases.length === 0 ? (
          <div className="p-8 text-center text-panel-text-muted flex flex-col items-center gap-2">
            <ShoppingBag size={32} className="opacity-50" />
            Todavía no hay compras registradas
          </div>
        ) : (
          <Table
            columns={['Fecha', 'Proveedor', 'Documento', 'Tipo', 'Total', 'Estado', 'Retención', 'XML']}
            data={recentPurchases}
            renderRow={(p) => {
              const retentions = p.purchase_retentions || [];
              const hasRetentions = retentions.length > 0;
              const isAuthorized = retentions.some(r => r.retention_sri_status === 'autorizada');
              const isSubmitting = submittingRetentionId === p.id;
              return (
                <tr key={p.id} className="hover:bg-panel-surface-2">
                  <td className="px-4 py-3 text-sm text-panel-text-muted">{p.document_date}</td>
                  <td className="px-4 py-3 font-bold text-panel-text">{p.suppliers?.razon_social}</td>
                  <td className="px-4 py-3 font-mono text-sm text-panel-text-muted">{p.supplier_document_number}</td>
                  <td className="px-4 py-3 text-sm text-panel-text-muted">{DOC_TYPE_LABELS[p.purchase_doc_type] || p.purchase_doc_type}</td>
                  <td className="px-4 py-3 font-bold text-panel-text">{formatUSD(p.total)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${p.status === 'registrada' ? 'bg-panel-success/10 text-panel-success' : 'bg-panel-danger/10 text-panel-danger'}`}>
                      {p.status === 'registrada' ? 'Registrada' : 'Anulada'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {!hasRetentions ? (
                      <span className="text-xs text-panel-text-muted">Sin retención</span>
                    ) : isAuthorized ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded bg-panel-success/10 text-panel-success">
                        <FileCheck2 size={12} /> Autorizada
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSubmitRetention(p)}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-panel-accent/20 hover:bg-panel-accent/30 disabled:opacity-50 text-panel-accent-soft rounded text-xs font-bold transition-colors"
                      >
                        {isSubmitting ? <Loader size={12} className="animate-spin" /> : <FileCheck2 size={12} />}
                        {isSubmitting ? 'Emitiendo...' : 'Emitir'}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.xml_file_path ? (
                      <button
                        onClick={() => handleDownloadXml(p)}
                        title="Descargar XML original"
                        className="text-panel-text-muted hover:text-panel-accent-soft transition-colors"
                      >
                        <Download size={16} />
                      </button>
                    ) : (
                      <span className="text-xs text-panel-text-muted">-</span>
                    )}
                  </td>
                </tr>
              );
            }}
          />
        )}
      </div>
    </div>
  );
}
