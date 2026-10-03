import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CircleCheckBig,
  CircleCheck,
  TriangleAlert,
  OctagonAlert,
  CircleHelp,
  Info,
  X,
  Check,
  Copy,
  Image as ImageIcon,
  Download,
  ChevronDown,
} from 'lucide-react';
import { useApp } from '../context.jsx';
import { copyNodeImage, copyText } from '../lib/clipboard.js';
import { expandRange } from '../lib/evaluate.js';
import { fmtDate, fmtPct, beyondText } from '../lib/format.js';

export const STATUS_ICON = {
  optimal: CircleCheckBig,
  normal: CircleCheck,
  borderline: TriangleAlert,
  out: OctagonAlert,
  unknown: CircleHelp,
};

export const STATUS_VAR = {
  optimal: 'var(--good)',
  normal: 'var(--normal)',
  borderline: 'var(--warn)',
  out: 'var(--crit)',
  unknown: 'var(--muted)',
};

export const scoreStatus = (s) =>
  s == null ? 'unknown' : s >= 85 ? 'optimal' : s >= 65 ? 'normal' : s >= 45 ? 'borderline' : 'out';

/**
 * Status label. `beyond` ({ dir, pct } from evaluate) replaces the plain High/Low with how far
 * past the reference limit the value is; compact pills show it as a signed percentage.
 */
export function StatusPill({ status, dir, compact, beyond }) {
  const { t, lang } = useApp();
  const Icon = STATUS_ICON[status] || CircleHelp;
  const signed = beyond && `${beyond.dir === 'high' ? '+' : '−'}${fmtPct(beyond.pct, lang)}%`;
  return (
    <span className={`pill s-${status}`} title={beyond ? beyondText(beyond, t, lang) : undefined}>
      <Icon size={13} strokeWidth={2.2} aria-hidden />
      {!compact && t(`status.${status}`)}
      {compact && beyond && <span className="num">{signed}</span>}
      {!compact && beyond && <span className="dir">· {beyondText(beyond, t, lang)}</span>}
      {!compact && !beyond && dir && status !== 'optimal' && <span className="dir">· {t(`status.${dir}`)}</span>}
    </span>
  );
}

export function ScoreRing({ score, size = 120, stroke = 9, sub, color }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const col = color || STATUS_VAR[scoreStatus(score)];
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${score ?? '—'} / 100`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={col}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="ring-label">
        <div>
          <div className="ring-value" style={{ fontSize: size * 0.3 }}>
            {score ?? '—'}
          </div>
          {sub && <div className="ring-sub">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

/**
 * Horizontal band showing acceptable + optimal ranges and the value marker.
 * `format` (value → text) adds the reference limits as labels under the track.
 */
export function RangeBar({ value, range, status, format }) {
  if (!range) return <div className="rangebar"><div className="track" /></div>;
  const r = expandRange(range);
  const finite = [r.lo, r.hi, r.olo, r.ohi, value].filter(Number.isFinite);
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  const span = max - min || Math.abs(max) || 1;
  min -= span * 0.25;
  max += span * 0.25;
  if (min < 0 && Math.min(...finite) >= 0) min = 0;
  const pos = (v) => `${((Math.max(min, Math.min(max, v)) - min) / (max - min)) * 100}%`;
  const lo = Number.isFinite(r.lo) ? r.lo : min;
  const hi = Number.isFinite(r.hi) ? r.hi : max;
  const olo = Number.isFinite(r.olo) ? r.olo : min;
  const ohi = Number.isFinite(r.ohi) ? r.ohi : max;
  const w = (a, b) => `calc(${pos(b)} - ${pos(a)})`;
  const bar = (
    <div className="rangebar" aria-hidden>
      <div className="track" />
      <div className="band" style={{ left: pos(lo), width: w(lo, hi) }} />
      <div className="band opt" style={{ left: pos(olo), width: w(olo, ohi) }} />
      {Number.isFinite(value) && <div className="marker" style={{ left: pos(value), '--c': STATUS_VAR[status] }} />}
    </div>
  );
  if (!format) return bar;
  return (
    <div className="rangebar-labelled">
      {bar}
      <div className="rangebar-labels" aria-hidden>
        {Number.isFinite(r.lo) && <span style={{ left: pos(r.lo) }}>{format(r.lo)}</span>}
        {Number.isFinite(r.hi) && <span style={{ left: pos(r.hi) }}>{format(r.hi)}</span>}
      </div>
    </div>
  );
}

export function Modal({ title, icon, kicker, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  const { t } = useApp();
  // Rendered straight under <body> so every dialog gets the same full-page blurred backdrop,
  // whatever part of the page opened it.
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { width: 'min(720px, 100%)' } : undefined}>
        <div className="modal-head">
          <div className="row" style={{ gap: 10, minWidth: 0 }}>
            {icon}
            <div className="modal-titles">
              {kicker && <div className="modal-kicker">{kicker}</div>}
              <h2>{title}</h2>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/**
 * Dropdown menu; `children` receives a close() callback. `className` styles the panel (e.g. header-menu).
 * `backdrop` dims and blurs the page behind it, like a dialog; tapping it closes the menu.
 */
export function Menu({ button, children, align = 'right', className = '', backdrop = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  // While a backdrop menu is open, <html> gets .menu-open so the header can sit above the backdrop.
  useEffect(() => {
    if (!open || !backdrop) return;
    document.documentElement.classList.add('menu-open');
    return () => document.documentElement.classList.remove('menu-open');
  }, [open, backdrop]);
  return (
    <div className="menu-wrap" ref={ref}>
      {button({ open, toggle: () => setOpen((o) => !o) })}
      {open && <div className={`menu ${align} ${className}`}>{children(() => setOpen(false))}</div>}
      {/* Outside the menu, so the mousedown handler above closes it when the backdrop is tapped. */}
      {open && backdrop && createPortal(<div className="menu-backdrop" aria-hidden="true" />, document.body)}
    </div>
  );
}

export function InfoButton({ onClick, label }) {
  const { t } = useApp();
  return (
    <button
      className="icon-btn sm"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label || t('common.explain')}
      title={label || t('common.explain')}
      data-no-capture
    >
      <Info size={15} />
    </button>
  );
}

/**
 * Copy & export controls for a visible section.
 * targetRef: node to rasterize; getRows: () => 2D array for "copy data";
 * exports: [{ label, icon, run }].
 */
export function SectionActions({ targetRef, getRows, exports = [] }) {
  const { t, toast } = useApp();
  const run = async (fn) => {
    try {
      await fn();
      toast(t('common.copied'));
    } catch {
      toast(t('toast.copyFailed'), 'error');
    }
  };
  return (
    <div className="row" data-no-capture style={{ gap: 2 }}>
      {getRows && (
        <button className="icon-btn" title={t('common.copyData')} aria-label={t('common.copyData')} onClick={() => run(() => copyText(getRows()))}>
          <Copy size={16} />
        </button>
      )}
      {targetRef && (
        <button className="icon-btn" title={t('common.copyImage')} aria-label={t('common.copyImage')} onClick={() => run(() => copyNodeImage(targetRef.current))}>
          <ImageIcon size={16} />
        </button>
      )}
      {exports.length > 0 && (
        <Menu
          button={({ toggle }) => (
            <button className="btn sm" onClick={toggle}>
              <Download size={14} /> {t('common.export')} <ChevronDown size={13} />
            </button>
          )}
        >
          {(close) =>
            exports.map((x) => (
              <button
                key={x.label}
                className="menu-item"
                onClick={async () => {
                  close();
                  try {
                    await x.run();
                    toast(t('toast.exported'));
                  } catch (e) {
                    console.error(e);
                    toast(t('toast.copyFailed'), 'error');
                  }
                }}
              >
                <x.icon size={16} /> {x.label}
              </button>
            ))
          }
        </Menu>
      )}
    </div>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`toast ${x.kind}`}>
          {x.kind === 'error' ? <TriangleAlert size={16} /> : <Check size={16} />}
          {x.message}
        </div>
      ))}
    </div>
  );
}

/** Opens a small confirmation dialog. */
export function useConfirm() {
  const { t, openModal, closeModal } = useApp();
  return (message, onYes, { danger = true, label, body } = {}) =>
    openModal(
      <Modal
        title={message}
        onClose={closeModal}
        footer={
          <>
            <button className="btn ghost" onClick={closeModal}>{t('common.cancel')}</button>
            <button
              className={`btn ${danger ? 'danger' : 'primary'}`}
              onClick={() => {
                closeModal();
                onYes();
              }}
            >
              {label || t('common.delete')}
            </button>
          </>
        }
      >
        {body}
      </Modal>
    );
}

/** Confirm-and-delete for a single stored lab result. */
export function useDeleteResult() {
  const { t, lang, setResults, toast } = useApp();
  const confirm = useConfirm();
  return (result, after) =>
    confirm(t('overview.deleteConfirm'), () => {
      setResults((rs) => rs.filter((r) => r.id !== result.id));
      toast(t('toast.deleted'));
      after?.();
    }, {
      body: (
        <div className="notice">
          <span>
            <b style={{ color: 'var(--text)' }}>{fmtDate(result.date, lang)}</b>
            {result.lab ? ` · ${result.lab}` : ''} · {t('overview.markers', { count: result.results.length })}
          </span>
        </div>
      ),
    });
}
