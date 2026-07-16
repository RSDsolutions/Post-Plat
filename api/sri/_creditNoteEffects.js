// Efectos que deben aplicarse una vez que una nota de crédito queda
// AUTORIZADA de verdad ante el SRI: si salda el 100% de la factura original,
// anularla; si el gerente pidió reingresar stock, hacerlo; en ambos casos
// dejar un movimiento en inventory_movements (best-effort). Se llama tanto
// desde submit-credit-note.js (cuando el SRI autoriza en el acto) como desde
// reconcile-invoice.js (cuando una NC quedó 'devuelta' por timeout y se
// autoriza después, al reconsultar) - sin este módulo compartido, una NC que
// tarda en autorizarse nunca dispara la cascada ni el reingreso de stock.
//
// Se recalcula todo desde la fila ya actualizada a 'autorizada' (no recibe
// el estado "antes" del caller) - así es idempotente y correcto sin importar
// qué endpoint la autorizó.
const AMOUNT_EPSILON = 0.01;

async function restockProduct(supabase, productId, branchId, amount) {
  const { data: current, error: fetchError } = await supabase
    .from('product_stock')
    .select('quantity')
    .eq('product_id', productId)
    .eq('branch_id', branchId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);

  const newQuantity = (current?.quantity || 0) + amount;

  const { error } = await supabase
    .from('product_stock')
    .upsert([{ product_id: productId, branch_id: branchId, quantity: newQuantity, updated_at: new Date().toISOString() }], { onConflict: 'product_id,branch_id' });

  if (error) throw new Error(error.message);
}

export async function applyCreditNoteAuthorizedEffects({ supabase, creditNoteId, companyId, userId }) {
  const warnings = [];

  const { data: creditNote, error: creditNoteError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', creditNoteId)
    .eq('company_id', companyId)
    .single();
  if (creditNoteError || !creditNote || creditNote.invoice_type !== 'nota_credito' || !creditNote.modified_invoice_id) {
    return { warnings, originalInvoiceVoided: false };
  }

  const { data: originalInvoice, error: originalError } = await supabase
    .from('invoices')
    .select('*, point_of_sales(branch_id)')
    .eq('id', creditNote.modified_invoice_id)
    .eq('company_id', companyId)
    .single();
  if (originalError || !originalInvoice) {
    warnings.push('No se encontró la factura original para aplicar los efectos de la nota de crédito');
    return { warnings, originalInvoiceVoided: false };
  }

  const { data: allCreditNotes, error: allError } = await supabase
    .from('invoices')
    .select('total_amount')
    .eq('modified_invoice_id', originalInvoice.id)
    .eq('invoice_type', 'nota_credito')
    .eq('status', 'autorizada');
  if (allError) {
    warnings.push(`No se pudo calcular el saldo acreditado: ${allError.message}`);
  }
  const totalCredited = (allCreditNotes || []).reduce((sum, cn) => sum + parseFloat(cn.total_amount), 0);
  const isFullyCredited = totalCredited >= parseFloat(originalInvoice.total_amount) - AMOUNT_EPSILON;

  let originalInvoiceVoided = false;
  if (isFullyCredited && originalInvoice.status !== 'anulada') {
    const { error: voidError } = await supabase.from('invoices').update({
      status: 'anulada',
      voided_at: new Date().toISOString(),
      voided_reason: `Anulada por nota de crédito ${creditNote.invoice_number}`
    }).eq('id', originalInvoice.id);
    if (voidError) {
      warnings.push(`No se pudo actualizar el estado de la factura original: ${voidError.message}`);
    } else {
      originalInvoiceVoided = true;
    }
  }

  if (creditNote.credit_note_restock) {
    const branchId = originalInvoice.point_of_sales?.branch_id;
    if (!branchId) {
      warnings.push('No se pudo determinar la sucursal para reingresar el stock');
    } else {
      const { data: details, error: detailsError } = await supabase
        .from('invoice_details')
        .select('*')
        .eq('invoice_id', creditNote.id);
      if (detailsError) {
        warnings.push(`No se pudo leer el detalle de la nota de crédito para reingresar stock: ${detailsError.message}`);
      } else {
        for (const d of details || []) {
          if (!d.product_id) continue;
          try {
            await restockProduct(supabase, d.product_id, branchId, parseFloat(d.quantity));
          } catch (stockError) {
            warnings.push(`No se pudo reingresar stock de "${d.product_name}": ${stockError.message}`);
            continue;
          }
          try {
            await supabase.from('inventory_movements').insert([{
              company_id: companyId,
              product_id: d.product_id,
              movement_type: 'nota_credito_reingreso',
              quantity: parseFloat(d.quantity),
              reference_id: creditNote.id,
              reference_type: 'invoice',
              user_id: userId,
              notes: `Reingreso por nota de crédito ${creditNote.invoice_number} sobre factura ${originalInvoice.invoice_number}`
            }]);
          } catch (movementError) {
            console.error('No se pudo registrar el movimiento de inventario (no crítico):', movementError);
          }
        }
      }
    }
  }

  return { warnings, originalInvoiceVoided };
}
