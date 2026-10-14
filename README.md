# VSLab42

Compare your lab results over time and with friends. Built with Vite, React, Chart.js (react-chartjs-2), lucide icons and i18next (English / Spanish).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
npm run deploy   # build + publish to Netlify production
npm test         # unit tests (node --test)
```

The app shows its version (from `package.json`) in the footer and the settings menu. Bump it with `npm version patch|minor|major` before deploying.

## How it works

- **Import**: VSLab42 only accepts structured JSON. The Import page gives you a prompt to copy, links to ChatGPT and Gemini, and a place to paste or upload the JSON the AI returns. In a browser with an AI agent, the agent can do all of that for you (see [AI agents](#ai-agents-webmcp)). You can store up to 10 lab results.
- **Storage**: everything stays in `localStorage` in your browser. Nothing is sent to a server.
- **Reference standards**: Longevity, your lab's own ranges, PSAP (ACCP), IFCC, ADA, ACC/AHA, ATA, KDIGO and WHO. These live in `src/data/standards.js`. If a standard doesn't cover a biomarker, VSLab42 uses conventional reference ranges for it and marks it in the UI.
- **Score**: Optimal 100, In range 75, Borderline 45, Out of range 15. The global score is the average across biomarkers.
- **Sharing**: you share one lab result at a time. *Create link* uploads it to a Netlify Function, which stores it in Netlify Blobs, and gives you a short link (`/#s=<guid>`). Your friend has **24 hours** to open it; once opened, the result is saved in their browser. If the share service can't be reached, the app offers an offline link instead, with the data compressed inside the URL (`#share=…`).
- **Exports**: PDF report, CSV and JSON. Every card can also copy its data (as TSV) or an image to the clipboard.

## AI agents (WebMCP)

In browsers with [WebMCP](https://github.com/webmachinelearning/webmcp), the page registers tools an AI agent in the browser can call. That covers ChatGPT Desktop and ChatGPT's in-app browser, plus Chrome 149+ and Edge 150+ through an origin trial. The user attaches their lab report in the agent's chat and asks it to import it, with no prompt to copy and no JSON to paste. The footer shows how many tools registered.

| Tool | What it does |
|---|---|
| `get_lab_import_guide` | Extraction rules and the biomarker catalog: codes, units and conversions. It shares its text with the copy/paste prompt. |
| `import_lab_results` | Validates the extracted data with `parseLabJson` and opens it on the Import review step. **Only the user can save it**, by pressing Import. |
| `list_lab_results` | Own and friends' results, with scores and ids. |
| `get_lab_result` | One result in full, optionally filtered by status. |
| `get_biomarker_history` | Readings over time and the trend for the given biomarkers. |
| `compare_lab_results` | Head-to-head comparison of two results. |

The tools live in `src/lib/webmcp.js`, the read-tool data in `src/lib/agentData.js`, and registration in `src/hooks/useWebMcp.js`. To try them locally:
1. In Chrome 149+, enable `chrome://flags/#enable-webmcp-testing` and relaunch.
2. Run `npm run dev`.
3. Use the Model Context Tool Inspector extension to list and call the tools.

For production in Chrome and Edge without the flag, add the origin-trial tokens in `index.html`; the comment there says how. `netlify.toml` sends the `Origin-Agent-Cluster` and `Permissions-Policy: tools=(self)` headers WebMCP needs. Design notes are in `docs/webmcp-import-plan.md`.

## Netlify (share service)

- `netlify/functions/share.mjs`: `POST /api/share` stores a result and returns `{ id, expiresAt }`; `GET /api/share/:id` returns it (404 if unknown, 410 if expired).
- `netlify/functions/cleanup-shares.mjs`: scheduled `@hourly`, deletes blobs older than 24 hours (`SHARE_TTL_HOURS` in `src/lib/shareSchema.js`) so the free-plan storage stays small.
- Blobs are stored in the `shared-results` store under `YYYY-MM-DD/HH/<guid>` (UTC creation hour). A lookup checks the hour folders from newest to oldest, at most the last 25.
- The payload format and its validation are in `src/lib/shareSchema.js`, used by both the browser and the function.

Deploy from your machine with `npm run deploy`. It runs `netlify deploy --build --prod` through `npx`, which builds the site and functions with the `netlify.toml` settings and publishes them to production. The first time, sign in and link the folder to your site with `npx netlify-cli login` and `npx netlify-cli link` (or `npx netlify-cli init` to create a new site).

Or deploy by connecting the repo to Netlify (`netlify.toml` sets the build, publish directory and functions). Blobs need no setup. For local development with the API, use the Netlify CLI: `npx netlify dev` (http://localhost:8888). Plain `npm run dev` works too, but sharing then falls back to offline links.

## Social previews

`index.html` has Open Graph and Twitter tags pointing at `public/og-image.png` (1200×630, dark). Crawlers need absolute URLs, so `%SITE_URL%` is filled in at build time from Netlify's `URL` variable. Set `SITE_URL` to override it, e.g. for a custom domain. To change the image or the touch icon, edit the SVG in `scripts/build-og.mjs` and run `npm run og`.

Code map: `src/data` (biomarker catalog, standards, AI prompt, sample data), `src/lib` (evaluation, validation, sharing, exports), `src/views`, `src/charts`, `src/i18n`.

> Educational tool, not a medical device. The ranges are simplified adaptations of public guidelines.
