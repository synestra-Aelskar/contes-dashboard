import { useEffect, useRef, useState } from 'react';
import { uid, domain, normUrl, lsGet, lsSet } from '../../lib/util.js';
import { toast } from '../../lib/toast.js';

/* ------------------------------------------------------------------ */

function LinkForm({ sec, entry, isMusic, catSuggestions, onDone, mutate }) {
  const [title, setTitle] = useState(entry ? entry.title || '' : '');
  const [url, setUrl] = useState(entry ? entry.url || '' : '');
  const [third, setThird] = useState(entry ? (isMusic ? entry.cat || '' : entry.note || '') : '');
  const [todo, setTodo] = useState(!!(entry && entry.todo));
  const first = useRef(null);
  useEffect(() => { first.current && first.current.focus(); }, []);

  function save() {
    const t = title.trim();
    const u = normUrl(url);
    if (!t || !u) { toast('Titre et lien requis'); return; }
    mutate((s) => {
      const section = s.sections.find((x) => x.id === sec.id);
      if (!section) return;
      if (isMusic) {
        const cat = third.trim() || 'Sans catégorie';
        if (entry) {
          const e = section.entries.find((x) => x.id === entry.id);
          if (e) { e.title = t; e.url = u; e.cat = cat; }
        } else {
          section.entries.push({ id: uid(), title: t, url: u, cat });
        }
        if (cat !== 'Sans catégorie') {
          if (!section.cats) section.cats = [];
          if (section.cats.indexOf(cat) < 0) section.cats.push(cat);
        }
        lsSet('ccm.musicTab', cat);
      } else if (entry) {
        const e = section.entries.find((x) => x.id === entry.id);
        if (e) { e.title = t; e.url = u; e.note = third.trim(); e.todo = todo; }
      } else {
        section.entries.push({ id: uid(), title: t, url: u, note: third.trim(), todo });
      }
    });
    onDone();
  }

  const listId = 'cats-' + sec.id;
  return (
    <div className="form">
      <label className="flabel">
        Titre
        <input
          ref={first} className="field" type="text"
          placeholder={isMusic ? 'Titre de la piste' : 'Titre du lien'}
          value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        />
      </label>
      <label className="flabel">
        Lien
        <input
          className="field field--mono" type="text"
          placeholder={isMusic ? 'https://www.youtube.com/watch?v=…' : 'https://…'}
          value={url} onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        />
      </label>
      <label className="flabel">
        {isMusic ? 'Catégorie' : 'Note'}
        <input
          className="field" type="text" list={isMusic ? listId : undefined}
          placeholder={isMusic ? 'Catégorie (Combat, Taverne…)' : 'Note courte (facultatif)'}
          value={third} onChange={(e) => setThird(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        />
      </label>
      {isMusic && (
        <datalist id={listId}>
          {catSuggestions.map((c) => <option key={c} value={c} />)}
        </datalist>
      )}
      {!isMusic && (
        <label className="fcheck">
          <input type="checkbox" checked={todo} onChange={(e) => setTodo(e.target.checked)} />
          À faire
        </label>
      )}
      <div className="form__actions">
        <button className="btn-primary" type="button" onClick={save}>
          {entry ? 'Enregistrer' : 'Ajouter'}
        </button>
        <button className="tbtn" type="button" onClick={onDone}>annuler</button>
      </div>
    </div>
  );
}

function RuleForm({ sec, entry, onDone, mutate }) {
  const [name, setName] = useState(entry ? entry.name || '' : '');
  const [desc, setDesc] = useState(entry ? entry.desc || '' : '');
  const first = useRef(null);
  useEffect(() => { first.current && first.current.focus(); }, []);

  function save() {
    const nm = name.trim();
    if (!nm) { toast('Nom de la règle requis'); return; }
    mutate((s) => {
      const section = s.sections.find((x) => x.id === sec.id);
      if (!section) return;
      if (entry) {
        const r = section.entries.find((x) => x.id === entry.id);
        if (r) { r.name = nm; r.desc = desc.trim(); }
      } else {
        section.entries.push({ id: uid(), name: nm, desc: desc.trim() });
      }
    });
    onDone();
  }

  return (
    <div className="form">
      <label className="flabel">
        Nom
        <input
          ref={first} className="field" type="text" placeholder="Nom de la règle"
          value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); } }}
        />
      </label>
      <label className="flabel">
        Description
        <textarea
          className="notes notes--sm"
          placeholder="Description — quand elle s’applique, comment on la tranche."
          value={desc} onChange={(e) => setDesc(e.target.value)}
        />
      </label>
      <div className="form__actions">
        <button className="btn-primary" type="button" onClick={save}>
          {entry ? 'Enregistrer' : 'Ajouter'}
        </button>
        <button className="tbtn" type="button" onClick={onDone}>annuler</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LinkEntry({ sec, e, mutate, onEdit }) {
  return (
    <div className={'entry' + (sec.kind === 'music' ? ' entry--play' : '')}>
      <span className="entry__marker" />
      <div className="entry__main">
        <div className="entry__titlerow">
          {e.todo && <span className="todo-badge">À faire</span>}
          <a className="entry__title" href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a>
        </div>
        {e.note && <p className="entry__note">{e.note}</p>}
        <div className="entry__actions">
          <button className="tbtn" type="button" onClick={onEdit}>modifier</button>
          <button
            className="tbtn" type="button"
            onClick={() => {
              if (!window.confirm('Retirer « ' + (e.title || 'cet élément') + ' » ?')) return;
              mutate((s) => {
                const section = s.sections.find((x) => x.id === sec.id);
                if (section) section.entries = section.entries.filter((x) => x.id !== e.id);
              });
            }}
          >
            retirer
          </button>
        </div>
      </div>
      <div className="entry__meta"><span className="domain">{domain(e.url)}</span></div>
    </div>
  );
}

function RuleRow({ sec, r, mutate, onEdit }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={'rule' + (open ? ' is-open' : '')}>
      <button
        className="rule__head" type="button" aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="rule__chev">{open ? '▾' : '▸'}</span>
        <span className="rule__name">{r.name}</span>
      </button>
      <div className="entry__actions rule__actions">
        <button className="tbtn" type="button" onClick={onEdit}>modifier</button>
        <button
          className="tbtn" type="button"
          onClick={() => {
            if (!window.confirm('Retirer « ' + (r.name || 'cette règle') + ' » ?')) return;
            mutate((s) => {
              const section = s.sections.find((x) => x.id === sec.id);
              if (section) section.entries = section.entries.filter((x) => x.id !== r.id);
            });
          }}
        >
          retirer
        </button>
      </div>
      {open && <p className="rule__desc">{r.desc || '—'}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MusicBody({ sec, adding, openForm, setOpenForm, mutate }) {
  const [tab, setTab] = useState(lsGet('ccm.musicTab'));
  const order = (sec.cats || []).slice();
  sec.entries.forEach((e) => {
    const c = e.cat || 'Sans catégorie';
    if (order.indexOf(c) < 0) order.push(c);
  });
  const active = order.filter((c) => sec.entries.some((e) => (e.cat || 'Sans catégorie') === c));

  const catSuggestions = (() => {
    const out = [];
    (sec.cats || []).forEach((c) => { if (out.indexOf(c) < 0) out.push(c); });
    sec.entries.forEach((e) => {
      if (e.cat && e.cat !== 'Sans catégorie' && out.indexOf(e.cat) < 0) out.push(e.cat);
    });
    return out;
  })();

  if (!active.length) {
    return (
      <div className="entries">
        {!adding && (
          <p className="empty">
            Aucune piste pour l’instant. Ajoutez un lien YouTube et rangez-le dans une catégorie —
            suggestions : {(sec.cats || []).join('  ·  ')}.
          </p>
        )}
        {adding && (
          <LinkForm
            sec={sec} entry={null} isMusic catSuggestions={catSuggestions}
            onDone={() => setOpenForm(null)} mutate={mutate}
          />
        )}
      </div>
    );
  }

  const current = tab && active.indexOf(tab) >= 0 ? tab : active[0];
  return (
    <div className="entries">
      <div className="tabs" role="tablist">
        {active.map((c) => {
          const n = sec.entries.filter((e) => (e.cat || 'Sans catégorie') === c).length;
          return (
            <button
              key={c} type="button" role="tab" className="tab" aria-selected={c === current}
              onClick={() => { setTab(c); lsSet('ccm.musicTab', c); }}
            >
              {c}<b>{n}</b>
            </button>
          );
        })}
      </div>
      {sec.entries
        .filter((e) => (e.cat || 'Sans catégorie') === current)
        .map((e) =>
          openForm && openForm.entryId === e.id ? (
            <LinkForm
              key={e.id} sec={sec} entry={e} isMusic catSuggestions={catSuggestions}
              onDone={() => setOpenForm(null)} mutate={mutate}
            />
          ) : (
            <LinkEntry
              key={e.id} sec={sec} e={e} mutate={mutate}
              onEdit={() => setOpenForm({ sectionId: sec.id, entryId: e.id })}
            />
          )
        )}
      {adding && (
        <LinkForm
          sec={sec} entry={null} isMusic catSuggestions={catSuggestions}
          onDone={() => setOpenForm(null)} mutate={mutate}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Chapter({ sec, openForm, setOpenForm, mutate }) {
  const adding = openForm && openForm.sectionId === sec.id && openForm.entryId === null;
  const nouns = { rules: 'une règle', music: 'une piste' };
  const noun = nouns[sec.kind] || 'un lien';

  let body;
  if (sec.kind === 'rules') {
    body = (
      <div className="entries">
        {sec.entries.map((r) =>
          openForm && openForm.sectionId === sec.id && openForm.entryId === r.id ? (
            <RuleForm key={r.id} sec={sec} entry={r} onDone={() => setOpenForm(null)} mutate={mutate} />
          ) : (
            <RuleRow
              key={r.id} sec={sec} r={r} mutate={mutate}
              onEdit={() => setOpenForm({ sectionId: sec.id, entryId: r.id })}
            />
          )
        )}
        {!sec.entries.length && !adding && (
          <p className="empty">
            Aucune règle notée. Ajoutez-en une (nom + description) : la description se déplie au clic.
          </p>
        )}
        {adding && <RuleForm sec={sec} entry={null} onDone={() => setOpenForm(null)} mutate={mutate} />}
      </div>
    );
  } else if (sec.kind === 'music') {
    body = (
      <MusicBody
        sec={sec} adding={adding} openForm={openForm && openForm.sectionId === sec.id ? openForm : null}
        setOpenForm={setOpenForm} mutate={mutate}
      />
    );
  } else {
    body = (
      <div className="entries">
        {sec.entries.map((e) =>
          openForm && openForm.sectionId === sec.id && openForm.entryId === e.id ? (
            <LinkForm
              key={e.id} sec={sec} entry={e} isMusic={false} catSuggestions={[]}
              onDone={() => setOpenForm(null)} mutate={mutate}
            />
          ) : (
            <LinkEntry
              key={e.id} sec={sec} e={e} mutate={mutate}
              onEdit={() => setOpenForm({ sectionId: sec.id, entryId: e.id })}
            />
          )
        )}
        {adding && (
          <LinkForm
            sec={sec} entry={null} isMusic={false} catSuggestions={[]}
            onDone={() => setOpenForm(null)} mutate={mutate}
          />
        )}
      </div>
    );
  }

  return (
    <section className="chapter" data-kind={sec.kind}>
      <div className="chapter__head">
        <h2>{sec.title}<span className="count"> ({sec.entries.length})</span></h2>
        <button
          className="tbtn" type="button"
          onClick={() => setOpenForm(adding ? null : { sectionId: sec.id, entryId: null })}
        >
          {adding ? '✕ fermer' : '＋ ajouter ' + noun}
        </button>
      </div>
      {body}
    </section>
  );
}

export default function Liens({ state, mutate }) {
  const [openForm, setOpenForm] = useState(null);
  return (
    <>
      {state.sections.map((sec) => (
        <Chapter
          key={sec.id} sec={sec} openForm={openForm} setOpenForm={setOpenForm} mutate={mutate}
        />
      ))}
    </>
  );
}
