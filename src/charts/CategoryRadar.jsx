import { useMemo, useRef } from 'react';
import { Chart as ReactChart } from 'react-chartjs-2';
import { toFont } from 'chart.js/helpers';
import { useApp } from '../context.jsx';
import { CHART_THEME, STATUS_HEX, baseTooltip } from './setup.js';

/** Splits a label into lines of roughly `max` characters at word boundaries. */
function wrapLabel(text, max = 12) {
  const lines = [];
  text.split(' ').forEach((word) => {
    const last = lines.at(-1);
    // Short words ("y", "&") stay with the previous line instead of sitting alone.
    if (last && (`${last} ${word}`.length <= max || word.length <= 2)) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  });
  return lines;
}

// Same thresholds as the score ring (components/ui.jsx scoreStatus).
const statusOf = (s) => (s >= 85 ? 'optimal' : s >= 65 ? 'normal' : s >= 45 ? 'borderline' : 'out');

/**
 * Chart.js config for scores (0–100) per biomarker category. A radar needs 3+ axes to form
 * a shape, so 1–2 categories fall back to a polar area chart. Labels carry the score so the
 * chart still reads when copied as a static image, and animation is off for the same reason.
 */
/**
 * Redraws the radial point labels so the last line (the score) uses its status colour while the
 * name stays in the text colour. Chart.js lays the labels out (and reserves their space) with a
 * transparent colour; this paints them at the same positions.
 */
const statusLabelsPlugin = {
  id: 'statusLabels',
  afterDraw(chart, _args, opts) {
    const scale = chart.scales.r;
    const items = scale?._pointLabelItems;
    if (!items?.length || !opts?.valueColors) return;
    const font = toFont(opts.font);
    const valueFont = toFont({ ...opts.font, weight: 700 });
    const { ctx } = chart;
    ctx.save();
    ctx.textBaseline = 'middle';
    items.forEach((item, i) => {
      if (!item.visible) return;
      const lines = [].concat(scale._pointLabels[i]);
      ctx.textAlign = item.textAlign;
      ctx.globalAlpha = opts.faded?.[i] ? 0.35 : 1;
      lines.forEach((line, j) => {
        const isValue = j === lines.length - 1;
        ctx.font = (isValue ? valueFont : font).string;
        ctx.fillStyle = isValue ? opts.valueColors[i] : opts.color;
        ctx.fillText(line, item.x, item.y + font.lineHeight / 2 + j * font.lineHeight);
      });
    });
    ctx.restore();
    // Report where the drawn chart starts (leftmost label), so layouts can align to the visible chart.
    if (opts.onExtent) {
      const left = Math.max(0, Math.min(...items.filter((it) => it.visible).map((it) => it.left)));
      if (chart.$lastLeft !== left) {
        chart.$lastLeft = left;
        opts.onExtent(left);
      }
    }
  },
};

/** Solid blend of two #rrggbb colours: `amount` of `a`, the rest `b`. */
function mixHex(a, b, amount) {
  const ch = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) * amount + ch(b, i) * (1 - amount)).toString(16).padStart(2, '0')).join('')}`;
}

/** Index of the point label under (x, y) in canvas pixels, or -1. */
function labelAt(chart, x, y) {
  const items = chart.scales.r?._pointLabelItems || [];
  const pad = 6;
  return items.findIndex((it) => x >= it.left - pad && x <= it.right + pad && y >= it.top - pad && y <= it.bottom + pad);
}

/** Taller chart for many categories so labels don't collide (used by the summary card). */
export const categoryChartHeight = (count) => (count > 10 ? 340 : count > 8 ? 310 : 270);

/**
 * selected: Set of highlighted categories (others fade); onPick(index): makes points, arcs and
 * labels clickable. Both optional; the copied summary card uses neither.
 */
export function categoryChartConfig(byCategory, theme, t, { selected, onPick, onExtent } = {}) {
  const th = CHART_THEME[theme];
  const cats = Object.keys(byCategory);
  const scores = cats.map((c) => byCategory[c]);
  // Multi-line labels (wrapped name, then the score) keep the chart readable on narrow screens.
  // Tighter labels as categories grow, so neighbours don't overlap.
  const dense = cats.length > 8;
  const labels = cats.map((c) => [...wrapLabel(t(`cat.${c}`), dense ? 10 : 12), String(byCategory[c])]);
  const pointColors = scores.map((s) => STATUS_HEX[statusOf(s)]);
  const tooltip = { ...baseTooltip(th), displayColors: false, callbacks: {
      title: (items) => t(`cat.${cats[items[0].dataIndex]}`),
      label: (item) => ` ${item.raw} ${t('compare.pts')}`,
    },
  };
  const r = { min: 0, max: 100, ticks: { stepSize: 25, display: false }, grid: { color: th.grid }, angleLines: { color: th.grid } };
  const font = { size: cats.length > 10 ? 10 : dense ? 10.5 : 11, weight: 550, lineHeight: 1.15 };
  const pointLabels = { color: 'transparent', font, padding: dense ? 4 : 6 };
  const picking = selected?.size > 0;
  const isOn = cats.map((c) => !picking || selected.has(c));
  const statusLabels = { font, color: th.text, valueColors: pointColors, faded: isOn.map((on) => !on), onExtent };
  // Faded = solid blend with the surface (a translucent dot would let the line show through it).
  const fade = (hex, on) => (on ? hex : mixHex(hex, th.surface, 0.35));
  const interaction = onPick && {
    onClick: (evt, els, chart) => {
      const i = els.length ? els[0].index : labelAt(chart, evt.x, evt.y);
      if (i >= 0) onPick(i);
    },
    onHover: (evt, els, chart) => {
      chart.canvas.style.cursor = els.length || labelAt(chart, evt.x, evt.y) >= 0 ? 'pointer' : 'default';
    },
  };
  const base = { animation: false, responsive: true, maintainAspectRatio: false, ...interaction, plugins: { legend: { display: false }, tooltip, statusLabels } };

  if (cats.length < 3) {
    return {
      type: 'polarArea',
      plugins: [statusLabelsPlugin],
      data: { labels, datasets: [{ data: scores, backgroundColor: pointColors.map((c, i) => (isOn[i] ? `${c}55` : `${c}1f`)), borderColor: pointColors.map((c, i) => fade(c, isOn[i])), borderWidth: cats.map((c) => (picking && selected.has(c) ? 3 : 2)) }] },
      options: { ...base, scales: { r: { ...r, pointLabels: { ...pointLabels, display: true, centerPointLabels: true } } } },
    };
  }
  return {
    type: 'radar',
    plugins: [statusLabelsPlugin],
    data: {
      labels,
      datasets: [
        {
          data: scores,
          borderColor: th.line,
          borderWidth: 2,
          backgroundColor: theme === 'dark' ? 'rgba(57,135,229,0.18)' : 'rgba(42,120,214,0.12)',
          fill: true,
          pointRadius: cats.map((c) => (picking && selected.has(c) ? 7 : 5)),
          pointHoverRadius: 8,
          pointHitRadius: 16,
          pointBackgroundColor: pointColors.map((c, i) => fade(c, isOn[i])),
          // Selected categories get a ring in the text colour.
          pointBorderColor: cats.map((c) => (picking && selected.has(c) ? th.text : th.surface)),
          pointBorderWidth: cats.map((c) => (picking && selected.has(c) ? 3 : 2)),
        },
      ],
    },
    options: { ...base, layout: { padding: 4 }, scales: { r: { ...r, pointLabels } } },
  };
}

/**
 * selected / onToggle(category) make it a category filter (see ResultDetail's Categories view).
 * onExtent(leftPx) reports where the drawn chart starts, measured from the canvas's left edge.
 */
export default function CategoryRadar({ byCategory, selected, onToggle, onExtent }) {
  const { theme, t, lang } = useApp();
  // Latest handler via a ref so the chart config doesn't rebuild just because the callback changed.
  const toggleRef = useRef(onToggle);
  toggleRef.current = onToggle;
  const extentRef = useRef(onExtent);
  extentRef.current = onExtent;
  const cats = Object.keys(byCategory);
  const selectedKey = selected ? [...selected].sort().join(',') : '';
  const { type, data, options, plugins } = useMemo(
    () => categoryChartConfig(byCategory, theme, t, {
        selected,
        onPick: onToggle ? (i) => toggleRef.current?.(cats[i]) : undefined,
        onExtent: onExtent ? (left) => extentRef.current?.(left) : undefined,
      }),
    // Rebuild only when scores, theme, language or the selection change, not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byCategory, theme, lang, selectedKey, !!onToggle, !!onExtent]
  );
  return <ReactChart type={type} data={data} options={options} plugins={plugins} />;
}
