import { splitInvoiceByTaxRate } from './accountingHelpers.js';

// Compras Fase 8 — Anexo Transaccional Simplificado (ATS).
//
// Reconstruido "mejor esfuerzo" a partir del XSD oficial del SRI
// (descargas.sri.gob.ec/download/anexos/ats/ats.xsd) y la Ficha Técnica ATS
// vigente (SRI, actualizada 2025) — no de memoria: el usuario pidió
// explícitamente investigar el esquema real en vez de asumirlo (precedente:
// en la Fase 4 el primer XSD que se subió resultó ser de otro estándar).
// AÚN ASÍ, el archivo generado debe revisarlo un contador antes de
// declararlo — ver las simplificaciones documentadas abajo.
//
// ALCANCE — qué NO incluye, y por qué:
//   - exportaciones, recap (tarjetas de crédito), fideicomisos,
//     rendFinancieros: no aplican al modelo de negocio de POST-PLAT (no hay
//     datos de exportación, la empresa no es comercializadora de tarjetas,
//     no maneja fideicomisos ni es una IFI). Los 4 son opcionales en el XSD
//     (minOccurs=0), omitirlos no invalida el archivo.
//
// SIMPLIFICACIONES DOCUMENTADAS — requieren revisión contable antes de
// declarar (se muestran también en la UI de AtsExport.jsx):
//   1. codSustento (compras): el sistema no clasifica cada compra como
//      inventario/activo fijo/gasto/viáticos — es un campo editable por fila
//      en la UI, con sugerencia por defecto '01' (crédito tributario IVA,
//      bienes/servicios distintos de inventario).
//   2. Retención de IVA en compras: el ATS pide el monto retenido desglosado
//      por bienes/servicios en tramos de 10/20/50/100% - purchase_retentions
//      solo guarda type ('iva'/'renta') + porcentaje, sin esa distinción. El
//      total retenido de IVA de cada compra se reporta completo en el campo
//      legado valorRetBienes (obligatorio, el de mayor compatibilidad),
//      dejando valRetBien10/valRetServ20/valRetServ50/valorRetServicios/
//      valRetServ100 en 0.00.
//   3. baseNoGraIva / baseImpExe: el modelo de datos (purchases, invoices)
//      no distingue "no objeto de IVA" ni "exenta" de la base 0%/gravada -
//      siempre van en 0.00.
//   4. valorRetIva / valorRetRenta (ventas): este sistema no registra
//      retenciones que los CLIENTES le practiquen a la empresa sobre sus
//      propias ventas (no es un flujo modelado en Ventas) - siempre 0.00.
//   5. formasDePago y la referencia a la propia retención emitida
//      (estabRetencion1..fechaEmiRet1) se omiten - son opcionales en el XSD
//      y no se modelan hoy con el detalle que pedirían.
//   6. anulados: cada documento anulado se reporta como su propio rango de
//      un comprobante (secuencialInicio = secuencialFin) en vez de agrupar
//      rangos consecutivos - siempre válido, solo menos compacto si hay
//      muchas anulaciones seguidas.
//
// Una compra sin clave de acceso del proveedor (supplier_access_key) no se
// puede reportar (autorizacion es obligatorio, mínimo 3 caracteres) - se
// excluye del XML y se cuenta en `incompleteCount` para que el usuario la
// complete antes de declarar.

export const CONSUMIDOR_FINAL_ID = '9999999999999';

export const COD_SUSTENTO_OPTIONS = [
  { value: '01', label: '01 - Crédito tributario IVA (bienes/servicios, no inventario/activo fijo)' },
  { value: '02', label: '02 - Costo o gasto IR (bienes/servicios, no inventario/activo fijo)' },
  { value: '03', label: '03 - Activo fijo - Crédito tributario IVA' },
  { value: '04', label: '04 - Activo fijo - Costo o gasto IR' },
  { value: '05', label: '05 - Liquidación gastos de viaje (a nombre de empleados)' },
  { value: '06', label: '06 - Inventario - Crédito tributario IVA' },
  { value: '07', label: '07 - Inventario - Costo o gasto IR' },
  { value: '08', label: '08 - Reembolso de gastos (intermediario)' },
  { value: '00', label: '00 - Caso especial sin sustento en las opciones anteriores' }
];

function parseDocNumber(value) {
  const parts = String(value || '').split('-');
  if (parts.length !== 3) return null;
  const [establecimiento, puntoEmision, secuencial] = parts;
  if (!/^\d{3}$/.test(establecimiento) || !/^\d{3}$/.test(puntoEmision) || !/^\d{1,9}$/.test(secuencial)) return null;
  return { establecimiento, puntoEmision, secuencial: String(Number(secuencial)) };
}

function tipoIdCliente(invoice) {
  if (!invoice.customer_id || !invoice.customers) return '07';
  return invoice.customers.identification_type === 'ruc' ? '04' : '05';
}

function idClienteOf(invoice) {
  if (!invoice.customer_id || !invoice.customers) return CONSUMIDOR_FINAL_ID;
  return invoice.customers.identification_number || CONSUMIDOR_FINAL_ID;
}

function tipoComprobanteVenta(invoice) {
  return invoice.invoice_type === 'nota_credito' ? '04' : '01';
}

// Ventas del ATS se reportan agrupadas por cliente+tipo de comprobante (así
// lo pide la Ficha Técnica: "Número de comprobantes emitidos... cantidad de
// comprobantes de venta emitidos en las transacciones realizadas con un
// mismo cliente en el período informado") - no es una fila por factura.
export function groupVentasForAts(invoices) {
  const eligible = invoices.filter(inv => inv.status === 'autorizada' && (inv.invoice_type === 'factura' || inv.invoice_type === 'nota_credito'));
  const groups = new Map();
  eligible.forEach(inv => {
    const tpIdCli = tipoIdCliente(inv);
    const idCli = idClienteOf(inv);
    const tipoComprobante = tipoComprobanteVenta(inv);
    const key = `${tpIdCli}_${idCli}_${tipoComprobante}`;
    const { base0, baseGravada, iva } = splitInvoiceByTaxRate(inv);
    const cur = groups.get(key) || {
      tpIdCliente: tpIdCli, idCliente: idCli, tipoComprobante,
      numeroComprobantes: 0, baseImponible: 0, baseImpGrav: 0, montoIva: 0
    };
    cur.numeroComprobantes += 1;
    cur.baseImponible += base0;
    cur.baseImpGrav += baseGravada;
    cur.montoIva += iva;
    groups.set(key, cur);
  });
  return Array.from(groups.values()).sort((a, b) => b.baseImpGrav + b.baseImponible - (a.baseImpGrav + a.baseImponible));
}

// Una fila por compra (no agrupada, a diferencia de ventas) - cada una carga
// su propio secuencial/autorización del comprobante del proveedor, que no
// se puede sumar entre compras distintas.
export function buildComprasForAts(purchases, codSustentoByPurchaseId) {
  const rows = [];
  let incompleteCount = 0;

  purchases.filter(p => p.status !== 'anulada').forEach(p => {
    const doc = parseDocNumber(p.supplier_document_number);
    const autorizacion = p.supplier_access_key;
    if (!doc || !autorizacion || autorizacion.length < 3) {
      incompleteCount += 1;
      return;
    }

    const retentions = p.purchase_retentions || [];
    const ivaRetained = retentions.filter(r => r.retention_type === 'iva').reduce((s, r) => s + (Number(r.retention_amount) || 0), 0);
    const rentaRetentions = retentions.filter(r => r.retention_type === 'renta');

    rows.push({
      codSustento: codSustentoByPurchaseId?.[p.id] || '01',
      tpIdProv: '01', // suppliers.ruc siempre es RUC en este sistema (ver Fase 1)
      idProv: p.suppliers?.ruc || '',
      tipoComprobante: p.purchase_doc_type === 'liquidacion_compra' ? '03' : '01',
      parteRel: p.suppliers?.es_parte_relacionada ? 'SI' : 'NO',
      fechaRegistro: p.document_date,
      fechaEmision: p.document_date,
      establecimiento: doc.establecimiento,
      puntoEmision: doc.puntoEmision,
      secuencial: doc.secuencial,
      autorizacion,
      baseImponible: Number(p.subtotal_0) || 0,
      baseImpGrav: Number(p.subtotal_iva) || 0,
      montoIva: Number(p.iva_amount) || 0,
      valorRetBienes: ivaRetained, // ver simplificación #2 arriba
      airDetalle: rentaRetentions.map(r => ({
        codRetAir: r.retention_concepts?.codigo_sri || '',
        baseImpAir: Number(r.retention_base) || 0,
        porcentajeAir: Number(r.retention_percentage) || 0,
        valRetAir: Number(r.retention_amount) || 0
      }))
    });
  });

  return { rows, incompleteCount };
}

export function buildAnuladosForAts(invoices, purchases) {
  const rows = [];

  invoices.filter(inv => inv.status === 'anulada' && (inv.invoice_type === 'factura' || inv.invoice_type === 'nota_credito')).forEach(inv => {
    const doc = parseDocNumber(inv.invoice_number);
    if (!doc) return;
    rows.push({
      tipoComprobante: tipoComprobanteVenta(inv),
      establecimiento: doc.establecimiento,
      puntoEmision: doc.puntoEmision,
      secuencialInicio: doc.secuencial,
      secuencialFin: doc.secuencial,
      autorizacion: inv.authorization_number || null
    });
  });

  purchases.filter(p => p.status === 'anulada').forEach(p => {
    const doc = parseDocNumber(p.supplier_document_number);
    if (!doc || !p.supplier_access_key) return;
    rows.push({
      tipoComprobante: p.purchase_doc_type === 'liquidacion_compra' ? '03' : '01',
      establecimiento: doc.establecimiento,
      puntoEmision: doc.puntoEmision,
      secuencialInicio: doc.secuencial,
      secuencialFin: doc.secuencial,
      autorizacion: p.supplier_access_key
    });
  });

  return rows.filter(r => r.autorizacion);
}

export function buildVentasEstablecimientoForAts(invoices) {
  const eligible = invoices.filter(inv => inv.status === 'autorizada' && (inv.invoice_type === 'factura' || inv.invoice_type === 'nota_credito'));
  const byEstab = new Map();
  eligible.forEach(inv => {
    const codEstab = inv.point_of_sales?.numero_establecimiento;
    if (!codEstab) return;
    const sign = inv.invoice_type === 'nota_credito' ? -1 : 1;
    byEstab.set(codEstab, (byEstab.get(codEstab) || 0) + sign * (Number(inv.total_amount) || 0));
  });
  return Array.from(byEstab.entries()).map(([codEstab, ventasEstab]) => ({ codEstab, ventasEstab }));
}

// Ensambla la estructura completa (previa a la serialización XML) para un
// período mensual (año/mes ya filtrados por el caller vía fetchInvoicesForReports
// / fetchPurchasesForReports con los límites del mes).
export function buildAtsSummary({ company, year, month, invoices, purchases, codSustentoByPurchaseId }) {
  const ventas = groupVentasForAts(invoices);
  const { rows: compras, incompleteCount } = buildComprasForAts(purchases, codSustentoByPurchaseId);
  const anulados = buildAnuladosForAts(invoices, purchases);
  const ventasEstablecimiento = buildVentasEstablecimientoForAts(invoices);

  const totalVentas = ventasEstablecimiento.reduce((s, v) => s + v.ventasEstab, 0);
  const numEstabRuc = new Set([
    ...ventasEstablecimiento.map(v => v.codEstab),
    ...compras.map(c => c.establecimiento)
  ]).size || 1;

  return {
    header: {
      tipoIDInformante: 'R',
      idInformante: company.ruc,
      razonSocial: company.razon_social,
      anio: String(year),
      mes: String(month).padStart(2, '0'),
      numEstabRuc: String(numEstabRuc).padStart(3, '0'),
      totalVentas,
      codigoOperativo: 'IVA'
    },
    ventas,
    compras,
    anulados,
    ventasEstablecimiento,
    incompleteCount
  };
}
