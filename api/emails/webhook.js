import { getSupabaseAdmin, sendEmail, verifyWebhookSecret } from './_lib.js';
import { lowStockEmail, invoiceReturnedEmail } from './_templates.js';

// ---------------------------------------------------------------------------
// Receptor de los Database Webhooks de Supabase (ver supabase/migrations).
//
// Los triggers de Postgres hacen POST aquí SÓLO cuando ocurre el evento real
// (stock cruza el mínimo / factura pasa a 'devuelta'), enviando un payload
// mínimo con ids. Esta función re-resuelve los datos contra la BD con service
// role y despacha el correo. Se autentica con un secreto compartido en el
// header 'x-webhook-secret' (config del webhook en Supabase).
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!verifyWebhookSecret(req)) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const body = req.body || {};
  const event = body.event;

  try {
    const supabase = getSupabaseAdmin();

    if (event === 'low_stock') {
      const { product_id, branch_id, quantity, min_stock } = body;

      const { data: product } = await supabase
        .from('products')
        .select('name, code, company_id')
        .eq('id', product_id)
        .single();
      if (!product) return res.status(200).json({ skipped: 'producto no encontrado' });

      const [{ data: branch }, { data: company }] = await Promise.all([
        branch_id
          ? supabase.from('branches').select('name').eq('id', branch_id).single()
          : Promise.resolve({ data: null }),
        supabase.from('companies').select('email, admin_email, nombre_comercial, razon_social').eq('id', product.company_id).single()
      ]);

      const to = company?.email || company?.admin_email;
      const { subject, html } = lowStockEmail({
        companyName: company?.nombre_comercial || company?.razon_social || 'POST-PLAT',
        productName: product.name,
        productCode: product.code,
        branchName: branch?.name,
        quantity,
        minStock: min_stock
      });
      const result = await sendEmail({ to, subject, html });
      return res.status(200).json({ ok: true, ...result });
    }

    if (event === 'invoice_returned') {
      const { invoice_id } = body;

      const { data: invoice } = await supabase
        .from('invoices')
        .select('invoice_number, company_id, sri_response_message')
        .eq('id', invoice_id)
        .single();
      if (!invoice) return res.status(200).json({ skipped: 'factura no encontrada' });

      const { data: company } = await supabase
        .from('companies')
        .select('email, admin_email, nombre_comercial, razon_social')
        .eq('id', invoice.company_id)
        .single();

      const to = company?.email || company?.admin_email;
      // sri_response_message puede ser JSON serializado; recortamos para el correo.
      let reason = invoice.sri_response_message || '';
      if (reason.length > 800) reason = reason.slice(0, 800) + '…';

      const { subject, html } = invoiceReturnedEmail({
        companyName: company?.nombre_comercial || company?.razon_social || 'POST-PLAT',
        invoiceNumber: invoice.invoice_number,
        reason
      });
      const result = await sendEmail({ to, subject, html });
      return res.status(200).json({ ok: true, ...result });
    }

    return res.status(400).json({ error: `Evento no soportado: ${event}` });
  } catch (error) {
    console.error('email webhook error:', error);
    // 200 para que Supabase/pg_net no reintente en bucle por un fallo de datos;
    // el error queda en los logs de Vercel.
    return res.status(200).json({ ok: false, error: error.message });
  }
}
