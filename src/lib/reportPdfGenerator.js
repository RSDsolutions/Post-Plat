import { jsPDF } from 'jspdf';
import { loadImageAsDataUrl } from './pdfImage.js';
import { formatCellValue } from './reportsHelpers.js';

// Same print-friendly palette used by rideGenerator.js, kept local here
// rather than shared so each generator can evolve independently.
const ACCENT = [39, 39, 42];     // zinc-800 - section bars
const TABLE_HEAD = [63, 63, 70]; // zinc-700 - column header row (distinguishes it from the section bar above)
const LIGHT = [244, 244, 245];   // zinc-100 - card fill / zebra rows
const BORDER = [212, 212, 216];  // zinc-300
const MUTED = [113, 113, 122];   // zinc-500

const ACCENT_COLORS = {
  emerald: [16, 185, 129],
  blue: [59, 130, 246],
  amber: [217, 119, 6],
  purple: [147, 51, 234],
  pink: [219, 39, 119],
  red: [220, 38, 38]
};

function truncateToWidth(doc, text, maxWidth) {
  const str = String(text ?? '');
  if (doc.getTextWidth(str) <= maxWidth) return str;
  let t = str;
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '…';
}

const DIACRITICS_START = String.fromCharCode(768);  // U+0300
const DIACRITICS_END = String.fromCharCode(879);    // U+036F
const DIACRITICS_RE = new RegExp('[' + DIACRITICS_START + '-' + DIACRITICS_END + ']', 'g');

function slugify(text) {
  return String(text)
    .normalize('NFD').replace(DIACRITICS_RE, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Renders any report produced by reportsHelpers.js's buildReport() into a
// branded, paginated PDF: logo header, KPI cards, an optional horizontal
// bar ranking, and the full detail table with zebra striping and a totals
// row. Orientation auto-switches to landscape when the table has too many
// columns to fit a portrait page.
export async function generateReportPdf({ company, title, dateRangeLabel, report }) {
  const { kpis = [], chart, table } = report;
  const logo = await loadImageAsDataUrl(company?.logo_url);

  const totalColWidth = (table?.columns || []).reduce((s, c) => s + (c.width || 25), 0);
  const orientation = totalColWidth > 180 ? 'landscape' : 'portrait';
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const usableWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed) => {
    if (y + needed > pageHeight - 16) {
      doc.addPage();
      y = margin;
      return true;
    }
    return false;
  };

  const sectionHeader = (text) => {
    doc.setFillColor(...ACCENT);
    doc.rect(margin, y, usableWidth, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(truncateToWidth(doc, text.toUpperCase(), usableWidth - 6), margin + 3, y + 4.8);
    y += 7;
    doc.setTextColor(0, 0, 0);
  };

  // ---- Header: logo + company (left) / title + date range (right) ----
  let textX = margin;
  if (logo) {
    const maxW = 22, maxH = 18;
    const ratio = Math.min(maxW / logo.width, maxH / logo.height, 1);
    const w = logo.width * ratio, h = logo.height * ratio;
    doc.addImage(logo.dataUrl, 'PNG', margin, y, w, h);
    textX = margin + maxW + 5;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text(truncateToWidth(doc, company?.nombre_comercial || company?.razon_social || 'POST-PLAT', usableWidth * 0.5), textX, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(company?.ruc ? `RUC: ${company.ruc}` : '', textX, y + 11);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...ACCENT);
  doc.text(truncateToWidth(doc, title.toUpperCase(), usableWidth * 0.55), pageWidth - margin, y + 6, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(dateRangeLabel || '', pageWidth - margin, y + 11, { align: 'right' });
  doc.text(`Generado: ${new Date().toLocaleString('es-EC')}`, pageWidth - margin, y + 15, { align: 'right' });

  y += 21;
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineWidth(0.2);
  y += 6;
  doc.setTextColor(0, 0, 0);

  // ---- KPI cards ----
  if (kpis.length) {
    const cardsPerRow = orientation === 'landscape' ? 6 : 4;
    const gap = 4;
    const cardW = (usableWidth - gap * (cardsPerRow - 1)) / cardsPerRow;
    const cardH = 20;
    const kpiRows = Math.ceil(kpis.length / cardsPerRow);
    ensureSpace(kpiRows * (cardH + gap));

    kpis.forEach((kpi, i) => {
      const col = i % cardsPerRow;
      const row = Math.floor(i / cardsPerRow);
      const cx = margin + col * (cardW + gap);
      const cy = y + row * (cardH + gap);
      doc.setFillColor(...LIGHT);
      doc.setDrawColor(...BORDER);
      doc.rect(cx, cy, cardW, cardH, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(truncateToWidth(doc, kpi.label.toUpperCase(), cardW - 6), cx + 3, cy + 6.5);

      const color = ACCENT_COLORS[kpi.accent] || [0, 0, 0];
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(kpi.format === 'text' ? 10 : 13);
      doc.setTextColor(...color);
      doc.text(truncateToWidth(doc, formatCellValue(kpi.value, kpi.format), cardW - 6), cx + 3, cy + 15.5);
    });

    y += kpiRows * (cardH + gap) + 2;
    doc.setTextColor(0, 0, 0);
  }

  // ---- Bar ranking (only chart type rendered natively in the PDF - donut
  // and trend charts stay on-screen only, the detail table below covers
  // the same data in print form) ----
  if (chart?.type === 'bars' && chart.data?.length) {
    ensureSpace(11);
    sectionHeader(chart.title || 'Ranking');
    y += 2;

    const maxVal = Math.max(...chart.data.map(d => d.value), 1);
    const labelW = Math.min(60, usableWidth * 0.35);
    const valueW = 26;
    const barAreaW = usableWidth - labelW - valueW - 4;

    chart.data.forEach(d => {
      ensureSpace(7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(truncateToWidth(doc, d.label, labelW - 2), margin, y + 4);

      const barW = Math.max(1.5, (d.value / maxVal) * barAreaW);
      doc.setFillColor(...ACCENT);
      doc.rect(margin + labelW, y + 0.3, barW, 4, 'F');

      doc.setFontSize(8);
      doc.text(d.formatted ?? formatCellValue(d.value, 'usd'), pageWidth - margin, y + 4, { align: 'right' });
      y += 7;
    });
    y += 3;
  }

  // ---- Detail table ----
  if (table && table.rows) {
    ensureSpace(16);
    sectionHeader(table.title || 'Detalle');
    y += 2;

    const rowH = 6.2;
    const drawColumnHeaderRow = () => {
      doc.setFillColor(...TABLE_HEAD);
      doc.rect(margin, y, usableWidth, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      let cx = margin;
      table.columns.forEach(col => {
        const label = truncateToWidth(doc, col.label.toUpperCase(), col.width - 3);
        const tx = col.align === 'right' ? cx + col.width - 2 : cx + 2;
        doc.text(label, tx, y + 4.8, { align: col.align === 'right' ? 'right' : 'left' });
        cx += col.width;
      });
      y += 7;
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
    };

    drawColumnHeaderRow();

    if (table.rows.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text('Sin datos para este período', margin + usableWidth / 2, y + 8, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      y += 16;
    }

    table.rows.forEach((row, idx) => {
      if (ensureSpace(rowH)) drawColumnHeaderRow();
      if (idx % 2 === 1) {
        doc.setFillColor(...LIGHT);
        doc.rect(margin, y, usableWidth, rowH, 'F');
      }
      let cx = margin;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(0, 0, 0);
      table.columns.forEach(col => {
        const text = truncateToWidth(doc, formatCellValue(row[col.key], col.format), col.width - 3);
        const tx = col.align === 'right' ? cx + col.width - 2 : cx + 2;
        doc.text(text, tx, y + 4.2, { align: col.align === 'right' ? 'right' : 'left' });
        cx += col.width;
      });
      y += rowH;
    });

    if (table.totals && table.rows.length > 0) {
      ensureSpace(rowH + 2);
      doc.setDrawColor(...BORDER);
      doc.line(margin, y, margin + usableWidth, y);
      y += 1.5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      let cx = margin;
      table.columns.forEach((col, i) => {
        const hasValue = table.totals[col.key] !== undefined;
        const text = hasValue
          ? truncateToWidth(doc, formatCellValue(table.totals[col.key], col.format), col.width - 3)
          : (i === 0 ? 'TOTAL' : '');
        const tx = col.align === 'right' ? cx + col.width - 2 : cx + 2;
        doc.text(text, tx, y + 4.2, { align: col.align === 'right' ? 'right' : 'left' });
        cx += col.width;
      });
      y += rowH + 2;
      doc.setFont('helvetica', 'normal');
    }
  }

  // ---- Footer (every page) ----
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text('Generado por POST-PLAT', margin, pageHeight - 8);
    doc.text(`Página ${p} de ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  doc.save(`Reporte_${slugify(title)}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
