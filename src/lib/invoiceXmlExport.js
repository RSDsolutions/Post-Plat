import JSZip from 'jszip';
import { buildCsvStringWithBom } from './csvExport.js';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Descarga el XML autorizado de una sola factura. authorization_number es la
// clave de acceso de 49 dígitos (ver api/sri/submit-invoice.js, se guarda ahí
// directo - en el esquema offline que usa este proyecto la autorización SRI
// devuelve la misma clave de acceso, no un número distinto).
export function downloadInvoiceXml(invoice) {
  if (!invoice.signed_xml || !invoice.authorization_number) {
    throw new Error('Esta factura no tiene un XML autorizado para descargar');
  }
  const blob = new Blob([invoice.signed_xml], { type: 'application/xml;charset=utf-8;' });
  downloadBlob(blob, `${invoice.authorization_number}.xml`);
}

const SUMMARY_COLUMNS = [
  { key: 'document_type', label: 'Tipo' },
  { key: 'invoice_number', label: 'Número' },
  { key: 'issue_date', label: 'Fecha', format: 'datetime' },
  { key: 'customer_name', label: 'Cliente' },
  { key: 'customer_id_number', label: 'RUC/Cédula' },
  { key: 'subtotal', label: 'Subtotal', format: 'usd' },
  { key: 'tax_amount', label: 'IVA', format: 'usd' },
  { key: 'total_amount', label: 'Total', format: 'usd' },
  { key: 'authorization_number', label: 'Número de autorización' }
];

// Arma un ZIP con un .xml por comprobante autorizado (nombrado con su clave
// de acceso) más un resumen.csv - todo en el cliente, sin pasar por ninguna
// Vercel Function (los signed_xml ya están en el objeto invoice, cargados
// junto con el resto de la lista en InvoiceManagement.jsx). Facturas y notas
// de crédito van en subcarpetas separadas (mismo ZIP, mismo resumen.csv con
// una columna Tipo) para que sea fácil declarar cada una por separado.
export async function downloadInvoicesXmlZip(invoices, zipFilename) {
  const withXml = invoices.filter(inv => inv.status === 'autorizada' && inv.signed_xml && inv.authorization_number);
  if (withXml.length === 0) {
    throw new Error('No hay comprobantes autorizados con XML en el rango seleccionado');
  }

  const zip = new JSZip();
  withXml.forEach(inv => {
    const folder = inv.invoice_type === 'nota_credito' ? 'notas_credito' : 'facturas';
    zip.file(`${folder}/${inv.authorization_number}.xml`, inv.signed_xml);
  });

  const summaryRows = withXml.map(inv => ({
    document_type: inv.invoice_type === 'nota_credito' ? 'Nota de Crédito' : 'Factura',
    invoice_number: inv.invoice_number,
    issue_date: inv.issue_date,
    customer_name: inv.customers?.name || 'Consumidor Final',
    customer_id_number: inv.customers?.identification_number || '',
    subtotal: inv.subtotal,
    tax_amount: inv.tax_amount,
    total_amount: inv.total_amount,
    authorization_number: inv.authorization_number
  }));
  zip.file('resumen.csv', buildCsvStringWithBom(SUMMARY_COLUMNS, summaryRows));

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, zipFilename);
  return withXml.length;
}
