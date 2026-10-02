import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, Share2, Search, FileText, Sheet, FileJson, Info, Trash2, Calculator, X } from 'lucide-react';
import { useApp } from '../context.jsx';
import { evaluateResult } from '../lib/evaluate.js';
import { fmtDate, fmtNum, fmtRange } from '../lib/format.js';
import { toTsv } from '../lib/clipboard.js';
import { exportResultCsv, exportResultJson, exportResultPdf, resultRows } from '../lib/reports.js';
import { ScoreRing, StatusPill, RangeBar, InfoButton, SectionActions, useDeleteResult } from '../components/ui.jsx';
import { useInfo } from '../components/info.jsx';
import ShareDialog from '../components/ShareDialog.jsx';

/**
 * Detail page for one lab result. Your own results get Share / Delete; a friend's result
 * (`shared` = { by, actions, notice }) is read-only, uses the sex from their report and shows `shared.actions`.
 */
export default function ResultDetail({ result, shared }) {
  const { t, lang, standard, sexOverride: ownSex, go, openModal } = useApp();
  const sexOverride = shared ? null : ownSex;
  const info = useInfo();
  const deleteResult = useDeleteResult();
  const [q, setQ] = useState('');
  // null (all) | a status | 'flagged' (borderline + out). Clicking the active filter again clears it.
  const [statusFilter, setStatusFilter] = useState(null);
  const toggleFilter = (f) => setStatusFilter((cur) => (cur === f ? null : f));
  const tableRef = useRef(null);
  const ev = useMemo(() => evaluateResult(result, standard.id, sexOverride), [result, standard.id, sexOverride]);

  const visible = ev.items.filter((i) => {
    const name = `${i.meta.name.en} ${i.meta.name.es} ${i.code}`.toLowerCase();
    return (!q || name.includes(q.toLowerCase())) && (!statusFilter ||
        (statusFilter === 'flagged' ? i.status === 'borderline' || i.status === 'out' : i.status === statusFilter));
  });

  const rowsWithCats = [];
  let lastCat = null;
  visible.forEach((i) => {
    if (i.meta.cat !== lastCat) {
      rowsWithCats.push({ cat: i.meta.cat });
      lastCat = i.meta.cat;
    }
    rowsWithCats.push(i);
  });

  const exports = [
    { label: t('common.exportPdf'), icon: FileText, run: () => exportResultPdf(result, ev, standard, t, lang) },
    { label: t('common.exportCsv'), icon: Sheet, run: () => exportResultCsv(result, ev, t, lang) },
    { label: t('common.exportJson'), icon: FileJson, run: () => exportResultJson(result) },
  ];

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <button className="btn ghost sm" onClick={() => go('overview')} style={{ marginLeft: -10, marginBottom: 8 }}>
            <ChevronLeft size={15} /> {t('common.back')}
          </button>
          {shared && (
            <div className="wizard-kicker" style={{ marginBottom: 4 }}>
              {shared.by ? t('sharedView.sharedBy', { name: shared.by }) : t('sharedView.sharedAnon')}
            </div>
          )}
          <div className="row">
            <h1>{fmtDate(result.date, lang, { year: 'numeric', month: 'long', day: 'numeric' })}</h1>
            <InfoButton onClick={() => info.labTest(result, ev)} label={t('detail.about')} />
          </div>
          <p>
            {result.lab || t('detail.title')} · {t('overview.markers', { count: result.results.length })}
            {result.sample && <span className="badge" style={{ marginLeft: 8 }}>{t('common.sample')}</span>}
          </p>
        </div>
        {shared ? (
          <div className="row wrap">{shared.actions}</div>
        ) : (
          <div className="row wrap">
            <button className="btn" onClick={() => openModal(<ShareDialog result={result} />)}>
              <Share2 size={15} /> {t('common.share')}
            </button>
            <button className="btn ghost danger" onClick={() => deleteResult(result, () => go('overview'))}>
              <Trash2 size={15} /> {t('common.delete')}
            </button>
          </div>
        )}
      </div>
      {shared?.notice}

      <div className="card" ref={tableRef}>
        <div className="hero" style={{ marginBottom: 20 }}>
          <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
            <ScoreRing score={ev.score} size={128} sub={standard.short} />
            <button className="btn ghost sm" onClick={info.score} data-no-capture>
              <Info size={13} /> {t('common.globalScore')}
            </button>
          </div>
          <div className="hero-stats">
            {['optimal', 'normal', 'borderline', 'out'].map((s) => (
              <button
                key={s}
                className={`stat stat-filter s-${s} ${statusFilter === s ? 'active' : ''} ${statusFilter && statusFilter !== s ? 'dimmed' : ''}`}
                onClick={() => toggleFilter(s)}
                disabled={!ev.counts[s]}
                aria-pressed={statusFilter === s}
                title={statusFilter === s ? t('detail.clearFilter') : t('detail.filterBy', { status: t(`status.${s}`) })}
              >
                <div className="stat-v">{ev.counts[s]}</div>
                <div className="stat-l"><StatusPill status={s} /></div>
              </button>
            ))}
          </div>
        </div>

        <div className="card-head">
          <div className="row wrap grow">
            <div className="search grow" style={{ maxWidth: 320 }} data-no-capture>
              <Search size={15} />
              <input className="input" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button className={`chip ${statusFilter === 'flagged' ? 'on' : ''}`} onClick={() => toggleFilter('flagged')} aria-pressed={statusFilter === 'flagged'} data-no-capture>
              {t('common.flaggedOnly')} · {ev.counts.borderline + ev.counts.out}
            </button>
            {statusFilter && statusFilter !== 'flagged' && (
              <button className="chip on" onClick={() => setStatusFilter(null)} data-no-capture>
                {t(`status.${statusFilter}`)} · {ev.counts[statusFilter]} <X size={12} />
              </button>
            )}
            <span className="tiny muted">{t('detail.rangesFor')}: {t(`detail.${ev.sex}`)}</span>
          </div>
          <SectionActions targetRef={tableRef} getRows={() => toTsv(resultRows({ items: visible }, t, lang))} exports={exports} />
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.biomarker')}</th>
                <th style={{ textAlign: 'right' }}>{t('common.value')}</th>
                <th style={{ minWidth: 150 }} />
                <th>{t('common.range')}</th>
                <th>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rowsWithCats.map((row) =>
                row.cat && !row.code ? (
                  <tr key={`c-${row.cat}`} className="cat-row">
                    <td colSpan={5}>{t(`cat.${row.cat}`)}</td>
                  </tr>
                ) : (
                  <tr key={row.code}>
                    <td>
                      <button className="marker-name" onClick={() => info.biomarker(row)}>
                        {row.meta.name[lang] || row.meta.name.en}
                        <Info size={13} data-no-capture />
                      </button>
                      {row.derived && <span className="badge" style={{ marginLeft: 6 }} title={t('common.calculatedFrom', { formula: row.meta.derived.formula[lang] || row.meta.derived.formula.en })}><Calculator size={11} /> {t('common.calculated')}</span>}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span className="value">{row.qualifier || ''}{fmtNum(row.value, lang)}</span>
                      <span className="unit">{row.unit}</span>
                    </td>
                    <td><RangeBar value={row.value} range={row.range} status={row.status} /></td>
                    <td className="num small text-2" style={{ whiteSpace: 'nowrap' }} title={row.source === 'fallback' ? t('standard.fallbackNote', { std: standard.short }) : undefined}>
                      {fmtRange(row.range, lang)}
                      {row.source === 'fallback' && <span className="fallback-dot" />}
                    </td>
                    <td><StatusPill status={row.status} dir={row.dir} beyond={row.beyond} /></td>
                  </tr>
                )
              )}
              {!visible.length && (
                <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 28 }}>{t('detail.noMatch')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="tiny muted" style={{ marginTop: 12 }}>
          <span className="fallback-dot" style={{ marginRight: 6 }} />
          {t('standard.fallbackNote', { std: standard.short })}
        </p>
      </div>
    </div>
  );
}
