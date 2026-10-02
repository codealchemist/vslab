export function fmtNum(v, lang, max = 2) {
  if (!Number.isFinite(v)) return '—';
  return new Intl.NumberFormat(lang, { maximumFractionDigits: max }).format(v);
}

/** Percentage past a limit: one decimal below 10 %, whole numbers above. */
export const fmtPct = (pct, lang) => fmtNum(pct, lang, pct < 10 ? 1 : 0);

/** "32% above limit" / "12% below limit" for an item's beyond field (empty when inside the interval). */
export const beyondText = (beyond, t, lang) =>
  beyond ? t(beyond.dir === 'high' ? 'status.above' : 'status.below', { pct: fmtPct(beyond.pct, lang) }) : '';

export function fmtDate(iso, lang, opts = { year: 'numeric', month: 'short', day: 'numeric' }) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(lang, opts);
}

/** Human readable interval, e.g. "70 – 99", "≤ 129", "≥ 40". */
export function fmtRange(r, lang, which = 'normal') {
  if (!r) return '—';
  const lo = which === 'optimal' ? r.olo ?? r.lo : r.lo;
  const hi = which === 'optimal' ? r.ohi ?? r.hi : r.hi;
  const hasLo = Number.isFinite(lo);
  const hasHi = Number.isFinite(hi);
  if (hasLo && hasHi) return `${fmtNum(lo, lang)} – ${fmtNum(hi, lang)}`;
  if (hasHi) return `≤ ${fmtNum(hi, lang)}`;
  if (hasLo) return `≥ ${fmtNum(lo, lang)}`;
  return '—';
}

export const hasOptimalBand = (r) =>
  r && ((Number.isFinite(r.olo) && r.olo !== r.lo) || (Number.isFinite(r.ohi) && r.ohi !== r.hi));

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
