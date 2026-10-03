// Shape of a lab result shared through the share service (format v3).
// Used by the browser before uploading / after downloading and by the Netlify
// function before storing, so neither side trusts the other blindly.
// Dependency-free on purpose: it is bundled into both.
//
// { v: 3, n: sharer name, r: { date, lab, sex, results: [{ code, value, unit?, name?, ref?: { lo?, hi? }, qualifier? }] } }

export const SHARE_VERSION = 3;
export const MAX_SHARE_BYTES = 64 * 1024;
export const MAX_SHARE_ENTRIES = 300;
/** How long a shared result stays available. */
export const SHARE_TTL_HOURS = 24;
export const SHARE_TTL_MS = SHARE_TTL_HOURS * 60 * 60 * 1000;
/** Netlify Blobs store holding shared results. */
export const SHARE_STORE = 'shared-results';

const SHARE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const isShareId = (id) => typeof id === 'string' && SHARE_ID.test(id);

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

function cleanEntry(e) {
  if (!e || typeof e !== 'object' || !finite(e.value)) return null;
  if (typeof e.code !== 'string' || !/^[a-z0-9_]{1,48}$/.test(e.code)) return null;
  const out = { code: e.code, value: e.value };
  if (e.unit) out.unit = str(e.unit, 24);
  if (e.name) out.name = str(e.name, 80);
  if (e.qualifier) out.qualifier = str(e.qualifier, 2);
  const lo = e.ref && finite(e.ref.lo) ? e.ref.lo : null;
  const hi = e.ref && finite(e.ref.hi) ? e.ref.hi : null;
  if (lo != null || hi != null) out.ref = { ...(lo != null && { lo }), ...(hi != null && { hi }) };
  return out;
}

/** Returns a cleaned share or null when the input isn't a valid shared lab result. */
export function sanitizeShare(input) {
  if (!input || typeof input !== 'object' || input.v !== SHARE_VERSION) return null;
  const r = input.r;
  if (!r || typeof r !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Array.isArray(r.results)) return null;
  if (r.results.length === 0 || r.results.length > MAX_SHARE_ENTRIES) return null;
  const results = r.results.map(cleanEntry).filter(Boolean);
  if (!results.length) return null;
  return {
    v: SHARE_VERSION,
    n: str(input.n, 40),
    r: {
      date: r.date,
      lab: str(r.lab, 80),
      sex: r.sex === 'male' || r.sex === 'female' ? r.sex : null,
      results,
    },
  };
}

/** Blob key grouping shares by creation hour (UTC): "YYYY-MM-DD/HH/<guid>". */
export function shareKey(id, date) {
  return `${hourPrefix(date)}/${id}`;
}

export function hourPrefix(date) {
  const iso = date.toISOString(); // 2026-10-02T14:05:00.000Z
  return `${iso.slice(0, 10)}/${iso.slice(11, 13)}`;
}

/** Start of the hour bucket a key belongs to (ms), or null for keys that don't follow the scheme. */
export function keyHourStart(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})\/(\d{2})\//.exec(key);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]) : null;
}
