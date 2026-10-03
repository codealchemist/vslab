import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, Share2, Info, Trash2, Calculator, Mars, Venus, ArrowLeftRight, SearchX, Pencil, LayoutGrid, Radar, Image as ImageIcon } from 'lucide-react';
import { useApp } from '../context.jsx';
import { evaluateResult } from '../lib/evaluate.js';
import { fmtDate, fmtNum, fmtRange } from '../lib/format.js';
import { toTsv, copyNodeImage, SQUARE_STYLE } from '../lib/clipboard.js';
import { resultRows } from '../lib/reports.js';
import { ScoreRing, StatusPill, RangeBar, InfoButton, useDeleteResult } from '../components/ui.jsx';
import ResultToolbar from '../components/ResultToolbar.jsx';
import ResultOptionsModal from '../components/ResultOptionsModal.jsx';
import ResultEditor from '../components/ResultEditor.jsx';
import ResultSummaryCard from '../components/ResultSummaryCard.jsx';
import ResultSnapshotCard from '../components/ResultSnapshotCard.jsx';
import CategoryRadar, { categoryChartHeight } from '../charts/CategoryRadar.jsx';
import { useInfo } from '../components/info.jsx';
import ShareDialog from '../components/ShareDialog.jsx';

/**
 * Detail page for one lab result. Your own results get Share / Delete; a friend's result
 * (`shared` = { by, actions, notice }) is read-only, uses the sex from their report and shows `shared.actions`.
 */
export default function ResultDetail({ result, shared }) {
  const { t, lang, standard, sexOverride: ownSex, go, openModal, setResults, toast, settings, updateSettings } = useApp();
  const [editing, setEditing] = useState(false);
  const snapshotRef = useRef(null);
  // Categories view (desktop): the gauge is centred in the free space between the content edge and
  // the radar's visible left edge, which only the chart knows (see CategoryRadar onExtent).
  const heroRef = useRef(null);
  const radarBoxRef = useRef(null);
  const [gaugeX, setGaugeX] = useState(null);
  const placeGauge = (chartLeft) => {
    const hero = heroRef.current;
    const box = radarBoxRef.current;
    if (!hero || !box) return;
    const freeSpace = box.getBoundingClientRect().left - hero.getBoundingClientRect().left + chartLeft;
    setGaugeX(Math.round(freeSpace / 2));
  };
  const heroView = settings.heroView === 'categories' ? 'categories' : 'status';
  const copySnapshot = async () => {
    try {
      await copyNodeImage(snapshotRef.current, undefined, SQUARE_STYLE);
      toast(t('common.copied'));
    } catch (e) {
      console.error(e);
      toast(t('toast.copyFailed'), 'error');
    }
  };
  // Ranges follow your setting (or the sharer's report); the header badge switches them for this view only.
  const [sexView, setSexView] = useState(null);
  const sexOverride = sexView ?? (shared ? null : ownSex);
  const info = useInfo();
  const deleteResult = useDeleteResult();
  const [q, setQ] = useState('');
  // null (all) | a status | 'flagged' (borderline + out). Clicking the active filter again clears it.
  const [statusFilter, setStatusFilter] = useState(null);
  // Categories to show (empty = all), set from the options dialog.
  const [catFilter, setCatFilter] = useState(() => new Set());
  const [optionsOpen, setOptionsOpen] = useState(false);
  const toggleFilter = (f) => setStatusFilter((cur) => (cur === f ? null : f));
  const ev = useMemo(() => evaluateResult(result, standard.id, sexOverride), [result, standard.id, sexOverride]);

  const visible = ev.items.filter((i) => {
    const name = `${i.meta.name.en} ${i.meta.name.es} ${i.code}`.toLowerCase();
    return (
      (!q || name.includes(q.toLowerCase())) &&
      (!catFilter.size || catFilter.has(i.meta.cat)) &&
      (!statusFilter || (statusFilter === 'flagged' ? i.status === 'borderline' || i.status === 'out' : i.status === statusFilter))
    );
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

  const activeFilters = [
    ...(statusFilter ? [statusFilter === 'flagged' ? t('common.flaggedOnly') : t(`status.${statusFilter}`)] : []),
    ...[...catFilter].map((c) => t(`cat.${c}`)),
  ];
  const clearAll = () => {
    setQ('');
    setStatusFilter(null);
    setCatFilter(new Set());
  };
  const toggleCat = (c) =>
    setCatFilter((cur) => {
      const n = new Set(cur);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });
  const tileActive = (s) => statusFilter === s || (statusFilter === 'flagged' && (s === 'borderline' || s === 'out'));

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
          <p className="row wrap" style={{ gap: 6 }}>
            <span>{result.lab || t('detail.title')} · {t('overview.markers', { count: result.results.length })} ·</span>
            <button
              className="sex-switch"
              onClick={() => setSexView(ev.sex === 'male' ? 'female' : 'male')}
              title={t('detail.switchSex', { sex: t(ev.sex === 'male' ? 'detail.female' : 'detail.male').toLowerCase() })}
            >
              {ev.sex === 'female' ? <Venus size={13} /> : <Mars size={13} />}
              {t(ev.sex === 'female' ? 'detail.rangesFemale' : 'detail.rangesMale')}
              <ArrowLeftRight size={11} className="muted" />
            </button>
            {result.sample && <span className="badge">{t('common.sample')}</span>}
          </p>
        </div>
        {shared ? (
          <div className="row wrap">{shared.actions}</div>
        ) : (
          <div className="row wrap">
            <button className="btn" onClick={() => setEditing(true)} disabled={editing}>
              <Pencil size={15} /> {t('edit.button')}
            </button>
            <button className="btn" onClick={() => openModal(<ShareDialog result={result} />)} disabled={editing}>
              <Share2 size={15} /> {t('common.share')}
            </button>
            <button className="btn ghost danger" onClick={() => deleteResult(result, () => go('overview'))}>
              <Trash2 size={15} /> {t('common.delete')}
            </button>
          </div>
        )}
      </div>
      {shared?.notice}

      {editing ? (
        <ResultEditor
          result={result}
          onCancel={() => setEditing(false)}
          onSave={(updated) => {
            setResults((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
            setEditing(false);
            toast(t('edit.saved'));
          }}
        />
      ) : (

      <div className="card">
        <div className="hero-bar">
          <div className="segmented" role="radiogroup" aria-label={t('detail.view')}>
            {[['status', LayoutGrid], ['categories', Radar]].map(([v, Icon]) => (
              <button key={v} role="radio" aria-checked={heroView === v} className={heroView === v ? 'active' : ''} onClick={() => updateSettings({ heroView: v })}>
                <Icon size={13} /> {t(`detail.view_${v}`)}
              </button>
            ))}
          </div>
          <button className="btn sm hero-copy" onClick={copySnapshot} title={t(`detail.copy_${heroView}`)} aria-label={t('common.copyImage')}>
            <ImageIcon size={14} /> <span className="hide-phone">{t('common.copyImage')}</span>
          </button>
        </div>
        <div
          ref={heroRef}
          className={`hero ${heroView === 'categories' ? 'hero-categories' : ''}`}
          style={{ marginBottom: 20, ...(gaugeX != null && { '--gauge-x': `${gaugeX}px` }) }}
        >
          <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
            <ScoreRing score={ev.score} size={128} sub={standard.short} />
            <button className="btn ghost sm" onClick={info.score} data-no-capture>
              <Info size={13} /> {t('common.globalScore')}
            </button>
          </div>
          {heroView === 'categories' ? (
            <div className="hero-radar">
              <div className="tiny muted summary-chart-title">{t('compare.byCategory')} · 0–100 {t('compare.pts')}</div>
              <div ref={radarBoxRef} style={{ position: 'relative', height: categoryChartHeight(Object.keys(ev.byCategory).length) }}>
                <CategoryRadar byCategory={ev.byCategory} selected={catFilter} onToggle={toggleCat} onExtent={placeGauge} />
              </div>
              <div className="tiny muted hero-radar-hint">
                {catFilter.size ? (
                  <>
                    {t('detail.radarFiltered', { count: catFilter.size })}{' '}
                    <button className="link-btn" onClick={() => setCatFilter(new Set())}>{t('detail.clearFilters')}</button>
                  </>
                ) : (
                  t('detail.radarHint')
                )}
              </div>
            </div>
          ) : (
          <div className="hero-stats">
            {['optimal', 'normal', 'borderline', 'out'].map((s) => (
              <button
                key={s}
                className={`stat stat-filter s-${s} ${tileActive(s) ? 'active' : ''} ${statusFilter && !tileActive(s) ? 'dimmed' : ''}`}
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
          )}
        </div>

        {/* Off-screen card that the copy button turns into an image (phone-screen sized). */}
        <div className="offscreen" aria-hidden="true">
          {heroView === 'categories' ? (
            <ResultSummaryCard ref={snapshotRef} result={result} ev={ev} by={shared?.by} />
          ) : (
            <ResultSnapshotCard ref={snapshotRef} result={result} ev={ev} by={shared?.by} />
          )}
        </div>

        <ResultToolbar
          q={q}
          setQ={setQ}
          activeFilters={activeFilters}
          optionsCount={catFilter.size + (statusFilter === 'flagged' ? 1 : 0)}
          onOpenOptions={() => setOptionsOpen(true)}
          shown={visible.length}
          total={ev.items.length}
          onClearAll={clearAll}
        />
        {optionsOpen && (
          <ResultOptionsModal
            onClose={() => setOptionsOpen(false)}
            result={result}
            ev={ev}
            by={shared?.by}
            catFilter={catFilter}
            setCatFilter={setCatFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            getRows={() => toTsv(resultRows({ items: visible }, t, lang))}
          />
        )}

        <div className="table-wrap result-wrap">
          <table className="table result-table">
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
                    <td className="c-name">
                      <button className="marker-name" onClick={() => info.biomarker(row)}>
                        {row.meta.name[lang] || row.meta.name.en}
                        <Info size={13} data-no-capture />
                      </button>
                      {row.edited && <span className="badge edited-badge" style={{ marginLeft: 6 }} title={t('edit.aiRead', { value: row.aiValue })}><Pencil size={10} /> {t('edit.edited')}</span>}
                      {row.manual && <span className="badge edited-badge" style={{ marginLeft: 6 }} title={t('edit.addedManually')}><Pencil size={10} /> {t('edit.added')}</span>}
                      {row.derived && <span className="badge" style={{ marginLeft: 6 }} title={t('common.calculatedFrom', { formula: row.meta.derived.formula[lang] || row.meta.derived.formula.en })}><Calculator size={11} /> {t('common.calculated')}</span>}
                    </td>
                    <td className="c-value" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span className="value">{row.qualifier || ''}{fmtNum(row.value, lang)}</span>
                      <span className="unit">{row.unit}</span>
                    </td>
                    <td className="c-bar"><RangeBar value={row.value} range={row.range} status={row.status} /></td>
                    <td className="c-ref num small text-2" style={{ whiteSpace: 'nowrap' }} title={row.source === 'fallback' ? t('standard.fallbackNote', { std: standard.short }) : undefined}>
                      <span className="mobile-label">{t('common.range')}: </span>
                      {fmtRange(row.range, lang)}
                      {row.source === 'fallback' && <span className="fallback-dot" />}
                    </td>
                    <td className="c-status"><StatusPill status={row.status} dir={row.dir} beyond={row.beyond} /></td>
                  </tr>
                )
              )}
              {!visible.length && (
                <tr className="empty-row">
                  <td colSpan={5}>
                    <SearchX size={22} className="muted" />
                    <p className="muted">{t('detail.noMatch')}</p>
                    <button className="btn sm" onClick={clearAll}>{t('detail.clearFilters')}</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="tiny muted" style={{ marginTop: 12 }}>
          <span className="fallback-dot" style={{ marginRight: 6 }} />
          {t('standard.fallbackNote', { std: standard.short })}
        </p>
      </div>
      )}
    </div>
  );
}
