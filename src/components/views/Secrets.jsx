import { useMemo, useState } from 'react';
import { uid, lsGet, lsSet } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { PLAYER_EMAIL_DOMAIN } from '../../lib/playerAuth.js';

/* Un secret = un titre + des tags MJ + autant de blocs que l'on veut. Chaque
 * bloc est caché par défaut ; la roue crantée choisit, personnage par
 * personnage (triés par joueur·euse), à qui il est révélé.
 * Côté joueur, chaque bloc révélé devient une carte indépendante (plus de
 * regroupement par secret) : à sa première apparition il porte le tag
 * « Non-classé » ; c'est au joueur de le retaguer pour relier entre eux les
 * blocs qui appartiennent au même fil, le tag étant personnel (chaque
 * joueur·euse ayant accès au bloc peut le classer différemment).
 * Les cartes sont repliées par défaut ; l'index à droite (titres + tags) ouvre
 * et fait défiler jusqu'à l'élément voulu. */

const NON_CLASSE = 'Non-classé';

function accountLabel(account) {
  if (!account) return '';
  if (account.label && account.label.trim()) return account.label.trim();
  const email = account.email || '';
  return email.endsWith(PLAYER_EMAIL_DOMAIN) ? email.slice(0, -PLAYER_EMAIL_DOMAIN.length) : email.split('@')[0];
}

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

const normTag = (t) => (t || '').trim().replace(/\s+/g, ' ');

/** Tags personnels du joueur sur ce bloc, ou [« Non-classé »] par défaut
 * tant qu'il ne les a pas encore modifiés. */
function playerTagsFor(block, userId) {
  const t = block.playerTags && Array.isArray(block.playerTags[userId]) ? block.playerTags[userId] : [];
  return t.length ? t : [NON_CLASSE];
}

function blockTitle(b) {
  const t = (b.text || '').trim().split('\n')[0];
  if (!t) return 'Élément';
  return t.length > 60 ? t.slice(0, 60) + '…' : t;
}

/* ---------- Tags ---------- */

function TagChips({ tags, onRemove, tone }) {
  if (!tags.length) return null;
  return (
    <span className="secret-tags">
      {tags.map((t) => (
        <span key={t} className={'secret-tag' + (tone ? ' secret-tag--' + tone : '')}>
          {t}
          {onRemove && (
            <button type="button" className="secret-tag__x" aria-label={'Retirer le tag ' + t} onClick={() => onRemove(t)}>×</button>
          )}
        </span>
      ))}
    </span>
  );
}

function TagEditor({ tags, onChange, placeholder, tone }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft.split(/[,;]/).map(normTag).filter(Boolean);
    if (!parts.length) return;
    const next = [...tags];
    parts.forEach((p) => { if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p); });
    onChange(next);
    setDraft('');
  };
  return (
    <div className="secret-tagedit">
      <TagChips tags={tags} tone={tone} onRemove={(t) => onChange(tags.filter((x) => x !== t))} />
      <input
        className="finput secret-tagedit__input" type="text" value={draft}
        placeholder={placeholder || 'tag, tag…'}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        onBlur={add}
      />
    </div>
  );
}

/* ---------- Index à droite (générique : items déjà {id, title, tags}) ---------- */

function SecretIndex({ items, tagFilter, setTagFilter, openIds, onPick, allTags }) {
  return (
    <aside className="secret-index">
      <span className="card__label">Index</span>
      {allTags.length > 0 && (
        <div className="secret-index__tags">
          <button
            type="button" className={'secret-index__tag' + (!tagFilter ? ' is-active' : '')}
            onClick={() => setTagFilter('')}
          >
            tous
          </button>
          {allTags.map(([t, n]) => (
            <button
              key={t} type="button"
              className={'secret-index__tag' + (tagFilter === t ? ' is-active' : '')}
              onClick={() => setTagFilter(tagFilter === t ? '' : t)}
            >
              {t}<span className="secret-index__n">{n}</span>
            </button>
          ))}
        </div>
      )}
      <div className="secret-index__grid">
        {!items.length && <p className="empty">Rien pour ce tag.</p>}
        {items.map((it) => (
          <button
            key={it.id} type="button"
            className={'secret-index__tile' + (openIds.has(it.id) ? ' is-active' : '')}
            onClick={() => onPick(it.id)}
            title={it.title}
          >
            <span className="secret-index__tiletitle">{it.title || <em>Sans titre</em>}</span>
            {it.tags.length > 0 && <span className="secret-index__tiletags">{it.tags.join(' · ')}</span>}
          </button>
        ))}
      </div>
    </aside>
  );
}

/** Tags MJ fusionnés avec leur fréquence, triés par nom (index MJ). */
function collectTags(list) {
  const counts = new Map();
  list.forEach((s) => {
    new Set(s.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
  });
  return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0], 'fr'));
}
function secretHasTag(s, tag) {
  if (!tag) return true;
  return (s.tags || []).includes(tag);
}

/** Idem, mais sur les tags personnels du joueur, par bloc (index joueur). */
function collectBlockTags(entries, userId) {
  const counts = new Map();
  entries.forEach(({ block }) => {
    new Set(playerTagsFor(block, userId)).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
  });
  return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0], 'fr'));
}
function blockHasTag(entry, tag, userId) {
  if (!tag) return true;
  return playerTagsFor(entry.block, userId).includes(tag);
}

/* Ouverture / repli mémorisés localement (par navigateur). */
function useOpenSet(key) {
  const [open, setOpen] = useState(() => {
    try { return new Set(JSON.parse(lsGet(key) || '[]')); } catch (_) { return new Set(); }
  });
  const toggle = (id, force) => setOpen((prev) => {
    const next = new Set(prev);
    const want = force === undefined ? !next.has(id) : force;
    if (want) next.add(id); else next.delete(id);
    lsSet(key, JSON.stringify(Array.from(next)));
    return next;
  });
  return [open, toggle];
}

function scrollTo(elId) {
  const el = document.getElementById(elId);
  if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- MJ ---------- */

function RevealModal({ state, block, onToggle, onClose, share, excludeIds }) {
  const groups = groupCharacters(state)
    .map((g) => ({ ...g, chars: g.chars.filter((c) => !(excludeIds && excludeIds.has(c.id))) }))
    .filter((g) => g.chars.length);
  const revealed = new Set(block.revealedTo || []);
  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal__card secret-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">{share ? 'Partager cet élément avec…' : 'Révéler ce bloc à…'}</h3>
        <p className="modal__note">
          {share
            ? 'Coche le personnage à qui tu confies cette information : son joueur·euse la verra dans ses Secrets. Un partage ne se reprend pas.'
            : 'Coche les personnages qui connaissent ce morceau du secret. Leur joueur·euse le verra dans sa vue Secrets ; les autres blocs restent cachés.'}
        </p>
        {!groups.length ? (
          <p className="empty">Aucun personnage pour l’instant.</p>
        ) : groups.map((g) => (
          <div key={g.key} className="secret-modal__group">
            <span className="card__label">{g.label}</span>
            {g.chars.map((c) => (
              <label key={c.id} className={'secret-modal__row' + (share && revealed.has(c.id) ? ' is-locked' : '')}>
                <input
                  type="checkbox" checked={revealed.has(c.id)}
                  disabled={share && revealed.has(c.id)}
                  onChange={() => onToggle(c.id)}
                />
                <span>{c.name || 'Personnage'}</span>
                {share && revealed.has(c.id) && <span className="secret-modal__known">sait déjà</span>}
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

function SecretBlock({ state, s, b, index, mutate, expanded, onExpand }) {
  const [text, setText, textRef] = useSyncedField(b.text);
  const [open, setOpen] = useState(false);
  const patchBlock = (fn) =>
    mutate((st) => {
      const x = st.secrets.find((y) => y.id === s.id);
      const blk = x && (x.blocks || []).find((z) => z.id === b.id);
      if (blk) fn(blk);
    });
  const names = (b.revealedTo || []).map((id) => {
    const c = (state.characters || []).find((x) => x.id === id);
    return c ? (c.name || 'Personnage') : null;
  }).filter(Boolean);

  return (
    <div className={'secret-block' + (expanded ? ' is-open' : '')}>
      <div
        className="secret-block__head" role="button" tabIndex={0}
        onClick={() => onExpand(expanded ? null : b.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onExpand(expanded ? null : b.id); } }}
      >
        <span className="secret-block__label">{index + 1}</span>
        <span className={'secret-block__who' + (names.length ? ' is-revealed' : '')}>
          {names.length ? names.join(', ') : 'caché'}
        </span>
        <button
          className="secret-block__gear" type="button" title="Révéler à…" aria-label="Révéler à…"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button
          className="secret-block__x" type="button" title="Retirer ce bloc" aria-label="Retirer ce bloc"
          onClick={(e) => {
            e.stopPropagation();
            if (text.trim() && !window.confirm('Retirer ce bloc ?')) return;
            mutate((st) => {
              const x = st.secrets.find((y) => y.id === s.id);
              if (x) x.blocks = (x.blocks || []).filter((z) => z.id !== b.id);
            });
          }}
        >
          ×
        </button>
      </div>
      {expanded ? (
        <textarea
          ref={textRef}
          className="finput finput--area secret-block__text" placeholder="Morceau du secret…"
          value={text}
          autoFocus
          rows={Math.min(10, Math.max(3, Math.ceil((text || '').length / 60) + (text || '').split('\n').length - 1))}
          onChange={(e) => { const v = e.target.value; setText(v); patchBlock((x) => { x.text = v; }); }}
          onBlur={() => patchBlock((x) => { x.text = text; })}
        />
      ) : null}
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

function SecretCard({ state, s, mutate, open, onToggle }) {
  const [title, setTitle, titleRef] = useSyncedField(s.title);
  // Un seul bloc deplie a la fois ; les autres restent sur une ligne.
  const [openBlock, setOpenBlock] = useState(null);
  const patch = (fn) =>
    mutate((st) => { const x = st.secrets.find((y) => y.id === s.id); if (x) fn(x); });
  const blocks = s.blocks || [];
  const revealed = blocks.filter((b) => (b.revealedTo || []).length).length;

  return (
    <div id={'secret-' + s.id} className={'card secret-card' + (open ? ' is-open' : '')}>
      <div className="secret-card__head">
        <button type="button" className="secret-card__toggle" onClick={() => onToggle(s.id)} aria-expanded={open}>
          <span className={'secret-card__chev' + (open ? ' is-open' : '')}>›</span>
          <span className="secret-card__title">{s.title || <em>Sans titre</em>}</span>
        </button>
        <span className="secret-card__meta">
          {blocks.length} bloc{blocks.length > 1 ? 's' : ''} · {revealed} révélé{revealed > 1 ? 's' : ''}
        </span>
      </div>
      {!open && <TagChips tags={s.tags || []} />}
      {open && (
        <>
          <input
            ref={titleRef}
            className="finput secret-card__titleinput" type="text" placeholder="Titre du secret (pour toi)"
            value={title}
            onChange={(e) => { const v = e.target.value; setTitle(v); patch((x) => { x.title = v; }); }}
            onBlur={() => patch((x) => { x.title = title.trim(); })}
          />
          <TagEditor tags={s.tags || []} onChange={(tags) => patch((x) => { x.tags = tags; })} placeholder="tags MJ : lieu, PNJ, intrigue…" />
          {blocks.map((b, i) => (
            <SecretBlock
              key={b.id} state={state} s={s} b={b} index={i} mutate={mutate}
              expanded={openBlock === b.id} onExpand={setOpenBlock}
            />
          ))}
          <div className="card__actions secret-card__actions">
            <button
              className="tbtn" type="button"
              onClick={() => {
                const id = uid();
                patch((x) => { x.blocks = x.blocks || []; x.blocks.push({ id, text: '', revealedTo: [], playerTags: {} }); });
                setOpenBlock(id);
              }}
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
        </>
      )}
    </div>
  );
}

/* ---------- Joueur : chaque bloc révélé = une carte indépendante ---------- */

function PlayerBlockCard({ state, secret, block, userId, mutate, open, onToggle }) {
  const mine = playerTagsFor(block, userId);
  const [shareOpen, setShareOpen] = useState(false);
  const myCharIds = new Set((state.characters || []).filter((c) => c.ownerId === userId).map((c) => c.id));

  const shareWith = (charId) => mutate((st) => {
    const x = st.secrets.find((y) => y.id === secret.id);
    const b = x && (x.blocks || []).find((z) => z.id === block.id);
    if (!b) return;
    b.revealedTo = Array.isArray(b.revealedTo) ? b.revealedTo : [];
    if (!b.revealedTo.includes(charId)) b.revealedTo.push(charId);
  });
  const setMine = (tags) => mutate((st) => {
    const x = st.secrets.find((y) => y.id === secret.id);
    const b = x && (x.blocks || []).find((z) => z.id === block.id);
    if (!b) return;
    b.playerTags = b.playerTags && typeof b.playerTags === 'object' ? b.playerTags : {};
    b.playerTags[userId] = tags;
  });

  return (
    <div id={'secret-block-' + block.id} className={'card secret-card' + (open ? ' is-open' : '')}>
      <div className="secret-card__head">
        <button type="button" className="secret-card__toggle" onClick={() => onToggle(block.id)} aria-expanded={open}>
          <span className={'secret-card__chev' + (open ? ' is-open' : '')}>›</span>
          <span className="secret-card__title">{blockTitle(block)}</span>
        </button>
        <button
          className="secret-block__gear" type="button" title="Partager avec un autre personnage" aria-label="Partager avec un autre personnage"
          onClick={() => setShareOpen(true)}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
          </svg>
        </button>
      </div>
      {!open && <TagChips tags={mine} tone="mine" />}
      {open && (
        <>
          {secret.title && <p className="chr__muted">Issu de : {secret.title}</p>}
          <p className="secret-card__text">{block.text}</p>
          <TagEditor tags={mine} onChange={setMine} placeholder="mon tag…" tone="mine" />
        </>
      )}
      {shareOpen && (
        <RevealModal
          state={state} block={block} share excludeIds={myCharIds}
          onToggle={(id) => shareWith(id)}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}

function PlayerSecrets({ state, mutate, userId }) {
  const mineChars = new Set((state.characters || []).filter((c) => c.ownerId === userId).map((c) => c.id));
  const entries = useMemo(() => {
    const out = [];
    (state.secrets || []).forEach((s) => {
      (s.blocks || []).forEach((b) => {
        if ((b.revealedTo || []).some((id) => mineChars.has(id)) && (b.text || '').trim()) out.push({ secret: s, block: b });
      });
    });
    return out;
  }, [state.secrets, state.characters, userId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tagFilter, setTagFilter] = useState('');
  const [openSet, toggle] = useOpenSet('ccm.secretsOpen.player');
  const allTags = collectBlockTags(entries, userId);
  const shown = entries.filter((e) => blockHasTag(e, tagFilter, userId));
  const opened = shown.filter((e) => openSet.has(e.block.id));
  const pick = (id) => {
    const willOpen = !openSet.has(id);
    toggle(id);
    if (willOpen) setTimeout(() => scrollTo('secret-block-' + id), 30);
  };

  return (
    <section className="chapter">
      <div className="chapter__head"><h2>Secrets<span className="count"> ({entries.length})</span></h2></div>
      {!entries.length ? (
        <p className="empty">Aucun secret ne vous a été révélé pour l’instant.</p>
      ) : (
        <div className="secret-layout">
          <div className="secret-list">
            {!opened.length && <p className="empty secret-list__hint">Choisis un élément dans l’index.</p>}
            {opened.map(({ secret, block }) => (
              <PlayerBlockCard
                key={block.id} state={state} secret={secret} block={block} userId={userId} mutate={mutate}
                open onToggle={(id) => toggle(id, false)}
              />
            ))}
          </div>
          <SecretIndex
            items={shown.map(({ block }) => ({ id: block.id, title: blockTitle(block), tags: playerTagsFor(block, userId) }))}
            tagFilter={tagFilter} setTagFilter={setTagFilter} openIds={openSet} onPick={pick} allTags={allTags}
          />
        </div>
      )}
    </section>
  );
}

/* ---------- Vue ---------- */

export default function Secrets({ state, mutate, role, userId }) {
  const [tagFilter, setTagFilter] = useState('');
  const [openSet, toggle] = useOpenSet('ccm.secretsOpen');
  if (role === 'player') return <PlayerSecrets state={state} mutate={mutate} userId={userId} />;

  const secrets = state.secrets || [];
  const allTags = collectTags(secrets);
  const shown = secrets.filter((s) => secretHasTag(s, tagFilter));
  const opened = shown.filter((s) => openSet.has(s.id));
  const pick = (id) => {
    const willOpen = !openSet.has(id);
    toggle(id);
    if (willOpen) setTimeout(() => scrollTo('secret-' + id), 30);
  };

  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Gestion des secrets<span className="count"> ({secrets.length})</span></h2>
        <button
          className="tbtn" type="button"
          onClick={() => {
            const id = uid();
            mutate((s) => { s.secrets.push({ id, title: '', tags: [], blocks: [{ id: uid(), text: '', revealedTo: [], playerTags: {} }] }); });
            toggle(id, true);
          }}
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
        <div className="secret-layout">
          <div className="secret-list">
            {!opened.length && <p className="empty secret-list__hint">Choisis un secret dans l’index (ou crée-en un).</p>}
            {opened.map((s) => (
              <SecretCard
                key={s.id} state={state} s={s} mutate={mutate}
                open onToggle={(id) => toggle(id, false)}
              />
            ))}
          </div>
          <SecretIndex
            items={shown.map((s) => ({ id: s.id, title: s.title || 'Sans titre', tags: s.tags || [] }))}
            tagFilter={tagFilter} setTagFilter={setTagFilter} openIds={openSet} onPick={pick} allTags={allTags}
          />
        </div>
      )}
    </section>
  );
}
