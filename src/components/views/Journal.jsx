import { useState } from 'react';
import { uid, lsGet, lsSet } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { aelValid, aelTextLine1 } from '../../lib/aelskar.js';
import { campaignDate } from '../WorldDate.jsx';
import AelPicker from '../AelPicker.jsx';
import CharToggles from '../CharToggles.jsx';

const clone = (x) => JSON.parse(JSON.stringify(x));

function Pane({ state, sel, mutate }) {
  const chars = state.characters || [];
  const [date, setDate, dateRef] = useSyncedField(sel.date);
  const [title, setTitle, titleRef] = useSyncedField(sel.title);
  const [summary, setSummary, summaryRef] = useSyncedField(sel.summary);
  const [pickOpen, setPickOpen] = useState(false);

  const patch = (fn) =>
    mutate((s) => { const x = s.sessions.find((y) => y.id === sel.id); if (x) fn(x); });

  return (
    <div className="journal__pane">
      <div className="journal__meta">
        <label className="flabel">
          Date réelle
          <input
            ref={dateRef}
            className="finput" type="text" placeholder="Date (monde ou réelle)"
            value={date} onChange={(e) => setDate(e.target.value)}
            onBlur={() => patch((x) => { x.date = date.trim(); })}
          />
        </label>
        <label className="flabel">
          Titre
          <input
            ref={titleRef}
            className="finput" type="text" placeholder="Titre de la séance"
            value={title} onChange={(e) => setTitle(e.target.value)}
            onBlur={() => patch((x) => { x.title = title.trim(); })}
          />
        </label>
      </div>

      <div className="clock__deadline">
        <span className="flabel">Date en jeu (Aelskar)</span>
        <button
          className="finput aelpick-trigger" type="button"
          onClick={() => setPickOpen((v) => !v)}
        >
          {aelValid(sel.aelDate)
            ? aelTextLine1(sel.aelDate) + ' — An ' + sel.aelDate.year
            : 'Choisir la date en jeu…'}
        </button>
        {pickOpen && (
          <AelPicker
            cur={aelValid(sel.aelDate) ? sel.aelDate : campaignDate(state)}
            onPick={(d) => { patch((x) => { x.aelDate = d; }); setPickOpen(false); }}
            onToday={() => { patch((x) => { x.aelDate = clone(campaignDate(state)); }); setPickOpen(false); }}
            midLabel="Présent actuel"
          />
        )}
      </div>

      <label className="flabel">
        Résumé
        <textarea
          ref={summaryRef}
          className="finput finput--area journal__summary"
          placeholder="Résumé : ce qui a été fait, décidé, découvert ; PNJ rencontrés ; fils laissés en suspens…"
          value={summary} onChange={(e) => setSummary(e.target.value)}
          onBlur={() => patch((x) => { x.summary = summary; })}
        />
      </label>

      <div className="flabel">
        <span>Participants<span className="count"> ({(sel.participants || []).length})</span></span>
        <CharToggles
          characters={chars}
          selected={sel.participants}
          onToggle={(cid) =>
            patch((x) => {
              x.participants = x.participants || [];
              const i = x.participants.indexOf(cid);
              if (i >= 0) x.participants.splice(i, 1); else x.participants.push(cid);
            })
          }
        />
      </div>

      {Array.isArray(sel.events) && sel.events.length > 0 && (
        <div className="flabel">
          <span>Événements</span>
          <ul className="chr__list">
            {sel.events.map((ev) => (
              <li key={ev.id}>
                {ev.description || '—'}
                {(ev.charIds || []).length ? (
                  <span className="chr__muted">
                    {' — '}
                    {(ev.charIds || [])
                      .map((id) => (chars.find((c) => c.id === id) || {}).name || '?')
                      .join(', ')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card__actions">
        <button
          className="tbtn" type="button"
          onClick={() => {
            if (!window.confirm('Supprimer la séance « ' + (sel.title || '') + ' » ?')) return;
            mutate((s) => { s.sessions = s.sessions.filter((y) => y.id !== sel.id); });
          }}
        >
          supprimer cette séance
        </button>
      </div>
    </div>
  );
}

export default function Journal({ state, mutate }) {
  const sessions = state.sessions || [];
  const [selId, setSelId] = useState(lsGet('ccm.session'));

  function addSession() {
    const s = {
      id: uid(),
      date: new Date().toLocaleDateString('fr-FR'),
      aelDate: clone(campaignDate(state)),
      title: 'Séance ' + (sessions.length + 1),
      summary: ''
    };
    mutate((st) => { st.sessions.push(s); });
    setSelId(s.id);
    lsSet('ccm.session', s.id);
  }

  const sel = sessions.find((x) => x.id === selId) || sessions[sessions.length - 1];

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Journal de campagne<span className="count"> ({sessions.length})</span></h2>
        <button className="tbtn" type="button" onClick={addSession}>＋ nouvelle séance</button>
      </div>

      {!sessions.length ? (
        <p className="empty">
          Aucune séance consignée. En fin de partie, crée une séance et résume ce qui s’est passé —
          la liste des séances apparaîtra à gauche.
        </p>
      ) : (
        <div className="journal">
          <div className="journal__rail">
            {sessions.slice().reverse().map((s) => (
              <button
                key={s.id} type="button"
                className={'journal__item' + (sel && s.id === sel.id ? ' is-active' : '')}
                onClick={() => { setSelId(s.id); lsSet('ccm.session', s.id); }}
              >
                <span className="journal__date">{s.date || '—'}</span>
                <span className="journal__title">{s.title || 'Sans titre'}</span>
              </button>
            ))}
          </div>
          {sel && <Pane key={sel.id} state={state} sel={sel} mutate={mutate} />}
        </div>
      )}
    </section>
  );
}
