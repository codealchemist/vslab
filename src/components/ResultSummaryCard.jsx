import { forwardRef } from 'react';
import { FlaskConical } from 'lucide-react';
import { useApp } from '../context.jsx';
import { fmtDate } from '../lib/format.js';
import { ScoreRing, StatusPill } from './ui.jsx';
import CategoryRadar, { categoryChartHeight } from '../charts/CategoryRadar.jsx';
import { APP_VERSION } from '../version.js';
import BrandName from './BrandName.jsx';

/**
 * One-screen summary of a lab result: global score, status counts and a category radar.
 * Sized to copy cleanly as an image (the whole biomarker table is too tall for that).
 */
const ResultSummaryCard = forwardRef(function ResultSummaryCard({ result, ev, by }, ref) {
  const { t, lang, standard } = useApp();
  return (
    <div className="summary-card" ref={ref}>
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
        <div className="tiny muted summary-chart-title">{t('compare.byCategory')} · 0–100 {t('compare.pts')}</div>
        <div className="summary-chart" style={{ height: categoryChartHeight(Object.keys(ev.byCategory).length) }}>
          <CategoryRadar byCategory={ev.byCategory} />
        </div>
      </div>
      <div className="tiny muted">{t('detail.rangesFooter', { sex: t(`detail.${ev.sex}`).toLowerCase(), std: standard.short })}</div>
    </div>
  );
});

export default ResultSummaryCard;
