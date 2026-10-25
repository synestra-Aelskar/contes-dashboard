import { useMemo, useRef, useState } from 'react';
import { looseKey } from '../lib/wiki.js';

/* Zone de texte Markdown avec complétion des [[liens]] : dès que `[[` est tapé,
 * on propose les notes (titre ou alias) dont le nom contient la saisie. */

const OPEN_RE = /\[\[([^\]\[\n|#^]*)$/;

function candidates(index, q) {
  const k = looseKey(q);
  const out = [];
  for (const n of index.notes) {
    const names = [n.title].concat([].concat(n.front.aliases || n.front.alias || []).filter((a) => typeof a === 'string'));
    for (const name of names) {
      const nk = looseKey(name);
      if (!k || nk.includes(k)) { out.push({ name, path: n.path, alias: name !== n.title, score: nk.startsWith(k) ? 0 : 1 }); break; }
    }
  }
  return out.sort((a, b) => a.score - b.score || a.name.length - b.name.length || a.name.localeCompare(b.name, 'fr')).slice(0, 8);
}

export default function WikiTextarea({ value, onChange, onBlur, index, className, placeholder }) {
  const ref = useRef(null);
  const [sug, setSug] = useState(null); // { start, query }
  const [sel, setSel] = useState(0);
  const list = useMemo(() => (sug ? candidates(index, sug.query) : []), [sug, index]);

  function detect(el) {
    const pos = el.selectionStart;
    const m = OPEN_RE.exec(el.value.slice(0, pos));
    if (m && el.selectionStart === el.selectionEnd) { setSug({ start: pos - m[1].length, query: m[1] }); setSel(0); } else setSug(null);
  }

  function pick(c) {
    const el = ref.current; if (!el || !sug) return;
    const end = el.selectionStart;
    const after = el.value.slice(end);
    const closing = after.startsWith(']]') ? '' : ']]';
    const text = el.value.slice(0, sug.start) + c.name + closing + after;
    onChange(text);
    const caret = sug.start + c.name.length + 2;
    setSug(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret, caret); });
  }

  function onKeyDown(e) {
    if (!sug || !list.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % list.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s - 1 + list.length) % list.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(list[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); setSug(null); }
  }

  return (
    <div className="wiki-suggest">
      <textarea
        ref={ref} className={className} spellCheck placeholder={placeholder} value={value}
        onChange={(e) => { onChange(e.target.value); detect(e.target); }}
        onKeyDown={onKeyDown} onKeyUp={(e) => { if (e.key.startsWith('Arrow') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) detect(e.target); }}
        onClick={(e) => detect(e.target)}
        onBlur={() => { setTimeout(() => setSug(null), 120); if (onBlur) onBlur(); }}
      />
      {sug && list.length > 0 && (
        <ul className="wiki-suggest__list" role="listbox" aria-label="Notes proposées">
          {list.map((c, i) => (
            <li key={c.path + c.name} role="option" aria-selected={i === sel} className={i === sel ? 'is-sel' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(c); }} onMouseEnter={() => setSel(i)}>
              <span>{c.name}</span>
              <i>{c.alias ? 'alias · ' : ''}{c.path.replace(/\.md$/i, '').split('/').slice(0, -1).join(' / ')}</i>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
