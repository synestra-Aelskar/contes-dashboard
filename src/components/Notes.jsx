import { useRef, useState } from 'react';
import { uid, lsGet, lsSet } from '../lib/util.js';

function Postit({ note, mutate }) {
  const [text, setText] = useState(note.text || '');
  const ref = useRef(null);

  function commit() {
    const v = text.trim();
    if (v === (note.text || '')) return;
    if (!v) mutate((s) => { s.notes = s.notes.filter((x) => x.id !== note.id); });
    else mutate((s) => { const n = s.notes.find((x) => x.id === note.id); if (n) n.text = v; });
  }

  return (
    <div className="postit">
      <button
        className="postit__del" type="button" aria-label="Supprimer la note"
        onClick={() => mutate((s) => { s.notes = s.notes.filter((x) => x.id !== note.id); })}
      >
        ×
      </button>
      <textarea
        ref={ref}
        className="postit__text"
        placeholder="Écris ta note…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
    </div>
  );
}

export default function Notes({ state, mutate }) {
  const [collapsed, setCollapsed] = useState(lsGet('ccm.notesCollapsed') === '1');
  const notes = state.notes || [];

  function toggle() {
    setCollapsed((c) => {
      const n = !c;
      lsSet('ccm.notesCollapsed', n ? '1' : '0');
      return n;
    });
  }

  function add() {
    mutate((s) => { s.notes.push({ id: uid(), text: '' }); });
  }

  return (
    <section className="chapter" data-kind="notes">
      <div className="chapter__head">
        <button className="notes-toggle" type="button" aria-expanded={!collapsed} onClick={toggle}>
          <span className="notes-toggle__chev">{collapsed ? '▸' : '▾'}</span>
          <h2>Notes marginales<span className="count"> ({notes.length})</span></h2>
        </button>
      </div>
      {!collapsed && (
        <div className="postits">
          {notes.map((n) => <Postit key={n.id} note={n} mutate={mutate} />)}
          <button className="postit postit--add" type="button" aria-label="Nouvelle note" onClick={add}>＋</button>
        </div>
      )}
    </section>
  );
}
