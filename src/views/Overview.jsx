import { useMemo, useRef } from 'react';
import { Upload, Sparkles, Share2, Trash2, ArrowUpRight, ArrowDownRight, Minus, FlaskConical, Info, FileText, ChartLine, Users } from 'lucide-react';
import { useApp } from '../context.jsx';
import { evaluateResult } from '../lib/evaluate.js';
import { fmtDate } from '../lib/format.js';
import { MAX_RESULTS } from '../lib/storage.js';
import { sampleResults } from '../data/sample.js';
import { exportResultPdf } from '../lib/reports.js';
import { ScoreRing, StatusPill, InfoButton, SectionActions, STATUS_VAR, scoreStatus, useDeleteResult, useConfirm } from '../components/ui.jsx';
import { useInfo } from '../components/info.jsx';
import ShareDialog from '../components/ShareDialog.jsx';
import ScoreChart from '../charts/ScoreChart.jsx';
import ResultDetail from './ResultDetail.jsx';

function MixBar({ counts, total }) {
  return (
    <div className="mix" aria-hidden>
      {['optimal', 'normal', 'borderline', 'out'].map((s) =>
        counts[s] ? <span key={s} style={{ width: `${(counts[s] / total) * 100}%`, background: STATUS_VAR[s] }} /> : null
      )}
    </div>
  );
}

/** Card for one lab result (own or shared). `badges` and `actions` are extra nodes; actions don't open the card. */
function ResultCard({ result, ev, onOpen, badges, actions }) {
  const { t, lang } = useApp();
  const attention = ev.counts.borderline + ev.counts.out;
  return (
    <div className="card result-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="date">{fmtDate(result.date, lang)}</div>
          <div className="small muted">{result.lab || '—'}</div>
        </div>
        <ScoreRing score={ev.score} size={56} stroke={5} />
      </div>
      <MixBar counts={ev.counts} total={ev.items.length} />
      <div className="row between">
        <div className="row wrap" style={{ gap: 6 }}>
          {badges}
          <span className="badge">{t('overview.markers', { count: result.results.length })}</span>
          {attention > 0 && <span className="badge" style={{ color: 'var(--crit)' }}>{t('overview.attention', { count: attention })}</span>}
          {result.sample && <span className="badge accent">{t('common.sample')}</span>}
        </div>
        <div className="row" style={{ gap: 0 }} onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      </div>
    </div>
  );
}

/** Lab results friends shared with you: listed like imported ones (never mixed into your scores) until removed. */
function SharedSection() {
  const { t, friends, setFriends, standard, go } = useApp();
  const confirm = useConfirm();
  // Each result uses the sex from its own report, as on the shared view.
  const evals = useMemo(() => friends.map((f) => ({ friend: f, ev: evaluateResult(f.result, standard.id, null) })), [friends, standard.id]);
  if (!friends.length) return null;
  return (
    <>
      <div className="page-head" style={{ paddingTop: 36, paddingBottom: 14 }}>
        <h2 className="row" style={{ gap: 8 }}><Users size={18} className="muted" /> {t('overview.sharedTitle')}</h2>
        <span className="badge">{friends.length}</span>
      </div>
      <div className="grid grid-auto">
        {[...evals].sort((a, b) => b.friend.result.date.localeCompare(a.friend.result.date)).map(({ friend, ev }) => (
          <ResultCard
            key={friend.id}
            result={friend.result}
            ev={ev}
            onOpen={() => go('shared', { friendId: friend.id })}
            badges={<span className="badge accent">{friend.sharedBy ? t('overview.sharedBy', { name: friend.sharedBy }) : t('sharedView.sharedAnon')}</span>}
            actions={
              <button
                className="icon-btn"
                title={t('sharedView.remove')}
                aria-label={t('sharedView.remove')}
                onClick={() =>
                  confirm(t('sharedView.removeConfirm'), () => setFriends((fs) => fs.filter((f) => f.id !== friend.id)), { label: t('sharedView.remove') })
                }
              >
                <Trash2 size={16} />
              </button>
            }
          />
        ))}
      </div>
    </>
  );
}

function Empty() {
  const { t, go, setResults } = useApp();
  return (
    <div className="card empty fade-in" style={{ marginTop: 32 }}>
      <div className="empty-icon"><FlaskConical size={30} /></div>
      <h1>{t('overview.emptyTitle')}</h1>
      <p>{t('overview.emptyBody')}</p>
      <div className="row wrap" style={{ justifyContent: 'center', marginTop: 6 }}>
        <button className="btn primary lg" onClick={() => go('import')}>
          <Upload size={17} /> {t('overview.importCta')}
        </button>
        <button className="btn lg" onClick={() => setResults(sampleResults())}>
          <Sparkles size={17} /> {t('overview.sampleCta')}
        </button>
      </div>
    </div>
  );
}

export default function Overview() {
  const { t, lang, results, setResults, standard, sexOverride, route, go, openModal, toast } = useApp();
  const info = useInfo();
  const deleteResult = useDeleteResult();
  const heroRef = useRef(null);
  const trendRef = useRef(null);

  const evals = useMemo(
    () => results.map((r) => ({ result: r, ev: evaluateResult(r, standard.id, sexOverride) })),
    [results, standard.id, sexOverride]
  );

  const selected = route.resultId && results.find((r) => r.id === route.resultId);
  if (selected) return <ResultDetail result={selected} />;
  if (!results.length) {
    return (
      <>
        <Empty />
        <SharedSection />
      </>
    );
  }

  const latest = evals.at(-1);
  const prev = evals.at(-2);
  const delta = prev && latest.ev.score != null && prev.ev.score != null ? latest.ev.score - prev.ev.score : null;
  const cats = Object.entries(latest.ev.byCategory).sort((a, b) => b[1] - a[1]);
  const best = cats.slice(0, 3);
  const worst = cats.slice(-3).reverse().filter(([c]) => !best.some(([b]) => b === c));
  const hasSamples = results.some((r) => r.sample);

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h1>{t('overview.hello')}</h1>
          <p>
            {t('standard.label')}: <b>{standard.short}</b> · {standard.org[lang] || standard.org.en}{' '}
            <button className="btn ghost sm" onClick={() => info.standard()} style={{ verticalAlign: 'middle' }}>
              <Info size={13} /> {t('standard.about')}
            </button>
          </p>
        </div>
        <div className="row wrap">
          {hasSamples && (
            <button className="btn ghost sm" onClick={() => setResults((rs) => rs.filter((r) => !r.sample))}>
              {t('overview.removeSamples')}
            </button>
          )}
          <button className="btn primary" onClick={() => go('import')} disabled={results.filter((r) => !r.sample).length >= MAX_RESULTS}>
            <Upload size={15} /> {t('overview.importCta')}
          </button>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card" ref={heroRef}>
          <div className="card-head">
            <h2>
              {t('overview.latest')}
              <InfoButton onClick={info.score} />
            </h2>
            <SectionActions
              targetRef={heroRef}
              exports={[{ label: t('common.exportPdf'), icon: FileText, run: () => exportResultPdf(latest.result, latest.ev, standard, t, lang) }]}
            />
          </div>
          <div className="hero" style={{ gridTemplateColumns: 'auto 1fr', gap: 22 }}>
            <ScoreRing score={latest.ev.score} size={136} sub={t('common.score')} />
            <div className="stack" style={{ gap: 10 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{fmtDate(latest.result.date, lang)}</div>
                <div className="muted small">{latest.result.lab}</div>
              </div>
              <span className="delta" style={{ alignSelf: 'flex-start' }}>
                {delta == null ? null : delta > 0 ? <ArrowUpRight size={14} style={{ color: 'var(--good)' }} /> : delta < 0 ? <ArrowDownRight size={14} style={{ color: 'var(--crit)' }} /> : <Minus size={14} />}
                {delta == null ? t('overview.markers', { count: latest.result.results.length }) : delta === 0 ? t('overview.noChange') : t('overview.change', { delta: delta > 0 ? `+${delta}` : delta })}
              </span>
              <MixBar counts={latest.ev.counts} total={latest.ev.items.length} />
              <div className="row wrap" style={{ gap: 6 }}>
                {['optimal', 'normal', 'borderline', 'out'].map((s) => (
                  <span key={s} className="small text-2 row" style={{ gap: 4 }}>
                    <StatusPill status={s} compact /> <b className="num">{latest.ev.counts[s]}</b>
                  </span>
                ))}
              </div>
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => go('overview', { resultId: latest.result.id })} data-no-capture>
                {t('overview.open')} <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {evals.length >= 2 ? (
          <div className="card" ref={trendRef}>
            <div className="card-head">
              <h2>{t('timeline.scoreTrend')}</h2>
              <SectionActions
                targetRef={trendRef}
                getRows={() => evals.map((e) => `${e.result.date}\t${e.ev.score}`).join('\n')}
              />
            </div>
            <div className="chart-box">
              <ScoreChart points={evals.map((e) => ({ date: e.result.date, score: e.ev.score }))} />
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card-head"><h2>{t('overview.highlights')}</h2></div>
            <div className="empty" style={{ padding: 24 }}>
              <ChartLine size={28} className="muted" />
              <p className="small">{t('timeline.needTwo')}</p>
            </div>
          </div>
        )}
      </div>

      {cats.length > 0 && (
        <div className="grid grid-2" style={{ marginTop: 16 }}>
          {[['best', best], ['worst', worst]].map(([key, list]) =>
            list.length ? (
              <div className="card" key={key}>
                <div className="card-head"><h3>{t(`overview.${key}`)}</h3></div>
                <div className="stack" style={{ gap: 10 }}>
                  {list.map(([c, s]) => (
                    <div key={c} className="row" style={{ gap: 12 }}>
                      <span className="grow small" style={{ fontWeight: 520 }}>{t(`cat.${c}`)}</span>
                      <div style={{ flex: 2, height: 6, background: 'var(--surface-3)', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${s}%`, height: '100%', borderRadius: 6, background: STATUS_VAR[scoreStatus(s)] }} />
                      </div>
                      <b className="num small" style={{ width: 28, textAlign: 'right' }}>{s}</b>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          )}
        </div>
      )}

      <div className="page-head" style={{ paddingTop: 36, paddingBottom: 14 }}>
        <h2>{t('overview.results')}</h2>
        <span className="badge">{t('overview.slots', { n: results.length, max: MAX_RESULTS })}</span>
      </div>
      <div className="grid grid-auto">
        {[...evals].reverse().map(({ result, ev }) => (
          <ResultCard
            key={result.id}
            result={result}
            ev={ev}
            onOpen={() => go('overview', { resultId: result.id })}
            actions={
              <>
                <button className="icon-btn" title={t('common.share')} aria-label={t('common.share')} onClick={() => openModal(<ShareDialog result={result} />)}>
                  <Share2 size={16} />
                </button>
                <button className="icon-btn" title={t('common.delete')} aria-label={t('common.delete')} onClick={() => deleteResult(result)}>
                  <Trash2 size={16} />
                </button>
              </>
            }
          />
        ))}
      </div>

      <SharedSection />
    </div>
  );
}
