import { uid } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import SessionLink from '../SessionLink.jsx';

function OwnCharPane({ state, char, mutate, goToSession }) {
  const [name, setName, nameRef] = useSyncedField(char.name);
  const [art, setArt, artRef] = useSyncedField(char.artUrl);
  const patch = (fn) => mutate((s) => { const c = s.characters.find((x) => x.id === char.id); if (c) fn(c); });

  const participations = (state.sessions || []).filter((s) => (s.participants || []).indexOf(char.id) >= 0);
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
          {xp.length ? (
            <ul className="chr__list">
              {xp.map((r) => (
                <li key={r.id}>
                  <b>{r.amount || 0} XP</b> — {r.reason || '—'}{' '}
                  <SessionLink sessions={state.sessions} sessionId={r.sessionId} goToSession={goToSession} />
                </li>
              ))}
            </ul>
          ) : <p className="chr__muted">Pas encore d’XP.</p>}
        </div>

        {events.length > 0 && (
          <div className="chr__block">
            <h4 className="chr__h">Événements<span className="count"> ({events.length})</span></h4>
            <ul className="chr__list">
              {events.map((ev) => (
                <li key={ev.id}>
                  <span className="chr__evt">{ev.description || '—'}</span>{' '}
                  <SessionLink sessions={state.sessions} sessionId={ev.sessionId} goToSession={goToSession} />
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

/**
 * Vue « joueur » de l'onglet Personnage : un joueur ne voit et ne peut
 * éditer que SON personnage (rattaché par char.ownerId === son user id
 * Supabase). XP / événements / résumés MJ restent en lecture seule (ce
 * sont des enregistrements du MJ) ; la Note MJ n'est jamais exposée ici.
 */
export default function PersonnageJoueur({ state, mutate, userId, goToSession }) {
  const chars = state.characters || [];
  const mine = chars.find((c) => c.ownerId === userId);

  function createMine() {
    const c = {
      id: uid(), name: 'Nouveau personnage', player: '', artUrl: '', mjNote: '',
      xp: [], events: [], recaps: [], ownerId: userId
    };
    mutate((s) => { s.characters.push(c); });
  }

  return (
    <section className="chapter">
      <div className="chapter__head"><h2>{mine ? (mine.name || 'Personnage') : 'Personnage'}</h2></div>
      {mine ? (
        <OwnCharPane state={state} char={mine} mutate={mutate} goToSession={goToSession} />
      ) : (
        <>
          <p className="empty">Tu n’as pas encore de personnage.</p>
          <button className="btn-primary" type="button" onClick={createMine}>＋ créer mon personnage</button>
        </>
      )}
    </section>
  );
}
