import { BIOMARKERS } from './biomarkers.js';

export const AI_LINKS = {
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/app',
};

const catalog = BIOMARKERS.filter((m) => !m.derived).map((m) => `- ${m.code} | ${m.name.en} | ${m.unit} | ${m.aliases || ''}`).join('\n');

export const AI_PROMPT = `You are a meticulous clinical-data extraction assistant. I attached a PDF (or photos) of my laboratory blood/urine test report. Extract every numeric biomarker result and normalize it for the app "VSLab42".

Return ONLY valid JSON inside a single \`\`\`json code block — no explanations before or after.

SCHEMA
{
  "schema": "vslab.v1",
  "date": "YYYY-MM-DD",
  "lab": "Laboratory name",
  "patient": { "sex": "male" | "female" | null, "birthYear": number | null },
  "results": [
    {
      "code": "ldl",
      "name": "LDL cholesterol",
      "value": 112,
      "unit": "mg/dL",
      "ref": { "low": null, "high": 129 },
      "originalValue": "2.9 mmol/L"
    }
  ]
}

RULES
1. "date" is the sample collection date (use the report date if missing).
2. Map each test to a canonical code from the list below and CONVERT the value AND the reference range to the canonical unit. Conversion hints are given next to each code. Keep the original value and unit as text in "originalValue".
3. If a test has no canonical code, still include it with a short snake_case code prefixed with "x_" (e.g. "x_ldh"), keeping its original unit.
4. "value" must be a JSON number with "." as decimal separator. For results such as "<0.5", use 0.5 and add "qualifier": "<".
5. "ref" is the laboratory reference interval printed on the report (null for a missing bound). Omit "ref" if none is printed.
6. If non-HDL cholesterol is not reported but total and HDL cholesterol are, compute non_hdl = total_cholesterol − hdl.
   For the white-cell differential (neutrophils, lymphocytes, monocytes, eosinophils, basophils) use ABSOLUTE counts in 10³/µL; if only percentages are printed, compute absolute = % × WBC ÷ 100.
7. PRIVACY: do NOT include the patient's name, document numbers, addresses or any identifiers.
8. Never invent or estimate values. Skip anything unreadable.
9. If the report contains results for several collection dates (historical columns), return a JSON array with one object per date.

CANONICAL CODES (code | name | unit | aliases & conversions)
${catalog}`;
