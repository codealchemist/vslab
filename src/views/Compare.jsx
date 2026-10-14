import { useMemo, useRef, useState } from 'react';
import { Swords, Crown, Trophy, Share2, Sparkles, Upload, FileText, Sheet, Trash2, Equal, Info, Eye, SearchX, Check, Download, Copy, ClipboardCopy, Image as ImageIcon } from 'lucide-react';
import { useApp } from '../context.jsx';
import { compareResults, pairDiff } from '../lib/evaluate.js';
import { CATEGORIES } from '../data/biomarkers.js';
import { fmtDate, fmtNum, fmtPct, beyondText } from '../lib/format.js';
import { toTsv, copyText, copyNodeImage } from '../lib/clipboard.js';
import { downloadFile, exportPdfReport, nodeToPng, toCsv } from '../lib/export.js';
import { sampleFriend } from '../data/sample.js';
import { MAX_FRIENDS } from '../lib/storage.js';
import { ScoreRing, StatusPill, InfoButton, SectionActions, useConfirm, Panel } from '../components/ui.jsx';
import { useInfo } from '../components/info.jsx';
import ShareDialog from '../components/ShareDialog.jsx';
import ResultToolbar from '../components/ResultToolbar.jsx';
import OptionsModal from '../components/OptionsModal.jsx';
import CategoryChart from '../charts/CategoryChart.jsx';

/** "7 · 20 · 0": wins for the left side, ties, wins for the right side, in each side's colour. */
function WinCount({ wins }) {
  const { t } = useApp();
  return (
    <span className="cb-mid num" title={`${wins.a} – ${wins.tie} – ${wins.b} · ${t('compare.winsCount')}`}>
      <b className="win-a">{wins.a}</b>
      <span className="muted">{wins.tie}</span>
      <b className="win-b">{wins.b}</b>
    </span>
  );
}

/** Small diff line under the left value in the head-to-head table. */
const Diff = ({ d }) => <span className={`h2h-diff num ${d.className}`} title={d.title}>{d.text}</span>;

export default function Compare() {
  const { t, lang, results, friends, setFriends, standard, sexOverride, username, route, go, openModal, settings, updateSettings } = useApp();
  const info = useInfo();
  const confirm = useConfirm();
  const versusRef = useRef(null);
  const chartRef = useRef(null);
  const tableRef = useRef(null);
  const [filter, setFilter] = useState('all');
  // Quick filters for the head-to-head table: a search and the categories to show (empty = all).
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState(() => new Set());
  const [optionsOpen, setOptionsOpen] = useState(false);
  // Left result minus right result, under the left value; in % or in the biomarker's unit (remembered).
  // How far a value is past its limit is already in the status pills.
  const diffUnit = settings.compareDiffUnit === 'value' ? 'value' : 'pct';
  const [aId, setAId] = useState(null);
  const [bKey, setBKey] = useState(route.opponent || null);

  const me = username || t('common.you');
  const a = results.find((r) => r.id === aId) || results.at(-1);
  const options = [
    ...friends.map((f) => ({ key: `f:${f.id}`, result: f.result, label: f.sharedBy || t('compare.they'), friend: f })),
    ...results.filter((r) => r.id !== a?.id).map((r) => ({ key: `m:${r.id}`, result: r, label: `${me} · ${fmtDate(r.date, lang)}` })),
  ];
  const b = options.find((o) => o.key === bKey) || options[0];

  const cmp = useMemo(
    () => (a && b ? compareResults(a, b.result, standard.id, sexOverride, b.friend ? null : sexOverride) : null),
    [a, b, standard.id, sexOverride]
  );

  if (!results.length) {
    return (
      <div className="card empty fade-in" style={{ marginTop: 32 }}>
        <div className="empty-icon"><Swords size={30} /></div>
        <h2>{t('compare.needYours')}</h2>
        <button className="btn primary" onClick={() => go('import')}><Upload size={15} /> {t('overview.importCta')}</button>
      </div>
    );
  }

  // Against a friend the sides are people; against yourself they are dates ("Latest" vs "Jun 2026").
  const selfMatch = b && !b.friend;
  const latestId = results.at(-1)?.id;
  const dateLabel = (r, full) =>
    r.id === latestId ? t('compare.latest') : fmtDate(r.date, lang, full ? undefined : { year: 'numeric', month: 'short' });
  let nameA = me;
  let nameB = b?.label;
  if (selfMatch) {
    nameA = dateLabel(a);
    nameB = dateLabel(b.result);
    if (nameA === nameB) {
      nameA = dateLabel(a, true);
      nameB = dateLabel(b.result, true);
    }
  }

  const head = (
    <div className="page-head">
      <div>
        <h1>{t('compare.title')}</h1>
        <p>{t('compare.subtitle')}</p>
      </div>
      <button className="btn" onClick={() => openModal(<ShareDialog result={a} />)}>
        <Share2 size={15} /> {t('compare.shareYours')}
      </button>
    </div>
  );

  if (!b) {
    return (
      <div className="fade-in">
        {head}
        <div className="card empty">
          <div className="empty-icon"><Swords size={30} /></div>
          <h2>{t('compare.noOpponent')}</h2>
          <p>{t('compare.noOpponentBody')}</p>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => openModal(<ShareDialog result={a} />)}><Share2 size={15} /> {t('compare.shareYours')}</button>
            <button className="btn" onClick={() => setFriends((fs) => [...fs, sampleFriend()].slice(-MAX_FRIENDS))}><Sparkles size={15} /> {t('compare.sampleFriend')}</button>
          </div>
        </div>
      </div>
    );
  }

  const cats = CATEGORIES.filter((c) => cmp.common.a.byCategory[c] != null || cmp.common.b.byCategory[c] != null);
  // How many categories each side scores higher in (collapsed category panel).
  const catLead = { a: 0, b: 0, even: 0 };
  cats.forEach((c) => {
    const d = (cmp.common.a.byCategory[c] ?? -1) - (cmp.common.b.byCategory[c] ?? -1);
    catLead[d > 0 ? 'a' : d < 0 ? 'b' : 'even']++;
  });
  // Categories in this comparison, with how many shared biomarkers each has. A category picked for a
  // previous opponent that this one lacks is ignored rather than hiding everything.
  const rowCats = CATEGORIES.map((c) => [c, cmp.rows.filter((r) => r.meta.cat === c).length]).filter(([, n]) => n);
  const activeCats = rowCats.map(([c]) => c).filter((c) => catFilter.has(c));
  const query = q.trim().toLowerCase();
  const focused = cmp.rows.filter(
    (r) =>
      (!activeCats.length || activeCats.includes(r.meta.cat)) &&
      (!query || `${r.meta.name.en} ${r.meta.name.es} ${r.code}`.toLowerCase().includes(query))
  );
  const focusedWins = { a: 0, b: 0, tie: 0 };
  focused.forEach((r) => focusedWins[r.winner]++);
  const clearFocus = () => {
    setQ('');
    setCatFilter(new Set());
    setFilter('all');
  };
  const rows = focused.filter((r) => filter === 'all' || r.winner === filter);
  const winnerName = cmp.overall === 'a' ? nameA : nameB;
  // Default names need their own phrasing ("You win", not "You wins").
  const winsText = (name, filter) =>
    name === t('common.you')
      ? t(filter ? 'compare.filterYouWin' : 'compare.youWin')
      : name === t('compare.they')
        ? t(filter ? 'compare.filterTheyWin' : 'compare.theyWin')
        : t(filter ? 'compare.filterWins' : 'compare.wins', { name });
  // Labels of the filters in effect, shown next to "Showing x of y" in the toolbar.
  const activeFilters = [
    ...(filter === 'all' ? [] : [filter === 'tie' ? t('compare.filterTie') : winsText(filter === 'a' ? nameA : nameB, true)]),
    ...activeCats.map((c) => t(`cat.${c}`)),
  ];

  const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±');
  const fmtDiff = ({ delta, pct }) =>
    diffUnit === 'pct' ? (pct == null ? '—' : `${sign(pct)}${fmtPct(Math.abs(pct), lang)}%`) : `${sign(delta)}${fmtNum(Math.abs(delta), lang, 3)}`;
  const diffTitle = t('compare.diffPairTitle', { a: nameA, b: nameB });
  /** A row's diff, as { text, className, title }: green when the left value is closer to optimal. */
  const diffOf = (r) => {
    const d = pairDiff(r.a, r.b);
    return { text: fmtDiff(d), className: `trend-${d.trend}`, title: diffTitle };
  };

  const tableData = () => [
    [t('common.biomarker'), nameA, '', nameB, '', t('common.unit'), '', `${nameA} − ${nameB}`],
    ...rows.map((r) => [
      r.meta.name[lang] || r.meta.name.en,
      fmtNum(r.a.value, lang, 3),
      t(`status.${r.a.status}`) + (r.a.beyond ? ` (${beyondText(r.a.beyond, t, lang)})` : ''),
      fmtNum(r.b.value, lang, 3),
      t(`status.${r.b.status}`) + (r.b.beyond ? ` (${beyondText(r.b.beyond, t, lang)})` : ''),
      r.a.unit,
      r.winner === 'tie' ? t('common.tie') : r.winner === 'a' ? nameA : nameB,
      diffOf(r).text,
    ]),
  ];

  const exportPdf = async () => {
    const d = tableData();
    const chartNode = chartRef.current;
    await exportPdfReport({
      filename: `vslab42-compare-${a.date}.pdf`,
      title: `VSLab42 · ${t('compare.title')}`,
      subtitle: `${nameA} (${fmtDate(a.date, lang)}) vs ${nameB} (${fmtDate(b.result.date, lang)}) · ${standard.short}`,
      sections: [
        {
          title: cmp.overall === 'tie' ? t('compare.tie') : winsText(winnerName),
          kv: [
            [`${nameA} · ${t('common.globalScore')}`, `${cmp.common.a.score ?? '—'} / 100`],
            [`${nameB} · ${t('common.globalScore')}`, `${cmp.common.b.score ?? '—'} / 100`],
            [t('compare.winsCount'), `${cmp.wins.a} – ${cmp.wins.b} (${t('common.tie')}: ${cmp.wins.tie})`],
          ],
          text: t('compare.fairNote'),
        },
        ...(chartNode ? [{ title: t('compare.byCategory'), image: { dataUrl: await nodeToPng(chartNode), ratio: chartNode.offsetWidth / chartNode.offsetHeight } }] : []),
        { title: t('compare.headToHead'), table: { head: d[0], body: d.slice(1) } },
      ],
      footer: t('footer.disclaimer'),
    });
  };

  const Side = ({ who, name, result, score, color, person }) => (
    <div className="versus-side">
      {cmp.overall === who && <Crown size={22} className="crown" style={{ top: -18 }} />}
      <ScoreRing score={score} size={132} color={color} sub={t('common.score')} />
      <div className="who"><span className="swatch" style={{ background: color }} />{name}</div>
      <div className="tiny muted">{person ? `${person} · ` : ''}{fmtDate(result.date, lang)}{result.lab ? ` · ${result.lab}` : ''}</div>
    </div>
  );

  return (
    <div className="fade-in">
      {head}

      <Panel
        id="compare.pick"
        defaultCollapsed
        style={{ marginBottom: 16 }}
        title={<h3>{t('compare.pickTitle')}</h3>}
        summary={
          <span className="cmp-pick">
            <span className="cmp-pick-side"><span className="swatch" style={{ background: 'var(--you)' }} /><b>{nameA}</b> <span className="muted">{fmtDate(a.date, lang)}</span></span>
            <span className="muted">vs</span>
            <span className="cmp-pick-side"><span className="swatch" style={{ background: 'var(--them)' }} /><b>{nameB}</b> <span className="muted">{fmtDate(b.result.date, lang)}</span></span>
          </span>
        }
      >
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div>
            <label className="label">{t('compare.yours')}</label>
            <select className="select" value={a.id} onChange={(e) => setAId(e.target.value)}>
              {[...results].reverse().map((r) => (
                <option key={r.id} value={r.id}>{fmtDate(r.date, lang)}{r.lab ? ` · ${r.lab}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('compare.opponent')}</label>
            <div className="row">
              <select className="select grow" value={b.key} onChange={(e) => setBKey(e.target.value)}>
                {friends.length > 0 && (
                  <optgroup label={t('compare.friends')}>
                    {options.filter((o) => o.friend).map((o) => (
                      <option key={o.key} value={o.key}>{t('compare.friendOf', { name: o.label })} · {fmtDate(o.result.date, lang)}</option>
                    ))}
                  </optgroup>
                )}
                {options.some((o) => !o.friend) && (
                  <optgroup label={t('compare.mine')}>
                    {options.filter((o) => !o.friend).map((o) => (
                      <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              {b.friend && (
                <button className="icon-btn" title={t('sharedView.view')} aria-label={t('sharedView.view')} onClick={() => go('shared', { friendId: b.friend.id })}>
                  <Eye size={16} />
                </button>
              )}
              {b.friend && (
                <button
                  className="icon-btn"
                  title={t('compare.removeFriend')}
                  aria-label={t('compare.removeFriend')}
                  onClick={() => confirm(t('compare.removeFriend') + '?', () => { setFriends((fs) => fs.filter((f) => f.id !== b.friend.id)); setBKey(null); })}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
        {!friends.length && (
          <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setFriends((fs) => [...fs, sampleFriend()])}>
            <Sparkles size={13} /> {t('compare.sampleFriend')}
          </button>
        )}
      </Panel>

      <Panel
        ref={versusRef}
        id="compare.score"
        defaultCollapsed
        style={{ marginBottom: 16 }}
        title={<h2>{t('common.globalScore')} <InfoButton onClick={info.score} /></h2>}
        actions={
          <SectionActions
            targetRef={versusRef}
            getRows={() => toTsv([[nameA, cmp.common.a.score], [nameB, cmp.common.b.score], [t('compare.winsCount'), `${cmp.wins.a}-${cmp.wins.b}-${cmp.wins.tie}`]])}
            exports={[{ label: t('common.exportPdf'), icon: FileText, run: exportPdf }]}
          />
        }
        summary={
          // Both sides' scores, wins – ties – wins, and the winner.
          <div className="compare-bar">
            <div className="cb-side">
              <span className="swatch" style={{ background: 'var(--you)' }} />
              <span className="cb-name">{nameA}</span>
              <b className="num">{cmp.common.a.score ?? '—'}</b>
              {cmp.overall === 'a' && <Crown size={14} className="cb-crown" aria-label={winsText(nameA)} />}
            </div>
            <WinCount wins={cmp.wins} />
            <div className="cb-side cb-right">
              {cmp.overall === 'b' && <Crown size={14} className="cb-crown" aria-label={winsText(nameB)} />}
              <b className="num">{cmp.common.b.score ?? '—'}</b>
              <span className="cb-name">{nameB}</span>
              <span className="swatch" style={{ background: 'var(--them)' }} />
            </div>
          </div>
        }
      >
        <div className="versus" style={{ paddingTop: 14 }}>
          <Side who="a" name={nameA} result={a} score={cmp.common.a.score} color="var(--you)" person={selfMatch ? me : null} />
          <div className="versus-mid">
            <div className="vs-badge">VS</div>
            <div className="winner-banner">
              {cmp.overall === 'tie' ? <Equal size={16} /> : <Trophy size={16} />}
              {cmp.overall === 'tie' ? t('compare.tie') : winsText(winnerName)}
            </div>
            <div className="wins">
              <span><b className="num win-a">{cmp.wins.a}</b> {t('compare.winsCount')}</span>
              <span><b className="num">{cmp.wins.tie}</b> {t('common.tie').toLowerCase()}</span>
              <span><b className="num win-b">{cmp.wins.b}</b> {t('compare.winsCount')}</span>
            </div>
            <span className="tiny muted">{t('compare.shared', { count: cmp.rows.length })}</span>
          </div>
          <Side who="b" name={nameB} result={b.result} score={cmp.common.b.score} color="var(--them)" person={selfMatch ? me : null} />
        </div>
        <p className="tiny muted" style={{ textAlign: 'center', marginTop: 16 }}>
          <Info size={12} style={{ verticalAlign: '-2px' }} /> {t('compare.fairNote')}
        </p>
      </Panel>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
        {cats.length > 0 && (
          <Panel
            ref={chartRef}
            id="compare.categories"
        defaultCollapsed
            title={<h3>{t('compare.byCategory')} <span className="badge">0–100 {t('compare.pts')}</span></h3>}
            summary={
              <>
                <span className="muted">{t('compare.catsAhead')}</span>
                <span className="win-a"><b className="num">{catLead.a}</b> {nameA}</span>
                <span className="win-b"><b className="num">{catLead.b}</b> {nameB}</span>
                {catLead.even > 0 && <span className="muted">= {catLead.even}</span>}
              </>
            }
            actions={
              <div className="row" style={{ gap: 14 }}>
                <div className="legend">
                  <span><i style={{ background: 'var(--you)' }} />{nameA}</span>
                  <span><i style={{ background: 'var(--them)' }} />{nameB}</span>
                </div>
                <SectionActions
                  targetRef={chartRef}
                  getRows={() => toTsv([['', nameA, nameB], ...cats.map((c) => [t(`cat.${c}`), cmp.common.a.byCategory[c] ?? '', cmp.common.b.byCategory[c] ?? ''])])}
                />
              </div>
            }
          >
            <div className="chart-box" style={{ height: Math.max(180, cats.length * 46) }}>
              <CategoryChart categories={cats} a={cmp.common.a.byCategory} b={cmp.common.b.byCategory} labelA={nameA} labelB={nameB} />
            </div>
          </Panel>
        )}

        <Panel ref={tableRef} id="compare.h2h" collapsible={false} title={<h3>{t('compare.headToHead')}</h3>}>
          {/* Search stays in view; categories, winner, diff unit and export live in the options dialog. */}
          <ResultToolbar
            q={q}
            setQ={setQ}
            activeFilters={activeFilters}
            optionsCount={activeCats.length + (filter !== 'all' ? 1 : 0)}
            onOpenOptions={() => setOptionsOpen(true)}
            shown={rows.length}
            total={cmp.rows.length}
            onClearAll={clearFocus}
          />
          {optionsOpen && (
            <OptionsModal
              onClose={() => setOptionsOpen(false)}
              filterHint={t('options.compareFilterHint')}
              catCounts={rowCats}
              catFilter={catFilter}
              setCatFilter={setCatFilter}
              activeCount={activeCats.length + (filter !== 'all' ? 1 : 0)}
              onClearFilters={() => {
                setCatFilter(new Set());
                setFilter('all');
              }}
              filterExtra={
                <>
                  <div className="options-group">
                    <span className="label">{t('compare.winner')}</span>
                    <div className="row wrap" style={{ gap: 6 }} role="radiogroup" aria-label={t('compare.winner')}>
                      {[['all', t('compare.filterAll'), focused.length], ['a', winsText(nameA, true), focusedWins.a], ['b', winsText(nameB, true), focusedWins.b], ['tie', t('compare.filterTie'), focusedWins.tie]].map(([k, l, n]) => (
                        <button key={k} role="radio" aria-checked={filter === k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
                          {filter === k && <Check size={12} />}
                          {k === 'a' && <span className="win-a">●</span>}
                          {k === 'b' && <span className="win-b">●</span>}
                          {l} <span className="tiny muted">{n}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="options-group">
                    <span className="label">{t('compare.diff')}</span>
                    <div className="row wrap" style={{ gap: 10 }}>
                      <div className="segmented" role="radiogroup" aria-label={t('compare.diffUnit')}>
                        {[['pct', '%'], ['value', t('common.value')]].map(([u, label]) => (
                          <button key={u} role="radio" aria-checked={diffUnit === u} className={diffUnit === u ? 'active' : ''} onClick={() => updateSettings({ compareDiffUnit: u })}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <span className="tiny muted">{diffTitle}</span>
                    </div>
                  </div>
                </>
              }
              exportHint={t('options.compareExportHint')}
              exports={[
                { label: t('common.exportPdf'), hint: t('options.comparePdfHint'), icon: FileText, trailIcon: Download, done: t('toast.exported'), run: exportPdf },
                { label: t('common.exportCsv'), hint: t('options.compareCsvHint'), icon: Sheet, trailIcon: Download, done: t('toast.exported'), run: () => downloadFile(`vslab42-compare-${a.date}.csv`, toCsv(tableData()), 'text/csv;charset=utf-8') },
                { label: t('options.copyRows'), hint: t('options.copyRowsHint'), icon: Copy, trailIcon: ClipboardCopy, done: t('common.copied'), run: () => copyText(toTsv(tableData())) },
                { label: t('common.copyImage'), hint: t('options.copyImageHint'), icon: ImageIcon, trailIcon: ClipboardCopy, done: t('common.copied'), run: () => copyNodeImage(tableRef.current) },
              ]}
            />
          )}
          {/* Phones hide the column headings, so this says which side is whose. */}
          <div className="h2h-legend small">
            <span><span className="win-a">●</span> {nameA}</span>
            <span className="muted">vs</span>
            <span>{nameB} <span className="win-b">●</span></span>
          </div>
          <div className="table-wrap h2h-wrap">
            <table className="table h2h-table">
              <thead>
                <tr>
                  <th>{t('common.biomarker')}</th>
                  <th style={{ textAlign: 'right' }}><span className="win-a">●</span> {nameA}</th>
                  <th />
                  <th style={{ textAlign: 'center' }} />
                  <th style={{ textAlign: 'right' }}><span className="win-b">●</span> {nameB}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code} className="h2h-row">
                    <td className="h-name">
                      <button className="marker-name" onClick={() => info.biomarker(r.a)}>
                        {r.meta.name[lang] || r.meta.name.en} <Info size={13} data-no-capture />
                      </button>
                      <span className="tiny muted">{r.a.unit}</span>
                    </td>
                    <td className="h-av" style={{ textAlign: 'right' }}><span className="value">{fmtNum(r.a.value, lang)}</span><Diff d={diffOf(r)} /></td>
                    <td className="h-ap"><StatusPill status={r.a.status} compact beyond={r.a.beyond} /></td>
                    <td className="win-cell h-win">
                      {r.winner === 'tie' ? <Equal size={15} className="muted" aria-label={t('common.tie')} /> : <Trophy size={15} className={r.winner === 'a' ? 'win-a' : 'win-b'} aria-label={r.winner === 'a' ? nameA : nameB} />}
                    </td>
                    <td className="h-bv" style={{ textAlign: 'right' }}><span className="value">{fmtNum(r.b.value, lang)}</span></td>
                    <td className="h-bp"><StatusPill status={r.b.status} compact beyond={r.b.beyond} /></td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr className="empty-row">
                    <td colSpan={6}>
                      <SearchX size={22} className="muted" />
                      <p className="muted">{t('detail.noMatch')}</p>
                      <button className="btn sm" onClick={clearFocus}>{t('detail.clearFilters')}</button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
