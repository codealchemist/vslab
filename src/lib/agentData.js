import { BIOMARKERS, BIOMARKER_MAP } from '../data/biomarkers.js';
import { STANDARD_MAP, STANDARDS } from '../data/standards.js';
import { evaluateResult, compareResults, diffTrend, STATUS_ORDER } from './evaluate.js';

/**
 * Read-only views of the app's data for the WebMCP tools (see webmcp.js).
 * Every function takes a snapshot of app state — { results, friends, standard, sex, sexSource, maxResults }
 * — and scores results with the same functions the screens use, so an agent is never told something
 * different from what the user sees. Own results are scored with the user's sex setting, friends'
 * results with the sex in their own report, as in Compare.
 */

export const STANDARD_IDS = STANDARDS.map((s) => s.id);
export const STATUSES = [...STATUS_ORDER, 'unknown'];

// Text that came from someone else's share (their name, lab, custom test names) is returned as
// short data fields only.
const cap = (s, n = 80) => (s == null ? s : String(s).slice(0, n));
const round = (v, d = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

function pickStandard(state, standard) {
  if (standard == null) return state.standard;
  if (!STANDARD_MAP[standard]) throw new Error(`Unknown standard "${standard}". Use one of: ${STANDARD_IDS.join(', ')}.`);
  return standard;
}

function pickSex(sex) {
  if (sex == null) return null;
  if (sex !== 'male' && sex !== 'female') throw new Error('sex must be "male" or "female".');
  return sex;
}

/** All results with their tool ids: me:<result id> for own results, friend:<friend id> for shared ones. */
const ownEntry = (r) => ({ id: `me:${r.id}`, owner: 'me', result: r });
const friendEntry = (f) => ({ id: `friend:${f.id}`, owner: 'friend', result: f.result, friend: f });
const entries = (state) => [...state.results.map(ownEntry), ...state.friends.map(friendEntry)];

function findEntry(state, id) {
  const entry = entries(state).find((e) => e.id === id);
  if (!entry) throw new Error(`No lab result with id "${cap(id)}". Call list_lab_results for valid ids.`);
  return entry;
}

// Own results follow the user's sex (or the override); friends' results use their report's sex.
const sexFor = (state, entry, override) => override || (entry.owner === 'me' ? state.sex : null);

function summary(entry, ev) {
  const r = entry.result;
  return {
    id: entry.id,
    ...(entry.friend && { sharedBy: cap(entry.friend.sharedBy) || null, receivedAt: entry.friend.receivedAt || null }),
    date: r.date,
    lab: cap(r.lab) || null,
    biomarkers: ev.items.length,
    score: ev.score,
    counts: { optimal: ev.counts.optimal, normal: ev.counts.normal, borderline: ev.counts.borderline, out: ev.counts.out },
    ...(r.sample && { sample: true }),
  };
}

function range(r) {
  if (!r) return null;
  const out = {};
  if (Number.isFinite(r.lo)) out.lo = r.lo;
  if (Number.isFinite(r.hi)) out.hi = r.hi;
  if (Number.isFinite(r.olo) && r.olo !== r.lo) out.optimalLo = r.olo;
  if (Number.isFinite(r.ohi) && r.ohi !== r.hi) out.optimalHi = r.ohi;
  return out;
}

function biomarker(item) {
  return {
    code: item.code,
    name: cap(item.meta.name.en),
    category: item.meta.cat,
    value: item.value,
    ...(item.qualifier && { qualifier: cap(item.qualifier, 2) }),
    unit: cap(item.unit, 20),
    range: range(item.range),
    rangeSource: item.source,
    status: item.status,
    ...(item.dir && item.status !== 'optimal' && { direction: item.dir }),
    ...(item.beyond && { beyondLimitPct: round(item.beyond.pct, 1) }),
    score: item.score,
    ...(item.derived && { calculated: true }),
    ...(item.edited && { editedByUser: true }),
    ...(item.manual && { addedByUser: true }),
  };
}

/** Every stored result, own and shared, newest first, with scores under the current settings. */
export function listResults(state) {
  const scored = (e) => summary(e, evaluateResult(e.result, state.standard, sexFor(state, e)));
  const own = [...state.results].reverse().map(ownEntry).map(scored);
  const friends = state.friends.map(friendEntry).map(scored);
  const real = own.filter((r) => !r.sample).length;
  return {
    settings: { standard: state.standard, sex: state.sex, sexSource: state.sexSource },
    own: { count: real, max: state.maxResults, results: own },
    friends: { count: friends.length, results: friends },
    ...(!real && {
      hint: own.length
        ? 'The results marked sample are demo data, not the user’s. To add the user’s own, read their lab report and call import_lab_results.'
        : 'No own results yet. To add one, read the user’s lab report and call import_lab_results.',
    }),
  };
}

/** One result in full. `status` optionally filters the biomarkers (e.g. ['borderline', 'out']). */
export function getResult(state, { id, standard, sex, status } = {}) {
  const entry = findEntry(state, id);
  const std = pickStandard(state, standard);
  if (status != null && (!Array.isArray(status) || status.some((s) => !STATUSES.includes(s)))) {
    throw new Error(`status must be an array of: ${STATUSES.join(', ')}.`);
  }
  const ev = evaluateResult(entry.result, std, sexFor(state, entry, pickSex(sex)));
  const items = status?.length ? ev.items.filter((i) => status.includes(i.status)) : ev.items;
  return {
    ...summary(entry, ev),
    owner: entry.owner,
    standard: std,
    sex: ev.sex,
    byCategory: ev.byCategory,
    ...(status?.length && { filteredBy: status, shown: items.length }),
    biomarkers: items.map(biomarker),
  };
}

const names = (m) => [m.code, m.name.en, m.name.es, ...String(m.aliases || '').replace(/\([^)]*\)/g, '').split(',')].map(norm).filter(Boolean);

/**
 * Canonical codes matching a code, an English or Spanish name, or an alias ("LDL", "glucemia").
 * An exact match wins; otherwise every biomarker with a name starting with the query, so a vague
 * query ("vitamin") returns several and the caller can say so instead of guessing.
 */
export function findCodes(query) {
  const q = norm(query);
  if (!q) return [];
  if (BIOMARKER_MAP[String(query).trim()]) return [String(query).trim()];
  const exact = BIOMARKERS.filter((m) => names(m).includes(q));
  if (exact.length) return exact.map((m) => m.code);
  return q.length >= 3 ? BIOMARKERS.filter((m) => names(m).some((n) => n.startsWith(q))).map((m) => m.code) : [];
}

/** The one code a query names, or null when it matches none or several. */
export function resolveCode(query) {
  const codes = findCodes(query);
  return codes.length === 1 ? codes[0] : null;
}

/** How biomarkers changed across the user's own results, oldest first. */
export function biomarkerHistory(state, { codes, standard, sex } = {}) {
  if (!Array.isArray(codes) || !codes.length) throw new Error('codes is required: a list of biomarker codes or names, e.g. ["ldl", "glucose"].');
  const std = pickStandard(state, standard);
  // Demo results aren't the user's history.
  const own = state.results.filter((r) => !r.sample);
  const evs = own.map((r) => ({ r, ev: evaluateResult(r, std, pickSex(sex) || state.sex) }));
  const notFound = [];
  const ambiguous = [];
  const biomarkers = [];
  codes.slice(0, 20).forEach((query) => {
    const found = findCodes(query);
    if (!found.length) return notFound.push(cap(query));
    if (found.length > 1) {
      return ambiguous.push({ query: cap(query), candidates: found.map((c) => ({ code: c, name: BIOMARKER_MAP[c].name.en })) });
    }
    const code = found[0];
    const readings = evs
      .map(({ r, ev }) => ({ r, item: ev.items.find((i) => i.code === code) }))
      .filter((x) => x.item && Number.isFinite(x.item.value));
    const meta = BIOMARKER_MAP[code];
    if (!readings.length) return biomarkers.push({ code, name: meta.name.en, unit: meta.unit, readings: [], change: null });
    const first = readings[0].item;
    const last = readings.at(-1).item;
    const d = readings.length > 1 ? diffTrend(first.value, last.value, last.range) : null;
    biomarkers.push({
      code,
      name: meta.name.en,
      unit: meta.unit,
      readings: readings.map(({ r, item }) => ({ resultId: ownEntry(r).id, date: r.date, value: item.value, status: item.status })),
      change: d && { first: first.value, last: last.value, delta: round(d.delta), pct: round(d.pct, 1), trend: d.trend },
    });
  });
  return {
    standard: std,
    resultCount: own.length,
    ...(own.length < state.results.length && { note: 'Sample (demo) results are not included.' }),
    trendMeans: 'better/worse = moved closer to / further from the optimal range; same = no change in that distance.',
    biomarkers,
    ...(notFound.length && { notFound }),
    ...(ambiguous.length && { ambiguous, ambiguousHint: 'Call again with one of the candidate codes.' }),
  };
}

/** Head-to-head comparison on the biomarkers both results share; a is the left side. */
export function compare(state, { a, b, standard } = {}) {
  if (!a || !b) throw new Error('a and b are required: two result ids from list_lab_results.');
  if (a === b) throw new Error('a and b must be different results.');
  const ea = findEntry(state, a);
  const eb = findEntry(state, b);
  const std = pickStandard(state, standard);
  const c = compareResults(ea.result, eb.result, std, sexFor(state, ea), sexFor(state, eb));
  const side = (e, common) => ({
    id: e.id,
    who: e.owner === 'me' ? 'user' : cap(e.friend.sharedBy) || 'friend',
    date: e.result.date,
    scoreOnSharedBiomarkers: common.score,
  });
  const cell = (i) => ({ value: i.value, status: i.status, score: i.score });
  return {
    standard: std,
    a: side(ea, c.common.a),
    b: side(eb, c.common.b),
    sharedBiomarkers: c.rows.length,
    wins: c.wins,
    overall: c.overall,
    rows: c.rows.map((r) => ({ code: r.code, name: r.meta.name.en, unit: r.a.unit, a: cell(r.a), b: cell(r.b), winner: r.winner })),
  };
}
