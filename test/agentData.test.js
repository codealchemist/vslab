import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleResults, sampleFriend } from '../src/data/sample.js';
import { evaluateResult, compareResults, diffTrend } from '../src/lib/evaluate.js';
import { listResults, getResult, biomarkerHistory, compare, resolveCode, findCodes } from '../src/lib/agentData.js';

// The sample data, as if the user had imported it (sample: true marks demo data).
function makeState() {
  const results = sampleResults().map(({ sample, ...r }) => r);
  const friend = sampleFriend();
  return { results, friends: [friend], standard: 'longevity', sex: 'male', sexSource: 'report', maxResults: 10 };
}

test('listResults splits own and friends’ results, newest first, with the scores the screens show', () => {
  const state = makeState();
  const out = listResults(state);
  assert.equal(out.own.count, 3);
  assert.equal(out.own.max, 10);
  assert.deepEqual(out.own.results.map((r) => r.date), ['2025-11-04', '2025-01-20', '2024-03-12']);
  assert.equal(out.own.results[0].id, `me:${state.results[2].id}`);
  assert.equal(out.own.results[0].score, evaluateResult(state.results[2], 'longevity', 'male').score);
  assert.equal(out.friends.count, 1);
  const f = out.friends.results[0];
  assert.equal(f.id, `friend:${state.friends[0].id}`);
  assert.equal(f.sharedBy, 'Alex');
  // Friends are scored with their own report's sex.
  assert.equal(f.score, evaluateResult(state.friends[0].result, 'longevity', null).score);
  assert.deepEqual(out.settings, { standard: 'longevity', sex: 'male', sexSource: 'report' });
  assert.equal(out.hint, undefined);
});

test('listResults explains how to import when there are no own results', () => {
  const out = listResults({ ...makeState(), results: [] });
  assert.equal(out.own.count, 0);
  assert.match(out.hint, /import_lab_results/);
});

test('listResults flags demo data and doesn’t count it as the user’s', () => {
  const out = listResults({ ...makeState(), results: sampleResults() });
  assert.equal(out.own.count, 0);
  assert.equal(out.own.results.length, 3);
  assert.ok(out.own.results.every((r) => r.sample));
  assert.match(out.hint, /demo data/);
});

test('ids from listResults resolve in every other tool', () => {
  const state = makeState();
  const { own, friends } = listResults(state);
  for (const r of [...own.results, ...friends.results]) assert.equal(getResult(state, { id: r.id }).id, r.id);
  assert.equal(compare(state, { a: own.results[0].id, b: friends.results[0].id }).a.id, own.results[0].id);
});

test('getResult matches evaluateResult and honours standard, sex and status', () => {
  const state = makeState();
  const r = state.results[0];
  const out = getResult(state, { id: `me:${r.id}` });
  const ev = evaluateResult(r, 'longevity', 'male');
  assert.equal(out.score, ev.score);
  assert.equal(out.biomarkers.length, ev.items.length);
  assert.equal(out.owner, 'me');
  const ldl = out.biomarkers.find((b) => b.code === 'ldl');
  assert.equal(ldl.value, 148);
  assert.equal(ldl.unit, 'mg/dL');
  assert.ok(['optimal', 'normal', 'borderline', 'out'].includes(ldl.status));

  const ifcc = getResult(state, { id: `me:${r.id}`, standard: 'ifcc', sex: 'female' });
  assert.equal(ifcc.score, evaluateResult(r, 'ifcc', 'female').score);
  assert.equal(ifcc.sex, 'female');

  const flagged = getResult(state, { id: `me:${r.id}`, status: ['borderline', 'out'] });
  assert.ok(flagged.biomarkers.every((b) => b.status === 'borderline' || b.status === 'out'));
  assert.equal(flagged.shown, ev.counts.borderline + ev.counts.out);
});

test('getResult rejects unknown ids, standards and statuses with retry hints', () => {
  const state = makeState();
  assert.throws(() => getResult(state, { id: 'me:nope' }), /Call list_lab_results/);
  assert.throws(() => getResult(state, { id: `me:${state.results[0].id}`, standard: 'nasa' }), /Use one of: longevity/);
  assert.throws(() => getResult(state, { id: `me:${state.results[0].id}`, status: ['bad'] }), /status must be/);
});

test('resolveCode accepts codes, names and aliases', () => {
  assert.equal(resolveCode('ldl'), 'ldl');
  assert.equal(resolveCode('LDL'), 'ldl');
  assert.equal(resolveCode('LDL-C'), 'ldl');
  assert.equal(resolveCode('glucemia'), 'glucose');
  assert.equal(resolveCode('Vitamin D'), 'vitamin_d');
  assert.equal(resolveCode('HDL'), 'hdl');
  assert.equal(resolveCode('not a test'), null);
});

test('vague names are reported as ambiguous, not guessed', () => {
  const vitamins = findCodes('vitamin');
  assert.ok(vitamins.includes('vitamin_d') && vitamins.includes('b12'));
  assert.equal(resolveCode('vitamin'), null);
  const out = biomarkerHistory(makeState(), { codes: ['vitamin', 'ldl'] });
  assert.deepEqual(out.biomarkers.map((b) => b.code), ['ldl']);
  assert.equal(out.ambiguous[0].query, 'vitamin');
  assert.ok(out.ambiguous[0].candidates.some((c) => c.code === 'vitamin_d'));
  assert.match(out.ambiguousHint, /candidate codes/);
});

test('biomarkerHistory leaves out demo results', () => {
  const state = makeState();
  const demo = sampleResults().map((r) => ({ ...r, date: '2023-01-01' }));
  const out = biomarkerHistory({ ...state, results: [...demo, ...state.results] }, { codes: ['ldl'] });
  assert.equal(out.resultCount, 3);
  assert.deepEqual(out.biomarkers[0].readings.map((x) => x.value), [148, 121, 96]);
  assert.match(out.note, /Sample/);
  const onlyDemo = biomarkerHistory({ ...state, results: demo }, { codes: ['ldl'] });
  assert.equal(onlyDemo.resultCount, 0);
  assert.deepEqual(onlyDemo.biomarkers[0].readings, []);
});

test('biomarkerHistory lists readings oldest first with the app’s trend', () => {
  const state = makeState();
  const out = biomarkerHistory(state, { codes: ['LDL', 'glucose', 'unicorn'] });
  const ldl = out.biomarkers.find((b) => b.code === 'ldl');
  assert.deepEqual(ldl.readings.map((x) => x.value), [148, 121, 96]);
  assert.equal(ldl.readings[0].resultId, `me:${state.results[0].id}`);
  const last = evaluateResult(state.results[2], 'longevity', 'male').items.find((i) => i.code === 'ldl');
  assert.equal(ldl.change.trend, diffTrend(148, 96, last.range).trend);
  assert.equal(ldl.change.delta, -52);
  assert.deepEqual(out.notFound, ['unicorn']);
  assert.throws(() => biomarkerHistory(state, {}), /codes is required/);
});

test('compare matches compareResults, using each side’s own sex rule', () => {
  const state = makeState();
  const me = state.results[2];
  const friend = state.friends[0];
  const out = compare(state, { a: `me:${me.id}`, b: `friend:${friend.id}` });
  const c = compareResults(me, friend.result, 'longevity', 'male', null);
  assert.equal(out.sharedBiomarkers, c.rows.length);
  assert.deepEqual(out.wins, c.wins);
  assert.equal(out.overall, c.overall);
  assert.equal(out.a.who, 'user');
  assert.equal(out.b.who, 'Alex');
  assert.throws(() => compare(state, { a: `me:${me.id}`, b: `me:${me.id}` }), /different/);
  assert.throws(() => compare(state, { a: `me:${me.id}` }), /a and b are required/);
});

test('text from friends’ shares is capped', () => {
  const state = makeState();
  state.friends[0] = { ...state.friends[0], sharedBy: 'x'.repeat(500), result: { ...state.friends[0].result, lab: 'y'.repeat(500) } };
  const f = listResults(state).friends.results[0];
  assert.equal(f.sharedBy.length, 80);
  assert.equal(f.lab.length, 80);
});
