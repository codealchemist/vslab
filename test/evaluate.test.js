import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairDiff } from '../src/lib/evaluate.js';

test('pairDiff is left minus right, with the trend judged toward the optimal band', () => {
  const range = { hi: 99, ohi: 70 };
  assert.deepEqual(pairDiff({ value: 96, range }, { value: 121, range }), { delta: -25, pct: (-25 / 121) * 100, trend: 'better' });
  assert.equal(pairDiff({ value: 121, range }, { value: 96, range }).trend, 'worse');
  assert.equal(pairDiff({ value: 60, range }, { value: 65, range }).trend, 'same'); // both inside the optimal band
  assert.equal(pairDiff({ value: 5, range }, { value: 0, range }).pct, null); // no % change from 0
});
