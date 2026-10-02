import { useRef, useState } from 'react';
import {
  Copy,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Upload,
  ClipboardPaste,
  TriangleAlert,
  ShieldCheck,
  CircleAlert,
  Trash2,
  Sparkles,
  ChevronLeft,
  ArrowRight,
} from 'lucide-react';
import { useApp } from '../context.jsx';
import { AI_PROMPT, AI_LINKS } from '../data/prompt.js';
import { parseLabJson } from '../lib/validate.js';
import { copyText } from '../lib/clipboard.js';
import { fmtDate } from '../lib/format.js';
import { MAX_RESULTS } from '../lib/storage.js';
import { evaluateResult } from '../lib/evaluate.js';
import { ScoreRing, useDeleteResult } from '../components/ui.jsx';

const STEPS = ['prompt', 'ai', 'answer', 'paste', 'review'];

/** Progress header: earlier steps can be revisited, later ones stay locked until reached. */
function Stepper({ step, onBack }) {
  const { t } = useApp();
  return (
    <ol className="stepper" aria-label={t('import.title')}>
      {STEPS.map((key, i) => {
        const state = i < step ? 'done' : i === step ? 'current' : 'todo';
        return (
          <li key={key} className={`stepper-item ${state}`}>
            <button
              className="stepper-btn"
              onClick={() => onBack(i)}
              disabled={i >= step}
              aria-current={state === 'current' ? 'step' : undefined}
              title={state === 'done' ? t('import.backTo', { step: t(`import.steps.${key}`) }) : undefined}
            >
              <span className="stepper-n">{state === 'done' ? <Check size={13} strokeWidth={2.6} /> : i + 1}</span>
              <span className="stepper-label">{t(`import.steps.${key}`)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export default function Import() {
  const { t, lang, results, setResults, standard, updateSettings, toast, go, pendingCompare, setPendingCompare } = useApp();
  const [step, setStep] = useState(0);
  const [promptCopied, setPromptCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef(null);
  const deleteResult = useDeleteResult();
  // Sample data is replaced by the first real import, so it never takes up a slot.
  const ownResults = results.filter((r) => !r.sample);
  const sampleCount = results.length - ownResults.length;
  const free = MAX_RESULTS - ownResults.length;
  const existingDates = new Set(ownResults.map((r) => r.date));

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = (to) => setStep((s) => (to < s ? to : s));

  const copyPrompt = async () => {
    try {
      await copyText(AI_PROMPT);
      setPromptCopied(true);
      toast(t('toast.promptCopied'));
    } catch {
      toast(t('toast.copyFailed'), 'error');
    }
  };

  /** Validates the JSON; only valid data moves on to the review step. */
  const checkAndContinue = (value = text) => {
    if (!value.trim()) return;
    const res = parseLabJson(value);
    setParsed(res);
    if (!res.error) setStep(4);
  };

  const readFile = (file) => {
    if (!file) return;
    if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
      setParsed({ results: [], warnings: [], error: { key: 'file' } });
      return;
    }
    file.text().then((s) => {
      setText(s);
      checkAndContinue(s);
    });
  };

  const pasteFromClipboard = async () => {
    try {
      const s = await navigator.clipboard.readText();
      setText(s);
      checkAndContinue(s);
    } catch {
      toast(t('toast.copyFailed'), 'error');
    }
  };

  const doImport = () => {
    const incoming = parsed.results.slice(0, free);
    setResults((rs) => [...rs.filter((r) => !r.sample), ...incoming]);
    const reportSex = [...incoming].sort((a, b) => a.date.localeCompare(b.date)).findLast((r) => r.patient.sex)?.patient.sex;
    if (reportSex) updateSettings({ sex: reportSex });
    toast(t('toast.imported', { count: incoming.length }) + (sampleCount ? ` · ${t('toast.samplesRemoved')}` : ''));
    if (pendingCompare) {
      setPendingCompare(null);
      go('compare', { opponent: pendingCompare });
    } else {
      go('overview', incoming.length === 1 ? { resultId: incoming[0].id } : {});
    }
  };

  /** Back / forward bar shared by every step; forward is always the step's own action. */
  const nav = (forward) => (
    <div className="wizard-nav">
      {step > 0 && (
        <button className="btn ghost" onClick={() => back(step - 1)}>
          <ChevronLeft size={15} /> {t('common.back')}
        </button>
      )}
      <span className="grow" />
      {forward}
    </div>
  );

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h1>{t('import.title')}</h1>
          <p>{t('import.subtitle')}</p>
        </div>
        <span className="badge">{t('import.slotsLeft', { n: Math.max(free, 0), max: MAX_RESULTS })}</span>
      </div>

      {free <= 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="notice error" style={{ marginBottom: 12 }}>
            <CircleAlert size={16} /> {t('import.full', { max: MAX_RESULTS })}
          </div>
          <div className="stack" style={{ gap: 4 }}>
            {[...ownResults].reverse().map((r) => (
              <div key={r.id} className="row stored-row">
                <span className="grow">
                  <b>{fmtDate(r.date, lang)}</b> <span className="muted small">· {r.lab || '—'} · {t('overview.markers', { count: r.results.length })}</span>
                </span>
                <button className="btn sm ghost danger" onClick={() => deleteResult(r)}>
                  <Trash2 size={14} /> {t('common.delete')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card wizard">
        <Stepper step={step} onBack={back} />

        <div className="wizard-body fade-in" key={step}>
          <div className="wizard-kicker">{t('import.stepOf', { n: step + 1, total: STEPS.length })}</div>

          {step === 0 && (
            <>
              <h2>{t('import.step1')}</h2>
              <p className="text-2">{t('import.step1Body')}</p>
              <div className="row wrap">
                <button className="btn primary lg" onClick={copyPrompt}>
                  {promptCopied ? <Check size={16} /> : <Copy size={16} />} {promptCopied ? t('import.promptCopied') : t('import.copyPrompt')}
                </button>
                <button className="btn ghost" onClick={() => setShowPrompt((s) => !s)}>
                  {showPrompt ? <EyeOff size={15} /> : <Eye size={15} />} {showPrompt ? t('import.hidePrompt') : t('import.showPrompt')}
                </button>
              </div>
              {showPrompt && <pre className="prompt-box">{AI_PROMPT}</pre>}
              {nav(
                <button className="btn primary" onClick={next} disabled={!promptCopied} title={!promptCopied ? t('import.copyFirst') : undefined}>
                  {t('import.continue')} <ArrowRight size={15} />
                </button>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <h2>{t('import.step2')}</h2>
              <p className="text-2">{t('import.step2Body')}</p>
              <div className="row wrap">
                <a className="btn lg ai-btn" href={AI_LINKS.chatgpt} target="_blank" rel="noopener noreferrer">
                  <span className="ai-logo" style={{ background: '#10a37f' }}>AI</span> {t('import.openChatgpt')} <ExternalLink size={13} className="muted" />
                </a>
                <a className="btn lg ai-btn" href={AI_LINKS.gemini} target="_blank" rel="noopener noreferrer">
                  <span className="ai-logo" style={{ background: 'linear-gradient(135deg,#4285f4,#9b72cb,#d96570)' }}>G</span> {t('import.openGemini')} <ExternalLink size={13} className="muted" />
                </a>
              </div>
              <ol className="wizard-list">
                <li>{t('import.step2a')}</li>
                <li>{t('import.step2b')}</li>
                <li>{t('import.step2c')}</li>
              </ol>
              {nav(
                <button className="btn primary" onClick={next}>
                  {t('import.step2Done')} <ArrowRight size={15} />
                </button>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <h2>{t('import.step3')}</h2>
              <p className="text-2">{t('import.step3Body')}</p>
              <div className="notice small">
                <TriangleAlert size={16} style={{ color: 'var(--warn)' }} />
                {t('import.step3Check')}
              </div>
              {nav(
                <button className="btn primary" onClick={next}>
                  {t('import.step3Done')} <ArrowRight size={15} />
                </button>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h2>{t('import.step4')}</h2>
              <p className="text-2">{t('import.step4Body')}</p>
              <div
                className={`dropzone ${over ? 'over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(false);
                  readFile(e.dataTransfer.files[0]);
                }}
              >
                <textarea
                  className="textarea"
                  value={text}
                  placeholder={t('import.paste')}
                  spellCheck={false}
                  autoFocus
                  onChange={(e) => {
                    setText(e.target.value);
                    setParsed(null);
                  }}
                  aria-label={t('import.paste')}
                />
              </div>
              <div className="row wrap">
                <button className="btn" onClick={pasteFromClipboard}><ClipboardPaste size={15} /> {t('import.pasteBtn')}</button>
                <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={15} /> {t('import.upload')}</button>
                <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { readFile(e.target.files[0]); e.target.value = ''; }} />
                <span className="small muted">{t('import.drop')}</span>
              </div>
              {parsed?.error && (
                <div className="notice error">
                  <TriangleAlert size={16} />
                  {t(`import.errors.${parsed.error.key}`, { detail: parsed.error.detail })}
                </div>
              )}
              <div className="notice small"><ShieldCheck size={16} style={{ color: 'var(--accent)' }} />{t('import.privacy')}</div>
              {nav(
                <button className="btn primary" onClick={() => checkAndContinue()} disabled={!text.trim()}>
                  {t('import.checkContinue')} <ArrowRight size={15} />
                </button>
              )}
            </>
          )}

          {step === 4 && parsed && (
            <>
              <h2>{t('import.preview')}</h2>
              <p className="text-2">{t('import.reviewBody')}</p>
              <div className="stack">
                {parsed.results.map((r, i) => {
                  const ev = evaluateResult(r, standard.id);
                  return (
                    <div key={r.id} className="row review-row" style={{ opacity: i < free ? 1 : 0.45 }}>
                      <ScoreRing score={ev.score} size={48} stroke={4} />
                      <div className="grow">
                        <div style={{ fontWeight: 600 }}>{fmtDate(r.date, lang)} <span className="muted" style={{ fontWeight: 450 }}>· {r.lab || '—'}</span></div>
                        <div className="small muted">
                          {t('overview.markers', { count: r.results.length })}
                          {r.patient.sex && ` · ${t(`detail.${r.patient.sex}`)}`}
                        </div>
                        {existingDates.has(r.date) && <div className="tiny" style={{ color: 'var(--warn)' }}>{t('import.duplicate', { date: r.date })}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {parsed.results.length > free && free > 0 && (
                <div className="notice warn"><TriangleAlert size={16} />{t('import.tooMany', { n: free })}</div>
              )}
              {parsed.warnings.length > 0 && (
                <div className="notice warn">
                  <TriangleAlert size={16} />
                  <div>
                    <b>{t('import.warnings.title')}</b>
                    <ul>
                      {parsed.warnings.slice(0, 12).map((w, i) => (
                        <li key={i}>{t(`import.warnings.${w.key}`, w)}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {sampleCount > 0 && (
                <div className="notice small">
                  <Sparkles size={16} style={{ color: 'var(--accent)' }} /> {t('import.samplesNote')}
                </div>
              )}
              {nav(
                <button className="btn primary lg" onClick={doImport} disabled={free <= 0}>
                  <Check size={16} /> {t('import.importN', { count: Math.min(parsed.results.length, Math.max(free, 0)) })}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
