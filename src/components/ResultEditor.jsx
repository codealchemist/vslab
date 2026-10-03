import { useMemo, useState } from 'react';
import { Trash2, Plus, Check, X, RotateCcw, TriangleAlert } from 'lucide-react';
import { useApp } from '../context.jsx';
import { BIOMARKERS, CATEGORIES, getBiomarker } from '../data/biomarkers.js';
import { fmtNum } from '../lib/format.js';

/** "5,4" → { value: 5.4 }; "<0.5" → { value: 0.5, qualifier: '<' }; anything else → null. */
export function parseEntryValue(text) {
  const m = String(text).trim().match(/^([<>≤≥])?\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const value = Number(m[2].replace(',', '.'));
  return Number.isFinite(value) ? { value, ...(m[1] && { qualifier: m[1] }) } : null;
}

const show = (e, lang) => `${e.qualifier || ''}${fmtNum(e.value, lang, 4)}`;

/**
 * Manual corrections for a lab result: date, lab, sex, values; remove and add biomarkers.
 * Changed values keep what the AI originally read in `aiValue` and are flagged `edited`.
 */
export default function ResultEditor({ result, onSave, onCancel }) {
  const { t, lang } = useApp();
  const [date, setDate] = useState(result.date);
  const [lab, setLab] = useState(result.lab || '');
  const [sex, setSex] = useState(result.patient?.sex || '');
  const [rows, setRows] = useState(() => result.results.map((e) => ({ entry: e, text: show(e, lang), removed: false })));
  const [addCode, setAddCode] = useState('');
  const [addText, setAddText] = useState('');

  const present = new Set(rows.filter((r) => !r.removed).map((r) => r.entry.code));
  const addable = useMemo(
    () =>
      CATEGORIES.map((cat) => [cat, BIOMARKERS.filter((m) => m.cat === cat && !m.derived && !present.has(m.code))]).filter(([, l]) => l.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows]
  );

  const invalid = rows.some((r) => !r.removed && !parseEntryValue(r.text));
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const addParsed = parseEntryValue(addText);

  const setText = (i, text) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, text } : r)));
  const toggleRemove = (i) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, removed: !r.removed } : r)));

  const add = () => {
    if (!addCode || !addParsed) return;
    const meta = getBiomarker(addCode);
    setRows((rs) => [...rs, { entry: { code: addCode, unit: meta.unit, manual: true, ...addParsed }, text: addText, removed: false, added: true }]);
    setAddCode('');
    setAddText('');
  };

  const save = () => {
    const results = rows
      .filter((r) => !r.removed)
      .map(({ entry, text }) => {
        const parsed = parseEntryValue(text);
        const changed = parsed.value !== entry.value || (parsed.qualifier || '') !== (entry.qualifier || '');
        if (!changed) return entry;
        const { qualifier, ...rest } = entry;
        return {
          ...rest,
          ...parsed,
          ...(!entry.manual && { edited: true, aiValue: entry.aiValue ?? `${entry.qualifier || ''}${entry.value}` }),
        };
      });
    onSave({ ...result, date, lab: lab.trim(), patient: { ...result.patient, sex: sex || null }, results, editedAt: new Date().toISOString() });
  };

  // Keep the result's category order so it's easy to compare against the PDF.
  const order = (r) => CATEGORIES.indexOf(getBiomarker(r.entry.code, r.entry).cat);
  const indexed = rows.map((r, i) => ({ r, i })).sort((a, b) => order(a.r) - order(b.r));

  return (
    <div className="card editor fade-in">
      <div className="card-head">
        <div>
          <h2>{t('edit.title')}</h2>
          <p className="small muted" style={{ marginTop: 4 }}>{t('edit.hint')}</p>
        </div>
      </div>

      <div className="editor-meta">
        <label>
          <span className="label">{t('common.date')}</span>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          <span className="label">{t('common.lab')}</span>
          <input className="input" value={lab} maxLength={80} onChange={(e) => setLab(e.target.value)} />
        </label>
        <label>
          <span className="label">{t('edit.sex')}</span>
          <select className="select" value={sex} onChange={(e) => setSex(e.target.value)}>
            <option value="">{t('edit.sexUnknown')}</option>
            <option value="male">{t('detail.male')}</option>
            <option value="female">{t('detail.female')}</option>
          </select>
        </label>
      </div>

      <div className="editor-list">
        {indexed.map(({ r, i }) => {
          const meta = getBiomarker(r.entry.code, r.entry);
          const bad = !r.removed && !parseEntryValue(r.text);
          return (
            <div key={`${r.entry.code}-${i}`} className={`editor-row ${r.removed ? 'removed' : ''}`}>
              <div className="editor-name">
                <span>{meta.name[lang] || meta.name.en}</span>
                {r.entry.aiValue != null && !r.removed && (
                  <span className="tiny muted">{t('edit.aiRead', { value: r.entry.aiValue })}</span>
                )}
                {r.added && <span className="badge accent">{t('edit.new')}</span>}
              </div>
              <div className="editor-value">
                <input
                  className={`input num ${bad ? 'invalid' : ''}`}
                  inputMode="decimal"
                  value={r.text}
                  disabled={r.removed}
                  onChange={(e) => setText(i, e.target.value)}
                  aria-label={meta.name[lang] || meta.name.en}
                  aria-invalid={bad}
                />
                <span className="unit">{r.entry.unit || meta.unit}</span>
              </div>
              <button
                className="icon-btn"
                onClick={() => toggleRemove(i)}
                title={r.removed ? t('edit.restore') : t('edit.remove')}
                aria-label={r.removed ? t('edit.restore') : t('edit.remove')}
              >
                {r.removed ? <RotateCcw size={16} /> : <Trash2 size={16} />}
              </button>
            </div>
          );
        })}
      </div>

      {addable.length > 0 && (
        <div className="editor-add">
          <span className="label">{t('edit.addTitle')}</span>
          <div className="editor-add-row">
            <select className="select" value={addCode} onChange={(e) => setAddCode(e.target.value)} aria-label={t('edit.addTitle')}>
              <option value="">{t('edit.pick')}</option>
              {addable.map(([cat, list]) => (
                <optgroup key={cat} label={t(`cat.${cat}`)}>
                  {list.map((m) => (
                    <option key={m.code} value={m.code}>{(m.name[lang] || m.name.en)}{m.unit ? ` (${m.unit})` : ''}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input
              className="input num"
              inputMode="decimal"
              placeholder={t('common.value')}
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              aria-label={t('common.value')}
            />
            <button className="btn" onClick={add} disabled={!addCode || !addParsed}>
              <Plus size={15} /> {t('edit.add')}
            </button>
          </div>
        </div>
      )}

      {(invalid || !dateOk) && (
        <div className="notice error small">
          <TriangleAlert size={16} /> {!dateOk ? t('edit.badDate') : t('edit.badValue')}
        </div>
      )}

      <div className="editor-actions">
        <button className="btn ghost" onClick={onCancel}><X size={15} /> {t('common.cancel')}</button>
        <button className="btn primary" onClick={save} disabled={invalid || !dateOk || !rows.some((r) => !r.removed)}>
          <Check size={15} /> {t('edit.save')}
        </button>
      </div>
    </div>
  );
}
