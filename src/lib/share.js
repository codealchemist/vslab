import LZString from 'lz-string';
import { uid } from './format.js';
import { SHARE_IDS, CODE_BY_SHARE_ID } from '../data/shareIds.js';
import { SHARE_VERSION, isShareId, sanitizeShare } from './shareSchema.js';

// Two kinds of share links exist:
//
// Hosted (default)   …/#s=<guid>
//   The result is uploaded to the share service (Netlify function + Blobs, see
//   netlify/functions/share.mjs) and downloaded by whoever opens the link within 1 hour.
//
// Inline (fallback when the service is unreachable, and links sent before it existed)
//   …/#share=<lz-compressed payload>. The data travels inside the URL. Formats:
//
// v1 (legacy, decode only)
//   one result:  { v: 1, n, d, l, s, x: [[code, value, unit?, name?]] }
//   several:     { v: 1, n, m: [{ d, l, s, x }] }
//
// v2 (current)  { v: 2, n, m: [{ d, l, s, x }] }
//   catalog entry: [shareId, value]  or  [shareId, value, refLo, refHi]
//   custom entry:  ['x_code', value, refLo, refHi, unit, name]
//   (shareId comes from data/shareIds.js; refs are the lab's printed range, null when missing)

/** Link to the app; lang ('en' | 'es') sets the language the recipient sees. */
export function appUrl(lang) {
  return `${location.origin}${location.pathname}${lang ? `?lang=${lang}` : ''}`;
}

const num = (v) => (Number.isFinite(v) ? v : null);

function encodeEntry(e) {
  const lo = num(e.ref?.lo);
  const hi = num(e.ref?.hi);
  const hasRef = lo != null || hi != null;
  const sid = SHARE_IDS[e.code];
  if (sid) return hasRef ? [sid, e.value, lo, hi] : [sid, e.value];
  return [e.code, e.value, lo, hi, e.unit || '', e.name || ''];
}

const encodeResult = (result) => ({
  d: result.date,
  l: result.lab || '',
  s: result.patient?.sex === 'female' ? 'f' : result.patient?.sex === 'male' ? 'm' : null,
  x: result.results.map(encodeEntry),
});

const ref = (lo, hi) =>
  Number.isFinite(lo) || Number.isFinite(hi)
    ? { ref: { ...(Number.isFinite(lo) && { lo }), ...(Number.isFinite(hi) && { hi }) } }
    : {};

function decodeEntry(raw, version) {
  if (!Array.isArray(raw) || typeof raw[1] !== 'number') return null;
  if (version === 1) {
    const [code, value, unit, name] = raw;
    return { code, value, ...(unit && { unit }), ...(name && { name }) };
  }
  const [id, value, lo, hi, unit, name] = raw;
  if (typeof id !== 'string') return null;
  if (id.startsWith('x_')) return { code: id, value, ...ref(lo, hi), ...(unit && { unit }), ...(name && { name }) };
  const code = CODE_BY_SHARE_ID[id];
  // Unknown IDs come from a newer app version: skip them rather than fail the whole link.
  return code ? { code, value, ...ref(lo, hi) } : null;
}

const decodeResult = (p, version) => {
  if (!p || !Array.isArray(p.x)) return null;
  return {
    id: uid(),
    date: p.d,
    lab: p.l,
    patient: { sex: p.s === 'f' ? 'female' : p.s === 'm' ? 'male' : null, birthYear: null },
    results: p.x.map((e) => decodeEntry(e, version)).filter(Boolean),
  };
};

/** Inline link (fallback). results: one lab result or an array of them. */
export function buildShareUrl(results, sharerName, lang) {
  const list = (Array.isArray(results) ? results : [results]).slice().sort((a, b) => a.date.localeCompare(b.date));
  const payload = { v: 2, n: (sharerName || '').slice(0, 40), m: list.map(encodeResult) };
  return `${appUrl(lang)}#share=${LZString.compressToEncodedURIComponent(JSON.stringify(payload))}`;
}

/** Decodes an inline link. Returns { sharedBy, receivedAt, results: [...] } or null when invalid. */
export function readShareFromHash(hash = location.hash) {
  const m = hash.match(/share=([^&]+)/);
  if (!m) return null;
  try {
    const p = JSON.parse(LZString.decompressFromEncodedURIComponent(m[1]));
    if (!p || (p.v !== 1 && p.v !== 2)) return null;
    const list = Array.isArray(p.m) ? p.m : [p];
    const results = list.map((r) => decodeResult(r, p.v)).filter((r) => r && r.results.length);
    if (!results.length) return null;
    return { sharedBy: p.n || '', receivedAt: new Date().toISOString(), results };
  } catch {
    return null;
  }
}

/** Identity of a lab result's content, used to skip results a friend shares twice. */
export function resultFingerprint(result) {
  const values = result.results
    .map((e) => `${e.code}=${e.value}`)
    .sort()
    .join(';');
  return `${result.date}|${result.lab || ''}|${values}`;
}

// ── Hosted links ─────────────────────────────────────────────────────────

const API = '/api/share';

const toShare = (result, sharerName) => ({
  v: SHARE_VERSION,
  n: (sharerName || '').slice(0, 40),
  r: {
    date: result.date,
    lab: result.lab || '',
    sex: result.patient?.sex ?? null,
    results: result.results.map(({ code, value, unit, name, ref, qualifier }) => ({
      code,
      value,
      ...(unit && { unit }),
      ...(name && { name }),
      ...(ref && { ref }),
      ...(qualifier && { qualifier }),
    })),
  },
});

const fromShare = (share) => ({
  sharedBy: share.n,
  receivedAt: new Date().toISOString(),
  results: [
    {
      id: uid(),
      date: share.r.date,
      lab: share.r.lab,
      patient: { sex: share.r.sex, birthYear: null },
      results: share.r.results,
    },
  ],
});

export const hostedShareUrl = (id, lang) => `${appUrl(lang)}#s=${id}`;

/** Uploads one lab result. Resolves to { id, expiresAt }; throws when the service can't be reached. */
export async function uploadShare(result, sharerName) {
  const share = sanitizeShare(toShare(result, sharerName));
  if (!share) throw new Error('invalid_payload');
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(share),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !isShareId(body?.id)) throw new Error(body?.error || `http_${res.status}`);
  return body;
}

/** Downloads a hosted share. Throws Error('expired') when it is gone, other errors for network problems. */
export async function downloadShare(id) {
  const res = await fetch(`${API}/${id}`, { headers: { accept: 'application/json' } });
  if (res.status === 404 || res.status === 410) throw new Error('expired');
  if (!res.ok) throw new Error(`http_${res.status}`);
  const share = sanitizeShare(await res.json().catch(() => null));
  if (!share) throw new Error('invalid_payload');
  return fromShare(share);
}

/** What a URL hash asks for: { hosted: id } | { inline: share } | { invalid: true } | null. */
export function parseShareHash(hash = location.hash) {
  const hosted = hash.match(/(?:^#|&)s=([^&]+)/);
  if (hosted) return isShareId(hosted[1]) ? { hosted: hosted[1] } : { invalid: true };
  if (!hash.includes('share=')) return null;
  const inline = readShareFromHash(hash);
  return inline ? { inline } : { invalid: true };
}
