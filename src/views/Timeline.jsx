import { useMemo, useRef, useState } from 'react';
import { ChartLine, FileText, Sheet, X, Upload, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Minus, GitCompareArrows, Search, Calculator } from 'lucide-react';
import { useApp } from '../context.jsx';
import { evaluateResult, diffTrend } from '../lib/evaluate.js';
import { CATEGORIES, getBiomarker } from '../data/biomarkers.js';
import { fmtDate, fmtNum } from '../lib/format.js';
import { toTsv } from '../lib/clipboard.js';
import { downloadFile, exportPdfReport, nodeToPng, toCsv } from '../lib/export.js';
import { timelineRows } from '../lib/reports.js';
import { InfoButton, SectionActions, StatusPill, STATUS_VAR } from '../components/ui.jsx';
import { useInfo } from '../components/info.jsx';
import BiomarkerChart from '../charts/BiomarkerChart.jsx';

function ChartCard({ code, points, registerNode }) {
  const { t, lang } = useApp();
  const info = useInfo();
  const ref = useRef(null);
  const meta = getBiomarker(code, points[0]);
  const last = points.at(-1);
  return (
    <div
      className="card"
      ref={(n) => {
        ref.current = n;
        registerNode(code, n);
      }}
    >
      <div className="card-head" style={{ marginBottom: 8 }}>
        <div>
          <h3>
            {meta.name[lang] || meta.name.en}
            <InfoButton onClick={() => info.biomarker(last.item)} />
          </h3>
          <div className="row small" style={{ gap: 8, marginTop: 2 }}>
            <span className="value" style={{ fontSize: 15 }}>{fmtNum(last.value, lang)}</span>
            <span className="unit" style={{ marginLeft: -4 }}>{meta.unit}</span>
            <StatusPill status={last.status} dir={last.dir} beyond={last.item.beyond} />
          </div>
        </div>
        <SectionActions
          targetRef={ref}
          getRows={() => toTsv([[meta.name[lang] || meta.name.en, meta.unit], ...points.map((p) => [p.date, p.value])])}
        />
      </div>
      <div className="chart-box">
        <BiomarkerChart points={points} unit={meta.unit} />
      </div>
    </div>
  );
}

function DiffTag({ diff }) {
  const { t, lang } = useApp();
  const Icon = diff.delta > 0 ? ArrowUp : diff.delta < 0 ? ArrowDown : Minus;
  const color = diff.trend === 'better' ? 'var(--good)' : diff.trend === 'worse' ? 'var(--crit)' : 'var(--muted)';
  const sign = diff.delta > 0 ? '+' : diff.delta < 0 ? '−' : '±';
  return (
    <div className="diff-tag" title={t(`timeline.trend.${diff.trend}`)}>
      <Icon size={11} style={{ color }} strokeWidth={2.5} aria-label={t(`timeline.trend.${diff.trend}`)} />
      {sign}{fmtNum(Math.abs(diff.delta), lang)}
      {diff.pct != null && Number.isFinite(diff.pct) && <span className="muted"> ({sign}{fmtNum(Math.abs(diff.pct), lang, 0)}%)</span>}
    </div>
  );
}

export default function Timeline() {
  const { t, lang, results, standard, sexOverride, go } = useApp();
  const evals = useMemo(() => results.map((r) => evaluateResult(r, standard.id, sexOverride)), [results, standard.id, sexOverride]);
  const nodes = useRef({});
  const tableRef = useRef(null);

  // code -> [{ date, value, status, range, item }]
  const series = useMemo(() => {
    const map = {};
    evals.forEach((ev, i) =>
      ev.items.forEach((item) => {
        (map[item.code] ||= []).push({ idx: i, date: results[i].date, value: item.value, status: item.status, dir: item.dir, range: item.range, item, name: item.name, unit: item.unit });
      })
    );
    return map;
  }, [evals, results]);

  const suggested = useMemo(() => {
    const latest = evals.at(-1);
    if (!latest) return [];
    const rank = { out: 0, borderline: 1, normal: 2, optimal: 3, unknown: 4 };
    return latest.items
      .filter((i) => (series[i.code]?.length || 0) >= 2)
      .sort((a, b) => rank[a.status] - rank[b.status])
      .slice(0, 4)
      .map((i) => i.code);
  }, [evals, series]);

  const [picked, setPicked] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [openCats, setOpenCats] = useState(() => new Set());
  const [showDiff, setShowDiff] = useState(false);
  const toggleCat = (cat) =>
    setOpenCats((s) => {
      const n = new Set(s);
      n.has(cat) ? n.delete(cat) : n.add(cat);
      return n;
    });
  const selected = (picked ?? suggested).filter((c) => series[c]);

  const byCat = useMemo(() => {
    const groups = {};
    Object.keys(series).forEach((c) => {
      const m = getBiomarker(c, series[c][0]);
      (groups[m.cat] ||= []).push(m);
    });
    return CATEGORIES.filter((c) => groups[c]).map((c) => [c, groups[c]]);
  }, [series]);

  const toggle = (code) =>
    setPicked((p) => {
      const cur = p ?? suggested;
      return cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
    });

  /** Select or clear every biomarker of a category at once. */
  const setCategory = (codes, on) =>
    setPicked((p) => {
      const cur = (p ?? suggested).filter((c) => !codes.includes(c));
      return on ? [...cur, ...codes] : cur;
    });

  const [query, setQuery] = useState('');
  const fold = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const matches = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return null;
    return byCat.flatMap(([cat, list]) =>
      list
        .filter((m) => [m.name.en, m.name.es, m.code, m.aliases].some((x) => fold(x).includes(q)))
        .map((m) => ({ m, cat }))
    );
  }, [query, byCat]);

  const renderChip = (m) => {
    const last = series[m.code].at(-1);
    const on = selected.includes(m.code);
    return (
      <button key={m.code} className={`chip ${on ? 'on' : ''}`} onClick={() => toggle(m.code)} aria-pressed={on}>
        <span className="dot" style={{ background: STATUS_VAR[last.status] }} />
        {m.name[lang] || m.name.en}
        {m.derived && <Calculator size={11} className="muted" aria-label={t('common.calculated')} />}
        <span className="tiny muted">{series[m.code].length}</span>
      </button>
    );
  };

  if (!results.length) {
    return (
      <div className="card empty fade-in" style={{ marginTop: 32 }}>
        <div className="empty-icon"><ChartLine size={30} /></div>
        <h2>{t('timeline.needTwo')}</h2>
        <button className="btn primary" onClick={() => go('import')}><Upload size={15} /> {t('overview.importCta')}</button>
      </div>
    );
  }

  const rows = () => timelineRows(results, selected, t, lang, showDiff);

  const exportPdf = async () => {
    const images = [];
    for (const code of selected) {
      const node = nodes.current[code];
      if (!node) continue;
      images.push({
        title: '',
        image: { dataUrl: await nodeToPng(node), ratio: node.offsetWidth / node.offsetHeight },
      });
    }
    const r = rows();
    await exportPdfReport({
      filename: `vslab-timeline-${new Date().toISOString().slice(0, 10)}.pdf`,
      title: `VSLab · ${t('timeline.title')}`,
      subtitle: `${t('standard.label')}: ${standard.short} · ${results.length} × ${t('overview.results').toLowerCase()}`,
      sections: [
        { title: t('timeline.scoreTrend'), kv: evals.map((ev, i) => [fmtDate(results[i].date, lang), `${ev.score ?? '—'} / 100`]) },
        { title: t('timeline.tableTitle'), table: { head: r[0], body: r.slice(1) } },
        ...images,
      ],
      footer: t('footer.disclaimer'),
    });
  };

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h1>{t('timeline.title')}</h1>
          <p>{t('timeline.subtitle')}</p>
        </div>
        <div className="legend">
          <span><i style={{ background: 'color-mix(in srgb, var(--good) 22%, transparent)' }} />{t('timeline.optimalBand')}</span>
          <span><i style={{ background: 'color-mix(in srgb, var(--normal) 18%, transparent)' }} />{t('timeline.rangeBand')}</span>
          {['optimal', 'normal', 'borderline', 'out'].map((s) => (
            <span key={s}><i style={{ background: STATUS_VAR[s], width: 8, borderRadius: 8 }} />{t(`status.${s}`)}</span>
          ))}
        </div>
      </div>

      {results.length < 2 && <div className="notice" style={{ marginBottom: 16 }}><ChartLine size={16} />{t('timeline.needTwo')}</div>}

      <div className="card picker" style={{ marginBottom: 16 }}>
        <div className="card-head" style={{ marginBottom: panelOpen ? 12 : 0 }}>
          <button className="collapse-toggle" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen}>
            {panelOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <h3>{t('timeline.pick')}</h3>
            <span className="badge">{selected.length}</span>
          </button>
          <div className="row">
            <button className="btn ghost sm" onClick={() => setPicked(suggested)}>{t('timeline.suggested')}</button>
            <button className="btn ghost sm" onClick={() => setPicked([])}><X size={13} /> {t('timeline.clear')}</button>
          </div>
        </div>
        {selected.length > 0 && (
          <div className="row wrap" style={{ gap: 6, marginBottom: panelOpen ? 12 : 0, marginTop: panelOpen ? 0 : 12 }}>
            {selected.map((c) => {
              const m = getBiomarker(c, series[c][0]);
              return (
                <button key={c} className="chip on" onClick={() => toggle(c)} title={t('timeline.clear')}>
                  <span className="dot" style={{ background: STATUS_VAR[series[c].at(-1).status] }} />
                  {m.name[lang] || m.name.en}
                  <X size={12} />
                </button>
              );
            })}
          </div>
        )}
        {panelOpen && (
          <div className="search" style={{ marginBottom: 12, maxWidth: 360 }}>
            <Search size={15} />
            <input
              className="input"
              type="search"
              value={query}
              placeholder={t('timeline.searchAll', { count: Object.keys(series).length })}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              aria-label={t('common.search')}
            />
          </div>
        )}
        {panelOpen && matches && (
          <div className="row wrap" style={{ gap: 6 }}>
            {matches.length === 0 && <span className="small muted">{t('detail.noMatch')}</span>}
            {matches.map(({ m, cat }) => (
              <span key={m.code} className="row" style={{ gap: 4 }}>
                {renderChip(m)}
                <span className="tiny muted">{t(`cat.${cat}`)}</span>
              </span>
            ))}
          </div>
        )}
        {panelOpen && !matches && (
          <div className="cat-groups">
            {byCat.map(([cat, list]) => {
              const open = openCats.has(cat);
              const codes = list.map((m) => m.code);
              const count = codes.filter((c) => selected.includes(c)).length;
              const all = count === codes.length;
              return (
                <div key={cat} className={`cat-group ${open ? 'open' : ''}`}>
                  <div className="cat-group-head">
                    <button className="cat-group-toggle" onClick={() => toggleCat(cat)} aria-expanded={open}>
                      {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      <span className="grow">{t(`cat.${cat}`)}</span>
                      <span className={`badge ${count ? 'accent' : ''}`}>{count}/{codes.length}</span>
                    </button>
                    <button
                      className={`switch ${all ? 'on' : count ? 'some' : ''}`}
                      role="switch"
                      aria-checked={all}
                      aria-label={t(all ? 'timeline.categoryOff' : 'timeline.categoryOn', { cat: t(`cat.${cat}`) })}
                      title={t(all ? 'timeline.categoryOff' : 'timeline.categoryOn', { cat: t(`cat.${cat}`) })}
                      onClick={() => setCategory(codes, !all)}
                    >
                      <span className="knob" />
                    </button>
                  </div>
                  {open && <div className="row wrap cat-group-body">{list.map(renderChip)}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected.length === 0 ? (
        <div className="card empty"><p>{t('timeline.empty')}</p></div>
      ) : (
        <>
          <div className="grid grid-2">
            {selected.map((code) => (
              <ChartCard key={code} code={code} points={series[code]} registerNode={(c, n) => (nodes.current[c] = n)} />
            ))}
          </div>

          <div className="card" style={{ marginTop: 16 }} ref={tableRef}>
            <div className="card-head">
              <h3>{t('timeline.tableTitle')}</h3>
              <div className="row wrap">
              <button className={`chip ${showDiff ? 'on' : ''}`} onClick={() => setShowDiff((d) => !d)} aria-pressed={showDiff} data-no-capture>
                <GitCompareArrows size={14} /> {t('timeline.showDiff')}
              </button>
              <SectionActions
                targetRef={tableRef}
                getRows={() => toTsv(rows())}
                exports={[
                  { label: t('common.exportPdf'), icon: FileText, run: exportPdf },
                  { label: t('common.exportCsv'), icon: Sheet, run: () => downloadFile('vslab-timeline.csv', toCsv(rows()), 'text/csv;charset=utf-8') },
                ]}
              />
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.biomarker')}</th>
                    {results.map((r) => <th key={r.id} style={{ textAlign: 'right' }}>{fmtDate(r.date, lang, { year: '2-digit', month: 'short', day: 'numeric' })}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {selected.map((code) => {
                    const meta = getBiomarker(code, series[code][0]);
                    return (
                      <tr key={code}>
                        <td style={{ fontWeight: 520 }}>{meta.name[lang] || meta.name.en} <span className="unit">{meta.unit}</span></td>
                        {results.map((r, ri) => {
                          const p = series[code].find((x) => x.idx === ri);
                          const prev = p && series[code].filter((x) => x.idx < ri).at(-1);
                          const diff = showDiff && prev ? diffTrend(prev.value, p.value, p.range) : null;
                          return (
                            <td key={r.id} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {p ? (
                                <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                                  <span className="value">{fmtNum(p.value, lang)}</span>
                                  <span className="dot" style={{ width: 7, height: 7, borderRadius: 7, background: STATUS_VAR[p.status] }} title={t(`status.${p.status}`)} />
                                </span>
                              ) : <span className="muted">—</span>}
                              {diff && <DiffTag diff={diff} />}
                              {p && showDiff && !prev && <div className="diff-tag muted">{t('timeline.firstReading')}</div>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {showDiff && <p className="tiny muted" style={{ marginTop: 10 }}>{t('timeline.diffNote')}</p>}
          </div>
        </>
      )}
    </div>
  );
}
