import { useState } from 'react';
import { uid, lsGet, lsSet } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import SessionLink from '../SessionLink.jsx';

/* ------------------------------------------------------------------ */

function XpRow({ char, row, mutate, sessions, goToSession }) {
  const [amount, setAmount, amountRef] = useSyncedField(row.amount);
  const [reason, setReason, reasonRef] = useSyncedField(row.reason);

  const patch = (fn) =>
    mutate((s) => {
      const c = s.characters.find((x) => x.id === char.id);
      const r = c && (c.xp || []).find((x) => x.id === row.id);
      if (r) fn(r);
    });

  return (
    <div className="xprow">
      <input
        ref={amountRef} className="field" type="text" inputMode="numeric" placeholder="XP"
        value={amount} onChange={(e) => setAmount(e.target.value)}
        onBlur={() => patch((r) => { r.amount = amount.trim(); })}
      />
      <input
        ref={reasonRef} className="field" type="text" placeholder="Raison du gain"
        value={reason} onChange={(e) => setReason(e.target.value)}
        onBlur={() => patch((r) => { r.reason = reason.trim(); })}
      />
      <div className="xprow__date">
        <select
          className="field" value={row.sessionId || ''}
          onChange={(e) => patch((r) => { r.sessionId = e.target.value || null; })}
        >
          <option value="">— séance —</option>
          {(sessions || []).map((s) => <option key={s.id} value={s.id}>{s.title || 'Séance'}</option>)}
        </select>
        <SessionLink sessions={sessions} sessionId={row.sessionId} goToSession={goToSession} />
      </div>
      <button
        className="tbtn" type="button" aria-label="retirer la ligne"
        onClick={() => mutate((s) => {
          const c = s.characters.find((x) => x.id === char.id);
          if (c) c.xp = (c.xp || []).filter((x) => x.id !== row.id);
        })}
      >
        ×
      </button>
    </div>
  );
}

function CharPane({ state, char, mutate, goToSession }) {
  const [name, setName, nameRef] = useSyncedField(char.name);
  const [player, setPlayer, playerRef] = useSyncedField(char.player);
  const [art, setArt, artRef] = useSyncedField(char.artUrl);
  const [mjNote, setMjNote, mjRef] = useSyncedField(char.mjNote);

  const patch = (fn) =>
    mutate((s) => { const c = s.characters.find((x) => x.id === char.id); if (c) fn(c); });

  const participations = (state.sessions || []).filter(
    (s) => (s.participants || []).indexOf(char.id) >= 0
  );
  const xp = char.xp || [];
  const events = char.events || [];
  const recaps = char.recaps || [];
  const totalXp = xp.reduce((n, r) => n + (parseInt(r.amount, 10) || 0), 0);

  return (
    <div className="chr">
      <div className="chr__main">
        <label className="flabel">
          Nom du personnage
          <input
            ref={nameRef} className="field" type="text" placeholder="Nom du personnage"
            value={name} onChange={(e) => setName(e.target.value)}
            onBlur={() => patch((c) => { c.name = name.trim(); })}
          />
        </label>
        <label className="flabel">
          Nom du joueur
          <input
            ref={playerRef} className="field" type="text" placeholder="Nom du joueur / de la joueuse"
            value={player} onChange={(e) => setPlayer(e.target.value)}
            onBlur={() => patch((c) => { c.player = player.trim(); })}
          />
        </label>
        <label className="flabel">
          Note MJ
          <textarea
            ref={mjRef} className="notes" placeholder="Tout ce que le MJ garde en tête sur ce personnage…"
            value={mjNote} onChange={(e) => setMjNote(e.target.value)}
            onBlur={() => patch((c) => { c.mjNote = mjNote; })}
          />
        </label>
        <div className="card__actions">
          <button
            className="tbtn" type="button"
            onClick={() => {
              if (!window.confirm('Supprimer le personnage « ' + (char.name || '') + ' » ?')) return;
              mutate((s) => { s.characters = s.characters.filter((x) => x.id !== char.id); });
            }}
          >
            supprimer ce personnage
          </button>
        </div>
      </div>

      <div className="chr__side">
        <label className="flabel">
          URL d’artwork
          <input
            ref={artRef} className="field field--mono" type="text" placeholder="https://…"
            value={art} onChange={(e) => setArt(e.target.value)}
            onBlur={() => patch((c) => { c.artUrl = art.trim(); })}
          />
        </label>
        {char.artUrl ? (
          <a className="chr__artlink" href={char.artUrl} target="_blank" rel="noopener noreferrer">
            <img className="chr__art" src={char.artUrl} alt={char.name || ''} />
          </a>
        ) : (
          <div className="chr__art chr__art--placeholder">POUVOIR DE L’IMAGINATION</div>
        )}

        <div className="chr__block">
          <h4 className="chr__h">Participation<span className="count"> ({participations.length})</span></h4>
          {participations.length ? (
            <ul className="chr__list">
              {participations.map((s) => (
                <li key={s.id}>
                  <SessionLink sessions={state.sessions} sessionId={s.id} goToSession={goToSession} />
                  {s.date ? <span className="chr__muted"> · {s.date}</span> : null}
                </li>
              ))}
            </ul>
          ) : <p className="chr__muted">Aucune séance.</p>}
        </div>

        <div className="chr__block">
          <h4 className="chr__h">XP<span className="count"> (total {totalXp})</span></h4>
          <div className="xptable">
            <div className="xptable__head"><span>XP</span><span>Raison</span><span>Date</span><span /></div>
            {xp.map((r) => (
              <XpRow
                key={r.id} char={char} row={r} mutate={mutate}
                sessions={state.sessions} goToSession={goToSession}
              />
            ))}
            <button
              className="tbtn" type="button"
              onClick={() => patch((c) => { c.xp = c.xp || []; c.xp.push({ id: uid(), amount: '', reason: '', sessionId: null }); })}
            >
              ＋ ligne
            </button>
          </div>
        </div>

        {events.length > 0 && (
          <div className="chr__block">
            <h4 className="chr__h">Événements<span className="count"> ({events.length})</span></h4>
            <ul className="chr__list">
              {events.map((ev) => (
                <li key={ev.id}>
                  <span className="chr__evt">{ev.description || '—'}</span>{' '}
                  <SessionLink sessions={state.sessions} sessionId={ev.sessionId} goToSession={goToSession} />
                  <button
                    className="tbtn chr__x" type="button" aria-label="retirer"
                    onClick={() => patch((c) => { c.events = (c.events || []).filter((x) => x.id !== ev.id); })}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {recaps.length > 0 && (
          <div className="chr__block">
            <h4 className="chr__h">Résumés MJ reçus</h4>
            {recaps.map((rc) => (
              <div key={rc.id} className="chr__recap">
                <SessionLink sessions={state.sessions} sessionId={rc.sessionId} goToSession={goToSession} />
                <p className="chr__recaptxt">{rc.summary || '—'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function Personnages({ state, mutate, goToSession }) {
  const chars = state.characters || [];
  const [selId, setSelId] = useState(lsGet('ccm.char'));
  const sel = chars.find((c) => c.id === selId) || chars[0];

  function addChar() {
    const c = { id: uid(), name: 'Nouveau personnage', player: '', artUrl: '', mjNote: '', xp: [], events: [], recaps: [] };
    mutate((s) => { s.characters.push(c); });
    setSelId(c.id);
    lsSet('ccm.char', c.id);
  }

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Personnages<span className="count"> ({chars.length})</span></h2>
        <button className="tbtn" type="button" onClick={addChar}>＋ nouveau personnage</button>
      </div>

      {!chars.length ? (
        <p className="empty">
          Aucun personnage. Ajoutes-en un — chaque personnage a son onglet : nom du joueur, artwork,
          note MJ, participation aux séances et tableau d’XP.
        </p>
      ) : (
        <>
          <div className="tabs" role="tablist">
            {chars.map((c) => (
              <button
                key={c.id} type="button" role="tab" className="tab"
                aria-selected={sel && c.id === sel.id}
                onClick={() => { setSelId(c.id); lsSet('ccm.char', c.id); }}
              >
                {c.name || 'Sans nom'}
              </button>
            ))}
          </div>
          {sel && (
            <CharPane key={sel.id} state={state} char={sel} mutate={mutate} goToSession={goToSession} />
          )}
        </>
      )}
    </section>
  );
}
