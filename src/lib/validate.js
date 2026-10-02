import { BIOMARKER_MAP } from '../data/biomarkers.js';
import { uid } from './format.js';

const normUnit = (u) =>
  String(u || '')
    .toLowerCase()
    .replace(/μ|u(?=[a-z])/g, 'µ')
    .replace(/\s+/g, '')
    .replace('²', '2');

const toNumber = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/^[<>≤≥=~]+/, '').replace(/\s/g, '');
  // "1.234,5" or "5,6" (European decimals)
  const n = Number(/,\d{1,3}$/.test(s) && !/\.\d+,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const slug = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);

function toIsoDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // dd/mm/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseRef(e) {
  const r = e.ref || e.range || e.referenceRange || e.labRange || {};
  const lo = toNumber(r.low ?? r.lo ?? r.min ?? e.refLow);
  const hi = toNumber(r.high ?? r.hi ?? r.max ?? e.refHigh);
  if (lo == null && hi == null) return undefined;
  return { ...(lo != null && { lo }), ...(hi != null && { hi }) };
}

/** Strip ``` fences and surrounding chatter the AI may add. */
export function extractJson(text) {
  let s = String(text || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  if (!/^[[{]/.test(s)) {
    const start = s.search(/[[{]/);
    if (start >= 0) s = s.slice(start);
  }
  return s;
}

/**
 * Parse and normalize AI-generated JSON into VSLab lab results.
 * Returns { results, warnings, error }.
 */
export function parseLabJson(text) {
  let data;
  try {
    data = JSON.parse(extractJson(text));
  } catch (e) {
    return { results: [], warnings: [], error: { key: 'invalidJson', detail: e.message } };
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.labResults) ? data.labResults : [data];
  const warnings = [];
  const results = [];

  list.forEach((raw, idx) => {
    const label = `#${idx + 1}`;
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.results)) {
      warnings.push({ key: 'noResultsArray', label });
      return;
    }
    const date = toIsoDate(raw.date || raw.collectionDate || raw.reportDate);
    if (!date) {
      warnings.push({ key: 'noDate', label });
      return;
    }
    const seen = new Set();
    const entries = [];
    raw.results.forEach((e) => {
      if (!e || typeof e !== 'object') return;
      const value = toNumber(e.value);
      const name = e.name || e.test || e.code;
      if (value == null) {
        warnings.push({ key: 'badValue', label, name: name || '?' });
        return;
      }
      let code = slug(e.code || '');
      const meta = BIOMARKER_MAP[code];
      if (!meta) {
        code = code ? (code.startsWith('x_') ? code : `x_${code}`) : `x_${slug(name || 'unknown')}`;
      } else if (e.unit && normUnit(e.unit) !== normUnit(meta.unit)) {
        warnings.push({ key: 'unitMismatch', label, name: meta.name.en, unit: e.unit, expected: meta.unit });
      }
      if (seen.has(code)) return;
      seen.add(code);
      const ref = parseRef(e);
      entries.push({
        code,
        value,
        unit: meta ? meta.unit : String(e.unit || ''),
        ...(!meta && name && { name: String(name) }),
        ...(ref && { ref }),
        ...(e.qualifier && { qualifier: String(e.qualifier) }),
        ...(e.originalValue && { originalValue: String(e.originalValue) }),
      });
    });
    if (!entries.length) {
      warnings.push({ key: 'noResultsArray', label });
      return;
    }
    const sex = String(raw.patient?.sex || raw.sex || '').toLowerCase();
    results.push({
      id: uid(),
      importedAt: new Date().toISOString(),
      date,
      lab: String(raw.lab || raw.laboratory || '').slice(0, 80),
      patient: {
        sex: /^(f|female|mujer|femenino)/.test(sex) ? 'female' : /^(m|male|hombre|masculino)/.test(sex) ? 'male' : null,
        birthYear: Number.isInteger(raw.patient?.birthYear) ? raw.patient.birthYear : null,
      },
      results: entries,
    });
  });

  if (!results.length) return { results, warnings, error: { key: 'nothingValid' } };
  return { results, warnings, error: null };
}
