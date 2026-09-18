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
    <div className="xprow xprow--char">
      <input
        ref={amountRef} className="field field--xp" type="text" inputMode="numeric" placeholder="XP"
        value={amount}
        onChange={(e) => { const v = e.target.value; setAmount(v); patch((r) => { r.amount = v; }); }}
        onBlur={() => patch((r) => { r.amount = amount.trim(); })}
      />
      <textarea
        ref={reasonRef} className="field field--area" rows={2} placeholder="Raison du gain"
        value={reason}
        onChange={(e) => { const v = e.target.value; setReason(v); patch((r) => { r.reason = v; }); }}
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
            value={name}
            onChange={(e) => { const v = e.target.value; setName(v); patch((c) => { c.name = v; }); }}
            onBlur={() => patch((c) => { c.name = name.trim(); })}
          />
        </label>
        <label className="flabel">
          Note MJ
          <textarea
            ref={mjRef} className="notes" placeholder="Tout ce que le MJ garde en tête sur ce personnage…"
            value={mjNote}
            onChange={(e) => { const v = e.target.value; setMjNote(v); patch((c) => { c.mjNote = v; }); }}
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
            value={art}
            onChange={(e) => { const v = e.target.value; setArt(v); patch((c) => { c.artUrl = v.trim(); }); }}
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
          <div className="xptable xptable--char">
            <div className="xptable__head"><span>XP</span><span>Raison</span><span /></div>
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

/* --- sommaire par compte (arbre) ----------------------------------- */

function AccountNode({ account, chars, selId, onSelect }) {
  const [open, setOpen] = useState(true);
  const linked = chars.filter((c) => account.userId && c.ownerId === account.userId);
  return (
    <div className="zone-node">
      <div className="zone-node__row">
        <button
          className="zone-node__chev" type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ visibility: linked.length ? 'visible' : 'hidden' }}
          aria-label={open ? 'replier' : 'déplier'}
        >
          {open ? '▾' : '▸'}
        </button>
        <span className="zone-node__label zone-node__label--static">{account.label || account.email}</span>
      </div>
      {open && linked.length > 0 && (
        <div className="zone-node__kids">
          {linked.map((c) => (
            <div key={c.id} className="zone-node">
              <div className={'zone-node__row' + (selId === c.id ? ' is-sel' : '')}>
                <span className="zone-node__chev" style={{ visibility: 'hidden' }} />
                <button className="zone-node__label" type="button" onClick={() => onSelect(c.id)}>
                  {c.name || 'Sans nom'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {open && !linked.length && <p className="chr__muted zone-node__empty">Aucun personnage créé.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function Personnages({ state, mutate, goToSession }) {
  const chars = state.characters || [];
  const accounts = (state.settings && state.settings.accounts) || [];
  const [selId, setSelId] = useState(lsGet('ccm.char'));
  const sel = chars.find((c) => c.id === selId);

  const select = (id) => { setSelId(id); lsSet('ccm.char', id); };

  function addChar() {
    const c = { id: uid(), name: 'Nouveau personnage', artUrl: '', mjNote: '', xp: [], events: [], recaps: [], ownerId: null };
    mutate((s) => { s.characters.push(c); });
    select(c.id);
  }

  const linkedAccountIds = new Set(accounts.filter((a) => a.userId).map((a) => a.userId));
  const unlinked = chars.filter((c) => !c.ownerId || !linkedAccountIds.has(c.ownerId));

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Personnages<span className="count"> ({chars.length})</span></h2>
        <button className="tbtn" type="button" onClick={addChar}>＋ nouveau personnage</button>
      </div>

      {!chars.length ? (
        <p className="empty">
          Aucun personnage. Ajoutes-en un — chaque personnage a son onglet : artwork, note MJ,
          participation aux séances et tableau d’XP.
        </p>
      ) : (
        <div className="zones">
          <div className="zone-tree">
            {accounts.filter((a) => a.userId).map((a) => (
              <AccountNode key={a.id} account={a} chars={chars} selId={selId} onSelect={select} />
            ))}
            {unlinked.length > 0 && (
              <div className="zone-node">
                <div className="zone-node__row">
                  <span className="zone-node__chev" style={{ visibility: 'hidden' }} />
                  <span className="zone-node__label zone-node__label--static">Sans compte lié</span>
                </div>
                <div className="zone-node__kids">
                  {unlinked.map((c) => (
                    <div key={c.id} className="zone-node">
                      <div className={'zone-node__row' + (selId === c.id ? ' is-sel' : '')}>
                        <span className="zone-node__chev" style={{ visibility: 'hidden' }} />
                        <button className="zone-node__label" type="button" onClick={() => select(c.id)}>
                          {c.name || 'Sans nom'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {sel ? (
            <CharPane key={sel.id} state={state} char={sel} mutate={mutate} goToSession={goToSession} />
          ) : (
            <p className="empty">Sélectionne un personnage dans la liste à gauche.</p>
          )}
        </div>
      )}
    </section>
  );
}
