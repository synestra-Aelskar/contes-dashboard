import { lsGet, lsSet } from '../../lib/util.js';
import { useState } from 'react';
import { aelValid, aelTextLine1 } from '../../lib/aelskar.js';

/**
 * Résumés de séance : le « Résumé Joueurs » rédigé par le MJ à chaque séance,
 * en lecture seule, pour que les joueurs retrouvent ce qui s'est passé dans
 * les dernières sessions. (Le résumé MJ, privé, reste dans le Journal.)
 * Un joueur ne voit que les séances qui ont un résumé ; le MJ les voit toutes.
 */
export default function ResumesSeance({ state, role }) {
  const all = state.sessions || [];
  const sessions = (role === 'admin' ? all : all.filter((s) => (s.playerSummary || '').trim())).slice().reverse();
  const [selId, setSelId] = useState(lsGet('ccm.resumes'));
  const sel = sessions.find((s) => s.id === selId) || sessions[0];

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Résumés de séance<span className="count"> ({sessions.length})</span></h2>
      </div>

      {!sessions.length ? (
        <p className="empty">Aucun résumé pour l’instant — ils apparaîtront ici après chaque séance.</p>
      ) : (
        <div className="journal">
          <div className="journal__rail">
            {sessions.map((s) => (
              <button
                key={s.id} type="button"
                className={'journal__item' + (sel && s.id === sel.id ? ' is-active' : '')}
                onClick={() => { setSelId(s.id); lsSet('ccm.resumes', s.id); }}
              >
                <span className="journal__date">{s.date || '—'}</span>
                <span className="journal__title">{s.title || 'Sans titre'}</span>
              </button>
            ))}
          </div>
          {sel && (
            <div className="journal__pane">
              <h3 className="ssn-h">{sel.title || 'Sans titre'}</h3>
              <span className="resume__meta">
                {sel.date || '—'}
                {aelValid(sel.aelDate) ? ' · ' + aelTextLine1(sel.aelDate) + ' — An ' + sel.aelDate.year : ''}
              </span>
              {(sel.playerSummary || '').trim()
                ? <p className="resume__text">{sel.playerSummary}</p>
                : <p className="empty">Pas de résumé Joueurs pour cette séance.</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
