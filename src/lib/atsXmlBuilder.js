// Serializador del XML del ATS - sigue el orden EXACTO de xsd:sequence del
// esquema oficial (ats.xsd), que es sensible al orden: dos elementos con los
// mismos valores pero en otro orden son inválidos. Ver atsHelpers.js para
// las simplificaciones documentadas y el alcance de qué se incluye.
//
// Declara UTF-8 (no ISO-8859-1 como el ejemplo del XSD) porque el archivo
// se genera como texto JS/Blob en UTF-8 real - declarar ISO-8859-1 mientras
// se escriben bytes UTF-8 sería un desajuste real entre lo declarado y lo
// escrito (rompería nombres con tildes/ñ), no una fidelidad al esquema.

function escapeXmlText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function el(tag, value) {
  if (value === null || value === undefined || value === '') return '';
  return `<${tag}>${escapeXmlText(value)}</${tag}>`;
}

function amount(value) {
  return (Math.round((Number(value) || 0) * 100) / 100).toFixed(2);
}

// dd/mm/aaaa, según fechaType del XSD. Las fechas de este sistema son
// `date` de Postgres (YYYY-MM-DD, sin hora - ver nota de Compras Fase 1
// sobre por qué se evitó timestamp without time zone) o issue_date de
// invoices (timestamp): en ambos casos basta tomar los primeros 10
// caracteres antes de reordenar, sin pasar por new Date()/toISOString()
// que podría correr la fecha un día en zonas UTC- como Ecuador.
function formatAtsDate(value) {
  const isoDate = String(value).slice(0, 10);
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function buildAirXml(airDetalle) {
  if (!airDetalle || airDetalle.length === 0) return '';
  const items = airDetalle.map(a => [
    '<detalleAir>',
    el('codRetAir', a.codRetAir),
    el('baseImpAir', amount(a.baseImpAir)),
    el('porcentajeAir', (Number(a.porcentajeAir) || 0).toFixed(2)),
    el('valRetAir', amount(a.valRetAir)),
    '</detalleAir>'
  ].join('')).join('');
  return `<air>${items}</air>`;
}

function buildDetalleCompraXml(row) {
  return [
    '<detalleCompras>',
    el('codSustento', row.codSustento),
    el('tpIdProv', row.tpIdProv),
    el('idProv', row.idProv),
    el('tipoComprobante', row.tipoComprobante),
    el('parteRel', row.parteRel),
    el('fechaRegistro', formatAtsDate(row.fechaRegistro)),
    el('establecimiento', row.establecimiento),
    el('puntoEmision', row.puntoEmision),
    el('secuencial', row.secuencial),
    el('fechaEmision', formatAtsDate(row.fechaEmision)),
    el('autorizacion', row.autorizacion),
    el('baseNoGraIva', amount(0)),
    el('baseImponible', amount(row.baseImponible)),
    el('baseImpGrav', amount(row.baseImpGrav)),
    el('baseImpExe', amount(0)),
    el('montoIce', amount(0)),
    el('montoIva', amount(row.montoIva)),
    el('valorRetBienes', amount(row.valorRetBienes)),
    el('valorRetServicios', amount(0)),
    el('valRetServ100', amount(0)),
    buildAirXml(row.airDetalle),
    '</detalleCompras>'
  ].join('');
}

function buildDetalleVentaXml(row) {
  return [
    '<detalleVentas>',
    el('tpIdCliente', row.tpIdCliente),
    el('idCliente', row.idCliente),
    el('tipoComprobante', row.tipoComprobante),
    el('tipoEmision', 'E'),
    el('numeroComprobantes', row.numeroComprobantes),
    el('baseNoGraIva', amount(0)),
    el('baseImponible', amount(row.baseImponible)),
    el('baseImpGrav', amount(row.baseImpGrav)),
    el('montoIva', amount(row.montoIva)),
    el('valorRetIva', amount(0)),
    el('valorRetRenta', amount(0)),
    '</detalleVentas>'
  ].join('');
}

function buildDetalleAnuladoXml(row) {
  return [
    '<detalleAnulados>',
    el('tipoComprobante', row.tipoComprobante),
    el('establecimiento', row.establecimiento),
    el('puntoEmision', row.puntoEmision),
    el('secuencialInicio', row.secuencialInicio),
    el('secuencialFin', row.secuencialFin),
    el('autorizacion', row.autorizacion),
    '</detalleAnulados>'
  ].join('');
}

function buildVentaEstXml(row) {
  return [
    '<ventaEst>',
    el('codEstab', row.codEstab),
    el('ventasEstab', amount(row.ventasEstab)),
    '</ventaEst>'
  ].join('');
}

export function buildAtsXml(summary) {
  const { header, ventas, compras, anulados, ventasEstablecimiento } = summary;

  const parts = [
    el('TipoIDInformante', header.tipoIDInformante),
    el('IdInformante', header.idInformante),
    el('razonSocial', header.razonSocial),
    el('Anio', header.anio),
    el('Mes', header.mes),
    el('numEstabRuc', header.numEstabRuc),
    el('totalVentas', amount(header.totalVentas)),
    el('codigoOperativo', header.codigoOperativo)
  ];

  if (compras.length > 0) {
    parts.push(`<compras>${compras.map(buildDetalleCompraXml).join('')}</compras>`);
  }
  if (ventas.length > 0) {
    parts.push(`<ventas>${ventas.map(buildDetalleVentaXml).join('')}</ventas>`);
  }
  if (ventasEstablecimiento.length > 0) {
    parts.push(`<ventasEstablecimiento>${ventasEstablecimiento.map(buildVentaEstXml).join('')}</ventasEstablecimiento>`);
  }
  if (anulados.length > 0) {
    parts.push(`<anulados>${anulados.map(buildDetalleAnuladoXml).join('')}</anulados>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<iva>${parts.join('')}</iva>`;
}

export function atsFileName(year, month) {
  return `AT${String(month).padStart(2, '0')}${year}.xml`;
}
