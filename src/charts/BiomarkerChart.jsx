import { forwardRef } from 'react';
import { Line } from 'react-chartjs-2';
import { useApp } from '../context.jsx';
import { CHART_THEME, STATUS_HEX, bandsPlugin, baseTooltip } from './setup.js';
import { expandRange } from '../lib/evaluate.js';
import { fmtDate, fmtNum, fmtRange, beyondText } from '../lib/format.js';

/**
 * Single-biomarker timeline (one series, one unit) with shaded reference bands.
 * points: [{ date, value, status, range }]
 */
const BiomarkerChart = forwardRef(function BiomarkerChart({ points, unit }, ref) {
  const { theme, lang, t } = useApp();
  const th = CHART_THEME[theme];
  const range = points.at(-1)?.range;
  const r = range ? expandRange(range) : null;
  const vals = points.map((p) => p.value);
  const bounds = r ? [r.lo, r.hi, r.olo, r.ohi].filter(Number.isFinite) : [];
  const lo = Math.min(...vals, ...bounds);
  const hi = Math.max(...vals, ...bounds);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.18;

  const bands = r
    ? [
        { from: r.lo, to: r.hi, color: th.rangeBand },
        { from: r.olo, to: r.ohi, color: th.optimalBand },
      ]
    : [];

  const data = {
    labels: points.map((p) => fmtDate(p.date, lang, { year: '2-digit', month: 'short' })),
    datasets: [
      {
        data: vals,
        borderColor: th.line,
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointHitRadius: 18,
        pointBackgroundColor: points.map((p) => STATUS_HEX[p.status]),
        pointBorderColor: th.surface,
        pointBorderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: 6, right: 6 } },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: th.muted } },
      y: {
        suggestedMin: Math.max(lo - pad, lo >= 0 ? 0 : -Infinity),
        suggestedMax: hi + pad,
        grid: { color: th.grid },
        border: { display: false },
        ticks: { color: th.muted, maxTicksLimit: 5, callback: (v) => fmtNum(v, lang) },
      },
    },
    plugins: {
      legend: { display: false },
      bands: { bands },
      tooltip: {
        ...baseTooltip(th),
        callbacks: {
          title: (items) => fmtDate(points[items[0].dataIndex].date, lang),
          label: (item) => {
            const p = points[item.dataIndex];
            const past = beyondText(p.item?.beyond, t, lang);
            return ` ${fmtNum(p.value, lang)} ${unit} · ${t(`status.${p.status}`)}${past ? ` (${past})` : ''}`;
          },
          // Reference of the hovered reading itself (ranges can differ per result, e.g. lab ranges).
          afterLabel: (item) => {
            const p = points[item.dataIndex];
            if (!p.range) return '';
            const opt = fmtRange(p.range, lang, 'optimal');
            const ref = fmtRange(p.range, lang);
            return ` ${t('common.range')}: ${ref}${opt !== ref ? ` · ${t('common.optimal')}: ${opt}` : ''} ${unit}`;
          },
          labelColor: (item) => {
            const c = STATUS_HEX[points[item.dataIndex].status];
            return { borderColor: c, backgroundColor: c };
          },
        },
      },
    },
  };

  return <Line ref={ref} data={data} options={options} plugins={[bandsPlugin]} />;
});

export default BiomarkerChart;
