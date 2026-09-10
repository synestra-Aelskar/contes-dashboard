import { useState } from 'react';
import { uid } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { aelValid, aelCompare, aelTextLine1 } from '../../lib/aelskar.js';
import { campaignDate } from '../WorldDate.jsx';
import AelPicker from '../AelPicker.jsx';
import SessionLink from '../SessionLink.jsx';

const clone = (x) => JSON.parse(JSON.stringify(x));

export function clockExpired(state, c) {
  if (c.expired === true) return true;
  if (c.kind === 'timer' && (c.filled || 0) >= (c.size || 1)) return true;
  if (c.kind === 'deadline' && aelValid(c.deadlineAel) &&
      aelCompare(campaignDate(state), c.deadlineAel) >= 0) return true;
  return false;
}

function ClockCard({ state, c, mutate, goToSession }) {
  const [title, setTitle, titleRef] = useSyncedField(c.title);
  const [note, setNote, noteRef] = useSyncedField(c.note);
  const [pickOpen, setPickOpen] = useState(false);

  const patch = (fn) =>
    mutate((s) => { const x = s.clocks.find((y) => y.id === c.id); if (x) fn(x); });

  const expired = clockExpired(state, c);
  const picked = aelValid(c.deadlineAel) ? c.deadlineAel : null;

  return (
    <div className={'card clock' + (expired ? ' clock--expired' : '')}>
      {expired && <div className="clock__banner">⚠ Événement arrivé à échéance</div>}

      <input
        ref={titleRef}
        className="finput clock__title" type="text" placeholder="Nom de l’horloge / du front"
        value={title} onChange={(e) => setTitle(e.target.value)}
        onBlur={() => patch((x) => { x.title = title.trim(); })}
      />

      <div className="clock__kinds">
        {[['timer', 'Segments'], ['deadline', 'Date butoir']].map(([val, label]) => (
          <button
            key={val} type="button"
            className={'clock__kindbtn' + (c.kind === val ? ' is-on' : '')}
            onClick={() => patch((x) => { x.kind = val; })}
          >
            {label}
          </button>
        ))}
      </div>

      {c.kind === 'deadline' ? (
        <div className="clock__deadline">
          <span className="flabel">Échéance (date d’Aelskar)</span>
          <button
            className="finput aelpick-trigger" type="button"
            onClick={() => setPickOpen((v) => !v)}
          >
            {picked
              ? aelTextLine1(picked) + ' — An ' + picked.year
              : (c.deadline ? c.deadline : 'Choisir une date…')}
          </button>
          {picked && (
            <button
              className="tbtn" type="button"
              onClick={() => patch((x) => { x.deadlineAel = null; })}
            >
              retirer l’échéance
            </button>
          )}
          {pickOpen && (
            <AelPicker
              cur={picked || campaignDate(state)}
              onPick={(d) => { patch((x) => { x.deadlineAel = d; x.deadline = ''; }); setPickOpen(false); }}
              onToday={() => { patch((x) => { x.deadlineAel = clone(campaignDate(state)); }); setPickOpen(false); }}
            />
          )}
        </div>
      ) : (
        <div className="clock__timer">
          <div className="pips">
            {Array.from({ length: c.size || 6 }).map((_, i) => (
              <button
                key={i} type="button"
                className={'pip' + (i < (c.filled || 0) ? ' is-on' : '')}
                aria-label={'segment ' + (i + 1)}
                onClick={() => patch((x) => { x.filled = x.filled === i + 1 ? i : i + 1; })}
              />
            ))}
          </div>
          <select
            className="finput clock__size" value={String(c.size || 6)}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              patch((x) => { x.size = n; if ((x.filled || 0) > n) x.filled = n; });
            }}
          >
            {[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n} segments</option>)}
          </select>
          <span className="card__label">{(c.filled || 0) + ' / ' + (c.size || 6)}</span>
        </div>
      )}

      <label className="flabel">
        Effet
        <textarea
          ref={noteRef}
          className="finput finput--area"
          placeholder="Ce qui se passe / ce qui se déclenche à échéance…"
          value={note} onChange={(e) => setNote(e.target.value)}
          onBlur={() => patch((x) => { x.note = note; })}
        />
      </label>

      {c.sessionId && (
        <SessionLink sessions={state.sessions} sessionId={c.sessionId} goToSession={goToSession} />
      )}

      <div className="card__actions">
        <button
          className="tbtn" type="button"
          onClick={() => patch((x) => { x.expired = !x.expired; })}
        >
          {c.expired ? 'réarmer' : 'marquer échu'}
        </button>
        <button
          className="tbtn" type="button"
          onClick={() => {
            if (!window.confirm('Retirer « ' + (c.title || '') + ' » ?')) return;
            mutate((s) => { s.clocks = s.clocks.filter((y) => y.id !== c.id); });
          }}
        >
          retirer
        </button>
      </div>
    </div>
  );
}

export default function Horloges({ state, mutate, goToSession }) {
  const clocks = state.clocks || [];
  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Horloges &amp; fronts<span className="count"> ({clocks.length})</span></h2>
        <button
          className="tbtn" type="button"
          onClick={() =>
            mutate((s) => {
              s.clocks.push({
                id: uid(), title: '', kind: 'timer', size: 6, filled: 0,
                deadline: '', note: '', expired: false
              });
            })
          }
        >
          ＋ nouvelle horloge
        </button>
      </div>

      {!clocks.length ? (
        <p className="empty">
          Tiens le compte des menaces qui avancent : une horloge à segments, ou une date butoir.
          À échéance, l’événement passe en rouge.
        </p>
      ) : (
        <div className="cards">
          {clocks.map((c) => (
            <ClockCard key={c.id} state={state} c={c} mutate={mutate} goToSession={goToSession} />
          ))}
        </div>
      )}
    </section>
  );
}
