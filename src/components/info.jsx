import { useRef } from 'react';
import { BookOpen, Scale, Gauge, FlaskConical, TrendingUp, TrendingDown, Info, ExternalLink, Library, Calculator, Copy, Image as ImageIcon } from 'lucide-react';
import { useApp } from '../context.jsx';
import { getBiomarker } from '../data/biomarkers.js';
import { STANDARDS, STANDARD_MAP, CONVENTIONAL_SOURCES, stdShort } from '../data/standards.js';
import { resolveRange, STATUS_ORDER } from '../lib/evaluate.js';
import { fmtDate, fmtNum, fmtRange, hasOptimalBand, beyondText } from '../lib/format.js';
import { copyText, copyNodeImage, SQUARE_STYLE } from '../lib/clipboard.js';
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
  const unit = item?.unit || meta.unit;
  const hasValue = item && Number.isFinite(item.value);
  // The explanation matching the user's value is shown first and highlighted.
  const focus = hasValue && item.status !== 'optimal' ? item.dir : null;
  const explain = [
    { dir: 'high', icon: TrendingUp, title: t('common.whenHigh'), text: L(meta.high, lang) },
    { dir: 'low', icon: TrendingDown, title: t('common.whenLow'), text: L(meta.low, lang) },
  ].sort((a, b) => (b.dir === focus) - (a.dir === focus));

  return (
    <>
      {hasValue && (
        <div className={`bm-result s-${item.status}`}>
          <div className="tiny muted">{t('common.yourValue')}</div>
          <div className="bm-value">
            <span className="num">{item.qualifier || ''}{fmtNum(item.value, lang)}</span>
            {unit && <span className="unit">{unit}</span>}
          </div>
          <StatusPill status={item.status} dir={item.dir} beyond={item.beyond} />
          {item.edited && <div className="tiny muted">{t('edit.edited')} · {t('edit.aiRead', { value: item.aiValue })}</div>}
          {range && <RangeBar value={item.value} range={range} status={item.status} format={(v) => fmtNum(v, lang)} />}
        </div>
      )}

      <div>
        <h4><Scale size={14} /> {t('common.currentRange', { std: standard.short })}</h4>
        <div className="bm-ranges">
          <div className="bm-range">
            <span className="tiny muted">{t('common.range')}</span>
            <span><b className="num">{fmtRange(range, lang)}</b> <span className="unit">{unit}</span></span>
          </div>
          {hasOptimalBand(range) && (
            <div className="bm-range optimal">
              <span className="tiny muted">{t('common.optimal')}</span>
              <span><b className="num">{fmtRange(range, lang, 'optimal')}</b> <span className="unit">{unit}</span></span>
            </div>
          )}
        </div>
        <div style={{ marginTop: 6 }}>
          <SourceNote source={resolved.source} stdShort={standard.short} />
        </div>
      </div>

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
          <div className="bm-explain-list">
            {explain.map((x) => (
              <div key={x.dir} className={`bm-explain ${x.dir === focus ? `active s-${item.status}` : ''}`}>
                <h4>
                  <x.icon size={14} /> {x.title}
                  {x.dir === focus && <span className="bm-you">{t('common.yourCase')}</span>}
                </h4>
                <p className="small">{x.text}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/** One line describing a measured value, e.g. "Glucose: 105 mg/dL · Borderline · high (range: 70 – 99 mg/dL)". */
function valueText(item, t, lang) {
  const unit = item.unit || item.meta.unit || '';
  const withUnit = (v) => (unit ? `${v} ${unit}` : v);
  const status = [
    t(`status.${item.status}`),
    item.beyond ? beyondText(item.beyond, t, lang) : item.dir && item.status !== 'optimal' && t(`status.${item.dir}`),
  ].filter(Boolean);
  const range = item.range ? ` (${t('common.range').toLowerCase()}: ${withUnit(fmtRange(item.range, lang))})` : '';
  return `${L(item.meta.name, lang)}: ${withUnit(`${item.qualifier || ''}${fmtNum(item.value, lang)}`)} · ${status.join(' · ')}${range}`;
}

/** Biomarker explanation dialog; with a measured value it can copy that value as text, or the whole panel as an image. */
function BiomarkerDialog({ item, code, onClose }) {
  const { t, lang, toast } = useApp();
  const panelRef = useRef(null);
  const meta = item?.meta || getBiomarker(code);
  const hasValue = item && Number.isFinite(item.value);
  const run = async (fn) => {
    try {
      await fn();
      toast(t('common.copied'));
    } catch (e) {
      console.error(e);
      toast(t('toast.copyFailed'), 'error');
    }
  };
  // The panel scrolls inside the viewport; the copy shows all of it.
  const captureStyle = { ...SQUARE_STYLE, maxHeight: 'none', overflow: 'visible', boxShadow: 'none', animation: 'none' };
  const actions = (
    <>
      {hasValue && (
        <button className="icon-btn" title={t('common.copyValue')} aria-label={t('common.copyValue')} onClick={() => run(() => copyText(valueText(item, t, lang)))}>
          <Copy size={16} />
        </button>
      )}
      <button className="icon-btn" title={t('common.copyImage')} aria-label={t('common.copyImage')} onClick={() => run(() => copyNodeImage(panelRef.current, undefined, captureStyle))}>
        <ImageIcon size={16} />
      </button>
    </>
  );
  return (
    <Modal title={L(meta.name, lang)} kicker={t(`cat.${meta.cat}`)} onClose={onClose} actions={actions} panelRef={panelRef}>
      <BiomarkerBody item={item} code={code} />
    </Modal>
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
  const show = (title, icon, body, kicker) =>
    openModal(
      <Modal title={title} icon={icon} kicker={kicker} onClose={closeModal}>
        {body}
      </Modal>
    );

  return {
    biomarker: (item, code) => openModal(<BiomarkerDialog item={item} code={code || item.code} onClose={closeModal} />),
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
