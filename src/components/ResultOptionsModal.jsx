import { useRef } from 'react';
import { Copy, ClipboardCopy, FileText, Sheet, FileJson, TriangleAlert, Download } from 'lucide-react';
import { useApp } from '../context.jsx';
import { CATEGORIES } from '../data/biomarkers.js';
import { copyText } from '../lib/clipboard.js';
import { nodeToPng } from '../lib/export.js';
import { exportResultCsv, exportResultJson, exportResultPdf } from '../lib/reports.js';
import OptionsModal from './OptionsModal.jsx';
import ResultSummaryCard from './ResultSummaryCard.jsx';

/**
 * Filters (by category, "needs attention") and export for one lab result.
 * Filters apply live to the table behind the dialog.
 */
export default function ResultOptionsModal({ onClose, result, ev, by, catFilter, setCatFilter, statusFilter, setStatusFilter, getRows }) {
  const { t, lang, standard } = useApp();
  const summaryRef = useRef(null);
  const activeCount = catFilter.size + (statusFilter === 'flagged' ? 1 : 0);

  const counts = {};
  ev.items.forEach((i) => (counts[i.meta.cat] = (counts[i.meta.cat] || 0) + 1));
  const flagged = ev.counts.borderline + ev.counts.out;

  const summaryImage = async () => {
    const node = summaryRef.current;
    return { dataUrl: await nodeToPng(node), ratio: node.offsetWidth / node.offsetHeight };
  };

  const exported = t('toast.exported');
  const exports = [
    { label: t('common.exportPdf'), hint: t('options.pdfHint'), icon: FileText, trailIcon: Download, done: exported, run: async () => exportResultPdf(result, ev, standard, t, lang, await summaryImage()) },
    { label: t('common.exportCsv'), hint: t('options.csvHint'), icon: Sheet, trailIcon: Download, done: exported, run: () => exportResultCsv(result, ev, t, lang) },
    { label: t('common.exportJson'), hint: t('options.jsonHint'), icon: FileJson, trailIcon: Download, done: exported, run: () => exportResultJson(result) },
    { label: t('options.copyRows'), hint: t('options.copyRowsHint'), icon: Copy, trailIcon: ClipboardCopy, done: t('common.copied'), run: () => copyText(getRows()) },
  ];

  return (
    <OptionsModal
      onClose={onClose}
      filterHint={t('options.filterHint')}
      catCounts={CATEGORIES.filter((c) => counts[c]).map((c) => [c, counts[c]])}
      catFilter={catFilter}
      setCatFilter={setCatFilter}
      activeCount={activeCount}
      onClearFilters={() => {
        setCatFilter(new Set());
        if (statusFilter === 'flagged') setStatusFilter(null);
      }}
      filterExtra={
        <label className={`share-option ${statusFilter === 'flagged' ? 'on' : ''}`}>
          <input
            type="checkbox"
            checked={statusFilter === 'flagged'}
            disabled={!flagged}
            onChange={(e) => setStatusFilter(e.target.checked ? 'flagged' : null)}
          />
          <TriangleAlert size={15} style={{ color: 'var(--warn)' }} />
          <span className="grow">{t('common.flaggedOnly')}</span>
          <span className="badge">{flagged}</span>
        </label>
      }
      exportHint={t('options.exportHint')}
      exports={exports}
    >
      {/* Off-screen summary card: the PDF export embeds it as an image. */}
      <div className="offscreen" aria-hidden="true">
        <ResultSummaryCard ref={summaryRef} result={result} ev={ev} by={by} />
      </div>
    </OptionsModal>
  );
}
