// Parsea del lado del cliente el XML de factura (o liquidación de compra)
// que un proveedor entrega - nunca lo firmamos ni lo reenviamos, solo
// extraemos los datos para precargar el formulario de PurchaseManagement.jsx
// (Fase 3) y dejar el archivo original guardado tal cual (Fase 5).
//
// La estructura de infoTributaria/infoFactura/detalles es la MISMA que ya
// usa este proyecto para armar sus propias facturas (api/sri/submit-invoice.js)
// - acá se recorre en sentido inverso, sin inventar un esquema nuevo.
//
// Usa getElementsByTagName en vez de querySelector/querySelectorAll a
// propósito: es el único método de recorrido que tanto el DOMParser real
// del navegador como los parsers XML livianos de Node (@xmldom/xmldom, ya
// es dependencia del proyecto) soportan por igual - así este módulo se
// puede probar de verdad fuera del navegador, no solo confiar en que
// funcione. Es seguro acá porque ningún tag de este esquema se anida dentro
// de sí mismo ni de un tag del mismo nombre a otra profundidad.
//
// El SRI también entrega los comprobantes autorizados envueltos en
// <autorizacion><comprobante><![CDATA[<factura>...</factura>]]></comprobante></autorizacion>
// (lo que baja el portal "Consulta de comprobantes") - se detecta y se
// desenvuelve antes de parsear el comprobante real.
const SUPPORTED_ROOT_TAGS = {
  factura: { infoTag: 'infoFactura', docType: 'factura_compra' },
  liquidacionCompra: { infoTag: 'infoLiquidacionCompra', docType: 'liquidacion_compra' }
};

function round2(n) {
  return Math.round((parseFloat(n) || 0) * 100) / 100;
}

function firstByTag(el, tag) {
  if (!el) return null;
  const nodes = el.getElementsByTagName(tag);
  return nodes.length > 0 ? nodes[0] : null;
}

function allByTag(el, tag) {
  if (!el) return [];
  return Array.from(el.getElementsByTagName(tag));
}

function textOf(el, tag) {
  const node = firstByTag(el, tag);
  return node && node.textContent ? node.textContent.trim() : '';
}

function numberOf(el, tag) {
  return parseFloat(textOf(el, tag)) || 0;
}

function fechaDDMMYYYYtoISO(value) {
  const [dd, mm, yyyy] = (value || '').split('/');
  if (!dd || !mm || !yyyy) return '';
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

export function parseSupplierInvoiceXml(xmlText) {
  const parser = new DOMParser();
  let doc = parser.parseFromString(xmlText, 'application/xml');
  if (!doc || !doc.documentElement) {
    throw new Error('El archivo no es un XML válido');
  }

  // Envoltorio de autorización del SRI - el comprobante real va en CDATA
  // dentro de <comprobante>, hay que re-parsear ese contenido.
  if (doc.documentElement.tagName === 'autorizacion') {
    const comprobanteNode = firstByTag(doc.documentElement, 'comprobante');
    const innerXml = comprobanteNode && comprobanteNode.textContent ? comprobanteNode.textContent.trim() : '';
    if (!innerXml) {
      throw new Error('El XML de autorización no contiene el comprobante');
    }
    doc = parser.parseFromString(innerXml, 'application/xml');
    if (!doc || !doc.documentElement) {
      throw new Error('El comprobante dentro del XML de autorización no es válido');
    }
  }

  const rootTag = doc.documentElement.tagName;
  const rootInfo = SUPPORTED_ROOT_TAGS[rootTag];
  if (!rootInfo) {
    throw new Error(`Tipo de comprobante no soportado (${rootTag}) - solo se pueden importar facturas o liquidaciones de compra`);
  }

  const infoTributaria = firstByTag(doc.documentElement, 'infoTributaria');
  const infoDoc = firstByTag(doc.documentElement, rootInfo.infoTag);
  if (!infoTributaria || !infoDoc) {
    throw new Error('El XML no tiene la estructura esperada de un comprobante del SRI');
  }

  const supplierRuc = textOf(infoTributaria, 'ruc');
  const supplierRazonSocial = textOf(infoTributaria, 'razonSocial');
  const accessKey = textOf(infoTributaria, 'claveAcceso');
  const estab = textOf(infoTributaria, 'estab');
  const ptoEmi = textOf(infoTributaria, 'ptoEmi');
  const secuencial = textOf(infoTributaria, 'secuencial');
  if (!supplierRuc || !estab || !ptoEmi || !secuencial) {
    throw new Error('El XML no tiene RUC o numeración de comprobante válidos');
  }

  const documentDate = fechaDDMMYYYYtoISO(textOf(infoDoc, 'fechaEmision'));

  const detallesEl = firstByTag(doc.documentElement, 'detalles');
  const detalleNodes = allByTag(detallesEl, 'detalle');
  if (detalleNodes.length === 0) {
    throw new Error('El XML no tiene ninguna línea de detalle');
  }
  const lines = detalleNodes.map(d => {
    const impuestosEl = firstByTag(d, 'impuestos');
    const impuestoNode = firstByTag(impuestosEl, 'impuesto');
    const tarifa = impuestoNode ? numberOf(impuestoNode, 'tarifa') : 0;
    return {
      description: textOf(d, 'descripcion') || 'Sin descripción',
      quantity: numberOf(d, 'cantidad') || 1,
      unit_price: numberOf(d, 'precioUnitario'),
      discount: numberOf(d, 'descuento'),
      iva_rate: tarifa,
      subtotal: round2(numberOf(d, 'precioTotalSinImpuesto'))
    };
  });

  // Los totales por tarifa vienen declarados en la cabecera
  // (totalConImpuestos > totalImpuesto[]) - más confiable que resumar las
  // líneas, que pueden tener pequeñas diferencias de redondeo respecto a
  // lo que el proveedor realmente declaró y firmó (mismo criterio ya
  // documentado para el Libro de Ventas propio, ver RESUMEN_SISTEMA.md).
  const totalConImpuestosEl = firstByTag(infoDoc, 'totalConImpuestos');
  const totalImpuestoNodes = allByTag(totalConImpuestosEl, 'totalImpuesto');
  let subtotal_0 = 0, subtotal_iva = 0, iva_amount = 0;
  for (const node of totalImpuestoNodes) {
    const tarifa = numberOf(node, 'tarifa');
    const base = numberOf(node, 'baseImponible');
    const valor = numberOf(node, 'valor');
    if (tarifa === 0) subtotal_0 += base;
    else { subtotal_iva += base; iva_amount += valor; }
  }
  const importeTotal = numberOf(infoDoc, 'importeTotal');

  return {
    purchaseDocType: rootInfo.docType,
    supplierRuc,
    supplierRazonSocial,
    documentNumber: `${estab}-${ptoEmi}-${secuencial}`,
    accessKey: accessKey || null,
    documentDate,
    lines,
    subtotal_0: round2(subtotal_0),
    subtotal_iva: round2(subtotal_iva),
    iva_amount: round2(iva_amount),
    total: round2(importeTotal || (subtotal_0 + subtotal_iva + iva_amount))
  };
}
