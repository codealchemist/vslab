# WebMCP best practices (for coding agents)

Instructions for adding WebMCP tools to a web app. This guide doesn't depend on any particular project. It was compiled in October 2026 from:

- the [WebMCP spec and explainer](https://github.com/webmachinelearning/webmcp) (W3C Web Machine Learning CG);
- its [implementation status](https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md);
- Netlify's [WebMCP Starter](https://webmcp-starter.netlify.app/);
- [Chrome's WebMCP docs](https://developer.chrome.com/docs/ai/webmcp).

WebMCP is still changing. If something here disagrees with the current spec, the spec wins. Check it before relying on details marked *(volatile)*.

## 1. What WebMCP is

A page registers **tools**: JavaScript functions with a name, a description written for a model, and a JSON Schema for their input. An AI agent in the user's browser can discover these tools and call them. They run in the user's own tab, with the user's session and the page's existing code. There is no server: the page itself acts as the MCP server.

Use WebMCP so agents can **operate the existing UI's capabilities directly** instead of scraping the DOM and simulating clicks. WebMCP adds to the human UI; it doesn't replace it.

## 2. The current API (use exactly this)

```js
// Feature detection. document.modelContext is current; navigator.modelContext is a
// deprecated alias still present in older Chromium builds.
const modelContext = document.modelContext ?? navigator.modelContext;
if (modelContext && 'registerTool' in modelContext) {
  const controller = new AbortController();
  await modelContext.registerTool(
    {
      name: 'search_products',                 // snake_case, verb-first, unique per document
      title: 'Search products',                // optional, shown to the user in the browser's UI; localise it
      description: 'Search the catalog by keyword. Returns matching products with id, name and price. Use this when the user asks for a kind of product.',
      inputSchema: {                           // REQUIRED, always a JSON Schema object
        type: 'object',
        properties: {
          query: { type: 'string', description: 'A keyword or short phrase, e.g. "denim", not the whole user sentence.' },
        },
        required: ['query'],
      },
      async execute({ query }, { signal }) {   // signal aborts if the agent cancels
        const results = await searchProducts(query, { signal }); // reuse existing app code
        return { query, resultCount: results.length, results };
      },
      annotations: { readOnlyHint: true },
    },
    { signal: controller.signal },             // abort() unregisters the tool
  );
}
```

**Interface summary** (from the spec IDL):

- **Methods on `document.modelContext`:**
  - `registerTool(tool, { signal, exposedTo? })` returns `Promise<undefined>`;
  - `getTools({ fromOrigins? })` and `executeTool(registeredTool, input, { signal })` are for agents written in page JavaScript.
- **Events:**
  - `toolchange`: a tool was registered or unregistered;
  - `toolactivated`: a tool started running;
  - `toolcancel`: the agent cancelled a call.
- **`annotations`:** `readOnlyHint`, `untrustedContentHint`, `consequentialHint`, `debugging`. All default to false.
- **Secure contexts only:** HTTPS, or `localhost` during development.

**When `registerTool` rejects:**
- the name is already registered;
- the name or description is empty;
- the schema is invalid;
- the `tools` permissions policy is disabled, which gives `NotAllowedError`.

**Do NOT use these removed or deprecated calls.** Older tutorials, and possibly your training data, still show them:
- `navigator.modelContext.provideContext()`
- `clearContext()`
- `unregisterTool()`: abort the signal instead
- event-style `toolcall` handlers

## 3. Required setup

- **Headers.** WebMCP needs an origin-isolated document. Send these explicitly so a later change can't silently disable it:
  - `Origin-Agent-Cluster: ?1`. Never send `?0`, and don't rely on `document.domain`.
  - `Permissions-Policy: tools=(self)`. This also blocks cross-origin iframes. Use `allow="tools"` on an iframe only to delegate deliberately.

  On Netlify:

  ```toml
  [[headers]]
    for = "/*"
    [headers.values]
      Origin-Agent-Cluster = "?1"
      Permissions-Policy = "tools=(self)"
  ```
- **Progressive enhancement.** Always feature-detect. With WebMCP absent, the site must work exactly as before, with no errors and no broken UI.
- **TypeScript.** Type definitions are in the [`webmcp-types`](https://www.npmjs.com/package/webmcp-types) npm package.

## 4. Designing tools

**Pick the tools**
1. **Start with an inventory.** List the 3–5 most valuable things a user actually comes to the site to do, and the existing function or endpoint behind each. Only wrap capabilities that already exist. Don't invent new ones, and don't build a parallel API layer.
2. **One code path.** The UI and the tool call the same function. A tool is a thin wrapper, so a person and an agent can never be told different things.
3. **Keep the tool count small.** Every tool's name, description and schema costs tokens in the model's context on every turn. Five well-described tools beat twenty vague ones. Give each tool a single job, with no overlapping tools.
4. **Move large reference data into a tool.** Long catalogs or rules don't belong in descriptions; put them behind a read-only tool, for example `get_*_guide`, that the agent calls only when it needs them.

**Describe them**

5. **Naming.** Use snake_case and start with a verb: `get_profile`, `search_links`, `create_event`. Separate doing something now from starting a workflow: `create_event` books immediately, while `start_event_creation` opens the form.
6. **Descriptions are for the model.** They are its only signal for *when* to pick the tool, so say what it returns and when to use it rather than a sibling tool. Prefer positive phrasing ("Searches products by keyword") over prohibitions.
7. **Describe every schema property.** The per-field `description` is the highest-leverage text you write: it is how the agent knows to pass `"music"` and not the user's whole sentence. Use natural-language enum values (`"express"`), not internal IDs (`2`).
8. **Accept raw input.** Don't make the model do arithmetic, convert units or time zones, or reformat strings. Normalise in code.
9. **No arguments still needs a schema:** `{ type: 'object', properties: {} }`.

**Handle results and errors**

10. **Validate loosely in the schema and strictly in `execute`.** Strict schemas can make agents stall. Recheck preconditions at call time too, because app state can change between discovery and the call.
11. **Throw errors that explain how to retry.** A thrown message reaches the model, so `"message is required and must be 1-280 characters"` gets a correct retry and `"Error: 400"` gets a dead end. If the action can't be done, say what the user must do in the UI.
12. **Return compact, self-describing data.** Return objects, not bare arrays: `{ query, resultCount: 0, results: [] }` reads as an answer, while `[]` looks like a failure. Leave out internal fields the model doesn't need.

## 5. Annotations and writes

- **Read-only tools set `readOnlyHint: true`.** Agents call them freely.
- **Writes leave `readOnlyHint` out.** Its absence signals a side effect, and that is what makes agents confirm with the user before calling. Write the description to back this up: "Messages are public and permanent, so confirm the exact wording with the user before calling this."
- **Set `consequentialHint: true`** for significant, real-world or irreversible actions: payments, deletions, sending messages to third parties, bookings.
- **Set `untrustedContentHint: true`** when the output contains third-party or user-generated content the model shouldn't treat as instructions.
- **For high-stakes data, prefer staging over committing.** The tool prepares the change and shows it in the UI, and the human presses the final button. Health, financial and legal data are examples.
- **Keep the visible UI in sync.** The user watches while the agent works, so every state-changing tool updates the UI right away. Use your state store, or dispatch a `CustomEvent` on `document` that the UI listens to.

## 6. Registration patterns

- **Simple app:** register every tool once at startup, from one module such as `src/webmcp.js`, and `await` each `registerTool`.
- **Single-page app with routes:** register a route's tools when it mounts and abort its controller when it unmounts, so the agent only sees actions that are valid now.
- **Report what happened.** Registration should return a result instead of throwing out of startup:

  ```js
  export async function registerTools(tools) {
    const modelContext = document.modelContext ?? navigator.modelContext;
    if (!modelContext || !('registerTool' in modelContext)) return { supported: false, registered: [], error: null };
    const controller = new AbortController();
    try {
      for (const tool of tools) await modelContext.registerTool(tool, { signal: controller.signal });
      return { supported: true, registered: tools.map((t) => t.name), error: null, controller };
    } catch (error) {
      controller.abort(); // don't leave a half-registered set behind
      return { supported: true, registered: [], error: error.message };
    }
  }
  ```

- **React:** register in a `useEffect` that aborts on cleanup. This also handles StrictMode's double mount without duplicate-name errors. Handlers should read the latest state through refs, so tools are registered once and not again on every render. Change a tool's metadata (name, description, schema) only by aborting and registering again.
- **Visible status:** show a small indicator, only when WebMCP is detected, saying how many tools registered or the registration error. It makes the integration verifiable.

## 7. Limits to design around *(volatile)*

- **No file or binary inputs or outputs yet** (spec issues #41, #86). An agent can't hand your page a PDF or image. For document-driven features, let the **agent** read the file with its own vision or OCR and call your tool with **structured data** that matches your schema.
- **No `outputSchema`** (#9), **no in-place `updateTool()`** (#167), **no streaming or progress** (#82), and **no built-in user-confirmation API** (#165). Use descriptions, annotations and UI review instead.
- **Navigation:** a tool that navigates to another document may lose its response (#135). Keep tool flows inside the single-page app when possible.
- **The declarative `<form toolname tooldescription>` API** is still being explored and isn't in the spec. Don't depend on it.

## 8. Security and privacy

- **A tool declaration is a hint to a cooperative agent, never a security boundary.** Enforce limits, authorisation and validation in the code the tool calls, and on the server for anything stored server-side, exactly as for the HTML form path.
- **Treat tool input as untrusted.** It may come from prompt-injected content the agent read: a PDF, a web page or an email. Apply size limits, whitelist fields and escape on render. Render with `textContent` or a framework that escapes; never use `innerHTML`.
- **Expose only what's needed.** Read tools hand data to the agent and its provider. For sensitive data, make them opt-in.
- **Leave out destructive or outward-facing tools** (delete, share, pay) unless they are central to the use case. When you do add them, use `consequentialHint` and a confirmation step in the UI.
- **Ask the model not to send identifiers it doesn't need,** for example in a description, and enforce it in code.

## 9. Browser support and testing *(volatile)*

| Where | Status (Oct 2026) |
|---|---|
| ChatGPT Desktop, ChatGPT in-app browser | Supported, no setup needed |
| Chrome 149+ | Origin trial. Locally, enable `chrome://flags/#enable-webmcp-testing` and relaunch |
| Edge 150+ | Origin trial |
| Brave (Leo) | Experimental |
| Firefox, Safari | Not implemented (standards positions open) |

To reach users in Chrome or Edge without the flag, register for the origin trial and add `<meta http-equiv="origin-trial" content="TOKEN">`. Tokens are tied to the production origin.

**How to verify:**
1. **Manual:** in Chrome 149+ with the flag on, install the **Model Context Tool Inspector** extension (see Chrome's WebMCP guide). It lists the tools, validates their schemas and calls them with your own arguments.
2. **Unit:** mock `document.modelContext` with an object that records `registerTool` calls. Then check that:
   - the schemas are valid;
   - `execute` gives the right results;
   - bad input throws actionable errors;
   - aborting the signal unregisters the tools.
3. **Agent smoke test:** have an agent use **only the tools**, with no DOM reading and no simulated clicks, and report each result word for word:
   1. list the tools with their schemas;
   2. call each read tool;
   3. call each write tool, then read the data back to confirm the change landed;
   4. call a tool with invalid input on purpose and quote the error.
4. **Fallback:** in a browser without WebMCP, the site works unchanged and no WebMCP UI appears.

## 10. Checklist

- [ ] Inventory written: the 3–5 tools, each mapped to existing code
- [ ] One module registers the tools; it detects `document.modelContext ?? navigator.modelContext` and checks `registerTool`
- [ ] Every tool has a snake_case verb-first name, a model-facing description and an object `inputSchema` with a description on every property
- [ ] Reads have `readOnlyHint: true`; writes have no `readOnlyHint`; irreversible actions have `consequentialHint: true`
- [ ] `execute` reuses app code, validates strictly, throws retryable errors and returns self-describing objects
- [ ] State-changing tools update the visible UI right away
- [ ] Unregistration uses `AbortController`; no `provideContext`, `clearContext` or `unregisterTool`
- [ ] `Origin-Agent-Cluster: ?1` and `Permissions-Policy: tools=(self)` headers are sent
- [ ] A visible status indicator shows tools registered or the error; the site works unchanged without WebMCP
- [ ] Verified with the Tool Inspector, unit tests and an agent smoke test
