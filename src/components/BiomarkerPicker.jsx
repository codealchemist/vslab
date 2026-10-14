import { forwardRef, useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useApp } from '../context.jsx';
import { normText, searchTerms } from '../data/biomarkers.js';

/**
 * Search box with suggestions for picking a biomarker from `options` (catalog entries).
 * Matches codes, English and Spanish names and aliases ("cistatina", "IGF1", "TSAT"); best matches first.
 * Calls onPick(code) when one is chosen, and onPick('') once the text no longer names a pick.
 */
const BiomarkerPicker = forwardRef(function BiomarkerPicker({ options, value, onPick, placeholder }, ref) {
  const { t, lang } = useApp();
  const id = useId();
  const listRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const label = (m) => m.name[lang] || m.name.en;

  // Exact name first, then names starting with the query, then anywhere in a name; catalog order breaks ties.
  const matches = useMemo(() => {
    const q = normText(query);
    if (!q) return options;
    const rank = (m) => {
      const terms = searchTerms(m);
      if (terms.includes(q)) return 0;
      if (terms.some((x) => x.startsWith(q))) return 1;
      if (terms.some((x) => x.includes(q))) return 2;
      return null;
    };
    return options
      .map((m, i) => ({ m, i, r: rank(m) }))
      .filter((x) => x.r != null)
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map((x) => x.m);
  }, [options, query]);

  const pick = (m) => {
    setQuery(label(m));
    setOpen(false);
    onPick(m.code);
  };

  const move = (step) => {
    if (!open) return setOpen(true);
    const next = (active + step + matches.length) % matches.length;
    setActive(next);
    listRef.current?.children[next]?.scrollIntoView?.({ block: 'nearest' });
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (matches.length) move(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter' && open && matches[active]) {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  const showList = open && (matches.length > 0 || query.trim());

  return (
    <div className="bm-picker">
      <div className="search">
        <Search size={15} />
        <input
          ref={ref}
          className="input"
          role="combobox"
          aria-expanded={!!showList}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={showList && matches[active] ? `${id}-${matches[active].code}` : undefined}
          aria-label={placeholder}
          placeholder={placeholder}
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
            if (value) onPick('');
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </div>
      {showList && (
        <ul ref={listRef} id={`${id}-list`} className="bm-picker-list" role="listbox" aria-label={placeholder}>
          {matches.map((m, i) => (
            <li
              key={m.code}
              id={`${id}-${m.code}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              // mousedown, not click: picking must happen before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="bm-picker-name">{label(m)}</span>
              <span className="bm-picker-meta tiny muted">
                {t(`cat.${m.cat}`)}
                {m.unit ? ` · ${m.unit}` : ''}
              </span>
            </li>
          ))}
          {!matches.length && <li role="presentation" className="bm-picker-empty small muted">{t('edit.noMatch', { q: query.trim() })}</li>}
        </ul>
      )}
    </div>
  );
});

export default BiomarkerPicker;
