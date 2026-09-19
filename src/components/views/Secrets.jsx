import { useState } from 'react';
import { uid } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { PLAYER_EMAIL_DOMAIN } from '../../lib/playerAuth.js';

/* Un secret = un titre + autant de blocs que l'on veut. Chaque bloc est caché
 * par défaut ; la roue crantée choisit, personnage par personnage (triés par
 * joueur·euse), à qui il est révélé. Côté joueur, seuls les blocs révélés à
 * l'un de SES personnages apparaissent. */

function accountLabel(account) {
  if (!account) return '';
  if (account.label && account.label.trim()) return account.label.trim();
  const email = account.email || '';
  return email.endsWith(PLAYER_EMAIL_DOMAIN) ? email.slice(0, -PLAYER_EMAIL_DOMAIN.length) : email.split('@')[0];
}

/** Personnages groupés par joueur·euse (compte), puis « Sans joueur ». */
function groupCharacters(state) {
  const accounts = (state.settings && state.settings.accounts) || [];
  const byOwner = new Map();
  accounts.forEach((a) => { if (a.userId) byOwner.set(a.userId, accountLabel(a) || 'Compte'); });
  const groups = new Map();
  (state.characters || []).forEach((c) => {
    const key = c.ownerId && byOwner.has(c.ownerId) ? c.ownerId : '__none__';
    const label = key === '__none__' ? 'Sans joueur' : byOwner.get(key);
    if (!groups.has(key)) groups.set(key, { key, label, chars: [] });
    groups.get(key).chars.push(c);
  });
  const out = Array.from(groups.values());
  out.forEach((g) => g.chars.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr')));
  out.sort((a, b) => {
    if (a.key === '__none__') return 1;
    if (b.key === '__none__') return -1;
    return a.label.localeCompare(b.label, 'fr');
  });
  return out;
}

function charName(state, id) {
  const c = (state.characters || []).find((x) => x.id === id);
  return c ? (c.name || 'Personnage') : null;
}

function RevealModal({ state, block, onToggle, onClose }) {
  const groups = groupCharacters(state);
  const revealed = new Set(block.revealedTo || []);
  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal__card secret-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Révéler ce bloc à…</h3>
        <p className="modal__note">
          Coche les personnages qui connaissent ce morceau du secret. Leur joueur·euse le verra
          dans sa vue Secrets ; les autres blocs restent cachés.
        </p>
        {!groups.length ? (
          <p className="empty">Aucun personnage pour l’instant.</p>
        ) : groups.map((g) => (
          <div key={g.key} className="secret-modal__group">
            <span className="card__label">{g.label}</span>
            {g.chars.map((c) => (
              <label key={c.id} className="secret-modal__row">
                <input type="checkbox" checked={revealed.has(c.id)} onChange={() => onToggle(c.id)} />
                <span>{c.name || 'Personnage'}</span>
              </label>
            ))}
          </div>
        ))}
        <div className="modal__actions">
          <button className="tbtn" type="button" onClick={onClose}>fermer</button>
        </div>
      </div>
    </div>
  );
}

function SecretBlock({ state, s, b, index, mutate }) {
  const [text, setText, textRef] = useSyncedField(b.text);
  const [open, setOpen] = useState(false);
  const patchBlock = (fn) =>
    mutate((st) => {
      const x = st.secrets.find((y) => y.id === s.id);
      const blk = x && (x.blocks || []).find((z) => z.id === b.id);
      if (blk) fn(blk);
    });
  const names = (b.revealedTo || []).map((id) => charName(state, id)).filter(Boolean);

  return (
    <div className="secret-block">
      <div className="secret-block__head">
        <span className="secret-block__label">Bloc {index + 1}</span>
        <span className={'secret-block__who' + (names.length ? ' is-revealed' : '')}>
          {names.length ? 'Révélé à : ' + names.join(', ') : 'Caché'}
        </span>
        <button
          className="secret-block__gear" type="button" title="Révéler à…" aria-label="Révéler à…"
          onClick={() => setOpen(true)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button
          className="tbtn secret-block__remove" type="button"
          onClick={() => {
            if (text.trim() && !window.confirm('Retirer ce bloc ?')) return;
            mutate((st) => {
              const x = st.secrets.find((y) => y.id === s.id);
              if (x) x.blocks = (x.blocks || []).filter((z) => z.id !== b.id);
            });
          }}
        >
          retirer
        </button>
      </div>
      <textarea
        ref={textRef}
        className="finput finput--area" placeholder="Morceau du secret…"
        value={text}
        onChange={(e) => { const v = e.target.value; setText(v); patchBlock((x) => { x.text = v; }); }}
        onBlur={() => patchBlock((x) => { x.text = text; })}
      />
      {open && (
        <RevealModal
          state={state} block={b}
          onToggle={(id) => patchBlock((x) => {
            x.revealedTo = Array.isArray(x.revealedTo) ? x.revealedTo : [];
            x.revealedTo = x.revealedTo.includes(id) ? x.revealedTo.filter((y) => y !== id) : [...x.revealedTo, id];
          })}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function SecretCard({ state, s, mutate }) {
  const [title, setTitle, titleRef] = useSyncedField(s.title);
  const patch = (fn) =>
    mutate((st) => { const x = st.secrets.find((y) => y.id === s.id); if (x) fn(x); });
  const blocks = s.blocks || [];

  return (
    <div className="card secret-card">
      <label className="flabel">
        Secret
        <input
          ref={titleRef}
          className="finput" type="text" placeholder="Titre du secret (pour toi)"
          value={title}
          onChange={(e) => { const v = e.target.value; setTitle(v); patch((x) => { x.title = v; }); }}
          onBlur={() => patch((x) => { x.title = title.trim(); })}
        />
      </label>
      {blocks.map((b, i) => <SecretBlock key={b.id} state={state} s={s} b={b} index={i} mutate={mutate} />)}
      <div className="card__actions">
        <button
          className="tbtn" type="button"
          onClick={() => patch((x) => { x.blocks = x.blocks || []; x.blocks.push({ id: uid(), text: '', revealedTo: [] }); })}
        >
          ＋ bloc
        </button>
        <button
          className="tbtn" type="button"
          onClick={() => {
            if (!window.confirm('Retirer ce secret et tous ses blocs ?')) return;
            mutate((st) => { st.secrets = st.secrets.filter((y) => y.id !== s.id); });
          }}
        >
          retirer le secret
        </button>
      </div>
    </div>
  );
}

/** Vue joueur : uniquement les blocs révélés à l'un de ses personnages. */
function PlayerSecrets({ state, userId }) {
  const mine = new Set((state.characters || []).filter((c) => c.ownerId === userId).map((c) => c.id));
  const visible = (state.secrets || [])
    .map((s) => ({ s, blocks: (s.blocks || []).filter((b) => (b.revealedTo || []).some((id) => mine.has(id)) && (b.text || '').trim()) }))
    .filter((x) => x.blocks.length);
  return (
    <section className="chapter">
      <div className="chapter__head"><h2>Secrets<span className="count"> ({visible.length})</span></h2></div>
      {!visible.length ? (
        <p className="empty">Aucun secret ne vous a été révélé pour l’instant.</p>
      ) : (
        <div className="cards">
          {visible.map(({ s, blocks }) => (
            <div key={s.id} className="card secret-card">
              {s.title && <h3 className="ssn-h">{s.title}</h3>}
              {blocks.map((b) => <p key={b.id} className="secret-card__text">{b.text}</p>)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Secrets({ state, mutate, role, userId }) {
  if (role === 'player') return <PlayerSecrets state={state} userId={userId} />;
  const secrets = state.secrets || [];
  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Gestion des secrets<span className="count"> ({secrets.length})</span></h2>
        <button
          className="tbtn" type="button"
          onClick={() => mutate((s) => { s.secrets.push({ id: uid(), title: '', blocks: [{ id: uid(), text: '', revealedTo: [] }] }); })}
        >
          ＋ nouveau secret
        </button>
      </div>

      {!secrets.length ? (
        <p className="empty">
          Un secret se découpe en blocs ; chaque bloc est caché tant que la roue crantée ne l’a pas
          révélé à un personnage.
        </p>
      ) : (
        <div className="cards">
          {secrets.map((s) => <SecretCard key={s.id} state={state} s={s} mutate={mutate} />)}
        </div>
      )}
    </section>
  );
}
