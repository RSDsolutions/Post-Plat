import { sendEmail } from './_lib.js';
import { newInvoiceEmail } from './_templates.js';
import { getAuthenticatedUser } from '../_authHelpers.js';

// ---------------------------------------------------------------------------
// Envía el RIDE (PDF) de una factura autorizada al correo del cliente.
//
// El PDF se genera en el navegador con jsPDF (rideGenerator.js) y llega aquí
// en Base64. NO confiamos en el navegador para nada sensible:
//   - JWT real (api/_authHelpers.js) resuelve quién llama y de qué empresa es -
//     ya no un userId/companyId que el body simplemente afirmaba.
//   - El destinatario (email) se resuelve desde la tabla customers, no del body.
//   - Solo gerente/admin (mismo patrón que api/sri/submit-invoice.js) -
//     antes no se restringía el rol acá, solo la UI lo ocultaba
//     (can('invoices.send_ride')), así que un contador podía llamarlo
//     directo y el servidor lo dejaba pasar.
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { invoiceId, pdfBase64 } = req.body || {};
  if (!invoiceId || !pdfBase64) {
    return res.status(400).json({ error: 'invoiceId y pdfBase64 son requeridos' });
  }

  try {
    const { supabase, user, error: authError, status: authStatus } = await getAuthenticatedUser(req);
    if (authError) return res.status(authStatus).json({ error: authError });
    if (!['gerente', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'No autorizado para enviar el RIDE de esta empresa' });
    }
    const companyId = user.company_id;
    if (!companyId) {
      return res.status(403).json({ error: 'No autorizado para enviar el RIDE de esta empresa' });
    }

    // La factura debe existir, ser de la empresa y estar autorizada.
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('invoice_number, status, total_amount, authorization_number, issue_date, customers(name, email)')
      .eq('id', invoiceId)
      .eq('company_id', companyId)
      .single();
    if (invError || !invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }
    if (invoice.status !== 'autorizada') {
      return res.status(400).json({ error: `La factura está en estado '${invoice.status}', no se puede enviar el RIDE` });
    }

    const to = invoice.customers?.email;
    if (!to) {
      return res.status(200).json({ skipped: true, reason: 'El cliente no tiene correo registrado' });
    }

    const { data: company } = await supabase
      .from('companies')
      .select('nombre_comercial, razon_social')
      .eq('id', companyId)
      .single();

    const [estab, ptoEmi, secuencial] = String(invoice.invoice_number).split('-');
    const issueDate = invoice.issue_date
      ? new Date(invoice.issue_date).toLocaleDateString('es-EC')
      : null;

    const { subject, html } = newInvoiceEmail({
      customerName: invoice.customers?.name,
      companyName: company?.nombre_comercial || company?.razon_social || 'POST-PLAT',
      invoiceNumber: invoice.invoice_number,
      total: parseFloat(invoice.total_amount).toFixed(2),
      authorizationNumber: invoice.authorization_number,
      issueDate
    });

    const result = await sendEmail({
      to,
      subject,
      html,
      attachments: [{
        filename: `RIDE_${estab}-${ptoEmi}-${secuencial}.pdf`,
        content: pdfBase64  // Resend acepta el contenido en Base64
      }]
    });

    return res.status(200).json({ ok: true, to, ...result });
  } catch (error) {
    console.error('send-invoice-ride error:', error);
    return res.status(500).json({ error: error.message || 'Error al enviar el RIDE' });
  }
}
