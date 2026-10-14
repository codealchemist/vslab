import { useState } from 'react';
import { SlidersHorizontal, Check, ListFilter, Download } from 'lucide-react';
import { useApp } from '../context.jsx';
import { Modal } from './ui.jsx';

/**
 * "Filters & export" dialog shared by the result page and Compare's head to head. Filters apply live
 * to the table behind the dialog.
 *
 * Filter tab: category chips (`catCounts` = [[category, count]], toggled in `catFilter`), then
 * `filterExtra` for page-specific options. Export tab: `exports` = [{ label, hint, icon, trailIcon, run, done }],
 * where `done` is the toast shown on success. `children` render hidden (e.g. off-screen cards for a PDF).
 */
export default function OptionsModal({ onClose, filterHint, catCounts, catFilter, setCatFilter, filterExtra, activeCount, onClearFilters, exportHint, exports, children }) {
  const { t, toast } = useApp();
  const [tab, setTab] = useState('filter');
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

  const toggleCat = (c) =>
    setCatFilter((s) => {
      const n = new Set(s);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });

  const run = async (x) => {
    try {
      await x.run();
      toast(x.done);
    } catch (e) {
      console.error(e);
      toast(t('toast.copyFailed'), 'error');
    }
  };

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
            <p className="small">{filterHint}</p>
            {activeCount > 0 && (
              <button className="btn ghost sm" onClick={onClearFilters}>
                {t('detail.clearFilters')}
              </button>
            )}
          </div>
          <div className="row wrap" style={{ gap: 6 }} role="group" aria-label={t('compare.categories')}>
            {catCounts.map(([c, n]) => {
              const on = catFilter.has(c);
              return (
                <button key={c} className={`chip ${on ? 'on' : ''}`} onClick={() => toggleCat(c)} aria-pressed={on}>
                  {on && <Check size={12} />}
                  {t(`cat.${c}`)} <span className="tiny muted">{n}</span>
                </button>
              );
            })}
          </div>
          {filterExtra}
        </section>
      )}

      {tab === 'export' && (
        <section className="options-panel" role="tabpanel" id="opt-panel-export" aria-labelledby="opt-tab-export">
          <p className="small">{exportHint}</p>
          <div className="export-list">
            {exports.map((x) => (
              <button key={x.label} className="export-item" onClick={() => run(x)}>
                <x.icon size={18} />
                <span className="grow">
                  <b>{x.label}</b>
                  <span className="tiny muted" style={{ display: 'block' }}>{x.hint}</span>
                </span>
                <x.trailIcon size={15} className="muted" />
              </button>
            ))}
          </div>
        </section>
      )}

      {children}
    </Modal>
  );
}
