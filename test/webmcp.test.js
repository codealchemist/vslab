import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleResults } from '../src/data/sample.js';
import { createTools, registerTools } from '../src/lib/webmcp.js';

/** Minimal stand-in for document.modelContext: rejects duplicate names, unregisters on abort. */
function fakeModelContext() {
  const tools = new Map();
  return {
    tools,
    async registerTool(tool, { signal } = {}) {
      if (tools.has(tool.name)) throw new Error(`Duplicate tool name: ${tool.name}`);
      if (signal?.aborted) return;
      tools.set(tool.name, tool);
      signal?.addEventListener('abort', () => tools.delete(tool.name));
    },
  };
}

function setup({ results = [], max = 10, titleFor } = {}) {
  const staged = [];
  const state = { results, friends: [], standard: 'longevity', sex: 'male', sexSource: 'default', maxResults: max };
  const tools = createTools({ getState: () => state, stage: (p) => staged.push(p), titleFor });
  const tool = (name) => tools.find((t) => t.name === name);
  return { tools, tool, staged, state };
}

const report = (extra = {}) => ({
  date: '2026-03-02',
  lab: 'Lab X',
  patient: { sex: 'female' },
  results: [
    { code: 'ldl', value: 112, unit: 'mg/dL', ref: { high: 129 } },
    { code: 'glucose', value: 91, unit: 'mg/dL' },
    { code: 'x_ldh', name: 'LDH', value: 180, unit: 'U/L' },
  ],
  ...extra,
});

test('every tool has a snake_case name, a description and an object input schema with described properties', () => {
  const { tools } = setup();
  assert.equal(tools.length, 6);
  const walk = (schema, path) => {
    for (const [k, p] of Object.entries(schema.properties || {})) {
      assert.ok(p.description || p.type === 'object' || p.type === 'array', `${path}.${k} needs a description`);
      if (p.type === 'object') walk(p, `${path}.${k}`);
      if (p.items?.type === 'object') walk(p.items, `${path}.${k}[]`);
    }
  };
  for (const t of tools) {
    assert.match(t.name, /^[a-z]+(_[a-z0-9]+)+$/);
    assert.ok(t.description.length > 40);
    assert.equal(t.inputSchema.type, 'object');
    assert.ok(t.inputSchema.properties);
    walk(t.inputSchema, t.name);
  }
  const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
  assert.deepEqual(readOnly.sort(), ['compare_lab_results', 'get_biomarker_history', 'get_lab_import_guide', 'get_lab_result', 'list_lab_results']);
});

test('the import guide carries the rules and the catalog', async () => {
  const guide = await setup().tool('get_lab_import_guide').execute({});
  assert.equal(guide.biomarkerCount, guide.biomarkers.length);
  assert.ok(guide.biomarkers.some((b) => b.code === 'ldl' && b.unit === 'mg/dL'));
  assert.ok(guide.rules.some((r) => /PRIVACY/.test(r)));
});

test('the guide never asks for null, which the import schema doesn’t accept', async () => {
  const { tool } = setup();
  const guide = await tool('get_lab_import_guide').execute({});
  assert.ok(!guide.rules.some((r) => /null/.test(r)), 'a rule mentions null');
  assert.ok(guide.rules.some((r) => /Omit a missing bound/.test(r)));
  const ref = tool('import_lab_results').inputSchema.properties.reports.items.properties.results.items.properties.ref;
  assert.equal(ref.properties.low.type, 'number');
});

test('titles come from titleFor, and a tool without one gets none', () => {
  const { tools } = setup({ titleFor: (n) => (n === 'list_lab_results' ? 'List lab results' : '') });
  assert.equal(tools.find((t) => t.name === 'list_lab_results').title, 'List lab results');
  assert.ok(!('title' in tools.find((t) => t.name === 'get_lab_result')));
});

test('import_lab_results stages valid data for review and returns a summary', async () => {
  const existing = sampleResults().map((r) => ({ ...r, sample: false }));
  const { tool, staged } = setup({ results: existing.slice(0, 1) });
  const out = await tool('import_lab_results').execute({ reports: [report(), report({ date: existing[0].date })] });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].results.length, 2);
  assert.equal(out.ok, true);
  assert.equal(out.staged, 2);
  assert.deepEqual(out.reports[0], { date: '2026-03-02', lab: 'Lab X', biomarkers: 3, unknownCodes: 1, alreadyImported: false });
  assert.equal(out.reports[1].alreadyImported, true);
  assert.match(out.nextStep, /Nothing is saved/);
});

test('import_lab_results drops identifiers and caps strings', async () => {
  const { tool, staged } = setup();
  await tool('import_lab_results').execute({ reports: [report({ patient: { sex: 'male', name: 'Jane Doe', id: '123' }, lab: 'L'.repeat(1000) })] });
  const r = staged[0].results[0];
  assert.deepEqual(r.patient, { sex: 'male', birthYear: null });
  assert.ok(r.lab.length <= 80);
});

test('import_lab_results throws errors the agent can act on', async () => {
  const { tool, staged } = setup();
  const run = (input) => tool('import_lab_results').execute(input);
  await assert.rejects(run({}), /reports is required/);
  await assert.rejects(run({ reports: [report({ date: 'someday' })] }), /no valid date\. Send "date" as YYYY-MM-DD/);
  await assert.rejects(run({ reports: Array.from({ length: 11 }, () => report()) }), /at most 10/);
  await assert.rejects(run({ reports: [report({ results: Array.from({ length: 301 }, (_, i) => ({ code: `x_${i}`, value: 1 })) })] }), /more than 300/);
  assert.equal(staged.length, 0);
});

test('import_lab_results reports unit mismatches as warnings', async () => {
  const { tool } = setup();
  const out = await tool('import_lab_results').execute({ reports: [report({ results: [{ code: 'ldl', value: 2.9, unit: 'mmol/L' }] })] });
  assert.match(out.warnings[0], /Convert value and ref to mg\/dL/);
});

test('import_lab_results refuses when storage is full, ignoring sample data', async () => {
  const full = Array.from({ length: 3 }, (_, i) => ({ id: `r${i}`, date: `2025-01-0${i + 1}`, results: [] }));
  const { tool, staged } = setup({ results: full, max: 3 });
  await assert.rejects(tool('import_lab_results').execute({ reports: [report()] }), /VSLab42 is full \(3 of 3/);
  assert.equal(staged.length, 0);

  const samples = sampleResults(); // sample: true, replaced by the first real import
  const ok = setup({ results: samples, max: 3 });
  await ok.tool('import_lab_results').execute({ reports: [report()] });
  assert.equal(ok.staged.length, 1);
});

test('import_lab_results does nothing once the agent cancelled', async () => {
  const { tool, staged } = setup();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(tool('import_lab_results').execute({ reports: [report()] }, { signal: controller.signal }), /Cancelled/);
  assert.equal(staged.length, 0);
});

test('registerTools registers all tools and unregisters them on abort', async () => {
  const mc = fakeModelContext();
  const { tools } = setup();
  const status = await registerTools(tools, { modelContext: mc });
  assert.equal(status.supported, true);
  assert.equal(status.error, null);
  assert.equal(mc.tools.size, 6);
  status.controller.abort();
  assert.equal(mc.tools.size, 0);
});

test('registerTools reports a failure instead of throwing, and leaves nothing half-registered', async () => {
  const mc = fakeModelContext();
  const { tools } = setup();
  await mc.registerTool({ name: 'list_lab_results' });
  const status = await registerTools(tools, { modelContext: mc });
  assert.equal(status.supported, true);
  assert.deepEqual(status.registered, []);
  assert.match(status.error, /Duplicate tool name/);
  assert.deepEqual([...mc.tools.keys()], ['list_lab_results']);
});

test('aborting during registration (React StrictMode remount) lets a second registration succeed', async () => {
  const mc = fakeModelContext();
  const { tools } = setup();
  const first = new AbortController();
  const pending = registerTools(tools, { modelContext: mc, controller: first });
  first.abort();
  const interrupted = await pending;
  assert.equal(interrupted.aborted, true);
  assert.deepEqual(interrupted.registered, []);
  assert.equal(mc.tools.size, 0);
  const second = await registerTools(tools, { modelContext: mc });
  assert.equal(second.error, null);
  assert.equal(mc.tools.size, 6);
});

test('without WebMCP nothing is registered', async () => {
  const status = await registerTools(setup().tools, { modelContext: null });
  assert.deepEqual(status, { supported: false, registered: [], error: null, controller: null });
});
