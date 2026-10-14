# WebMCP lab-result import: implementation plan

## Goal

Today, importing a lab report takes five steps. The user copies our prompt, opens ChatGPT or Gemini, attaches the PDF, copies the JSON answer, and pastes it back into VSLab42.

With WebMCP, a user who has VSLab42 open in an agent-enabled browser just **attaches the report to the agent chat and says "import this into VSLab42"**. The agent reads the file, extracts the data and hands it to the page through a tool. VSLab42 validates it and shows the usual review screen, and the user clicks **Import**. There's no prompt to copy, no JSON to paste and no tab switching.

Once results are in, the same agent can **read everything VSLab42 holds** through read-only tools:
- the user's own results;
- friends' shared results;
- the scores, statuses and comparisons the app calculates.

So the user can ask "how has my LDL changed?" or "how do I compare with Ana?" without leaving the chat.

The current copy/paste wizard stays as the fallback for browsers without WebMCP.

## What WebMCP gives us (and what it doesn't)

Sources: the [WebMCP explainer](https://github.com/webmachinelearning/webmcp), [spec](https://webmachinelearning.github.io/webmcp/) and [implementation status](https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md), plus Netlify's [WebMCP Starter](https://webmcp-starter.netlify.app/): its two agent prompts and the `assets/webmcp.js` it runs.

- **API:** `document.modelContext.registerTool({ name, title, description, inputSchema, execute, annotations }, { signal })`. Only available in secure contexts (HTTPS or localhost).
- **Feature detection** (as in the starter): `const mc = document.modelContext ?? navigator.modelContext`, and use it only if `'registerTool' in mc`. `navigator.modelContext` is a deprecated alias that older Chromium builds still expose.
- **Removed APIs we must not use:** `provideContext()`, `clearContext()` and `unregisterTool()`. Older tutorials, and models trained on them, still show these.
- **`inputSchema` is required** and is always a JSON Schema object. A tool with no arguments uses `{ type: 'object', properties: {} }`.
- **Flow:** the page registers tools, and the agent discovers them and calls `execute(input, { signal })` with arguments that match `inputSchema`. Whatever `execute` returns goes back to the model, and an error thrown in `execute` reaches the model as text.
- **Unregistering:** abort the `AbortSignal` passed at registration. Registering a name that is already taken rejects the promise.
- **Headers:** WebMCP needs an origin-isolated document. The starter's `netlify.toml` sends `Origin-Agent-Cluster: ?1` and `Permissions-Policy: tools=(self)`, so a later change can't quietly switch the API off.
- **Annotations:** `readOnlyHint`, `untrustedContentHint`, `consequentialHint`, `debugging`.
- **Events:** `toolchange`, `toolactivated` (a tool started running) and `toolcancel` (the agent cancelled the call).
- **No file inputs.** Binary or multimodal tool inputs are still an open issue (#41, #86). The agent can't pass the PDF to our page; **it has to read the file itself and send us structured data.** That fits us: extraction is already done by the AI in today's flow, and our page never handles the raw report.
- **Where it works today:**

  | Where | Status |
  |---|---|
  | ChatGPT Desktop and ChatGPT's in-app browser | Supported, no setup |
  | Chrome 149 | Origin trial; for local development, turn on `chrome://flags/#enable-webmcp-testing` and relaunch |
  | Edge 150 | Origin trial |
  | Brave (Leo) | Experimental |
  | Firefox, Safari | Not yet |

- **Best practices** (explainer and starter):
  - keep the number of tools small and give each a single job;
  - name tools snake_case and verb-first;
  - write descriptions for the model: what the tool returns and when to pick it;
  - describe every schema property;
  - validate strictly in code and loosely in the schema;
  - throw errors that say how to retry ("date is required, format YYYY-MM-DD"), not "Error: 400";
  - return compact, self-describing objects (counts, echoed inputs) rather than bare arrays;
  - keep the visible UI in sync with whatever a tool does, because the user is watching.
- **`readOnlyHint` changes how agents behave.** Read tools set it so the agent calls them freely. Write tools leave it out, and *its absence is what makes the agent confirm with the user before calling*.
- **One code path.** A tool is a thin wrapper around something the site already does. It never gets a parallel implementation, so a person and an agent can't be told different things.
- **Tool declarations aren't a security boundary.** They are hints to a cooperative agent. Real validation lives in the code the tool calls.

## User flow

1. The user opens VSLab42 in ChatGPT's browser, in ChatGPT Desktop, or in Chrome with an agent. The page registers its tools on load.
2. They attach `analisis-marzo.pdf` to the agent chat: *"Import my lab results into VSLab42."*
3. The agent calls `get_lab_import_guide`. That returns the extraction rules and the biomarker catalog: codes, canonical units and conversions.
4. The agent reads the PDF, builds the data and calls `import_lab_results`.
5. VSLab42 validates the data with the existing `parseLabJson`.
   - **If it's valid:** the page opens Import at the **review step**, filled in (score preview, date, lab, warnings). The tool tells the agent: *"Staged 1 report (2026-03-02, 34 biomarkers). Ask the user to review it and press Import."*
   - **If it's invalid:** the tool throws an error naming each problem (missing date, bad values) so the agent can fix the data and retry.
6. The user checks the values and clicks **Import**, as they do today.

The agent **stages** the import but never saves it. AI extraction can misread values, and this is health data, so **the user always confirms by pressing Import** (decided; see [Decisions](#decisions)). No tool can save, edit or delete results.

## Tools

Six tools are registered once at startup:

- two for importing: `get_lab_import_guide` and `import_lab_results`;
- four read tools: `list_lab_results`, `get_lab_result`, `get_biomarker_history` and `compare_lab_results`.

That's within the "five well-described tools beat twenty vague ones" budget. None of them depends on the current route, so they aren't registered per route.

### 1. `get_lab_import_guide` (read-only)

- **Title:** "How to extract lab results for VSLab42"
- **Description:** "Returns the rules, canonical biomarker codes and unit conversions needed to turn a laboratory report (PDF or photo the user attached) into data for import_lab_results. Call this before import_lab_results."
- **Input schema:** `{ type: 'object', properties: {} }`. It's required even with no arguments.
- **Returns:** `{ rules, biomarkers: [{ code, name, unit, aliasesAndConversions }], biomarkerCount }`, built from the same data as today's `AI_PROMPT`. We drop the "return a ```json block" instruction, because the tool schema defines the output now.
- **Annotations:** `{ readOnlyHint: true }`

We use a separate tool because the catalog lists 56 biomarkers with aliases and conversions. Putting it in a tool description would add it to the agent's context on every page load. As a tool, the agent only pays that cost when it imports.

### 2. `import_lab_results` (stages an import for review)

- **Title:** "Import lab results"
- **Description:** "Loads blood or urine test results extracted from the user's laboratory report into VSLab42 and opens them for the user to review before saving. Use the codes and units from get_lab_import_guide. Do not include the patient's name or any identifiers."
- **Input schema:** the same `vslab.v1` shape we already parse, always wrapped in an array so reports with several collection dates work.

```js
{
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
            properties: {
              sex: { type: 'string', enum: ['male', 'female'], description: 'Omit if not printed.' },
              birthYear: { type: 'integer' },
            },
          },
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                code: { type: 'string', description: 'Canonical code from the guide, or x_<snake_case> if none fits.' },
                name: { type: 'string', description: 'Test name as printed.' },
                value: { type: 'number', description: 'Value converted to the canonical unit.' },
                unit: { type: 'string' },
                qualifier: { type: 'string', enum: ['<', '>', '≤', '≥'] },
                ref: {
                  type: 'object',
                  description: 'Reference interval printed on the report, converted to the canonical unit.',
                  properties: { low: { type: 'number' }, high: { type: 'number' } },
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
}
```

**What `execute` does:**

1. Checks size limits: at most 10 reports and 300 results per report, and every string trimmed and truncated.
2. Runs `parseLabJson(JSON.stringify(input.reports))`. Reusing it gives us the same normalisation, unit checks and whitelisting of fields as the paste flow, so anything unknown, such as names or IDs, is dropped.
3. **If `error` is set:** throws an error the agent can act on, for example `"No valid reports: report #1 has no date. Send date as YYYY-MM-DD."` The validator's warning keys are turned into sentences like this.
4. **If there are no free slots** (`MAX_RESULTS` reached): throws `"VSLab42 is full (10 of 10 results stored). Ask the user to delete an older result in VSLab42, then call import_lab_results again."` It doesn't stage anything.
5. **Otherwise:** stages the parsed results through the same function the paste flow uses (see Code changes), navigates to `import` and jumps to the review step. It returns a compact, self-describing object:

```js
{
  ok: true,
  staged: 1,
  reports: [{ date: '2026-03-02', lab: 'Lab X', biomarkers: 34, unknownCodes: 2, alreadyImported: false }],
  warnings: ['LDL cholesterol: unit "mmol/L" differs from the expected mg/dL'],
  nextStep: 'Shown to the user for review. Nothing is saved until they press Import in VSLab42.',
}
```

**Annotations:** no `readOnlyHint`. Leaving it out tells the agent this tool has an effect, so it confirms with the user before calling: "Load these 34 results into VSLab42 for review?" That's a cheap extra check on health data, and the user still confirms in the page. We don't set `consequentialHint` either, because nothing irreversible happens.

### 3–6. Read tools

All four are wrappers around functions the views already use: `evaluateResult`, `compareResults`, `diffTrend` and `timelineRows`. They are pure functions of a snapshot of app state, `{ results, friends, settings, sex }`, read through a ref, so they always return what the screen would show.

**Common rules:**
- **Annotations:** `{ readOnlyHint: true, untrustedContentHint: true }`. They're read-only, so the agent calls them without asking. `untrustedContentHint` is set because friends' results contain text we didn't write and must not be followed as instructions: who shared them, lab names, and names of unknown tests.
- **Result ids:** every result has an id the agent passes back. Own results use `me:<id>` and friends' results use `friend:<id>`, the same split the Compare view uses.
- **Optional `standard` and `sex` arguments,** so the agent can re-score under another standard. Without them, the user's current settings apply.
  - `standard` is an enum of the ids in `STANDARDS`: `longevity`, `lab`, `psap`, `ifcc`, `ada`, …, each described in the schema.
  - `sex` is `"male"` or `"female"`.
- **Return shape:** compact, self-describing objects, always with counts. Biomarkers carry English names and canonical units, plus the status, range and score. Display-only fields such as colours and localised labels are left out.

#### `list_lab_results`
- **Description:** "Lists every lab result stored in VSLab42: the user's own and those friends shared with them, with date, lab, global score (0-100) and status counts. Call this first to get result ids for the other tools."
- **Input:** `{}`
- **Returns:**

  ```js
  {
    settings: { standard: 'longevity', sex: 'male', sexSource: 'report' },
    own: { count: 3, max: 10, results: [{ id: 'me:…', date, lab, biomarkers: 34, score: 82, counts: { optimal, normal, borderline, out }, sample: false }] },
    friends: { count: 1, results: [{ id: 'friend:…', sharedBy: 'Ana', receivedAt, date, lab, biomarkers, score, counts }] },
  }
  ```

#### `get_lab_result`
- **Description:** "Returns one lab result in full: every biomarker with value, unit, reference and optimal range, status (optimal, normal, borderline, out) and score, plus the global and per-category scores. Use list_lab_results to find the id."
- **Input:** `{ id (required), standard?, sex?, status? }`. `status` is an optional filter, for example `["borderline", "out"]` for "what needs attention?".
- **Returns:** `{ id, owner, sharedBy?, date, lab, standard, sex, score, byCategory, counts, biomarkers: [{ code, name, category, value, qualifier?, unit, range: { lo, hi, optimalLo, optimalHi }, rangeSource, status, direction, beyond?, score, calculated?, edited? }] }`

#### `get_biomarker_history`
- **Description:** "Returns how one or more biomarkers changed across the user's own lab results over time, with each reading's status and whether it moved toward or away from the optimal range. Use for questions like 'how has my LDL changed?'."
- **Input:** `{ codes (required; canonical codes or names, which the handler resolves through BIOMARKER_MAP and its aliases, so the agent can pass "LDL"), standard?, sex? }`
- **Returns:** `{ biomarkers: [{ code, name, unit, readings: [{ resultId, date, value, status }], change: { first, last, delta, pct, trend: 'better' | 'worse' | 'same' } }], notFound: [] }`

#### `compare_lab_results`
- **Description:** "Compares two lab results head-to-head on the biomarkers both share: who scores better on each, win counts, and the overall winner. Works for the user vs a friend, or two of the user's own results."
- **Input:** `{ a (required), b (required), standard? }`. Each side uses its own report's sex, as the Compare view does.
- **Returns:** `{ a: { id, label, date, score }, b: {…}, sharedBiomarkers, wins: { a, b, tie }, overall: 'a' | 'b' | 'tie', rows: [{ code, name, unit, a: { value, status, score }, b: {…}, winner }] }`

**Errors:** an unknown id throws `"No lab result with id '…'. Call list_lab_results for valid ids."` When there are no results, the read tools return empty lists rather than errors, and `list_lab_results` says how to import.

## Code changes

| File | Change |
|---|---|
| `src/data/prompt.js` | Split `AI_PROMPT` into reusable `SCHEMA_TEXT`, `RULES_TEXT` and `CATALOG_TEXT`. `AI_PROMPT` becomes their concatenation, unchanged for the copy/paste flow. Export `importGuide()` for the tool. |
| `src/lib/agentData.js` (new) | Pure functions behind the four read tools: `listResults(state)`, `getResult(state, args)`, `biomarkerHistory(state, args)` and `compare(state, args)`. They build on `evaluate.js` and `reports.js`, have no React or DOM dependency, and are unit-tested directly. |
| `src/lib/webmcp.js` (new) | `getModelContext()` (`document.modelContext ?? navigator.modelContext`, only if `'registerTool' in` it), the six tool definitions in a `TOOLS` list, and `registerTools(handlers)`. It registers each tool with one `AbortController` and returns `{ supported, registered, error, controller }`, so failures such as a duplicate name or a blocked permissions policy are reported rather than thrown. It has no React dependency, so it's easy to test. |
| `src/hooks/useWebMcp.js` (new) | Called once in `App`. It calls `registerTools` on mount and aborts the controller on unmount, which also covers StrictMode's double mount. Handlers read the latest app state (results, friends, settings, free slots) through one ref, so the tools are registered once. It puts the registration status in context for the indicator. |
| `src/context.jsx` | Adds `stagedImport` and `setStagedImport`: the parsed results waiting for review. Also adds `webmcp`, the registration status. |
| `src/views/Import.jsx` | Extracts `stageParsed(res)`, which sets `parsed` and moves to the review step. The paste, upload and clipboard paths and the tool all go through it, so there is one code path. When `stagedImport` is set, it calls `stageParsed` and clears it. Shows an "Extracted by your browser's AI agent" note at the review step. Cancellation is handled in the tool: if its `signal` is already aborted, it stages nothing. The tool returns as soon as the data is on screen, so a later `toolcancel` would have nothing to undo. When tools registered, step 1 shows a callout: *"Using an AI browser? Attach your report in the agent chat and ask it to import into VSLab42."* It has a copyable example request, and the five-step wizard stays below as an alternative. |
| `src/App.jsx` footer | A small, honest status indicator that appears only when WebMCP was detected. It shows "AI agent tools: 6 available", or the registration error. The starter recommends this so people can check the integration works. |
| `src/App.jsx` | Calls `useWebMcp()`. |
| `src/i18n/en.js`, `es.js` | Callout, review note and the user-visible tool `title`s, localised (the spec recommends this). Tool `description`s and errors stay in English, because they are for the model. |
| `netlify.toml` | Adds a `[[headers]]` block for `/*` with `Origin-Agent-Cluster = "?1"` and `Permissions-Policy = "tools=(self)"`, matching the starter. Both are effectively the default on Netlify today, but stating them explicitly stops a later header change from silently disabling WebMCP. `tools=(self)` also keeps cross-origin iframes from reaching our tools. |
| `index.html` | Origin-trial `<meta http-equiv="origin-trial" content="…">` tags for Chrome and Edge (decided). See [Origin trials](#origin-trials). |
| `README.md` | Short "AI agents (WebMCP)" section and the `npm test` command. |
| `package.json`, `test/` | `npm test` runs `node --test test/`: `agentData.test.js` and `webmcp.test.js`, against a fake `document.modelContext`. |

No Netlify function changes are needed. Apart from the headers above, everything runs in the page, and the data stays in the user's browser as it does today.

## Origin trials

Decided: register now, so Chrome 149+ and Edge 150+ users get the tools without turning on a flag.

1. Register the production origin (the Netlify site URL, or the custom domain if `SITE_URL` sets one):
   - for **WebMCP** in the [Chrome Origin Trials console](https://developer.chrome.com/origintrials/);
   - for the [Edge WebMCP origin trial](https://developer.microsoft.com/en-us/microsoft-edge/origin-trials/trials/0b76fe60-b266-458e-a285-04e375c0c31a).
2. Add one `<meta http-equiv="origin-trial" content="TOKEN">` per browser in `index.html`. Tokens are public by design, so committing them is fine.
3. Deploy previews run on other origins and won't match the tokens. Test previews with the Chrome flag, or in ChatGPT, which needs no token.
4. Tokens expire. Put the expiry date in a comment next to each tag, and renew before it. When WebMCP ships without a flag, delete the tags.

## Security and privacy

- **The report goes to the AI provider either way.** That's no different from today's flow, where the user uploads the PDF to ChatGPT or Gemini. The page itself never receives the file.
- **Treat tool input as untrusted.** A crafted PDF could carry prompt-injected text. Mitigations:
  - strict validation and size limits in `execute`, through `parseLabJson`;
  - React escapes all rendered text;
  - unknown fields are dropped;
  - nothing is saved without the user clicking Import.
- **No identifiers.** The tool description tells the model not to send any, and the field whitelist enforces it. Results don't store any either. The only names the read tools return are the display names friends chose when sharing (`sharedBy`).
- **The agent can read everything VSLab42 holds** (decided). That includes friends' shared results, which they chose to send to this user. Own results mostly came from the user's AI in the first place, and the scores are calculations the agent could redo. The tool descriptions say plainly that they return the user's and friends' health data.
- **Text from friends' results is untrusted.** A crafted share could hide instructions in `sharedBy`, `lab` or a custom test name. The read tools set `untrustedContentHint: true`, cap string lengths, and return those strings only as data fields.
- **No destructive or outward-facing tools.** No delete, share, edit or settings tools. Those would need `consequentialHint` and user confirmation, and they aren't needed for the goal.
- **Validation lives in the code the tool calls, not in the schema.** As the starter puts it, a tool declaration is a hint to a cooperative agent, never a security boundary. `parseLabJson` and the size limits are the real checks, and they also protect the paste flow.

## Testing

1. **Unit tests** (Node, using a fake `document.modelContext` that records `registerTool` calls):
   - the schemas are valid JSON Schema;
   - `execute` with a sample report stages the right results;
   - malformed input throws actionable errors;
   - a full store throws the "full" error;
   - aborting the signal unregisters the tools;
   - a duplicate registration is reported in the status, not thrown;
   - the `agentData.js` functions, run against `src/data/sample.js` plus a fake friend's result:
     - `listResults` splits own and friends' results and matches the scores shown in the Overview;
     - `getResult` matches `evaluateResult` and honours the `standard`, `sex` and `status` filters;
     - `biomarkerHistory` resolves aliases such as "LDL" and its trend matches `diffTrend`;
     - `compare` matches `compareResults`;
     - unknown ids throw the "call list_lab_results" error.
2. **Local, with Chrome 149 or newer:** turn on `chrome://flags/#enable-webmcp-testing` and relaunch, then run `npm run dev` on `localhost` (a secure context). Use the **Model Context Tool Inspector** extension (setup is in [Chrome's WebMCP guide](https://developer.chrome.com/docs/ai/webmcp)). It lists the registered tools, validates their JSON Schemas and calls them with your own arguments. Check that the status indicator says 6 tools.
3. **Scripted agent check,** adapted from the starter's prompt 1. Ask a coding agent to use only the tools (no DOM reading, no simulated clicks) and report each result verbatim:
   1. List every registered tool with its name, description and input schema.
   2. Call `get_lab_import_guide` and report `biomarkerCount`.
   3. Call `import_lab_results` with the report in `src/data/sample.js`, then confirm the review screen shows it.
   4. Call `import_lab_results` with a report missing `date`, and quote the error.
   5. Call `list_lab_results`, then `get_lab_result` on the first id with `status: ["borderline", "out"]`.
   6. Call `get_biomarker_history` with `["LDL", "glucose"]`, and `compare_lab_results` on two ids.
   7. Call `get_lab_result` with a made-up id, and quote the error.
4. **End to end:**
   - deploy a Netlify preview and open it in ChatGPT's in-app browser or ChatGPT Desktop;
   - attach a real report and a photographed one, in English and in Spanish;
   - try a multi-date report, a report with unknown tests, and one with a full store.

   For each, check the review screen and the agent's replies. Then ask questions that need the read tools: "What needs attention in my latest results?", "How has my glucose changed?" and "Am I healthier than Ana?". Check the answers against the app's screens.
5. **Fallback:** in Firefox and Safari, nothing is registered, neither the callout nor the indicator appears, and the copy/paste wizard is unchanged.

## Phases

1. **Phase 1, agent import and read tools:** everything above. All six tools ship together.
2. **Phase 2, possible follow-ups (not decided):**
   - `open_lab_result` or `open_comparison` tools that navigate the UI, so the agent can show the user what it's talking about. That would follow the "keep the UI in sync" practice.
   - A setting to turn the read tools off.
3. **Phase 3, follow the spec:** adopt an `outputSchema` (issue #9) and user-confirmation or elicitation APIs (#165) once they land. If file inputs are ever added (#41), consider accepting the PDF directly.

## Decisions

Confirmed on 2026-10-10:

1. **The user confirms every import.** `import_lab_results` only stages data for review, and nothing is saved until the user presses Import. No tool can save, edit or delete results.
2. **Read tools ship, on by default, with access to all data:** own results, friends' shared results, and the calculated scores, statuses, trends and comparisons. Reason: own results mostly came from the user's AI anyway, the calculations are ones the agent could redo, and the only app-held data the agent couldn't otherwise see is friends' shared results.
3. **Origin-trial tokens are registered now** for Chrome and Edge on the production origin. See [Origin trials](#origin-trials).
