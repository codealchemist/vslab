import { useEffect, useMemo, useState } from 'react';
import { Link2, Copy, ShieldCheck, Check, Languages, Clock, CloudOff, LoaderCircle } from 'lucide-react';
import { useApp } from '../context.jsx';
import { buildShareUrl, hostedShareUrl, uploadShare } from '../lib/share.js';
import { copyText } from '../lib/clipboard.js';
import { fmtDate } from '../lib/format.js';
import { evaluateResult } from '../lib/evaluate.js';
import { Modal } from './ui.jsx';
import { LANGS } from '../i18n/index.js';

export function LangPicker({ value, onChange }) {
  const { t } = useApp();
  return (
    <div className="segmented" role="radiogroup" aria-label={t('share.linkLang')}>
      {LANGS.map((l) => (
        <button key={l} role="radio" aria-checked={value === l} className={value === l ? 'active' : ''} onClick={() => onChange(l)}>
          {t(`lang.${l}`)}
        </button>
      ))}
    </div>
  );
}

/**
 * Shares exactly one lab result. `result` is pre-selected; another can be picked when there are several.
 * The link is created on demand: the result is uploaded to the share service and the link carries only its id.
 */
export default function ShareDialog({ result }) {
  const { t, lang, results, username, updateSettings, closeModal, toast, standard, sexOverride } = useApp();
  const [name, setName] = useState(username);
  const [linkLang, setLinkLang] = useState(lang);
  const [selectedId, setSelectedId] = useState(result.id);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  // idle | creating | ready | failed
  const [status, setStatus] = useState('idle');
  const [link, setLink] = useState(null); // { id, expiresAt } | { inline: true }
  const [copied, setCopied] = useState(false);

  const selected = results.find((r) => r.id === selectedId) || result;

  // Optionally keep only borderline / out-of-range biomarkers (judged under the current standard).
  const toShare = useMemo(() => {
    if (!flaggedOnly) return selected;
    const flagged = new Set(
      evaluateResult(selected, standard.id, sexOverride)
        .items.filter((i) => i.status === 'borderline' || i.status === 'out')
        .map((i) => i.code)
    );
    return { ...selected, results: selected.results.filter((e) => flagged.has(e.code)) };
  }, [selected, flaggedOnly, standard.id, sexOverride]);

  // A created link captures what was uploaded, so any change to the content needs a new one.
  useEffect(() => {
    setStatus('idle');
    setLink(null);
  }, [selectedId, flaggedOnly, name]);

  // The language only changes the ?lang= part, so it never requires a new upload.
  const url = !link ? '' : link.inline ? buildShareUrl(toShare, name, linkLang) : hostedShareUrl(link.id, linkLang);

  const create = async () => {
    setStatus('creating');
    try {
      setLink(await uploadShare(toShare, name));
      setStatus('ready');
      if (!username && name.trim()) updateSettings({ username: name.trim() });
    } catch (e) {
      console.warn('share upload failed', e);
      setStatus('failed');
    }
  };

  const useInline = () => {
    setLink({ inline: true });
    setStatus('ready');
  };

  const copy = async () => {
    try {
      await copyText(url);
      setCopied(true);
      toast(t('toast.linkCopied'));
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast(t('toast.copyFailed'), 'error');
    }
  };

  const expiresAt = link?.expiresAt && new Date(link.expiresAt).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });

  return (
    <Modal title={t('share.title')} icon={<Link2 size={18} className="muted" />} onClose={closeModal}>
      <p>{t('share.body')}</p>

      {results.length > 1 ? (
        <div>
          <span className="label">{t('share.pickOne')}</span>
          <div className="share-picker" role="radiogroup" aria-label={t('share.pickOne')}>
            {[...results].reverse().map((r) => (
              <label key={r.id} className={`share-option ${r.id === selectedId ? 'on' : ''}`}>
                <input type="radio" name="share-result" checked={r.id === selectedId} onChange={() => setSelectedId(r.id)} />
                <span className="grow">
                  <b>{fmtDate(r.date, lang)}</b>
                  <span className="muted small"> · {r.lab || '—'}</span>
                </span>
                <span className="badge">{t('overview.markers', { count: r.results.length })}</span>
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div className="row small">
          <span className="badge">{fmtDate(result.date, lang)}</span>
          {result.lab && <span className="badge">{result.lab}</span>}
          <span className="badge">{t('overview.markers', { count: result.results.length })}</span>
        </div>
      )}

      <label className={`share-option ${flaggedOnly ? 'on' : ''}`}>
        <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
        <span className="grow">
          {t('share.flaggedOnly')}
          <span className="tiny muted" style={{ display: 'block' }}>{t('share.flaggedOnlyHint', { std: standard.short })}</span>
        </span>
        <span className="badge">{t('overview.markers', { count: toShare.results.length })}</span>
      </label>

      <div className="grid grid-2" style={{ gap: 12 }}>
        <div>
          <label className="label" htmlFor="share-name">{t('share.name')}</label>
          <input id="share-name" className="input" value={name} maxLength={40} placeholder={t('share.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <span className="label"><Languages size={12} style={{ verticalAlign: '-1px' }} /> {t('share.linkLang')}</span>
          <LangPicker value={linkLang} onChange={setLinkLang} />
        </div>
      </div>

      {toShare.results.length === 0 ? (
        <div className="notice small">{t('share.noneFlagged')}</div>
      ) : status === 'ready' ? (
        <div className="stack" style={{ gap: 6 }}>
          <div className="row">
            <input className="input grow num" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link" style={{ color: 'var(--text-2)', fontSize: 12.5 }} />
            <button className="btn primary" onClick={copy}>
              {copied ? <Check size={15} /> : <Copy size={15} />} {t('share.copyLink')}
            </button>
          </div>
          <div className="tiny row muted" style={{ gap: 6 }}>
            {link.inline ? <CloudOff size={13} /> : <Clock size={13} />}
            {link.inline ? t('share.inlineNote') : t('share.expires', { time: expiresAt })}
          </div>
        </div>
      ) : status === 'failed' ? (
        <div className="notice error small" style={{ alignItems: 'center' }}>
          <CloudOff size={16} />
          <span className="grow">{t('share.uploadFailed')}</span>
          <button className="btn sm" onClick={create}>{t('share.retry')}</button>
          <button className="btn sm" onClick={useInline}>{t('share.useInline')}</button>
        </div>
      ) : (
        <button className="btn primary lg" onClick={create} disabled={status === 'creating'}>
          {status === 'creating' ? <LoaderCircle size={16} className="spin" /> : <Link2 size={16} />}
          {status === 'creating' ? t('share.creating') : t('share.create')}
        </button>
      )}

      <div className="notice">
        <ShieldCheck size={16} style={{ color: 'var(--accent)' }} />
        <span className="small">{link?.inline ? t('share.privacyInline') : t('share.privacy')}</span>
      </div>
    </Modal>
  );
}
