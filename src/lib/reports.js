import { fmtDate, fmtNum, fmtRange, beyondText } from './format.js';
import { downloadFile, exportPdfReport, toCsv } from './export.js';
import { BIOMARKERS, withDerived } from '../data/biomarkers.js';

const nameOf = (item, lang) => item.meta.name[lang] || item.meta.name.en;

export function resultRows(ev, t, lang) {
  return [
    [t('common.biomarker'), t('common.value'), t('common.unit'), t('common.range'), t('common.optimal'), t('common.status')],
    ...ev.items.map((i) => [
      nameOf(i, lang),
      fmtNum(i.value, lang, 3),
      i.unit,
      fmtRange(i.range, lang),
      fmtRange(i.range, lang, 'optimal'),
      t(`status.${i.status}`) +
        (i.beyond ? ` (${beyondText(i.beyond, t, lang)})` : i.dir && i.status !== 'optimal' ? ` (${t(`status.${i.dir}`)})` : ''),
    ]),
  ];
}

export function exportResultPdf(result, ev, standard, t, lang, chartImage) {
  const rows = resultRows(ev, t, lang);
  return exportPdfReport({
    filename: `vslab42-${result.date}.pdf`,
    title: `VSLab42 · ${t('detail.title')} ${fmtDate(result.date, lang)}`,
    subtitle: `${result.lab || ''}  ·  ${t('standard.label')}: ${standard.short} (${standard.org[lang] || standard.org.en})`,
    sections: [
      {
        title: t('common.globalScore'),
        kv: [
          [t('common.globalScore'), `${ev.score ?? '—'} / 100`],
          [t('status.optimal'), String(ev.counts.optimal)],
          [t('status.normal'), String(ev.counts.normal)],
          [t('status.borderline'), String(ev.counts.borderline)],
          [t('status.out'), String(ev.counts.out)],
        ],
      },
      ...(chartImage ? [{ title: '', image: chartImage }] : []),
      { title: t('common.biomarkers'), table: { head: rows[0], body: rows.slice(1), statusCol: 5, statuses: ev.items.map((i) => i.status) } },
    ],
    footer: t('footer.disclaimer'),
  });
}

export function exportResultCsv(result, ev, t, lang) {
  downloadFile(`vslab42-${result.date}.csv`, toCsv(resultRows(ev, t, lang)), 'text/csv;charset=utf-8');
}

export function exportResultJson(result) {
  const { id, importedAt, sample, ...clean } = result;
  downloadFile(`vslab42-${result.date}.json`, JSON.stringify({ schema: 'vslab.v1', ...clean }, null, 2), 'application/json');
}

const signed = (v, lang) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtNum(Math.abs(v), lang, 3)}`;

/** Wide table: one row per biomarker, one column per lab date. withDiff appends the change vs the previous reading. */
export function timelineRows(rawResults, codes, t, lang, withDiff = false) {
  const results = rawResults.map(withDerived);
  const byCode = Object.fromEntries(BIOMARKERS.map((m) => [m.code, m]));
  return [
    [t('common.biomarker'), t('common.unit'), ...results.map((r) => r.date)],
    ...codes.map((c) => {
      const m = byCode[c];
      return [
        m ? m.name[lang] || m.name.en : c,
        m?.unit || '',
        ...results.map((r, i) => {
          const v = r.results.find((e) => e.code === c)?.value;
          if (!Number.isFinite(v)) return '';
          const prev = withDiff
            ? results.slice(0, i).reverse().map((p) => p.results.find((e) => e.code === c)?.value).find(Number.isFinite)
            : undefined;
          return fmtNum(v, lang, 3) + (Number.isFinite(prev) ? ` (${signed(v - prev, lang)})` : '');
        }),
      ];
    }),
  ];
}
