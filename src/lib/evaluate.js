import { CONVENTIONAL, STANDARD_MAP } from '../data/standards.js';
import { getBiomarker, CATEGORIES, withDerived } from '../data/biomarkers.js';

export const STATUS_SCORE = { optimal: 100, normal: 75, borderline: 45, out: 15 };
export const STATUS_ORDER = ['optimal', 'normal', 'borderline', 'out'];

const pickSex = (r, sex) => (r && (r.m || r.f) ? (sex === 'female' ? r.f : r.m) || r.m || r.f : r);

const hasBounds = (r) => r && (Number.isFinite(r.lo) || Number.isFinite(r.hi));

/** Find the range that applies for a code under a standard. */
export function resolveRange(code, standardId, sex, labRange) {
  const std = STANDARD_MAP[standardId];
  const lab = labRange && hasBounds(labRange) ? labRange : null;
  if (std?.usesLabRanges && lab) return { range: lab, source: 'lab' };
  const own = pickSex(std?.ranges?.[code], sex);
  if (hasBounds(own)) return { range: own, source: 'standard' };
  const conv = pickSex(CONVENTIONAL[code], sex);
  if (hasBounds(conv)) return { range: conv, source: 'fallback' };
  if (lab) return { range: lab, source: 'lab' };
  return { range: null, source: 'none' };
}

/** Fill in the implicit optimal/borderline bounds of a range. */
export function expandRange(r) {
  const lo = Number.isFinite(r.lo) ? r.lo : -Infinity;
  const hi = Number.isFinite(r.hi) ? r.hi : Infinity;
  return {
    lo,
    hi,
    olo: Number.isFinite(r.olo) ? r.olo : lo,
    ohi: Number.isFinite(r.ohi) ? r.ohi : hi,
    blo: Number.isFinite(r.blo) ? r.blo : Number.isFinite(lo) ? lo * 0.9 : -Infinity,
    bhi: Number.isFinite(r.bhi) ? r.bhi : Number.isFinite(hi) ? hi * 1.1 : Infinity,
  };
}

export function classify(value, range) {
  if (!range || !Number.isFinite(value)) return { status: 'unknown', dir: null };
  const r = expandRange(range);
  if (value >= r.lo && value <= r.hi) {
    if (value >= r.olo && value <= r.ohi) return { status: 'optimal', dir: null };
    return { status: 'normal', dir: value < r.olo ? 'low' : 'high' };
  }
  if (value < r.lo) return { status: value >= r.blo ? 'borderline' : 'out', dir: 'low' };
  return { status: value <= r.bhi ? 'borderline' : 'out', dir: 'high' };
}

/**
 * How far a value lies past the reference limit it crossed, as a % of that limit.
 * Returns { dir: 'high' | 'low', pct } or null when the value is inside the interval.
 */
export function limitDeviation(value, range) {
  if (!range || !Number.isFinite(value)) return null;
  const { lo, hi } = expandRange(range);
  if (value > hi && Number.isFinite(hi) && hi !== 0) return { dir: 'high', pct: ((value - hi) / Math.abs(hi)) * 100 };
  if (value < lo && Number.isFinite(lo) && lo !== 0) return { dir: 'low', pct: ((lo - value) / Math.abs(lo)) * 100 };
  return null;
}

export function resultSex(result, override) {
  if (override === 'male' || override === 'female') return override;
  return result?.patient?.sex === 'female' ? 'female' : 'male';
}

function evaluateItem(entry, standardId, sex) {
  const meta = getBiomarker(entry.code, entry);
  const { range, source } = resolveRange(entry.code, standardId, sex, entry.ref);
  const { status, dir } = classify(entry.value, range);
  return {
    ...entry,
    meta,
    unit: entry.unit || meta.unit,
    range,
    source,
    status,
    dir,
    beyond: limitDeviation(entry.value, range),
    score: STATUS_SCORE[status] ?? null,
  };
}

const mean = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function summarize(items) {
  const scored = items.filter((i) => i.score != null);
  const counts = { optimal: 0, normal: 0, borderline: 0, out: 0, unknown: 0 };
  items.forEach((i) => (counts[i.status] = (counts[i.status] || 0) + 1));
  const byCategory = {};
  CATEGORIES.forEach((c) => {
    const s = mean(scored.filter((i) => i.meta.cat === c).map((i) => i.score));
    if (s != null) byCategory[c] = s;
  });
  return { score: mean(scored.map((i) => i.score)), counts, byCategory, scoredCount: scored.length };
}

/** Evaluate every biomarker in a lab result against a standard. */
export function evaluateResult(result, standardId, sexOverride) {
  const sex = resultSex(result, sexOverride);
  const items = withDerived(result).results.map((e) => evaluateItem(e, standardId, sex));
  items.sort(
    (a, b) =>
      CATEGORIES.indexOf(a.meta.cat) - CATEGORIES.indexOf(b.meta.cat) ||
      a.meta.name.en.localeCompare(b.meta.name.en)
  );
  return { items, sex, ...summarize(items) };
}

/** Head-to-head comparison on the biomarkers both results share. */
export function compareResults(a, b, standardId, sexA, sexB) {
  const ea = evaluateResult(a, standardId, sexA);
  const eb = evaluateResult(b, standardId, sexB);
  const mapB = Object.fromEntries(eb.items.map((i) => [i.code, i]));
  const rows = ea.items
    .filter((i) => mapB[i.code] && i.score != null && mapB[i.code].score != null)
    .map((ia) => {
      const ib = mapB[ia.code];
      const winner = ia.score > ib.score ? 'a' : ib.score > ia.score ? 'b' : 'tie';
      return { code: ia.code, meta: ia.meta, a: ia, b: ib, winner };
    });
  const common = {
    a: summarize(rows.map((r) => r.a)),
    b: summarize(rows.map((r) => r.b)),
  };
  const wins = { a: 0, b: 0, tie: 0 };
  rows.forEach((r) => wins[r.winner]++);
  const overall =
    common.a.score === common.b.score ? 'tie' : (common.a.score ?? 0) > (common.b.score ?? 0) ? 'a' : 'b';
  return { ea, eb, rows, common, wins, overall };
}

/** How far a value sits from the optimal band (0 when inside it). */
export function distanceToOptimal(value, range) {
  if (!range || !Number.isFinite(value)) return null;
  const r = expandRange(range);
  if (value < r.olo) return r.olo - value;
  if (value > r.ohi) return value - r.ohi;
  return 0;
}

/** Change between two readings of the same biomarker, judged against the optimal band. */
export function diffTrend(prev, cur, range) {
  const delta = cur - prev;
  const pct = prev ? (delta / Math.abs(prev)) * 100 : null;
  const d0 = distanceToOptimal(prev, range);
  const d1 = distanceToOptimal(cur, range);
  const eps = 1e-9;
  const trend = d0 == null || d1 == null || Math.abs(d1 - d0) < eps ? 'same' : d1 < d0 ? 'better' : 'worse';
  return { delta, pct, trend };
}
