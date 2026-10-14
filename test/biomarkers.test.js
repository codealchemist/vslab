import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOMARKERS, BIOMARKER_MAP, withDerived } from '../src/data/biomarkers.js';
import { CONVENTIONAL, STANDARD_MAP } from '../src/data/standards.js';
import { evaluateResult } from '../src/lib/evaluate.js';
import { findCodes } from '../src/lib/agentData.js';
import { importGuide } from '../src/data/prompt.js';

const ADDED = ['cystatin_c', 'homa_ir', 'omega3_index', 'fibrinogen', 'transferrin_sat', 'igf1', 'dhea_s', 'shbg', 'psa'];

test('every biomarker is complete: unique code, texts in both languages, a conventional range', () => {
  assert.equal(new Set(BIOMARKERS.map((m) => m.code)).size, BIOMARKERS.length);
  for (const m of BIOMARKERS) {
    for (const field of ['name', 'about', 'high', 'low']) {
      assert.ok(m[field]?.en && m[field]?.es, `${m.code}.${field} needs en and es`);
    }
    assert.ok(CONVENTIONAL[m.code], `${m.code} needs a conventional range`);
  }
});

test('the new longevity biomarkers are in the catalog', () => {
  for (const code of ADDED) assert.ok(BIOMARKER_MAP[code], code);
});

test('HOMA-IR is calculated from fasting glucose and insulin', () => {
  const r = withDerived({ results: [{ code: 'glucose', value: 90 }, { code: 'insulin', value: 5 }] });
  assert.deepEqual(r.results.at(-1), { code: 'homa_ir', value: 1.11, derived: true });
  // A value the lab reported wins over the calculation.
  const own = withDerived({ results: [{ code: 'glucose', value: 90 }, { code: 'insulin', value: 5 }, { code: 'homa_ir', value: 1.3 }] });
  assert.equal(own.results.filter((e) => e.code === 'homa_ir').length, 1);
  assert.equal(BIOMARKER_MAP.homa_ir.derived.from.join(), 'glucose,insulin');
});

test('the new biomarkers are scored under the longevity standard', () => {
  const ev = evaluateResult(
    { date: '2026-01-01', patient: { sex: 'male' }, results: [{ code: 'cystatin_c', value: 0.75 }, { code: 'omega3_index', value: 6 }, { code: 'glucose', value: 100 }, { code: 'insulin', value: 10 }] },
    'longevity'
  );
  const status = Object.fromEntries(ev.items.map((i) => [i.code, i.status]));
  assert.equal(status.cystatin_c, 'optimal'); // < 0.8
  assert.equal(status.omega3_index, 'normal'); // 4–8 %
  assert.equal(status.homa_ir, 'borderline'); // 100 × 10 ÷ 405 = 2.47: past 1.9, under 2.9
  assert.ok(STANDARD_MAP.longevity.ranges.cystatin_c);
});

test('the new biomarkers can be found by their other names', () => {
  assert.deepEqual(findCodes('cistatina C'), ['cystatin_c']);
  assert.deepEqual(findCodes('IGF1'), ['igf1']);
  assert.deepEqual(findCodes('TSAT'), ['transferrin_sat']);
  assert.deepEqual(findCodes('HOMA'), ['homa_ir']);
});

test('the AI import guide lists the new measurable biomarkers but not calculated ones', () => {
  const codes = importGuide().biomarkers.map((b) => b.code);
  for (const code of ADDED.filter((c) => c !== 'homa_ir')) assert.ok(codes.includes(code), code);
  assert.ok(!codes.includes('homa_ir'));
});
