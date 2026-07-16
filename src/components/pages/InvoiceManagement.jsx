import React, { useState, useEffect, useMemo } from 'react';
import { FileText, CheckCircle, XCircle, X, Copy, Loader, Download, MapPin, Mail, FileCode, Archive, Undo2, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import {
  fetchInvoicesByCompany, fetchInvoiceDetails, submitInvoiceToSRI, voidInvoice, getBillingConfig,
  fetchCompanyById, fetchBranches, emailInvoiceRide,
  createInvoice, createInvoiceDetail, getNextDocumentSequential, submitCreditNoteToSRI, fetchCreditNotesForInvoice
} from '../../lib/supabaseHelpers.js';
import Table from '../ui/Table.jsx';
import Badge from '../ui/Badge.jsx';
import Modal from '../ui/Modal.jsx';
import { formatUSD } from '../../lib/format.js';
import { generateRidePdf } from '../../lib/rideGenerator.js';
import { downloadInvoiceXml, downloadInvoicesXmlZip } from '../../lib/invoiceXmlExport.js';

const STATUS_LABELS = {
  borrador: 'Pendiente',
  autorizada: 'Autorizada',
  anulada: 'Anulada',
  devuelta: 'Devuelta'
};

const TYPE_LABELS = {
  factura: 'Factura',
  nota_credito: 'Nota de Crédito'
};

const AMOUNT_EPSILON = 0.01;

function formatDetailAmounts(unitPrice, quantity, discountPercent, taxPercent) {
  const grossAmount = parseFloat(unitPrice) * parseFloat(quantity);
  const discountAmount = grossAmount * (parseFloat(discountPercent) || 0) / 100;
  const subtotal = grossAmount - discountAmount;
  const taxAmount = subtotal * (parseFloat(taxPercent) || 0) / 100;
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

export default function InvoiceManagement() {
  const { currentUser, showToast, openConfirm, can } = useStore();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceDetails, setInvoiceDetails] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [submittingId, setSubmittingId] = useState(null);
  const [sriEnvironment, setSriEnvironment] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [company, setCompany] = useState(null);
  const [downloadingRideId, setDownloadingRideId] = useState(null);
  const [emailingRideId, setEmailingRideId] = useState(null);
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [showBulkExport, setShowBulkExport] = useState(false);
  const [bulkStartDate, setBulkStartDate] = useState('');
  const [bulkEndDate, setBulkEndDate] = useState('');
  const [bulkBranchId, setBulkBranchId] = useState('all');
  const [exportingZip, setExportingZip] = useState(false);

  // Emisión de nota de crédito
  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
  const [creditNoteReason, setCreditNoteReason] = useState('');
  const [creditNoteRestock, setCreditNoteRestock] = useState(true);
  const [creditNoteLines, setCreditNoteLines] = useState([]);
  const [priorCreditNotes, setPriorCreditNotes] = useState([]);
  const [loadingCreditNoteData, setLoadingCreditNoteData] = useState(false);
  const [submittingCreditNote, setSubmittingCreditNote] = useState(false);
  const [creditNoteError, setCreditNoteError] = useState(null);

  const loadInvoices = async () => {
    try {
      const data = await fetchInvoicesByCompany(currentUser.company_id);
      setInvoices(data || []);
    } catch (error) {
      console.error('Error loading invoices:', error);
      showToast('error', 'Error al cargar facturas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.company_id) {
      loadInvoices();
      getBillingConfig(currentUser.company_id).then(cfg => setSriEnvironment(cfg.environment)).catch(() => {});
      fetchCompanyById(currentUser.company_id).then(setCompany).catch(() => {});
      fetchBranches(currentUser.company_id).then(setBranches).catch(() => {});
    }
  }, [currentUser?.company_id]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (selectedBranchId !== 'all' && inv.point_of_sales?.branch_id !== selectedBranchId) return false;
      if (selectedType !== 'all' && inv.invoice_type !== selectedType) return false;
      return true;
    });
  }, [invoices, selectedBranchId, selectedType]);

  // Para una nota de crédito, resuelve la factura que modifica (ya está en
  // memoria - fetchInvoicesByCompany trae todas las facturas de la empresa,
  // sin paginar) para mostrarla/incluirla en el RIDE.
  const getModifiedInvoiceRef = (invoice) => {
    if (invoice.invoice_type !== 'nota_credito') return undefined;
    return invoices.find(i => i.id === invoice.modified_invoice_id);
  };

  const openInvoiceDetail = async (invoice) => {
    setSelectedInvoice(invoice);
    setLoadingDetails(true);
    try {
      const details = await fetchInvoiceDetails(invoice.id);
      setInvoiceDetails(details);
    } catch (error) {
      showToast('error', 'Error al cargar detalles de la factura');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleDownloadRide = async (invoice, e) => {
    e?.stopPropagation();
    if (!company) {
      showToast('error', 'Cargando datos de la empresa, intenta de nuevo en un momento');
      return;
    }
    setDownloadingRideId(invoice.id);
    try {
      const details = await fetchInvoiceDetails(invoice.id);
      await generateRidePdf({ invoice, details, company, sriEnvironment, modifiedInvoice: getModifiedInvoiceRef(invoice) });
    } catch (error) {
      console.error('Error generating RIDE:', error);
      showToast('error', error.message || 'Error al generar el RIDE');
    } finally {
      setDownloadingRideId(null);
    }
  };

  // Genera el RIDE en el navegador (Base64) y lo manda a la función serverless
  // que lo adjunta y lo envía al correo del cliente. Devuelve el resultado para
  // que quien lo llame (botón manual o auto-envío) decida qué avisar.
  const sendRideByEmail = async (invoice) => {
    const details = await fetchInvoiceDetails(invoice.id);
    const pdfBase64 = await generateRidePdf({ invoice, details, company, sriEnvironment, modifiedInvoice: getModifiedInvoiceRef(invoice), output: 'base64' });
    return emailInvoiceRide({
      invoiceId: invoice.id,
      pdfBase64
    });
  };

  const handleEmailRide = async (invoice, e) => {
    e?.stopPropagation();
    if (!company) {
      showToast('error', 'Cargando datos de la empresa, intenta de nuevo en un momento');
      return;
    }
    setEmailingRideId(invoice.id);
    try {
      const result = await sendRideByEmail(invoice);
      if (result?.skipped) {
        showToast('info', 'El cliente no tiene un correo registrado');
      } else {
        showToast('success', `RIDE enviado a ${result?.to || 'el cliente'}`);
      }
    } catch (error) {
      console.error('Error emailing RIDE:', error);
      showToast('error', error.message || 'Error al enviar el RIDE por correo');
    } finally {
      setEmailingRideId(null);
    }
  };

  const handleApprove = (invoice) => {
    const isCreditNote = invoice.invoice_type === 'nota_credito';
    const docLabel = isCreditNote ? 'nota de crédito' : 'factura';
    const envLabel = sriEnvironment === 'production' ? 'PRODUCCIÓN (real)' : 'PRUEBAS';
    openConfirm(
      'Aprobar y enviar al SRI',
      `¿Confirmas enviar la ${docLabel} ${invoice.invoice_number} al SRI en ambiente de ${envLabel}? El comprobante se firmará con el certificado cargado y se enviará al webservice real del SRI. Puede tardar varios segundos.`,
      async () => {
        setSubmittingId(invoice.id);
        setLastError(null);
        try {
          await (isCreditNote ? submitCreditNoteToSRI(invoice.id) : submitInvoiceToSRI(invoice.id));
          showToast('success', `${isCreditNote ? 'Nota de crédito' : 'Factura'} ${invoice.invoice_number} autorizada por el SRI`);
          await loadInvoices();
          setSelectedInvoice(null);

          // En producción, envía el RIDE al cliente automáticamente. Volvemos a
          // leer la factura ya 'autorizada' (con authorization_number) porque el
          // objeto local seguía en 'borrador'. Un fallo aquí no invalida la
          // autorización; el gerente puede reenviar con el botón de correo.
          if (sriEnvironment === 'production') {
            try {
              const fresh = await fetchInvoicesByCompany(currentUser.company_id);
              const authorized = fresh.find(i => i.id === invoice.id);
              if (authorized?.status === 'autorizada') {
                setEmailingRideId(invoice.id);
                const result = await sendRideByEmail(authorized);
                if (!result?.skipped) {
                  showToast('info', `RIDE enviado a ${result?.to || 'el cliente'}`);
                }
              }
            } catch (mailErr) {
              console.error('Auto-envío del RIDE falló:', mailErr);
            } finally {
              setEmailingRideId(null);
            }
          }
        } catch (error) {
          console.error('SRI submission error:', error);
          showToast('error', error.message || `Error al enviar la ${docLabel} al SRI`);
          setLastError({
            message: error.message,
            detail: error.detail
          });
          await loadInvoices();
        } finally {
          setSubmittingId(null);
        }
      }
    );
  };

  const handleVoid = (invoice) => {
    openConfirm(
      'Anular factura',
      `¿Confirmas anular la factura ${invoice.invoice_number}? Esta acción no se puede deshacer.`,
      async () => {
        try {
          await voidInvoice(invoice.id, 'Anulada por el gerente');
          showToast('success', `Factura ${invoice.invoice_number} anulada`);
          await loadInvoices();
          setSelectedInvoice(null);
        } catch (error) {
          showToast('error', error.message || 'Error al anular la factura');
        }
      }
    );
  };

  const handleDownloadXml = (invoice) => {
    try {
      downloadInvoiceXml(invoice);
    } catch (error) {
      showToast('error', error.message || 'Error al descargar el XML');
    }
  };

  // Abre el modal de nota de crédito sobre la factura actualmente seleccionada.
  // Reusa invoiceDetails, que ya está cargado porque este botón solo aparece
  // dentro del modal de detalle (ver openInvoiceDetail). Por defecto arranca
  // con todas las líneas a su cantidad completa - "nota de crédito total" es
  // simplemente no tocar nada; una parcial es desmarcar/reducir cantidades.
  const openCreditNoteModal = async (invoice) => {
    setCreditNoteReason('');
    setCreditNoteRestock(true);
    setCreditNoteError(null);
    setCreditNoteLines(invoiceDetails.map(d => ({
      ...d,
      included: true,
      creditQty: parseFloat(d.quantity)
    })));
    setShowCreditNoteModal(true);
    setLoadingCreditNoteData(true);
    try {
      const prior = await fetchCreditNotesForInvoice(invoice.id);
      setPriorCreditNotes(prior);
    } catch (error) {
      showToast('error', error.message || 'Error al cargar notas de crédito previas');
    } finally {
      setLoadingCreditNoteData(false);
    }
  };

  const updateCreditNoteLine = (index, patch) => {
    setCreditNoteLines(prev => prev.map((line, i) => i === index ? { ...line, ...patch } : line));
  };

  const priorCreditedTotal = useMemo(() => (
    priorCreditNotes.filter(cn => cn.status === 'autorizada').reduce((sum, cn) => sum + parseFloat(cn.total_amount), 0)
  ), [priorCreditNotes]);

  const availableBalance = selectedInvoice ? parseFloat(selectedInvoice.total_amount) - priorCreditedTotal : 0;

  const creditNoteTotals = useMemo(() => {
    return creditNoteLines
      .filter(l => l.included && parseFloat(l.creditQty) > 0)
      .reduce((acc, l) => {
        const { subtotal, taxAmount, total } = formatDetailAmounts(l.unit_price, l.creditQty, l.discount_percent, l.tax_percent);
        return { subtotal: acc.subtotal + subtotal, taxAmount: acc.taxAmount + taxAmount, total: acc.total + total };
      }, { subtotal: 0, taxAmount: 0, total: 0 });
  }, [creditNoteLines]);

  const creditNoteExceedsBalance = creditNoteTotals.total > availableBalance + AMOUNT_EPSILON;

  const handleSubmitCreditNote = async () => {
    if (!selectedInvoice) return;
    if (!creditNoteReason.trim()) {
      setCreditNoteError('El motivo es obligatorio');
      return;
    }
    const includedLines = creditNoteLines.filter(l => l.included && parseFloat(l.creditQty) > 0);
    if (includedLines.length === 0) {
      setCreditNoteError('Selecciona al menos un producto para la nota de crédito');
      return;
    }
    if (creditNoteExceedsBalance) {
      setCreditNoteError(`El total excede el saldo disponible de la factura (${formatUSD(availableBalance)})`);
      return;
    }

    setSubmittingCreditNote(true);
    setCreditNoteError(null);
    try {
      const pos = selectedInvoice.point_of_sales;
      const sequential = await getNextDocumentSequential(selectedInvoice.pos_id, 'nota_credito');
      const invoiceNumber = `${pos.numero_establecimiento.padStart(3, '0')}-${pos.numero_pos.padStart(3, '0')}-${String(sequential).padStart(9, '0')}`;

      const creditNote = await createInvoice({
        company_id: currentUser.company_id,
        user_id: currentUser.id,
        pos_id: selectedInvoice.pos_id,
        customer_id: selectedInvoice.customer_id || null,
        invoice_type: 'nota_credito',
        invoice_number: invoiceNumber,
        subtotal_amount: creditNoteTotals.subtotal,
        tax_amount: creditNoteTotals.taxAmount,
        total_amount: creditNoteTotals.total,
        payment_method: selectedInvoice.payment_method,
        modified_invoice_id: selectedInvoice.id,
        credit_note_reason: creditNoteReason.trim(),
        credit_note_restock: creditNoteRestock,
        notes: `Nota de crédito sobre factura ${selectedInvoice.invoice_number}`
      });

      for (const line of includedLines) {
        const { subtotal, taxAmount, total } = formatDetailAmounts(line.unit_price, line.creditQty, line.discount_percent, line.tax_percent);
        await createInvoiceDetail({
          invoice_id: creditNote.id,
          product_id: line.product_id,
          product_code: line.product_code,
          product_name: line.product_name,
          quantity: line.creditQty,
          unit_price: line.unit_price,
          discount_percent: line.discount_percent,
          subtotal,
          tax_rate: line.tax_percent,
          tax_amount: taxAmount,
          total
        });
      }

      const result = await submitCreditNoteToSRI(creditNote.id);
      showToast('success', `Nota de crédito ${invoiceNumber} autorizada por el SRI`);
      if (result?.warnings?.length) {
        result.warnings.forEach(w => showToast('warning', w));
      }
      setShowCreditNoteModal(false);
      setSelectedInvoice(null);
      await loadInvoices();
    } catch (error) {
      console.error('Error emitting credit note:', error);
      setCreditNoteError(error.message || 'Error al emitir la nota de crédito');
    } finally {
      setSubmittingCreditNote(false);
    }
  };

  // Descarga masiva: filtra las facturas ya cargadas en memoria (invoices ya
  // trae signed_xml completo, ver fetchInvoicesByCompany) por rango de fecha
  // + sucursal, arma el ZIP en el navegador - sin pasar por Vercel Functions,
  // como pide el criterio de aceptación de esta fase.
  const handleBulkExport = async () => {
    if (!bulkStartDate || !bulkEndDate) {
      showToast('error', 'Selecciona el rango de fechas');
      return;
    }
    const start = new Date(`${bulkStartDate}T00:00:00`);
    const end = new Date(`${bulkEndDate}T23:59:59`);

    const inRange = invoices.filter(inv => {
      const issued = new Date(inv.issue_date);
      if (issued < start || issued > end) return false;
      if (bulkBranchId !== 'all' && inv.point_of_sales?.branch_id !== bulkBranchId) return false;
      return true;
    });

    setExportingZip(true);
    try {
      const count = await downloadInvoicesXmlZip(inRange, `comprobantes-${bulkStartDate}-a-${bulkEndDate}.zip`);
      showToast('success', `ZIP generado con ${count} comprobante${count === 1 ? '' : 's'} autorizado${count === 1 ? '' : 's'}`);
      setShowBulkExport(false);
    } catch (error) {
      showToast('error', error.message || 'Error al generar el ZIP');
    } finally {
      setExportingZip(false);
    }
  };

  const copyAccessKey = (key) => {
    navigator.clipboard.writeText(key);
    showToast('success', 'Clave de acceso copiada');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-panel-text">Gestión de Facturas</h1>
          {sriEnvironment && (
            <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${
              sriEnvironment === 'production'
                ? 'bg-panel-danger/10 text-panel-danger border-panel-danger/30'
                : 'bg-panel-accent/10 text-panel-accent-soft border-panel-accent/30'
            }`}>
              SRI: {sriEnvironment === 'production' ? 'Producción (real)' : 'Pruebas'}
            </span>
          )}
        </div>
        {can('invoices.export') && (
          <button
            onClick={() => { setBulkBranchId(selectedBranchId); setShowBulkExport(true); }}
            className="flex items-center gap-2 bg-panel-surface-2 hover:bg-panel-text/10 text-panel-text text-sm font-bold px-4 py-2 rounded-lg transition-colors"
          >
            <Archive size={16} /> Descarga masiva de XML
          </button>
        )}
      </div>

      {branches.length > 1 && (
        <div className="bg-panel-surface border border-panel-border rounded-2xl p-4 flex flex-wrap items-center gap-2">
          <MapPin size={16} className="text-panel-text-muted flex-shrink-0" />
          <button
            onClick={() => setSelectedBranchId('all')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              selectedBranchId === 'all' ? 'bg-panel-accent/20 text-panel-accent-soft border border-panel-accent/40' : 'text-panel-text-muted hover:text-panel-text hover:bg-panel-text/10 border border-transparent'
            }`}
          >
            Todas las sucursales
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
      )}

      <div className="bg-panel-surface border border-panel-border rounded-2xl p-4 flex flex-wrap items-center gap-2">
        <FileText size={16} className="text-panel-text-muted flex-shrink-0" />
        {[
          { value: 'all', label: 'Todos' },
          { value: 'factura', label: 'Facturas' },
          { value: 'nota_credito', label: 'Notas de Crédito' }
        ].map(opt => (
          <button
            key={opt.value}
            onClick={() => setSelectedType(opt.value)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              selectedType === opt.value ? 'bg-panel-accent/20 text-panel-accent-soft border border-panel-accent/40' : 'text-panel-text-muted hover:text-panel-text hover:bg-panel-text/10 border border-transparent'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {lastError && (
        <div className="bg-panel-danger/10 border border-panel-danger/30 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-panel-danger">Error al enviar al SRI (detalle técnico)</h3>
            <button onClick={() => setLastError(null)} className="text-panel-danger hover:opacity-80 text-xs font-bold">Cerrar</button>
          </div>
          <div className="text-sm text-panel-danger">{lastError.message}</div>
          {lastError.detail && (
            <pre className="text-xs text-panel-danger/80 whitespace-pre-wrap break-all bg-panel-danger/10 rounded p-2 max-h-48 overflow-y-auto">
              {typeof lastError.detail === 'string' ? lastError.detail : JSON.stringify(lastError.detail, null, 2)}
            </pre>
          )}
        </div>
      )}

      <div className="bg-panel-surface rounded-2xl border border-panel-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-panel-text-muted">Cargando facturas...</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-panel-text-muted">No hay facturas registradas</div>
        ) : (
          <Table
            columns={['Factura', 'Sucursal', 'Cliente', 'Fecha', 'Total', 'Estado', 'Acciones']}
            data={filteredInvoices}
            renderRow={(inv) => (
              <tr key={inv.id} className="hover:bg-panel-surface-2 cursor-pointer" onClick={() => openInvoiceDetail(inv)}>
                <td className="px-4 py-3 font-bold text-panel-text font-mono">
                  <div className="flex items-center gap-2">
                    {inv.invoice_type === 'nota_credito' && (
                      <Undo2 size={14} className="text-panel-danger flex-shrink-0" title="Nota de crédito" />
                    )}
                    {inv.invoice_number}
                  </div>
                </td>
                <td className="px-4 py-3 text-panel-text-muted text-sm">{inv.point_of_sales?.branches?.name || '-'}</td>
                <td className="px-4 py-3 text-panel-text">
                  {inv.customers?.name || 'Consumidor Final'}
                </td>
                <td className="px-4 py-3 text-panel-text-muted">{new Date(inv.issue_date).toLocaleDateString()}</td>
                <td className={`px-4 py-3 font-bold ${inv.invoice_type === 'nota_credito' ? 'text-panel-text' : 'text-panel-success'}`}>
                  {inv.invoice_type === 'nota_credito' ? '-' : ''}{formatUSD(inv.total_amount)}
                </td>
                <td className="px-4 py-3"><Badge status={STATUS_LABELS[inv.status] || inv.status} /></td>
                <td className="px-4 py-3">
                  {inv.status === 'borrador' && (
                    submittingId === inv.id ? (
                      <div className="text-xs font-bold text-panel-text-muted flex items-center gap-1">
                        <Loader size={14} className="animate-spin" /> Enviando al SRI...
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {can('invoices.approve') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleApprove(inv); }}
                            className="text-xs font-bold text-panel-success hover:opacity-80 flex items-center gap-1"
                          >
                            <CheckCircle size={14} /> Aprobar
                          </button>
                        )}
                        {can('invoices.void') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleVoid(inv); }}
                            className="text-xs font-bold text-panel-danger hover:opacity-80 flex items-center gap-1"
                          >
                            <XCircle size={14} /> Anular
                          </button>
                        )}
                      </div>
                    )
                  )}
                  {inv.status === 'autorizada' && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => handleDownloadRide(inv, e)}
                        disabled={downloadingRideId === inv.id}
                        className="text-xs font-bold text-panel-accent-soft hover:opacity-80 flex items-center gap-1 disabled:opacity-50"
                      >
                        {downloadingRideId === inv.id ? (
                          <><Loader size={14} className="animate-spin" /> Generando...</>
                        ) : (
                          <><Download size={14} /> Descargar RIDE</>
                        )}
                      </button>
                      {can('invoices.send_ride') && (
                        <button
                          onClick={(e) => handleEmailRide(inv, e)}
                          disabled={emailingRideId === inv.id}
                          className="text-xs font-bold text-panel-success hover:opacity-80 flex items-center gap-1 disabled:opacity-50"
                        >
                          {emailingRideId === inv.id ? (
                            <><Loader size={14} className="animate-spin" /> Enviando...</>
                          ) : (
                            <><Mail size={14} /> Enviar por correo</>
                          )}
                        </button>
                      )}
                      {can('invoices.export') && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownloadXml(inv); }}
                          className="text-xs font-bold text-panel-text-muted hover:text-panel-text flex items-center gap-1"
                        >
                          <FileCode size={14} /> XML
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )}
          />
        )}
      </div>

      {/* Invoice Detail Modal */}
      {selectedInvoice && !showCreditNoteModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-panel-surface border border-panel-border rounded-2xl p-6 sm:p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                {selectedInvoice.invoice_type === 'nota_credito' ? (
                  <Undo2 className="text-panel-danger" size={28} />
                ) : (
                  <FileText className="text-panel-success" size={28} />
                )}
                <h3 className="text-2xl font-bold text-panel-text">
                  {selectedInvoice.invoice_type === 'nota_credito' ? 'Detalle de Nota de Crédito' : 'Detalle de Factura'}
                </h3>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="text-panel-text-muted hover:text-panel-text">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-panel-text-muted">
                    {selectedInvoice.invoice_type === 'nota_credito' ? 'Número de Nota de Crédito' : 'Número de Factura'}
                  </div>
                  <div className="text-lg font-bold text-panel-text font-mono">{selectedInvoice.invoice_number}</div>
                  {selectedInvoice.point_of_sales?.branches?.name && (
                    <div className="text-xs text-panel-text-muted flex items-center gap-1 mt-1">
                      <MapPin size={11} /> {selectedInvoice.point_of_sales.branches.name} · {selectedInvoice.point_of_sales.nombre}
                    </div>
                  )}
                </div>
                <Badge status={STATUS_LABELS[selectedInvoice.status] || selectedInvoice.status} />
              </div>

              {selectedInvoice.invoice_type === 'nota_credito' && (
                <div className="bg-panel-danger/10 border border-panel-danger/30 rounded-lg p-4 space-y-1">
                  <div className="text-xs font-bold text-panel-text flex items-center gap-1">
                    <Undo2 size={12} className="text-panel-danger" />
                    Modifica la factura {invoices.find(i => i.id === selectedInvoice.modified_invoice_id)?.invoice_number || selectedInvoice.modified_invoice_id}
                  </div>
                  {selectedInvoice.credit_note_reason && (
                    <div className="text-sm text-panel-text">{selectedInvoice.credit_note_reason}</div>
                  )}
                </div>
              )}

              {/* Access Key */}
              <div className="bg-panel-bg border border-panel-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-bold text-panel-text-muted">Clave de Acceso SRI</div>
                  {selectedInvoice.authorization_number && (
                    <button
                      onClick={() => copyAccessKey(selectedInvoice.authorization_number)}
                      className="text-panel-text-muted hover:text-panel-success"
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </div>
                <div className="text-xs sm:text-sm text-panel-success font-mono break-all">
                  {selectedInvoice.authorization_number || 'No generada'}
                </div>
              </div>

              {selectedInvoice.status === 'devuelta' && selectedInvoice.sri_response_message && (
                <div className="bg-panel-danger/10 border border-panel-danger/30 rounded-lg p-4">
                  <div className="text-xs font-bold text-panel-danger mb-1">Respuesta del SRI (rechazo)</div>
                  <div className="text-xs text-panel-danger break-all whitespace-pre-wrap">{selectedInvoice.sri_response_message}</div>
                </div>
              )}

              {/* Customer Info */}
              <div className="bg-panel-bg border border-panel-border rounded-lg p-4">
                <div className="text-xs font-bold text-panel-text-muted mb-2">Cliente</div>
                {selectedInvoice.customers ? (
                  <div className="space-y-1 text-sm">
                    <div className="text-panel-text font-bold">{selectedInvoice.customers.name}</div>
                    <div className="text-panel-text-muted">
                      {selectedInvoice.customers.identification_type === 'ruc' ? 'RUC' : 'Cédula'}: {selectedInvoice.customers.identification_number}
                    </div>
                    {selectedInvoice.customers.email && <div className="text-panel-text-muted text-xs">{selectedInvoice.customers.email}</div>}
                    {selectedInvoice.customers.phone && <div className="text-panel-text-muted text-xs">{selectedInvoice.customers.phone}</div>}
                  </div>
                ) : (
                  <div className="text-sm text-panel-text">Consumidor Final</div>
                )}
              </div>

              {/* Line Items */}
              <div>
                <div className="text-xs font-bold text-panel-text-muted mb-2">Productos</div>
                {loadingDetails ? (
                  <div className="text-center text-panel-text-muted py-4 text-sm">Cargando...</div>
                ) : (
                  <div className="space-y-2">
                    {invoiceDetails.map(item => {
                      // invoice_details has no discount_amount column - derive it
                      // from what's actually stored (gross - net subtotal)
                      const grossAmount = parseFloat(item.unit_price) * parseFloat(item.quantity);
                      const discountAmount = grossAmount - parseFloat(item.subtotal);
                      return (
                        <div key={item.id} className="flex justify-between items-center bg-panel-bg rounded-lg p-3 text-sm">
                          <div>
                            <div className="text-panel-text">{item.product_name}</div>
                            <div className="text-xs text-panel-text-muted">{item.quantity} x {formatUSD(item.unit_price)}</div>
                            {item.discount_percent > 0 && (
                              <div className="text-xs text-[var(--kpi-pink)] font-bold">
                                -{item.discount_percent}% dto. (-{formatUSD(discountAmount)})
                              </div>
                            )}
                          </div>
                          <div className="font-bold text-panel-success">{formatUSD(item.total)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="border-t border-panel-border pt-4 space-y-1 text-sm">
                <div className="flex justify-between text-panel-text-muted">
                  <span>Subtotal:</span>
                  <span>{formatUSD(selectedInvoice.subtotal)}</span>
                </div>
                {selectedInvoice.discount_amount > 0 && (
                  <div className="flex justify-between text-panel-danger">
                    <span>Descuento:</span>
                    <span>-{formatUSD(selectedInvoice.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-panel-text-muted">
                  <span>IVA:</span>
                  <span>{formatUSD(selectedInvoice.tax_amount)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg text-panel-success pt-1">
                  <span>Total:</span>
                  <span>{formatUSD(selectedInvoice.total_amount)}</span>
                </div>
              </div>

              {selectedInvoice.status === 'borrador' && (can('invoices.approve') || can('invoices.void')) && (
                <div className="flex gap-3 pt-4 border-t border-panel-border">
                  {can('invoices.void') && (
                    <button
                      onClick={() => handleVoid(selectedInvoice)}
                      disabled={submittingId === selectedInvoice.id}
                      className="flex-1 bg-panel-surface-2 hover:bg-panel-danger/10 disabled:opacity-50 text-panel-danger font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <XCircle size={18} /> Anular
                    </button>
                  )}
                  {can('invoices.approve') && (
                    <button
                      onClick={() => handleApprove(selectedInvoice)}
                      disabled={submittingId === selectedInvoice.id}
                      className="flex-1 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {submittingId === selectedInvoice.id ? (
                        <><Loader size={18} className="animate-spin" /> Enviando al SRI...</>
                      ) : (
                        <><CheckCircle size={18} /> Aprobar y Enviar al SRI</>
                      )}
                    </button>
                  )}
                </div>
              )}

              {selectedInvoice.status === 'autorizada' && (
                <div className="pt-4 border-t border-panel-border space-y-2">
                  <button
                    onClick={() => handleDownloadRide(selectedInvoice)}
                    disabled={downloadingRideId === selectedInvoice.id}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {downloadingRideId === selectedInvoice.id ? (
                      <><Loader size={18} className="animate-spin" /> Generando RIDE...</>
                    ) : (
                      <><Download size={18} /> Descargar RIDE (PDF)</>
                    )}
                  </button>
                  {can('invoices.send_ride') && (
                    <button
                      onClick={() => handleEmailRide(selectedInvoice)}
                      disabled={emailingRideId === selectedInvoice.id}
                      className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {emailingRideId === selectedInvoice.id ? (
                        <><Loader size={18} className="animate-spin" /> Enviando...</>
                      ) : (
                        <><Mail size={18} /> Enviar RIDE por correo al cliente</>
                      )}
                    </button>
                  )}
                  {can('invoices.export') && (
                    <button
                      onClick={() => handleDownloadXml(selectedInvoice)}
                      className="w-full bg-panel-surface-2 hover:bg-panel-text/10 text-panel-text font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <FileCode size={18} /> Descargar XML autorizado
                    </button>
                  )}
                  {selectedInvoice.invoice_type !== 'nota_credito' && can('credit_notes.create') && (
                    selectedInvoice.customers ? (
                      <button
                        onClick={() => openCreditNoteModal(selectedInvoice)}
                        className="w-full bg-panel-danger/10 hover:bg-panel-danger/20 border border-panel-danger/30 text-panel-text font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <Undo2 size={18} className="text-panel-danger" /> Emitir nota de crédito
                      </button>
                    ) : (
                      <div className="text-xs text-panel-text-muted bg-panel-surface-2 rounded-lg p-3 flex items-start gap-2">
                        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                        El SRI no permite emitir notas de crédito sobre facturas a consumidor final - solo sobre facturas con un cliente identificado (RUC/cédula).
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showCreditNoteModal && selectedInvoice && (
        <Modal
          title={`Emitir nota de crédito - ${selectedInvoice.invoice_number}`}
          onClose={() => !submittingCreditNote && setShowCreditNoteModal(false)}
          footer={
            <>
              <button
                onClick={() => setShowCreditNoteModal(false)}
                disabled={submittingCreditNote}
                className="px-4 py-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] font-bold disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitCreditNote}
                disabled={submittingCreditNote || loadingCreditNoteData || creditNoteExceedsBalance}
                className="px-4 py-2 bg-[var(--status-danger)]/10 hover:bg-[var(--status-danger)]/20 disabled:opacity-50 border border-[var(--status-danger)]/30 text-[var(--text-primary)] font-bold rounded-lg flex items-center gap-2"
              >
                {submittingCreditNote ? (
                  <><Loader size={16} className="animate-spin" /> Enviando al SRI...</>
                ) : (
                  <><Undo2 size={16} className="text-[var(--status-danger)]" /> Emitir y enviar al SRI</>
                )}
              </button>
            </>
          }
        >
          {loadingCreditNoteData ? (
            <div className="text-center text-[var(--text-muted)] py-8">Cargando...</div>
          ) : (
            <div className="space-y-4">
              <div className="bg-[var(--surface-2)] rounded-lg p-4 flex items-center justify-between text-sm">
                <div>
                  <div className="text-[var(--text-muted)]">Total factura original</div>
                  <div className="font-bold text-[var(--text-primary)]">{formatUSD(selectedInvoice.total_amount)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[var(--text-muted)]">Saldo disponible</div>
                  <div className="font-bold text-[var(--text-primary)]">{formatUSD(availableBalance)}</div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-[var(--text-primary)] mb-1">Motivo *</label>
                <textarea
                  value={creditNoteReason}
                  onChange={(e) => setCreditNoteReason(e.target.value)}
                  rows={2}
                  placeholder="Ej: Devolución de mercadería, error de facturación..."
                  className="w-full bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-[var(--text-primary)] mb-2">Productos a acreditar</label>
                <div className="space-y-2">
                  {creditNoteLines.map((line, index) => (
                    <div key={line.id} className="flex items-center gap-3 bg-[var(--surface-2)] rounded-lg p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={line.included}
                        onChange={(e) => updateCreditNoteLine(index, { included: e.target.checked })}
                        className="w-4 h-4 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[var(--text-primary)] truncate">{line.product_name}</div>
                        <div className="text-xs text-[var(--text-muted)]">{formatUSD(line.unit_price)} c/u · máx {parseFloat(line.quantity)}</div>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max={line.quantity}
                        step="0.01"
                        value={line.creditQty}
                        disabled={!line.included}
                        onChange={(e) => {
                          const raw = parseFloat(e.target.value) || 0;
                          const capped = Math.min(Math.max(raw, 0), parseFloat(line.quantity));
                          updateCreditNoteLine(index, { creditQty: capped });
                        }}
                        className="w-20 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-lg px-2 py-1 text-[var(--text-primary)] disabled:opacity-50"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={creditNoteRestock}
                  onChange={(e) => setCreditNoteRestock(e.target.checked)}
                  className="w-4 h-4"
                />
                Reingresar mercadería al stock
              </label>

              <div className="border-t border-[var(--border-subtle)] pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-[var(--text-muted)]">
                  <span>Subtotal:</span>
                  <span>{formatUSD(creditNoteTotals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-[var(--text-muted)]">
                  <span>IVA:</span>
                  <span>{formatUSD(creditNoteTotals.taxAmount)}</span>
                </div>
                <div className={`flex justify-between font-bold text-lg pt-1 ${creditNoteExceedsBalance ? 'text-[var(--status-danger)]' : 'text-[var(--text-primary)]'}`}>
                  <span>Total nota de crédito:</span>
                  <span>{formatUSD(creditNoteTotals.total)}</span>
                </div>
              </div>

              {creditNoteExceedsBalance && (
                <div className="bg-[var(--status-danger)]/10 border border-[var(--status-danger)]/30 rounded-lg p-3 text-sm text-[var(--text-primary)] flex items-start gap-2">
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-[var(--status-danger)]" />
                  El total excede el saldo disponible de la factura ({formatUSD(availableBalance)}).
                </div>
              )}

              {creditNoteError && (
                <div className="bg-[var(--status-danger)]/10 border border-[var(--status-danger)]/30 rounded-lg p-3 text-sm text-[var(--text-primary)] flex items-start gap-2">
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-[var(--status-danger)]" />
                  {creditNoteError}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {showBulkExport && (
        <Modal
          title="Descarga masiva de XML"
          onClose={() => !exportingZip && setShowBulkExport(false)}
          footer={
            <>
              <button
                onClick={() => setShowBulkExport(false)}
                disabled={exportingZip}
                className="px-4 py-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] font-bold disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkExport}
                disabled={exportingZip}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-bold rounded-lg flex items-center gap-2"
              >
                {exportingZip ? <><Loader size={16} className="animate-spin" /> Generando ZIP...</> : <><Archive size={16} /> Descargar ZIP</>}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-muted)]">
              Genera un .zip con el XML autorizado de cada comprobante del rango (facturas y notas de crédito, en subcarpetas separadas, nombrados con su clave de acceso) y un <span className="font-mono text-[var(--text-primary)]">resumen.csv</span>. Solo se incluyen comprobantes en estado <span className="font-bold text-[var(--status-success)]">autorizada</span>.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-[var(--text-primary)] mb-1">Desde</label>
                <input
                  type="date"
                  value={bulkStartDate}
                  onChange={(e) => setBulkStartDate(e.target.value)}
                  className="w-full bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-[var(--text-primary)] mb-1">Hasta</label>
                <input
                  type="date"
                  value={bulkEndDate}
                  onChange={(e) => setBulkEndDate(e.target.value)}
                  className="w-full bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                />
              </div>
            </div>
            {branches.length > 1 && (
              <div>
                <label className="block text-sm font-bold text-[var(--text-primary)] mb-1">Sucursal</label>
                <select
                  value={bulkBranchId}
                  onChange={(e) => setBulkBranchId(e.target.value)}
                  className="w-full bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                >
                  <option value="all">Todas las sucursales</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
