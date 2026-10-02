import { Bar } from 'react-chartjs-2';
import { useApp } from '../context.jsx';
import { CHART_THEME, baseTooltip } from './setup.js';

/** Grouped horizontal bars: category score (0–100 pts) for two competitors. */
export default function CategoryChart({ categories, a, b, labelA, labelB }) {
  const { theme, t } = useApp();
  const th = CHART_THEME[theme];
  const unit = t('compare.pts');
  const ds = (label, vals, color) => ({
    label,
    data: categories.map((c) => vals[c] ?? null),
    backgroundColor: color,
    hoverBackgroundColor: color,
    borderRadius: 4,
    borderSkipped: 'start',
    barPercentage: 0.8,
    categoryPercentage: 0.7,
  });
  return (
    <Bar
      data={{
        labels: categories.map((c) => t(`cat.${c}`)),
        datasets: [ds(labelA, a, th.you), ds(labelB, b, th.them)],
      }}
      options={{
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        // Horizontal bars: the category lives on the y axis, so hover must resolve along y.
        // (index mode defaults to x, which matched a different category than the one under the cursor.)
        interaction: { mode: 'index', axis: 'y', intersect: false },
        scales: {
          x: {
            min: 0,
            max: 100,
            grid: { color: th.grid },
            border: { display: false },
            ticks: { color: th.muted, stepSize: 25, callback: (v) => `${v}` },
            title: { display: true, text: t('compare.scoreAxis'), color: th.muted, font: { size: 11 } },
          },
          y: { grid: { display: false }, border: { display: false }, ticks: { color: th.text } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...baseTooltip(th),
            callbacks: {
              label: (item) => ` ${item.dataset.label}: ${item.raw ?? '—'} ${unit}`,
            },
          },
        },
      }}
    />
  );
}
