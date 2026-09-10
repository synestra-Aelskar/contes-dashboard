import { useState } from 'react';
import { uid } from '../../lib/util.js';
import { toast } from '../../lib/toast.js';
import SessionLink from '../SessionLink.jsx';

const KINDS = ['Promesse de PNJ', 'Objet mystérieux', 'Info glissée en passant', 'PNJ à revoir', 'Lieu à explorer'];

function RForm({ entry, onDone, mutate }) {
  const [text, setText] = useState(entry ? entry.text || '' : '');
  const [kind, setKind] = useState(entry ? entry.kind || '' : '');

  function save() {
    const t = text.trim();
    if (!t) { toast('Écris quelque chose'); return; }
    const kv = kind.trim() || 'Divers';
    mutate((s) => {
      if (entry) {
        const r = s.reminders.find((x) => x.id === entry.id);
        if (r) { r.text = t; r.kind = kv; }
      } else {
        s.reminders.push({ id: uid(), text: t, kind: kv });
      }
    });
    onDone();
  }

  return (
    <div className="form">
      <label className="flabel">
        Note
        <textarea
          className="finput finput--area" placeholder="Quoi ne pas oublier…"
          value={text} onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label className="flabel">
        Catégorie
        <input
          className="finput" type="text" placeholder="Catégorie" list="rk-list"
          value={kind} onChange={(e) => setKind(e.target.value)}
        />
      </label>
      <datalist id="rk-list">{KINDS.map((x) => <option key={x} value={x} />)}</datalist>
      <div className="form__actions">
        <button className="btn-primary" type="button" onClick={save}>
          {entry ? 'Enregistrer' : 'Ajouter'}
        </button>
        <button className="tbtn" type="button" onClick={onDone}>annuler</button>
      </div>
    </div>
  );
}

export default function Oublis({ state, mutate, goToSession }) {
  const [openId, setOpenId] = useState(undefined);
  const reminders = state.reminders || [];
  const adding = openId === null;

  const groups = {};
  reminders.forEach((r) => { const k = r.kind || 'Divers'; (groups[k] = groups[k] || []).push(r); });
  const order = KINDS.concat(Object.keys(groups).filter((k) => KINDS.indexOf(k) < 0));

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>À ne pas oublier<span className="count"> ({reminders.length})</span></h2>
        <button className="tbtn" type="button" onClick={() => setOpenId(adding ? undefined : null)}>
          {adding ? '✕ fermer' : '＋ ajouter'}
        </button>
      </div>

      <div className="entries">
        {adding && <RForm entry={null} onDone={() => setOpenId(undefined)} mutate={mutate} />}
        {!reminders.length && !adding && (
          <p className="empty">
            Promesses de PNJ, objets mystérieux, infos lâchées en passant, personnages que les
            joueur·euses veulent revoir.
          </p>
        )}
        {order.map((k) =>
          groups[k] ? (
            <div key={k}>
              <div className="grouphead">{k}</div>
              {groups[k].map((r) =>
                openId === r.id ? (
                  <RForm key={r.id} entry={r} onDone={() => setOpenId(undefined)} mutate={mutate} />
                ) : (
                  <div key={r.id} className="entry">
                    <span className="entry__marker" />
                    <div className="entry__main">
                      <p className="entry__body">{r.text || '—'}</p>
                      {r.sessionId && (
                        <SessionLink sessions={state.sessions} sessionId={r.sessionId} goToSession={goToSession} />
                      )}
                      <div className="entry__actions">
                        <button className="tbtn" type="button" onClick={() => setOpenId(r.id)}>modifier</button>
                        <button
                          className="tbtn" type="button"
                          onClick={() => {
                            if (!window.confirm('Retirer ?')) return;
                            mutate((s) => { s.reminders = s.reminders.filter((x) => x.id !== r.id); });
                          }}
                        >
                          retirer
                        </button>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          ) : null
        )}
      </div>
    </section>
  );
}
