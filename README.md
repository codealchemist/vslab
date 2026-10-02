# VSLab

Compare your lab results over time and with friends. Built with Vite, React, Chart.js (react-chartjs-2), lucide icons and i18next (English / Spanish).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## How it works

- **Import**: VSLab only accepts structured JSON. The Import page gives you a prompt to copy, links to ChatGPT and Gemini, and a place to paste or upload the JSON the AI returns. You can store up to 10 lab results.
- **Storage**: everything stays in `localStorage` in your browser. Nothing is sent to a server.
- **Reference standards**: Longevity, your lab's own ranges, PSAP (ACCP), IFCC, ADA, ACC/AHA, ATA, KDIGO and WHO. These live in `src/data/standards.js`. If a standard doesn't cover a biomarker, VSLab uses conventional reference ranges for it and marks it in the UI.
- **Score**: Optimal 100, In range 75, Borderline 45, Out of range 15. The global score is the average across biomarkers.
- **Sharing**: you share one lab result at a time. *Create link* uploads it to a Netlify Function, which stores it in Netlify Blobs, and gives you a short link (`/#s=<guid>`). Your friend has **1 hour** to open it; once opened, the result is saved in their browser. If the share service can't be reached, the app offers an offline link instead, with the data compressed inside the URL (`#share=…`).
- **Exports**: PDF report, CSV and JSON. Every card can also copy its data (as TSV) or an image to the clipboard.

## Netlify (share service)

- `netlify/functions/share.mjs`: `POST /api/share` stores a result and returns `{ id, expiresAt }`; `GET /api/share/:id` returns it (404 if unknown, 410 if expired).
- `netlify/functions/cleanup-shares.mjs`: scheduled `@hourly`, deletes blobs older than 1 hour so the free-plan storage stays small.
- Blobs are stored in the `shared-results` store under `YYYY-MM-DD/HH/<guid>` (UTC creation hour). A lookup only checks the current and previous hour folders.
- The payload format and its validation are in `src/lib/shareSchema.js`, used by both the browser and the function.

Deploy by connecting the repo to Netlify (`netlify.toml` sets the build, publish directory and functions). Blobs need no setup. For local development with the API, use the Netlify CLI: `npx netlify dev` (http://localhost:8888). Plain `npm run dev` works too, but sharing then falls back to offline links.

Code map: `src/data` (biomarker catalog, standards, AI prompt, sample data), `src/lib` (evaluation, validation, sharing, exports), `src/views`, `src/charts`, `src/i18n`.

> Educational tool, not a medical device. The ranges are simplified adaptations of public guidelines.
