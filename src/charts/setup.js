import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
  RadarController,
  PolarAreaController,
  RadialLinearScale,
  ArcElement,
} from 'chart.js';

Chart.register(
  LineController, LineElement, PointElement, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Filler,
  RadarController, PolarAreaController, RadialLinearScale, ArcElement
);

Chart.defaults.font.family = "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif";
Chart.defaults.font.size = 11.5;
Chart.defaults.animation.duration = 500;

// Light & dark chart palettes (validated categorical slots 1–2 + status set).
export const CHART_THEME = {
  light: {
    text: '#52514e',
    muted: '#8d8c86',
    grid: 'rgba(20,20,19,0.06)',
    surface: '#ffffff',
    you: '#2a78d6',
    them: '#eb6834',
    line: '#2a78d6',
    optimalBand: 'rgba(12,163,12,0.10)',
    rangeBand: 'rgba(79,157,143,0.08)',
    tooltipBg: '#1c1c1b',
    tooltipText: '#ffffff',
  },
  dark: {
    text: '#c3c2b7',
    muted: '#8a8981',
    grid: 'rgba(255,255,255,0.06)',
    surface: '#1a1a19',
    you: '#3987e5',
    them: '#d95926',
    line: '#3987e5',
    optimalBand: 'rgba(12,163,12,0.16)',
    rangeBand: 'rgba(95,179,165,0.10)',
    tooltipBg: '#f4f4f1',
    tooltipText: '#141413',
  },
};

export const STATUS_HEX = {
  optimal: '#0ca30c',
  normal: '#4f9d8f',
  borderline: '#d99400',
  out: '#d03b3b',
  unknown: '#8d8c86',
};

/** Draws horizontal reference bands behind the data. options: { bands: [{ from, to, color }] } */
export const bandsPlugin = {
  id: 'bands',
  beforeDatasetsDraw(chart, _args, opts) {
    const { ctx, chartArea, scales } = chart;
    if (!opts?.bands?.length || !scales.y) return;
    ctx.save();
    opts.bands.forEach(({ from, to, color }) => {
      const y1 = scales.y.getPixelForValue(Number.isFinite(to) ? to : scales.y.max);
      const y2 = scales.y.getPixelForValue(Number.isFinite(from) ? from : scales.y.min);
      const top = Math.max(chartArea.top, Math.min(y1, y2));
      const bottom = Math.min(chartArea.bottom, Math.max(y1, y2));
      if (bottom <= top) return;
      ctx.fillStyle = color;
      ctx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, bottom - top);
    });
    ctx.restore();
  },
};

export function baseTooltip(th) {
  return {
    backgroundColor: th.tooltipBg,
    titleColor: th.tooltipText,
    bodyColor: th.tooltipText,
    padding: 10,
    cornerRadius: 10,
    displayColors: true,
    boxPadding: 4,
    usePointStyle: true,
  };
}
