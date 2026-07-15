import { formatDate, formatDateTime, formatDayKey } from './reportsHelpers.js';

// CSV values are kept as raw numbers for usd/number/percent columns (no $
// sign or thousands separator) so Excel/Sheets can sum/pivot them directly -
// only dates get a human-readable format, since ISO timestamps are painful
// to read in a spreadsheet.
function csvCellValue(value, format) {
  if (value === null || value === undefined) return '';
  switch (format) {
    case 'usd': return Number(value).toFixed(2);
    case 'number': return String(Math.round(Number(value) || 0));
    case 'percent': return Number(value).toFixed(1);
    case 'datetime': return formatDateTime(value);
    case 'date': return formatDate(value);
    case 'daykey': return formatDayKey(value, 'long');
    default: return String(value);
  }
}

function escapeCsvField(value) {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Sin el BOM: para incrustar en un ZIP (invoiceXmlExport.js) hay que agregarlo
// aparte, ver buildCsvStringWithBom.
export function buildCsvString(columns, rows) {
  const header = columns.map(c => escapeCsvField(c.label)).join(',');
  const lines = rows.map(row =>
    columns.map(c => escapeCsvField(csvCellValue(row[c.key], c.format))).join(',')
  );
  return [header, ...lines].join('\r\n');
}

// Con el BOM inicial - así lo necesita cualquier destino que Excel vaya a
// abrir directo (descarga de archivo suelto o dentro de un ZIP).
export function buildCsvStringWithBom(columns, rows) {
  const BOM = String.fromCharCode(0xFEFF);
  return BOM + buildCsvString(columns, rows);
}

export function downloadReportCsv(filename, columns, rows) {
  const blob = new Blob([buildCsvStringWithBom(columns, rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
