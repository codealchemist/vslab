import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import { FlaskConical, CircleCheckBig } from 'lucide-react';
import { useApp } from '../context.jsx';
import { fmtDate, fmtNum } from '../lib/format.js';
import { APP_VERSION } from '../version.js';
import BrandName from './BrandName.jsx';
import { ScoreRing, StatusPill } from './ui.jsx';

/** Copied images are sized like a phone screen: 420px wide, at most this tall. */
export const SNAPSHOT_MAX_HEIGHT = 900;
/** Space taken by the "+N more" line (margin + box), see .snapshot-more. */
const MORE_LINE = 44;

/**
 * Phone-screen snapshot of a lab result for copying as an image: score, status counts and the
 * biomarkers that need attention (out of range first, then borderline). Rows that don't fit in
 * SNAPSHOT_MAX_HEIGHT are dropped and summarised as "+N more".
 */
const ResultSnapshotCard = forwardRef(function ResultSnapshotCard({ result, ev, by }, ref) {
  const { t, lang, standard } = useApp();
  const flagged = [
    ...ev.items.filter((i) => i.status === 'out'),
    ...ev.items.filter((i) => i.status === 'borderline'),
  ];
  const [limit, setLimit] = useState(flagged.length);
  const cardRef = useRef(null);
  const listRef = useRef(null);
  const key = `${result.id}|${standard.id}|${ev.sex}|${flagged.length}`;

  // Render every row, measure, then keep as many as fit (leaving room for the "+N" line and footer).
  useLayoutEffect(() => {
    setLimit(flagged.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useLayoutEffect(() => {
    const card = cardRef.current;
    const list = listRef.current;
    if (!card || !list || limit !== flagged.length || card.offsetHeight <= SNAPSHOT_MAX_HEIGHT) return;
    // Positions relative to the card: keep the rows that end within the budget, i.e. the max height
    // minus what sits below the list (footer, padding) and the "+N more" line that replaces the rest.
    const rows = [...list.children];
    const top = (el) => el.offsetTop - card.offsetTop;
    const last = rows.at(-1);
    const below = card.offsetHeight - (top(last) + last.offsetHeight);
    const budget = SNAPSHOT_MAX_HEIGHT - below - MORE_LINE;
    setLimit(rows.filter((r) => top(r) + r.offsetHeight <= budget).length);
  }, [limit, flagged.length]);

  const setRefs = (node) => {
    cardRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };
  const hidden = flagged.length - limit;

  return (
    <div className="summary-card snapshot-card" ref={setRefs}>
      <div className="summary-head">
        <span className="summary-brand">
          <span className="brand-mark" style={{ width: 22, height: 22, borderRadius: 7 }}><FlaskConical size={12} strokeWidth={2.4} /></span>
          <BrandName />
        </span>
        <span className="badge num">v{APP_VERSION}</span>
      </div>
      <div>
        {by && <div className="tiny muted">{t('sharedView.sharedBy', { name: by })}</div>}
        <div className="summary-date">{fmtDate(result.date, lang, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        <div className="small muted">{[result.lab, t('overview.markers', { count: ev.items.length })].filter(Boolean).join(' · ')}</div>
      </div>
      <div className="summary-score">
        <ScoreRing score={ev.score} size={92} stroke={8} sub={t('common.score')} />
        <div className="summary-counts">
          {['optimal', 'normal', 'borderline', 'out'].map((s) => (
            <div key={s} className="row" style={{ gap: 8 }}>
              <b className="num" style={{ width: 22, textAlign: 'right' }}>{ev.counts[s]}</b>
              <StatusPill status={s} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="tiny muted summary-chart-title">{t('common.flaggedOnly')} · {flagged.length}</div>
        {flagged.length === 0 ? (
          <div className="snapshot-clear"><CircleCheckBig size={16} /> {t('snapshot.allClear')}</div>
        ) : (
          <div className="snapshot-list" ref={listRef}>
            {flagged.slice(0, limit).map((i) => (
              <div key={i.code} className="snapshot-row">
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="snapshot-name">{i.meta.name[lang] || i.meta.name.en}</div>
                  <div className="tiny muted num">
                    {i.qualifier || ''}{fmtNum(i.value, lang)} {i.unit}
                  </div>
                </div>
                <StatusPill status={i.status} beyond={i.beyond} compact />
              </div>
            ))}
          </div>
        )}
        {hidden > 0 && <div className="snapshot-more">{t('snapshot.more', { count: hidden })}</div>}
      </div>

      <div className="tiny muted">{t('detail.rangesFooter', { sex: t(`detail.${ev.sex}`).toLowerCase(), std: standard.short })}</div>
    </div>
  );
});

export default ResultSnapshotCard;
