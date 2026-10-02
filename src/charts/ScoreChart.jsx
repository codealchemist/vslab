import { Line } from 'react-chartjs-2';
import { useApp } from '../context.jsx';
import { CHART_THEME, bandsPlugin, baseTooltip } from './setup.js';
import { fmtDate } from '../lib/format.js';

/** Global score per lab result over time. points: [{ date, score }] */
export default function ScoreChart({ points }) {
  const { theme, lang, t } = useApp();
  const th = CHART_THEME[theme];
  const data = {
    labels: points.map((p) => fmtDate(p.date, lang, { year: '2-digit', month: 'short' })),
    datasets: [
      {
        data: points.map((p) => p.score),
        borderColor: th.line,
        borderWidth: 2,
        tension: 0.35,
        fill: true,
        backgroundColor: (ctx) => {
          const { chart } = ctx;
          if (!chart.chartArea) return 'transparent';
          const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
          g.addColorStop(0, theme === 'dark' ? 'rgba(57,135,229,0.28)' : 'rgba(42,120,214,0.18)');
          g.addColorStop(1, 'rgba(42,120,214,0)');
          return g;
        },
        pointRadius: 4,
        pointHoverRadius: 6,
        pointHitRadius: 18,
        pointBackgroundColor: th.line,
        pointBorderColor: th.surface,
        pointBorderWidth: 2,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: th.muted } },
      y: { min: 0, max: 100, grid: { color: th.grid }, border: { display: false }, ticks: { color: th.muted, stepSize: 25 } },
    },
    plugins: {
      legend: { display: false },
      bands: { bands: [{ from: 85, to: 100, color: th.optimalBand }] },
      tooltip: {
        ...baseTooltip(th),
        displayColors: false,
        callbacks: {
          title: (items) => fmtDate(points[items[0].dataIndex].date, lang),
          label: (item) => ` ${t('common.globalScore')}: ${item.raw}`,
        },
      },
    },
  };
  return <Line data={data} options={options} plugins={[bandsPlugin]} />;
}
