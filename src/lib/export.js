import { toPng } from 'html-to-image';

// Standard PDF fonts only cover Latin-1, so swap the few glyphs we use outside it.
const pdfSafe = (s) =>
  String(s ?? '')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/⁶/g, '^6')
    .replace(/³/g, '^3')
    .replace(/[“”]/g, '"')
    .replace(/→/g, '->')
    .replace(/−/g, '-');

const STATUS_RGB = {
  optimal: [12, 163, 12],
  normal: [94, 175, 120],
  borderline: [214, 150, 0],
  out: [208, 59, 59],
};

export function downloadFile(filename, content, mime = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const toCsv = (rows) =>
  rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

export const nodeToPng = (node) =>
  toPng(node, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    filter: (el) => !(el.dataset && el.dataset.noCapture !== undefined),
  });

/**
 * Build and download a PDF report.
 * sections: [{ title, kv?: [[k, v]], table?: { head, body, statusCol?, statuses? }, image?: { dataUrl, ratio } }]
 */
export async function exportPdfReport({ filename, title, subtitle, sections, footer }) {
  // Loaded on demand: the PDF stack is large and only needed for exports.
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = M;

  doc.setFillColor(15, 118, 110);
  doc.roundedRect(M, y, 26, 26, 6, 6, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('VS', M + 13, y + 17, { align: 'center' });
  doc.setTextColor(20);
  doc.setFontSize(18);
  doc.text(pdfSafe(title), M + 36, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(pdfSafe(subtitle), M + 36, y + 27);
  y += 48;

  const ensure = (h) => {
    if (y + h > H - M) {
      doc.addPage();
      y = M;
    }
  };

  sections.forEach((s) => {
    ensure(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text(pdfSafe(s.title), M, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(70);
    if (s.text) {
      const lines = doc.splitTextToSize(pdfSafe(s.text), W - 2 * M);
      ensure(lines.length * 12);
      doc.text(lines, M, y);
      y += lines.length * 12 + 6;
    }
    if (s.kv) {
      s.kv.forEach(([k, v]) => {
        ensure(14);
        doc.setTextColor(120);
        doc.text(pdfSafe(k), M, y);
        doc.setTextColor(20);
        doc.text(pdfSafe(v), M + 140, y);
        y += 14;
      });
      y += 6;
    }
    if (s.image) {
      const w = W - 2 * M;
      const h = w / (s.image.ratio || 2);
      ensure(h + 10);
      doc.addImage(s.image.dataUrl, 'PNG', M, y, w, h);
      y += h + 14;
    }
    if (s.table) {
      autoTable(doc, {
        startY: y,
        head: [s.table.head.map(pdfSafe)],
        body: s.table.body.map((r) => r.map(pdfSafe)),
        margin: { left: M, right: M },
        styles: { fontSize: 8.5, cellPadding: 4, textColor: [40, 40, 40], lineColor: [230, 230, 228], lineWidth: 0.5 },
        headStyles: { fillColor: [244, 246, 245], textColor: [80, 80, 80], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [252, 252, 251] },
        didParseCell: (d) => {
          if (d.section === 'body' && s.table.statusCol === d.column.index) {
            const st = s.table.statuses?.[d.row.index];
            if (STATUS_RGB[st]) {
              d.cell.styles.textColor = STATUS_RGB[st];
              d.cell.styles.fontStyle = 'bold';
            }
          }
        },
      });
      y = doc.lastAutoTable.finalY + 18;
    }
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(150);
    doc.text(doc.splitTextToSize(pdfSafe(footer), W - 2 * M - 40), M, H - 22);
    doc.text(`${i}/${pages}`, W - M, H - 22, { align: 'right' });
  }
  doc.save(filename);
}
