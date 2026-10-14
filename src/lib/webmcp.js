import { importGuide } from '../data/prompt.js';
import { parseLabJson } from './validate.js';
import { listResults, getResult, biomarkerHistory, compare, STANDARD_IDS, STATUSES } from './agentData.js';

/**
 * WebMCP tools: let an AI agent in the user's browser import lab results and read the app's data.
 * Spec: https://github.com/webmachinelearning/webmcp — design notes: docs/webmcp-import-plan.md.
 *
 * Descriptions and errors are written for the model (English); `title` is shown to the user and is
 * localised by the caller. Import only stages data on the review screen: the user saves it.
 */

/** document.modelContext is current; navigator.modelContext is a deprecated alias in older Chromium. */
export function getModelContext() {
  const mc = typeof document !== 'undefined' ? document.modelContext ?? navigator.modelContext : null;
  return mc && 'registerTool' in mc ? mc : null;
}

const MAX_REPORTS = 10;
const MAX_ENTRIES = 300;

/** Deep copy with every string trimmed and capped, so oversized input never reaches the parser. */
const clip = (v) =>
  typeof v === 'string' ? v.trim().slice(0, 200) : Array.isArray(v) ? v.map(clip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clip(x)])) : v;

// The validator's warnings, as instructions the agent can act on.
const WARNING_TEXT = {
  noResultsArray: (w) => `Report ${w.label} has no valid results; it needs a "results" array with numeric values.`,
  noDate: (w) => `Report ${w.label} has no valid date. Send "date" as YYYY-MM-DD.`,
  badValue: (w) => `"${w.name}" in report ${w.label} has a non-numeric value and was skipped. Send "value" as a number.`,
  unitMismatch: (w) => `${w.name}: unit "${w.unit}" differs from the expected ${w.expected}. Convert value and ref to ${w.expected}.`,
};
const warningText = (w) => (WARNING_TEXT[w.key] || ((x) => x.key))(w);

const STANDARD_ARG = {
  type: 'string',
  enum: STANDARD_IDS,
  description:
    'Reference standard to score against. Defaults to the user’s setting. longevity = strict longevity-medicine targets; lab = the ranges printed on each report; the rest are clinical bodies (psap, ifcc, ada, accaha, ata, kdigo, who).',
};
const SEX_ARG = { type: 'string', enum: ['male', 'female'], description: 'Sex for sex-specific ranges. Defaults to the user’s setting for their own results and to the report’s sex for friends’ results.' };
const ID_ARG = { type: 'string', description: 'A result id from list_lab_results, e.g. "me:abc123" or "friend:xyz789".' };

const READ = { readOnlyHint: true };
// Friends' results contain text written by someone else (their name, lab, custom test names).
const READ_SHARED = { readOnlyHint: true, untrustedContentHint: true };

/**
 * The six tools. `getState()` returns the latest app state snapshot (see agentData.js);
 * `stage({ results, warnings })` shows parsed results on the import review screen;
 * `titleFor(name)` gives a tool's user-facing title (empty for none).
 */
export function createTools({ getState, stage, titleFor = () => '' }) {
  const tools = [
    {
      name: 'get_lab_import_guide',
      description:
        'Returns the rules, canonical biomarker codes and unit conversions needed to turn a laboratory report (PDF or photo the user attached) into data for import_lab_results. Call this before import_lab_results.',
      inputSchema: { type: 'object', properties: {} },
      execute: () => importGuide(),
      annotations: READ,
    },
    {
      name: 'import_lab_results',
      description:
        "Loads blood or urine test results extracted from the user's laboratory report into VSLab42 and opens them on screen for the user to review. Nothing is saved until the user presses Import. Use the codes and units from get_lab_import_guide. Do not include the patient's name or any identifiers.",
      inputSchema: {
        type: 'object',
        properties: {
          reports: {
            type: 'array',
            description: 'One entry per sample collection date found in the report.',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string', description: 'Sample collection date, YYYY-MM-DD.' },
                lab: { type: 'string', description: 'Laboratory name.' },
                patient: {
                  type: 'object',
                  description: 'Only sex and birth year; never names or identifiers.',
                  properties: {
                    sex: { type: 'string', enum: ['male', 'female'], description: 'Omit if not printed.' },
                    birthYear: { type: 'integer', description: 'Omit if not printed.' },
                  },
                },
                results: {
                  type: 'array',
                  description: 'Every numeric result in the report.',
                  items: {
                    type: 'object',
                    properties: {
                      code: { type: 'string', description: 'Canonical code from get_lab_import_guide, or x_<snake_case> if none fits.' },
                      name: { type: 'string', description: 'Test name as printed.' },
                      value: { type: 'number', description: 'Value converted to the canonical unit.' },
                      unit: { type: 'string', description: 'Canonical unit (or the printed unit for x_ codes).' },
                      qualifier: { type: 'string', enum: ['<', '>', '≤', '≥'], description: 'Only for results printed like "<0.5".' },
                      ref: {
                        type: 'object',
                        description: 'Reference interval printed on the report, converted to the canonical unit. Omit if none is printed.',
                        properties: { low: { type: 'number', description: 'Lower bound, if any.' }, high: { type: 'number', description: 'Upper bound, if any.' } },
                      },
                      originalValue: { type: 'string', description: 'Value and unit exactly as printed, e.g. "2.9 mmol/L".' },
                    },
                    required: ['code', 'value'],
                  },
                },
              },
              required: ['date', 'results'],
            },
          },
        },
        required: ['reports'],
      },
      // No readOnlyHint: it changes what the user sees, so agents confirm with the user before calling.
      async execute(input, { signal } = {}) {
        const reports = input?.reports;
        if (!Array.isArray(reports) || !reports.length) throw new Error('reports is required: a non-empty array with one entry per collection date.');
        if (reports.length > MAX_REPORTS) throw new Error(`Too many reports (${reports.length}); send at most ${MAX_REPORTS} per call.`);
        const big = reports.findIndex((r) => Array.isArray(r?.results) && r.results.length > MAX_ENTRIES);
        if (big >= 0) throw new Error(`Report #${big + 1} has more than ${MAX_ENTRIES} results; send only the lab's actual test results.`);

        const parsed = parseLabJson(JSON.stringify(clip(reports)));
        if (parsed.error) {
          const why = parsed.warnings.map(warningText);
          throw new Error(`No valid reports. ${why.length ? why.join(' ') : 'Each report needs a date and a results array.'}`);
        }

        const state = getState();
        const own = state.results.filter((r) => !r.sample);
        const free = state.maxResults - own.length;
        if (free <= 0) {
          throw new Error(
            `VSLab42 is full (${own.length} of ${state.maxResults} results stored). Ask the user to delete an older result in VSLab42, then call import_lab_results again.`
          );
        }
        if (signal?.aborted) throw new Error('Cancelled before anything was shown.');

        stage(parsed);
        const dates = new Set(own.map((r) => r.date));
        return {
          ok: true,
          staged: parsed.results.length,
          ...(parsed.results.length > free && { fitsNow: free, note: `Only ${free} more result(s) fit; the extra entries will not be imported.` }),
          reports: parsed.results.map((r) => ({
            date: r.date,
            lab: r.lab || null,
            biomarkers: r.results.length,
            unknownCodes: r.results.filter((e) => e.code.startsWith('x_')).length,
            alreadyImported: dates.has(r.date),
          })),
          warnings: parsed.warnings.map(warningText),
          nextStep: 'Shown to the user for review. Nothing is saved until they press Import in VSLab42.',
        };
      },
    },
    {
      name: 'list_lab_results',
      description:
        "Lists every lab result stored in VSLab42: the user's own and those friends shared with them, with date, lab, global score (0-100) and status counts, plus the user's current standard and sex settings. Call this first to get result ids for the other tools.",
      inputSchema: { type: 'object', properties: {} },
      execute: () => listResults(getState()),
      annotations: READ_SHARED,
    },
    {
      name: 'get_lab_result',
      description:
        'Returns one lab result in full: every biomarker with value, unit, reference and optimal range, status (optimal, normal, borderline, out) and score (0-100), plus the global and per-category scores. Filter by status to answer "what needs attention?".',
      inputSchema: {
        type: 'object',
        properties: {
          id: ID_ARG,
          status: { type: 'array', items: { type: 'string', enum: STATUSES }, description: 'Only return biomarkers with these statuses, e.g. ["borderline", "out"].' },
          standard: STANDARD_ARG,
          sex: SEX_ARG,
        },
        required: ['id'],
      },
      execute: (args) => getResult(getState(), args),
      annotations: READ_SHARED,
    },
    {
      name: 'get_biomarker_history',
      description:
        "Returns how biomarkers changed across the user's own lab results over time: each reading with date, value and status, and whether the latest moved toward or away from the optimal range. Use for questions like 'how has my LDL changed?'.",
      inputSchema: {
        type: 'object',
        properties: {
          codes: { type: 'array', items: { type: 'string' }, description: 'Biomarker codes or common names, e.g. ["ldl", "glucose"] or ["LDL", "vitamin D"].' },
          standard: STANDARD_ARG,
          sex: SEX_ARG,
        },
        required: ['codes'],
      },
      execute: (args) => biomarkerHistory(getState(), args),
      annotations: READ,
    },
    {
      name: 'compare_lab_results',
      description:
        "Compares two lab results head-to-head on the biomarkers both share: each side's value, status and score, who wins each biomarker, and the overall winner. Works for the user vs a friend, or two of the user's own results.",
      inputSchema: {
        type: 'object',
        properties: {
          a: { ...ID_ARG, description: 'First result id (usually the user’s), from list_lab_results.' },
          b: { ...ID_ARG, description: 'Second result id, from list_lab_results.' },
          standard: STANDARD_ARG,
        },
        required: ['a', 'b'],
      },
      execute: (args) => compare(getState(), args),
      annotations: READ_SHARED,
    },
  ];
  return tools.map((t) => {
    const title = titleFor(t.name);
    return title ? { ...t, title } : t;
  });
}

/**
 * Registers the tools and reports what happened instead of throwing, so the page can show an
 * honest status. Aborting `controller` unregisters them (WebMCP has no unregisterTool()); pass your
 * own to be able to abort while registration is still in progress.
 */
export async function registerTools(tools, { modelContext = getModelContext(), controller = new AbortController() } = {}) {
  if (!modelContext) return { supported: false, registered: [], error: null, controller: null };
  try {
    for (const tool of tools) {
      if (controller.signal.aborted) break;
      await modelContext.registerTool(tool, { signal: controller.signal });
    }
    // Aborted while registering (e.g. the component unmounted): nothing stays registered.
    if (controller.signal.aborted) return { supported: true, registered: [], error: null, aborted: true, controller };
    return { supported: true, registered: tools.map((t) => t.name), error: null, controller };
  } catch (e) {
    // Most likely a duplicate name or the `tools` permissions policy. Don't leave half a set behind.
    controller.abort();
    return { supported: true, registered: [], error: e?.message || String(e), controller: null };
  }
}
