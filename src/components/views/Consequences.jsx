import { useState } from 'react';
import { uid } from '../../lib/util.js';
import { toast } from '../../lib/toast.js';
import SessionLink from '../SessionLink.jsx';

function CForm({ entry, onDone, mutate }) {
  const [a, setA] = useState(entry ? entry.trigger || '' : '');
  const [b, setB] = useState(entry ? entry.effect || '' : '');

  function save() {
    const t = a.trim();
    const e = b.trim();
    if (!t && !e) { toast('Remplis au moins un champ'); return; }
    mutate((s) => {
      if (entry) {
        const c = s.consequences.find((x) => x.id === entry.id);
        if (c) { c.trigger = t; c.effect = e; }
      } else {
        s.consequences.push({ id: uid(), trigger: t, effect: e, done: false });
      }
    });
    onDone();
  }

  return (
    <div className="card">
      <label className="flabel">
        Si —
        <textarea
          className="finput finput--area" placeholder="Ce que les joueur·euses ont fait…"
          value={a} onChange={(e) => setA(e.target.value)}
        />
      </label>
      <label className="flabel">
        Alors —
        <textarea
          className="finput finput--area" placeholder="Ce que ça déclenche / à ressortir plus tard…"
          value={b} onChange={(e) => setB(e.target.value)}
        />
      </label>
      <div className="card__actions">
        <button className="btn-primary" type="button" onClick={save}>
          {entry ? 'Enregistrer' : 'Ajouter'}
        </button>
        <button className="tbtn" type="button" onClick={onDone}>annuler</button>
      </div>
    </div>
  );
}

export default function Consequences({ state, mutate, goToSession }) {
  const [openId, setOpenId] = useState(undefined); // undefined = rien, null = ajout, id = edit
  const items = (state.consequences || []).slice().sort((x, y) => (x.done ? 1 : 0) - (y.done ? 1 : 0));
  const adding = openId === null;

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Conséquences<span className="count"> ({(state.consequences || []).length})</span></h2>
        <button
          className="tbtn" type="button"
          onClick={() => setOpenId(adding ? undefined : null)}
        >
          {adding ? '✕ fermer' : '＋ nouvelle conséquence'}
        </button>
      </div>

      {!items.length && !adding ? (
        <p className="empty">
          Les fils tendus : « les joueur·euses ont fait X → ça déclenchera Y ». Tu ne les oublieras
          plus, même quatre séances plus tard.
        </p>
      ) : (
        <div className="cards">
          {adding && <CForm entry={null} onDone={() => setOpenId(undefined)} mutate={mutate} />}
          {items.map((c) =>
            openId === c.id ? (
              <CForm key={c.id} entry={c} onDone={() => setOpenId(undefined)} mutate={mutate} />
            ) : (
              <div key={c.id} className={'card' + (c.done ? ' is-done' : '')}>
                <span className="card__label">{c.done ? 'Résolu · Si —' : 'Si —'}</span>
                <p className="card__text">{c.trigger || '—'}</p>
                <div className="arrow">↓</div>
                <span className="card__label">Alors —</span>
                <p className="card__text">{c.effect || '—'}</p>
                {c.sessionId && (
                  <SessionLink sessions={state.sessions} sessionId={c.sessionId} goToSession={goToSession} />
                )}
                <div className="card__actions">
                  <label className="fcheck">
                    <input
                      type="checkbox" checked={!!c.done}
                      onChange={(e) => {
                        const v = e.target.checked;
                        mutate((s) => {
                          const x = s.consequences.find((y) => y.id === c.id);
                          if (x) x.done = v;
                        });
                      }}
                    />
                    résolu
                  </label>
                  <button className="tbtn" type="button" onClick={() => setOpenId(c.id)}>modifier</button>
                  <button
                    className="tbtn" type="button"
                    onClick={() => {
                      if (!window.confirm('Retirer cette conséquence ?')) return;
                      mutate((s) => { s.consequences = s.consequences.filter((y) => y.id !== c.id); });
                    }}
                  >
                    retirer
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}
