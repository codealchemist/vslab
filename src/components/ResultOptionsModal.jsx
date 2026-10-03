import { useRef, useState } from 'react';
import { SlidersHorizontal, Copy, ClipboardCopy, FileText, Sheet, FileJson, TriangleAlert, Check, ListFilter, Download } from 'lucide-react';
import { useApp } from '../context.jsx';
import { CATEGORIES } from '../data/biomarkers.js';
import { copyText } from '../lib/clipboard.js';
import { nodeToPng } from '../lib/export.js';
import { exportResultCsv, exportResultJson, exportResultPdf } from '../lib/reports.js';
import { Modal } from './ui.jsx';
import ResultSummaryCard from './ResultSummaryCard.jsx';

/**
 * Filters (by category, "needs attention") and export for one lab result.
 * Filters apply live to the table behind the dialog.
 */
export default function ResultOptionsModal({ onClose, result, ev, by, catFilter, setCatFilter, statusFilter, setStatusFilter, getRows }) {
  const { t, lang, standard, toast } = useApp();
  const summaryRef = useRef(null);
  const [tab, setTab] = useState('filter');
  const activeCount = catFilter.size + (statusFilter === 'flagged' ? 1 : 0);
  const tabs = [
    { id: 'filter', icon: ListFilter, label: t('options.filterTitle'), badge: activeCount },
    { id: 'export', icon: Download, label: t('common.export') },
  ];
  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onTabKey = (e) => {
    const i = tabs.findIndex((x) => x.id === tab);
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (next == null) return;
    e.preventDefault();
    const id = tabs[(next + tabs.length) % tabs.length].id;
    setTab(id);
    document.getElementById(`opt-tab-${id}`)?.focus();
  };

  const counts = {};
  ev.items.forEach((i) => (counts[i.meta.cat] = (counts[i.meta.cat] || 0) + 1));
  const cats = CATEGORIES.filter((c) => counts[c]);
  const flagged = ev.counts.borderline + ev.counts.out;

  const toggleCat = (c) =>
    setCatFilter((s) => {
      const n = new Set(s);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });

  const run = async (fn, ok) => {
    try {
      await fn();
      toast(ok);
    } catch (e) {
      console.error(e);
      toast(t('toast.copyFailed'), 'error');
    }
  };

  const summaryImage = async () => {
    const node = summaryRef.current;
    return { dataUrl: await nodeToPng(node), ratio: node.offsetWidth / node.offsetHeight };
  };

  const exports = [
    { label: t('common.exportPdf'), hint: t('options.pdfHint'), icon: FileText, run: async () => exportResultPdf(result, ev, standard, t, lang, await summaryImage()) },
    { label: t('common.exportCsv'), hint: t('options.csvHint'), icon: Sheet, run: () => exportResultCsv(result, ev, t, lang) },
    { label: t('common.exportJson'), hint: t('options.jsonHint'), icon: FileJson, run: () => exportResultJson(result) },
  ];

  return (
    <Modal
      title={t('options.title')}
      icon={<SlidersHorizontal size={18} className="muted" />}
      onClose={onClose}
      wide
      footer={<button className="btn primary" onClick={onClose}><Check size={15} /> {t('options.done')}</button>}
    >
      <div className="options-tabs" role="tablist" aria-label={t('options.title')} onKeyDown={onTabKey}>
        {tabs.map((x) => (
          <button
            key={x.id}
            id={`opt-tab-${x.id}`}
            role="tab"
            aria-selected={tab === x.id}
            aria-controls={`opt-panel-${x.id}`}
            tabIndex={tab === x.id ? 0 : -1}
            className={tab === x.id ? 'active' : ''}
            onClick={() => setTab(x.id)}
          >
            <x.icon size={14} /> {x.label}
            {x.badge > 0 && <span className="tab-badge num">{x.badge}</span>}
          </button>
        ))}
      </div>

      {tab === 'filter' && (
        <section className="options-panel" role="tabpanel" id="opt-panel-filter" aria-labelledby="opt-tab-filter">
          <div className="row between">
            <p className="small">{t('options.filterHint')}</p>
            {activeCount > 0 && (
              <button className="btn ghost sm" onClick={() => { setCatFilter(new Set()); if (statusFilter === 'flagged') setStatusFilter(null); }}>
                {t('detail.clearFilters')}
              </button>
            )}
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {cats.map((c) => {
              const on = catFilter.has(c);
              return (
                <button key={c} className={`chip ${on ? 'on' : ''}`} onClick={() => toggleCat(c)} aria-pressed={on}>
                  {on && <Check size={12} />}
                  {t(`cat.${c}`)} <span className="tiny muted">{counts[c]}</span>
                </button>
              );
            })}
          </div>
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
        </section>
      )}

      {tab === 'export' && (
        <section className="options-panel" role="tabpanel" id="opt-panel-export" aria-labelledby="opt-tab-export">
          <p className="small">{t('options.exportHint')}</p>
          <div className="export-list">
            {exports.map((x) => (
              <button key={x.label} className="export-item" onClick={() => run(x.run, t('toast.exported'))}>
                <x.icon size={18} />
                <span className="grow">
                  <b>{x.label}</b>
                  <span className="tiny muted" style={{ display: 'block' }}>{x.hint}</span>
                </span>
                <Download size={15} className="muted" />
              </button>
            ))}
            <button className="export-item" onClick={() => run(() => copyText(getRows()), t('common.copied'))}>
              <Copy size={18} />
              <span className="grow">
                <b>{t('options.copyRows')}</b>
                <span className="tiny muted" style={{ display: 'block' }}>{t('options.copyRowsHint')}</span>
              </span>
              <ClipboardCopy size={15} className="muted" />
            </button>
          </div>
        </section>
      )}

      {/* Off-screen summary card: the PDF export embeds it as an image. */}
      <div className="offscreen" aria-hidden="true">
        <ResultSummaryCard ref={summaryRef} result={result} ev={ev} by={by} />
      </div>
    </Modal>
  );
}
