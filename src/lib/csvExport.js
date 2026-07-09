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

export function downloadReportCsv(filename, columns, rows) {
  const header = columns.map(c => escapeCsvField(c.label)).join(',');
  const lines = rows.map(row =>
    columns.map(c => escapeCsvField(csvCellValue(row[c.key], c.format))).join(',')
  );
  // Leading BOM so Excel opens accented characters (á, é, ñ) as UTF-8
  // instead of mangling them under its default codepage.
  const BOM = String.fromCharCode(0xFEFF);
  const csvContent = [header, ...lines].join('\r\n');
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
