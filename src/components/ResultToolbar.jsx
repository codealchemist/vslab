import { useEffect, useRef, useState } from 'react';
import { Search, X, Ellipsis } from 'lucide-react';
import { useApp } from '../context.jsx';

/** True once the element has scrolled up against the sticky app header. */
function useStuck() {
  const sentinel = useRef(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 60;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { rootMargin: `-${headerH + 1}px 0px 0px 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [sentinel, stuck];
}

/**
 * Sticky search for the biomarker table. Status filters live in the stat tiles above;
 * category filters, copy and export open from the ⋯ button (`onOpenOptions`).
 * activeFilters: labels of the filters in effect, shown with the result count.
 */
export default function ResultToolbar({ q, setQ, activeFilters, optionsCount, onOpenOptions, shown, total, onClearAll }) {
  const { t } = useApp();
  const [sentinel, stuck] = useStuck();
  const filtered = q.trim() || activeFilters.length > 0;

  return (
    <>
      <div ref={sentinel} aria-hidden="true" />
      <div className={`result-toolbar ${stuck ? 'stuck' : ''}`} data-no-capture>
        <div className="toolbar-row">
          <div className="search grow">
            <Search size={15} />
            <input
              className="input"
              type="search"
              placeholder={t('common.search')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQ('')}
              aria-label={t('common.search')}
            />
            {q && (
              <button className="search-clear" onClick={() => setQ('')} aria-label={t('detail.clearSearch')} title={t('detail.clearSearch')}>
                <X size={14} />
              </button>
            )}
          </div>
          <button className="icon-btn toolbar-more" onClick={onOpenOptions} aria-label={t('options.title')} title={t('options.title')} aria-haspopup="dialog">
            <Ellipsis size={18} />
            {optionsCount > 0 && <span className="toolbar-count num">{optionsCount}</span>}
          </button>
        </div>

        {filtered && (
          <div className="toolbar-status small">
            <span className="muted">
              {t('detail.showing', { shown, total })}
              {activeFilters.length > 0 && ` · ${activeFilters.join(', ')}`}
            </span>
            <button className="btn ghost sm" onClick={onClearAll}>{t('detail.clearFilters')}</button>
          </div>
        )}
      </div>
    </>
  );
}
