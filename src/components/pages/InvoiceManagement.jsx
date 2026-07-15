import React, { useState, useEffect, useMemo } from 'react';
import { FileText, CheckCircle, XCircle, X, Copy, Loader, Download, MapPin, Mail, FileCode, Archive } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchInvoicesByCompany, fetchInvoiceDetails, submitInvoiceToSRI, voidInvoice, getBillingConfig, fetchCompanyById, fetchBranches, emailInvoiceRide } from '../../lib/supabaseHelpers.js';
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
  const [showBulkExport, setShowBulkExport] = useState(false);
  const [bulkStartDate, setBulkStartDate] = useState('');
  const [bulkEndDate, setBulkEndDate] = useState('');
  const [bulkBranchId, setBulkBranchId] = useState('all');
  const [exportingZip, setExportingZip] = useState(false);

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
    if (selectedBranchId === 'all') return invoices;
    return invoices.filter(inv => inv.point_of_sales?.branch_id === selectedBranchId);
  }, [invoices, selectedBranchId]);

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
      await generateRidePdf({ invoice, details, company, sriEnvironment });
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
    const pdfBase64 = await generateRidePdf({ invoice, details, company, sriEnvironment, output: 'base64' });
    return emailInvoiceRide({
      invoiceId: invoice.id,
      companyId: currentUser.company_id,
      userId: currentUser.id,
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
    const envLabel = sriEnvironment === 'production' ? 'PRODUCCIÓN (real)' : 'PRUEBAS';
    openConfirm(
      'Aprobar y enviar al SRI',
      `¿Confirmas enviar la factura ${invoice.invoice_number} al SRI en ambiente de ${envLabel}? El comprobante se firmará con el certificado cargado y se enviará al webservice real del SRI. Puede tardar varios segundos.`,
      async () => {
        setSubmittingId(invoice.id);
        setLastError(null);
        try {
          await submitInvoiceToSRI(invoice.id, currentUser.company_id, currentUser.id);
          showToast('success', `Factura ${invoice.invoice_number} autorizada por el SRI`);
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
          showToast('error', error.message || 'Error al enviar la factura al SRI');
          setLastError({
            message: error.message,
            detail: error.detail,
            stack: error.stack_remote
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
      const count = await downloadInvoicesXmlZip(inRange, `facturas-${bulkStartDate}-a-${bulkEndDate}.zip`);
      showToast('success', `ZIP generado con ${count} factura${count === 1 ? '' : 's'} autorizada${count === 1 ? '' : 's'}`);
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
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-zinc-100">Gestión de Facturas</h1>
          {sriEnvironment && (
            <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${
              sriEnvironment === 'production'
                ? 'bg-red-500/10 text-red-400 border-red-500/30'
                : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
            }`}>
              SRI: {sriEnvironment === 'production' ? 'Producción (real)' : 'Pruebas'}
            </span>
          )}
        </div>
        {can('invoices.export') && (
          <button
            onClick={() => { setBulkBranchId(selectedBranchId); setShowBulkExport(true); }}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-bold px-4 py-2 rounded-lg transition-colors"
          >
            <Archive size={16} /> Descarga masiva de XML
          </button>
        )}
      </div>

      {branches.length > 1 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-wrap items-center gap-2">
          <MapPin size={16} className="text-zinc-500 flex-shrink-0" />
          <button
            onClick={() => setSelectedBranchId('all')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              selectedBranchId === 'all' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent'
            }`}
          >
            Todas las sucursales
          </button>
          {branches.map(b => (
            <button
              key={b.id}
              onClick={() => setSelectedBranchId(b.id)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                selectedBranchId === b.id ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {lastError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-red-400">Error al enviar al SRI (detalle técnico)</h3>
            <button onClick={() => setLastError(null)} className="text-red-400 hover:text-red-300 text-xs font-bold">Cerrar</button>
          </div>
          <div className="text-sm text-red-300">{lastError.message}</div>
          {lastError.detail && (
            <pre className="text-xs text-red-300/80 whitespace-pre-wrap break-all bg-red-950/30 rounded p-2 max-h-48 overflow-y-auto">
              {typeof lastError.detail === 'string' ? lastError.detail : JSON.stringify(lastError.detail, null, 2)}
            </pre>
          )}
          {lastError.stack && (
            <pre className="text-[10px] text-red-300/60 whitespace-pre-wrap break-all bg-red-950/30 rounded p-2 max-h-48 overflow-y-auto">
              {lastError.stack}
            </pre>
          )}
        </div>
      )}

      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-zinc-500">Cargando facturas...</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">No hay facturas registradas</div>
        ) : (
          <Table
            columns={['Factura', 'Sucursal', 'Cliente', 'Fecha', 'Total', 'Estado', 'Acciones']}
            data={filteredInvoices}
            renderRow={(inv) => (
              <tr key={inv.id} className="hover:bg-zinc-800/50 cursor-pointer" onClick={() => openInvoiceDetail(inv)}>
                <td className="px-4 py-3 font-bold text-zinc-100 font-mono">{inv.invoice_number}</td>
                <td className="px-4 py-3 text-zinc-400 text-sm">{inv.point_of_sales?.branches?.name || '-'}</td>
                <td className="px-4 py-3 text-zinc-300">
                  {inv.customers?.name || 'Consumidor Final'}
                </td>
                <td className="px-4 py-3 text-zinc-400">{new Date(inv.issue_date).toLocaleDateString()}</td>
                <td className="px-4 py-3 font-bold text-emerald-400">{formatUSD(inv.total_amount)}</td>
                <td className="px-4 py-3"><Badge status={STATUS_LABELS[inv.status] || inv.status} /></td>
                <td className="px-4 py-3">
                  {inv.status === 'borrador' && (
                    submittingId === inv.id ? (
                      <div className="text-xs font-bold text-zinc-400 flex items-center gap-1">
                        <Loader size={14} className="animate-spin" /> Enviando al SRI...
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {can('invoices.approve') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleApprove(inv); }}
                            className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                          >
                            <CheckCircle size={14} /> Aprobar
                          </button>
                        )}
                        {can('invoices.void') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleVoid(inv); }}
                            className="text-xs font-bold text-red-400 hover:text-red-300 flex items-center gap-1"
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
                        className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 disabled:opacity-50"
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
                          className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 disabled:opacity-50"
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
                          className="text-xs font-bold text-zinc-300 hover:text-zinc-100 flex items-center gap-1"
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
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <FileText className="text-emerald-500" size={28} />
                <h3 className="text-2xl font-bold text-white">Detalle de Factura</h3>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="text-zinc-500 hover:text-zinc-300">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-zinc-500">Número de Factura</div>
                  <div className="text-lg font-bold text-zinc-100 font-mono">{selectedInvoice.invoice_number}</div>
                  {selectedInvoice.point_of_sales?.branches?.name && (
                    <div className="text-xs text-zinc-500 flex items-center gap-1 mt-1">
                      <MapPin size={11} /> {selectedInvoice.point_of_sales.branches.name} · {selectedInvoice.point_of_sales.nombre}
                    </div>
                  )}
                </div>
                <Badge status={STATUS_LABELS[selectedInvoice.status] || selectedInvoice.status} />
              </div>

              {/* Access Key */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-bold text-zinc-400">Clave de Acceso SRI</div>
                  {selectedInvoice.authorization_number && (
                    <button
                      onClick={() => copyAccessKey(selectedInvoice.authorization_number)}
                      className="text-zinc-500 hover:text-emerald-400"
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </div>
                <div className="text-xs sm:text-sm text-emerald-400 font-mono break-all">
                  {selectedInvoice.authorization_number || 'No generada'}
                </div>
              </div>

              {selectedInvoice.status === 'devuelta' && selectedInvoice.sri_response_message && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <div className="text-xs font-bold text-red-400 mb-1">Respuesta del SRI (rechazo)</div>
                  <div className="text-xs text-red-300 break-all whitespace-pre-wrap">{selectedInvoice.sri_response_message}</div>
                </div>
              )}

              {/* Customer Info */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                <div className="text-xs font-bold text-zinc-400 mb-2">Cliente</div>
                {selectedInvoice.customers ? (
                  <div className="space-y-1 text-sm">
                    <div className="text-zinc-100 font-bold">{selectedInvoice.customers.name}</div>
                    <div className="text-zinc-400">
                      {selectedInvoice.customers.identification_type === 'ruc' ? 'RUC' : 'Cédula'}: {selectedInvoice.customers.identification_number}
                    </div>
                    {selectedInvoice.customers.email && <div className="text-zinc-500 text-xs">{selectedInvoice.customers.email}</div>}
                    {selectedInvoice.customers.phone && <div className="text-zinc-500 text-xs">{selectedInvoice.customers.phone}</div>}
                  </div>
                ) : (
                  <div className="text-sm text-zinc-300">Consumidor Final</div>
                )}
              </div>

              {/* Line Items */}
              <div>
                <div className="text-xs font-bold text-zinc-400 mb-2">Productos</div>
                {loadingDetails ? (
                  <div className="text-center text-zinc-500 py-4 text-sm">Cargando...</div>
                ) : (
                  <div className="space-y-2">
                    {invoiceDetails.map(item => {
                      // invoice_details has no discount_amount column - derive it
                      // from what's actually stored (gross - net subtotal)
                      const grossAmount = parseFloat(item.unit_price) * parseFloat(item.quantity);
                      const discountAmount = grossAmount - parseFloat(item.subtotal);
                      return (
                        <div key={item.id} className="flex justify-between items-center bg-zinc-950 rounded-lg p-3 text-sm">
                          <div>
                            <div className="text-zinc-100">{item.product_name}</div>
                            <div className="text-xs text-zinc-500">{item.quantity} x {formatUSD(item.unit_price)}</div>
                            {item.discount_percent > 0 && (
                              <div className="text-xs text-pink-400 font-bold">
                                -{item.discount_percent}% dto. (-{formatUSD(discountAmount)})
                              </div>
                            )}
                          </div>
                          <div className="font-bold text-emerald-400">{formatUSD(item.total)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="border-t border-zinc-800 pt-4 space-y-1 text-sm">
                <div className="flex justify-between text-zinc-400">
                  <span>Subtotal:</span>
                  <span>{formatUSD(selectedInvoice.subtotal)}</span>
                </div>
                {selectedInvoice.discount_amount > 0 && (
                  <div className="flex justify-between text-red-400">
                    <span>Descuento:</span>
                    <span>-{formatUSD(selectedInvoice.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-zinc-400">
                  <span>IVA:</span>
                  <span>{formatUSD(selectedInvoice.tax_amount)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg text-emerald-400 pt-1">
                  <span>Total:</span>
                  <span>{formatUSD(selectedInvoice.total_amount)}</span>
                </div>
              </div>

              {selectedInvoice.status === 'borrador' && (can('invoices.approve') || can('invoices.void')) && (
                <div className="flex gap-3 pt-4 border-t border-zinc-800">
                  {can('invoices.void') && (
                    <button
                      onClick={() => handleVoid(selectedInvoice)}
                      disabled={submittingId === selectedInvoice.id}
                      className="flex-1 bg-zinc-800 hover:bg-red-900/30 disabled:opacity-50 text-red-400 font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <XCircle size={18} /> Anular
                    </button>
                  )}
                  {can('invoices.approve') && (
                    <button
                      onClick={() => handleApprove(selectedInvoice)}
                      disabled={submittingId === selectedInvoice.id}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
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
                <div className="pt-4 border-t border-zinc-800 space-y-2">
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
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
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
                      className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <FileCode size={18} /> Descargar XML autorizado
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
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
                className="px-4 py-2 rounded-lg text-zinc-400 hover:text-zinc-200 font-bold disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkExport}
                disabled={exportingZip}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-lg flex items-center gap-2"
              >
                {exportingZip ? <><Loader size={16} className="animate-spin" /> Generando ZIP...</> : <><Archive size={16} /> Descargar ZIP</>}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Genera un .zip con el XML autorizado de cada factura del rango (nombrado con su clave de acceso) y un <span className="font-mono text-zinc-300">resumen.csv</span>. Solo se incluyen facturas en estado <span className="font-bold text-emerald-400">autorizada</span>.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-zinc-300 mb-1">Desde</label>
                <input
                  type="date"
                  value={bulkStartDate}
                  onChange={(e) => setBulkStartDate(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-300 mb-1">Hasta</label>
                <input
                  type="date"
                  value={bulkEndDate}
                  onChange={(e) => setBulkEndDate(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100"
                />
              </div>
            </div>
            {branches.length > 1 && (
              <div>
                <label className="block text-sm font-bold text-zinc-300 mb-1">Sucursal</label>
                <select
                  value={bulkBranchId}
                  onChange={(e) => setBulkBranchId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100"
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
