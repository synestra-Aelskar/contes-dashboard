import { useState } from 'react';
import { uid, lsGet, lsSet } from '../../lib/util.js';

const MJ_AUTHOR_ID = 'mj';

function ThreadMessages({ thread, mutate }) {
  const [text, setText] = useState('');

  function send() {
    const t = text.trim();
    if (!t) return;
    mutate((s) => {
      const th = (s.threads || []).find((x) => x.id === thread.id);
      if (th) {
        th.messages = th.messages || [];
        th.messages.push({ id: uid(), authorId: MJ_AUTHOR_ID, authorName: 'MJ', text: t, createdAt: new Date().toISOString() });
      }
    });
    setText('');
  }

  return (
    <div className="pj__thread">
      <div className="pj__threadmsgs">
        {(thread.messages || []).map((m) => (
          <div key={m.id} className={'pj__msg' + (m.authorId === MJ_AUTHOR_ID ? ' pj__msg--mine' : '')}>
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
          className="notes" placeholder="Répondre en tant que MJ…" rows={3}
          value={text} onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-primary" type="button" onClick={send}>Envoyer</button>
      </div>
    </div>
  );
}

/** Vue MJ : tous les threads Backstage, tous joueurs confondus — le MJ est
 * implicitement participant de chaque thread créé côté joueur. */
export default function BackstageMJ({ state, mutate }) {
  const threads = state.threads || [];
  const chars = state.characters || [];
  const nameOf = (id) => (chars.find((c) => c.id === id) || {}).name || 'Sans nom';

  const [selId, setSelId] = useState(lsGet('ccm.mjThread'));
  const sel = threads.find((t) => t.id === selId) || threads[0] || null;
  const select = (id) => { setSelId(id); lsSet('ccm.mjThread', id); };

  return (
    <section className="chapter">
      <div className="chapter__head"><h2>Backstage (MJ)<span className="count"> ({threads.length})</span></h2></div>
      {!threads.length ? (
        <p className="empty">Aucun thread créé par les joueurs pour l’instant.</p>
      ) : (
        <div className="pj__backstage">
          <div className="pj__threadrail">
            {threads.map((t) => (
              <button
                key={t.id} type="button"
                className={'journal__item' + (sel && sel.id === t.id ? ' is-active' : '')}
                onClick={() => select(t.id)}
              >
                <span className="journal__title">{t.title || 'Sans titre'}</span>
                <span className="chr__muted">{(t.participantIds || []).map(nameOf).join(', ')}</span>
              </button>
            ))}
          </div>
          {sel ? <ThreadMessages key={sel.id} thread={sel} mutate={mutate} /> : <p className="empty">Sélectionne un thread.</p>}
        </div>
      )}
    </section>
  );
}
