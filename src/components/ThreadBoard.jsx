import { useState } from 'react';
import { uid, lsGet, lsSet } from '../lib/util.js';
import { toast } from '../lib/toast.js';

export function ThreadMessages({ thread, mutate, authorId, authorName }) {
  const [text, setText] = useState('');

  function send() {
    const t = text.trim();
    if (!t) return;
    mutate((s) => {
      const th = (s.threads || []).find((x) => x.id === thread.id);
      if (th) {
        th.messages = th.messages || [];
        th.messages.push({ id: uid(), authorId, authorName, text: t, createdAt: new Date().toISOString() });
      }
    });
    setText('');
  }

  function toggleClosed() {
    mutate((s) => {
      const th = (s.threads || []).find((x) => x.id === thread.id);
      if (th) th.closed = !th.closed;
    });
  }

  return (
    <div className="pj__thread">
      <div className="pj__threadhead">
        <span className={'pj__threadstatus' + (thread.closed ? ' is-closed' : '')}>
          {thread.closed ? 'Clôturé' : 'Ouvert'}
        </span>
        <button className="tbtn" type="button" onClick={toggleClosed}>
          {thread.closed ? 'Rouvrir le sujet' : 'Clôturer le sujet'}
        </button>
      </div>
      <div className="pj__threadmsgs">
        {(thread.messages || []).map((m) => (
          <div key={m.id} className={'pj__msg' + (m.authorId === authorId ? ' pj__msg--mine' : '')}>
            <div className="pj__msghead">
              <b>{m.authorName || '—'}</b>
              <span className="chr__muted">{m.createdAt ? new Date(m.createdAt).toLocaleString('fr-FR') : ''}</span>
            </div>
            <p className="pj__msgtext">{m.text}</p>
          </div>
        ))}
        {!((thread.messages || []).length) && <p className="chr__muted">Aucun message pour l’instant.</p>}
      </div>
      <div className="pj__threadcompose">
        <textarea
          className="notes" placeholder="Écrire un message…" rows={3}
          value={text} onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-primary" type="button" onClick={send}>Envoyer</button>
      </div>
    </div>
  );
}

/**
 * Forum Backstage scopé à un personnage : threads où `scopeCharId` participe.
 * Côté joueur (canCreate=true) : le joueur écrit en son nom (authorId = son
 * personnage) et peut créer un thread + inviter d'autres personnages joueurs.
 * Côté MJ (canCreate=false) : le MJ ne fait que lire/répondre (authorId='mj'),
 * jamais créer de thread au nom du joueur.
 */
export default function ThreadBoard({ state, mutate, scopeCharId, authorId, authorName, canCreate, storageKey }) {
  const allThreads = state.threads || [];
  const otherChars = (state.characters || []).filter((c) => c.id !== scopeCharId && c.ownerId);
  const mine = allThreads.filter((t) => t.participantIds.includes(scopeCharId) || t.createdBy === scopeCharId);
  const [selId, setSelId] = useState(lsGet(storageKey) || (mine[0] && mine[0].id) || null);
  const sel = mine.find((t) => t.id === selId) || mine[0] || null;
  const [title, setTitle] = useState('');
  const [invited, setInvited] = useState([]);

  function select(id) { setSelId(id); lsSet(storageKey, id); }

  function toggleInvite(id) {
    setInvited((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function createThread() {
    const t = title.trim();
    if (!t) { toast('Titre du thread requis'); return; }
    const thread = { id: uid(), title: t, participantIds: [scopeCharId, ...invited], messages: [], createdBy: scopeCharId, createdAt: new Date().toISOString(), closed: false };
    mutate((s) => { s.threads = s.threads || []; s.threads.push(thread); });
    setTitle(''); setInvited([]);
    select(thread.id);
  }

  return (
    <div className="pj__backstage">
      <div className="pj__threadrail">
        {mine.map((t) => (
          <button
            key={t.id} type="button"
            className={'journal__item' + (sel && sel.id === t.id ? ' is-active' : '')}
            onClick={() => select(t.id)}
          >
            <span className="journal__title">{t.title || 'Sans titre'}</span>
            {t.closed && <span className="chr__muted"> (clôturé)</span>}
          </button>
        ))}
        {canCreate && (
          <div className="pj__newthread">
            <input
              className="field" type="text" placeholder="Titre du nouveau thread"
              value={title} onChange={(e) => setTitle(e.target.value)}
            />
            {otherChars.length > 0 && (
              <div className="pj__invitelist">
                <span className="chr__muted">Inviter :</span>
                {otherChars.map((c) => (
                  <label key={c.id} className="pj__invitechip">
                    <input type="checkbox" checked={invited.includes(c.id)} onChange={() => toggleInvite(c.id)} />
                    {c.name || 'Sans nom'}
                  </label>
                ))}
              </div>
            )}
            <button className="tbtn" type="button" onClick={createThread}>＋ créer le thread</button>
          </div>
        )}
      </div>
      {sel ? (
        <ThreadMessages key={sel.id} thread={sel} mutate={mutate} authorId={authorId} authorName={authorName} />
      ) : (
        <p className="empty">
          {canCreate
            ? 'Aucun thread. Crée-en un pour ouvrir une narration hors-jeu avec le MJ (et d’autres joueurs si tu le souhaites).'
            : 'Aucun thread pour ce personnage.'}
        </p>
      )}
    </div>
  );
}
