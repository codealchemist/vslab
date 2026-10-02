import { BookOpen, Scale, Gauge, FlaskConical, TrendingUp, TrendingDown, Info, ExternalLink, Library, Calculator } from 'lucide-react';
import { useApp } from '../context.jsx';
import { getBiomarker } from '../data/biomarkers.js';
import { STANDARDS, STANDARD_MAP, CONVENTIONAL_SOURCES, stdShort } from '../data/standards.js';
import { resolveRange, STATUS_ORDER } from '../lib/evaluate.js';
import { fmtDate, fmtNum, fmtRange, hasOptimalBand } from '../lib/format.js';
import { Modal, StatusPill, RangeBar } from './ui.jsx';

const L = (obj, lang) => (obj ? obj[lang] || obj.en : '');

function SourceNote({ source, stdShort }) {
  const { t } = useApp();
  if (source === 'fallback') return <p className="small muted">{t('standard.fallbackNote', { std: stdShort })}</p>;
  if (source === 'lab') return <p className="small muted">{t('standard.labNote')}</p>;
  if (source === 'none') return <p className="small muted">{t('standard.noneNote')}</p>;
  return null;
}

function BiomarkerBody({ item, code }) {
  const { t, lang, standard, sexOverride } = useApp();
  const meta = item?.meta || getBiomarker(code);
  const resolved = item || resolveRange(code, standard.id, sexOverride || 'male');
  const range = resolved.range;
  return (
    <>
      {meta.custom ? (
        <p>{t('detail.custom')}</p>
      ) : (
        <>
          <div>
            <h4><BookOpen size={14} /> {t('common.whatIsThis')}</h4>
            <p>{L(meta.about, lang)}</p>
          </div>
          {meta.derived && (
            <div className="notice small">
              <Calculator size={15} style={{ color: 'var(--accent)' }} />
              <span>{t('common.calculatedNote', { formula: L(meta.derived.formula, lang) })}</span>
            </div>
          )}
          <div className="grid grid-2" style={{ gap: 12 }}>
            <div>
              <h4><TrendingUp size={14} /> {t('common.whenHigh')}</h4>
              <p className="small">{L(meta.high, lang)}</p>
            </div>
            <div>
              <h4><TrendingDown size={14} /> {t('common.whenLow')}</h4>
              <p className="small">{L(meta.low, lang)}</p>
            </div>
          </div>
        </>
      )}
      <div className="card flat" style={{ padding: 14, background: 'var(--surface-2)' }}>
        <h4 style={{ marginBottom: 8 }}>
          <Scale size={14} /> {t('common.currentRange', { std: standard.short })}
        </h4>
        <dl className="kv">
          <dt>{t('common.range')}</dt>
          <dd className="num">{fmtRange(range, lang)} <span className="unit">{meta.unit}</span></dd>
          {hasOptimalBand(range) && (
            <>
              <dt>{t('common.optimal')}</dt>
              <dd className="num">{fmtRange(range, lang, 'optimal')} <span className="unit">{meta.unit}</span></dd>
            </>
          )}
          {item && Number.isFinite(item.value) && (
            <>
              <dt>{t('common.yourValue')}</dt>
              <dd className="row" style={{ gap: 8 }}>
                <span className="value">{fmtNum(item.value, lang)}</span>
                <StatusPill status={item.status} dir={item.dir} beyond={item.beyond} />
              </dd>
            </>
          )}
        </dl>
        {item && range && (
          <div style={{ marginTop: 10 }}>
            <RangeBar value={item.value} range={range} status={item.status} />
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <SourceNote source={resolved.source} stdShort={standard.short} />
        </div>
      </div>
    </>
  );
}

function SourceLinks({ standard, compact }) {
  const { t } = useApp();
  const own = standard.sources || [];
  return (
    <div className="sources">
      {!compact && <h4><Library size={14} /> {t('standard.sources')}</h4>}
      {standard.usesLabRanges && <p className="small">{t('standard.labSource')}</p>}
      {own.length > 0 && (
        <ul>
          {own.map((s) => (
            <li key={s.url + s.label}>
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.label} <ExternalLink size={11} />
              </a>
            </li>
          ))}
        </ul>
      )}
      {!compact && (
        <>
          <p className="tiny muted" style={{ marginTop: 8 }}>{t('standard.fallbackSource')}</p>
          <ul>
            {CONVENTIONAL_SOURCES.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.label} <ExternalLink size={11} />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function StatusLegend() {
  const { t } = useApp();
  return (
    <div className="stack" style={{ gap: 8 }}>
      {STATUS_ORDER.map((s) => (
        <div key={s} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
          <div style={{ width: 120, flex: 'none' }}>
            <StatusPill status={s} />
          </div>
          <p className="small">{t(`statusHelp.${s}`)}</p>
        </div>
      ))}
    </div>
  );
}

/** Openers for every explanation dialog in the app. */
export function useInfo() {
  const { t, lang, openModal, closeModal, standard } = useApp();
  const show = (title, icon, body) =>
    openModal(
      <Modal title={title} icon={icon} onClose={closeModal}>
        {body}
      </Modal>
    );

  return {
    biomarker: (item, code) => {
      const meta = item?.meta || getBiomarker(code);
      show(
        L(meta.name, lang),
        <span className="badge accent">{t(`cat.${meta.cat}`)}</span>,
        <BiomarkerBody item={item} code={code || item.code} />
      );
    },
    standard: (id = standard.id) => {
      const s = STANDARD_MAP[id];
      show(
        stdShort(s, lang),
        <Scale size={18} className="muted" />,
        <>
          <p style={{ color: 'var(--text)', fontWeight: 550 }}>{L(s.org, lang)}</p>
          <p>{L(s.desc, lang)}</p>
          <SourceLinks standard={s} />
          <p className="small muted">{t('footer.disclaimer')}</p>
        </>
      );
    },
    allStandards: () =>
      show(
        t('standard.label'),
        <Scale size={18} className="muted" />,
        STANDARDS.map((s) => (
          <div key={s.id}>
            <h4>{stdShort(s, lang)} · <span className="muted" style={{ fontWeight: 450 }}>{L(s.org, lang)}</span></h4>
            <p className="small">{L(s.desc, lang)}</p>
            <SourceLinks standard={s} compact />
          </div>
        )).concat(
          <div key="conventional" className="sources">
            <h4><Library size={14} /> {t('standard.fallbackSource')}</h4>
            <ul>
              {CONVENTIONAL_SOURCES.map((c) => (
                <li key={c.url}><a href={c.url} target="_blank" rel="noopener noreferrer">{c.label} <ExternalLink size={11} /></a></li>
              ))}
            </ul>
          </div>
        )
      ),
    score: () =>
      show(
        t('info.scoreTitle'),
        <Gauge size={18} className="muted" />,
        <>
          <p>{t('info.scoreBody')}</p>
          <StatusLegend />
        </>
      ),
    status: () => show(t('info.statusTitle'), <Info size={18} className="muted" />, <StatusLegend />),
    labTest: (result, ev) =>
      show(
        t('detail.about'),
        <FlaskConical size={18} className="muted" />,
        <>
          <p>
            {t('info.labTestBody', {
              count: result.results.length,
              lab: result.lab || '—',
              date: fmtDate(result.date, lang),
              std: standard.short,
              ...ev.counts,
            })}
          </p>
          <p className="small">{t('info.labTestTip')}</p>
          <div>
            <h4><Gauge size={14} /> {t('info.scoreTitle')}</h4>
            <p className="small">{t('info.scoreBody')}</p>
          </div>
          <StatusLegend />
        </>
      ),
  };
}
