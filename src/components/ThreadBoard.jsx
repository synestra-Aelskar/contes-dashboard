import { useRef, useState } from 'react';
import { uid, lsGet, lsSet } from '../lib/util.js';
import { toast } from '../lib/toast.js';

function avatarForMessage(m, chars) {
  if (m.avatarUrl) return m.avatarUrl;
  const c = (chars || []).find((x) => x.id === m.authorId);
  return (c && c.artUrl) || '';
}

function Avatar({ url, label }) {
  return (
    <div className="pj__msgavatar">
      {url ? <img src={url} alt="" /> : <span className="pj__msgavatar__ph">{(label || '?')[0]}</span>}
    </div>
  );
}

/* ------------------------- mise en forme (balises) ------------------------ */

const FONT_STACK = {
  '': "'Spectral', Georgia, serif",
  display: "'Cormorant Garamond', Georgia, serif",
  mono: "'IBM Plex Mono', monospace",
  sans: 'system-ui, sans-serif'
};
const FONTS = [['', 'Spectral'], ['display', 'Cormorant'], ['mono', 'Mono'], ['sans', 'Sans']];
const SIZES = [['11', 'Petit'], ['16', 'Normal'], ['22', 'Grand'], ['30', 'Très grand']];

const TAG_PATTERNS = [
  { re: /\*\*([^*]+)\*\*/, tag: (c, k) => <b key={k}>{c}</b> },
  { re: /~~([^~]+)~~/, tag: (c, k) => <s key={k}>{c}</s> },
  { re: /==([^=]+)==/, tag: (c, k) => <mark key={k} className="tb-hl">{c}</mark> },
  { re: /\*([^*]+)\*/, tag: (c, k) => <i key={k}>{c}</i> },
  { re: /\[c=(#[0-9a-fA-F]{3,8})\]([\s\S]+?)\[\/c\]/, group: 2, tag: (c, k, m) => <span key={k} style={{ color: m[1] }}>{c}</span> },
  { re: /\[s=(\d+)\]([\s\S]+?)\[\/s\]/, group: 2, tag: (c, k, m) => <span key={k} style={{ fontSize: m[1] + 'px' }}>{c}</span> },
  { re: /\[f=(\w*)\]([\s\S]+?)\[\/f\]/, group: 2, tag: (c, k, m) => <span key={k} style={{ fontFamily: FONT_STACK[m[1]] || FONT_STACK[''] }}>{c}</span> }
];

/** Parse la petite syntaxe à balises (gras/italique/barré/surligné/couleur/
 * taille/police) en éléments React, récursivement (gère l'imbrication). */
function parseFormatted(text, key) {
  if (!text) return [];
  let best = null;
  for (const p of TAG_PATTERNS) {
    const m = text.match(p.re);
    if (m && (!best || m.index < best.m.index)) best = { p, m };
  }
  if (!best) return [text];
  const { p, m } = best;
  const group = p.group || 1;
  const before = text.slice(0, m.index);
  const after = text.slice(m.index + m[0].length);
  const inner = m[group];
  const k = key + '.' + m.index;
  const out = [];
  if (before) out.push(before);
  out.push(p.tag(parseFormatted(inner, k + 'i'), k, m));
  out.push(...parseFormatted(after, k + 'a'));
  return out;
}

function FormatBar({ composeRef, text, setText }) {
  function wrap(before, after) {
    const el = composeRef.current;
    if (!el) { setText(text + before + after); return; }
    const s = el.selectionStart, e = el.selectionEnd;
    const selected = text.slice(s, e);
    const next = text.slice(0, s) + before + selected + after + text.slice(e);
    setText(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + selected.length); });
  }
  return (
    <div className="tb-fmtbar">
      <button type="button" className="tb-fmtbtn" onClick={() => wrap('**', '**')} title="Gras"><b>G</b></button>
      <button type="button" className="tb-fmtbtn" onClick={() => wrap('*', '*')} title="Italique"><i>I</i></button>
      <button type="button" className="tb-fmtbtn" onClick={() => wrap('~~', '~~')} title="Barré"><s>B</s></button>
      <button type="button" className="tb-fmtbtn" onClick={() => wrap('==', '==')} title="Surligné">Sur.</button>
      <input type="color" className="tb-fmtcolor" title="Couleur" onChange={(e) => wrap(`[c=${e.target.value}]`, '[/c]')} />
      <select
        className="field tb-fmtsel" defaultValue="" title="Taille"
        onChange={(e) => { if (e.target.value) wrap(`[s=${e.target.value}]`, '[/s]'); e.target.value = ''; }}
      >
        <option value="">Taille</option>
        {SIZES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <select
        className="field tb-fmtsel" defaultValue="" title="Police"
        onChange={(e) => { wrap(`[f=${e.target.value}]`, '[/f]'); e.target.value = ''; }}
      >
        <option value="">Police</option>
        {FONTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

/* ------------------------- accès par personnage --------------------------- */

/** Un participant voit un message si l'un de ses segments d'accès couvre
 * l'index du message. Pas d'historique = accès complet (rétrocompat). */
function visibleMessages(thread, viewerCharId) {
  const msgs = thread.messages || [];
  if (!viewerCharId) return msgs; // MJ : omniscient
  const segs = thread.accessLog && thread.accessLog[viewerCharId];
  if (!segs || !segs.length) return msgs;
  return msgs.filter((m, i) => segs.some((sg) => i >= sg.from && (sg.to === null || i <= sg.to)));
}

function AddPeopleModal({ chars, thread, onAdd, onClose }) {
  const activeIds = new Set(
    (thread.participantIds || []).filter((id) => ((thread.accessLog && thread.accessLog[id]) || []).some((sg) => sg.to === null))
  );
  const candidates = chars.filter((c) => c.ownerId && !activeIds.has(c.id));
  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal__card secret-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Ajouter des personnes</h3>
        <p className="modal__note">« Depuis le dernier message » ne donne pas l’historique ; « accès complet » donne tout depuis le début.</p>
        {!candidates.length ? (
          <p className="empty">Personne à ajouter pour l’instant.</p>
        ) : (
          <div className="secret-modal__group">
            {candidates.map((c) => (
              <div key={c.id} className="pj__addrow">
                <span>{c.name || 'Sans nom'}</span>
                <div className="fiche-row__actions">
                  <button type="button" onClick={() => onAdd(c.id, 'last')}>depuis le dernier message</button>
                  <button type="button" onClick={() => onAdd(c.id, 'full')}>accès complet</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="modal__actions">
          <button className="tbtn" type="button" onClick={onClose}>fermer</button>
        </div>
      </div>
    </div>
  );
}

function ParticipantsBar({ thread, chars, mutate, canManageParticipants, canExclude }) {
  const [addOpen, setAddOpen] = useState(false);
  const activeIds = new Set(
    (thread.participantIds || []).filter((id) => ((thread.accessLog && thread.accessLog[id]) || []).some((sg) => sg.to === null))
  );

  function exclude(id) {
    mutate((s) => {
      const th = (s.threads || []).find((x) => x.id === thread.id);
      if (!th) return;
      const segs = (th.accessLog && th.accessLog[id]) || [];
      const open = segs.find((sg) => sg.to === null);
      if (open) open.to = Math.max(open.from, th.messages.length - 1);
    });
  }
  function add(id, mode) {
    mutate((s) => {
      const th = (s.threads || []).find((x) => x.id === thread.id);
      if (!th) return;
      th.participantIds = th.participantIds || [];
      if (!th.participantIds.includes(id)) th.participantIds.push(id);
      th.accessLog = th.accessLog || {};
      th.accessLog[id] = th.accessLog[id] || [];
      const from = mode === 'full' ? 0 : Math.max(0, th.messages.length - 1);
      th.accessLog[id].push({ from, to: null });
    });
    setAddOpen(false);
  }

  return (
    <div className="pj__participants">
      {(thread.participantIds || []).map((id) => {
        const c = chars.find((x) => x.id === id);
        const isActive = activeIds.has(id);
        return (
          <span key={id} className={'pj__particip' + (isActive ? '' : ' is-excluded')} title={isActive ? 'Actif' : 'Exclu'}>
            {c ? (c.name || 'Sans nom') : '?'}
            {canExclude && isActive && (
              <button type="button" onClick={() => exclude(id)} aria-label={'exclure ' + (c ? c.name : '')}>×</button>
            )}
          </span>
        );
      })}
      {canManageParticipants && (
        <button className="tbtn" type="button" onClick={() => setAddOpen(true)}>＋ ajouter des personnes</button>
      )}
      {addOpen && <AddPeopleModal chars={chars} thread={thread} onAdd={add} onClose={() => setAddOpen(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------------------- */

/**
 * Messages d'un thread, avec avatar à droite de chaque message, mise en
 * forme à balises (gras/italique/barré/surligné/couleur/taille/police, avec
 * bascule affichage balises ↔ normal), et gestion des participants :
 * `canManageParticipants` (joueur ET MJ) affiche « ajouter des personnes »
 * (accès depuis le dernier message, ou complet) ; `canExclude` (MJ
 * seulement) permet d'exclure un participant actif — il garde ce qu'il a
 * déjà vu mais ne voit plus la suite, jusqu'à une éventuelle réinvitation.
 * `viewerCharId` scope les messages visibles pour ce personnage (MJ =
 * omniscient, ne pas passer viewerCharId).
 */
export function ThreadMessages({
  thread, mutate, authorId, authorName, chars, posterOptions, allowCustomAvatar, avatarStorageKey,
  viewerCharId, canManageParticipants, canExclude
}) {
  const [text, setText] = useState('');
  const [rawView, setRawView] = useState(false);
  const [composePreview, setComposePreview] = useState(false);
  const composeRef = useRef(null);
  const options = posterOptions || [];
  const [avatarUrl, setAvatarUrl] = useState(() => lsGet(avatarStorageKey) || (options[0] && options[0].url) || '');
  const [customDraft, setCustomDraft] = useState('');

  function choose(url) {
    setAvatarUrl(url || '');
    if (avatarStorageKey) lsSet(avatarStorageKey, url || '');
  }

  function commitCustomAvatar() {
    if (customDraft.trim()) { choose(customDraft.trim()); setCustomDraft(''); }
  }

  function send() {
    const t = text.trim();
    if (!t) return;
    mutate((s) => {
      const th = (s.threads || []).find((x) => x.id === thread.id);
      if (th) {
        th.messages = th.messages || [];
        th.messages.push({ id: uid(), authorId, authorName, text: t, avatarUrl, createdAt: new Date().toISOString() });
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

  const msgs = visibleMessages(thread, viewerCharId);

  return (
    <div className="pj__thread">
      <div className="pj__threadhead">
        <span className={'pj__threadstatus' + (thread.closed ? ' is-closed' : '')}>
          {thread.closed ? 'Clôturé' : 'Ouvert'}
        </span>
        <button className="tbtn" type="button" onClick={toggleClosed}>
          {thread.closed ? 'Rouvrir le sujet' : 'Clôturer le sujet'}
        </button>
        <button className="tbtn" type="button" onClick={() => setRawView((r) => !r)}>
          {rawView ? 'Affichage normal' : 'Voir les balises'}
        </button>
      </div>

      {(canManageParticipants || canExclude) && (
        <ParticipantsBar thread={thread} chars={chars} mutate={mutate} canManageParticipants={canManageParticipants} canExclude={canExclude} />
      )}

      <div className="pj__threadmsgs">
        {msgs.map((m) => (
          <div key={m.id} className={'pj__msgrow' + (m.authorId === authorId ? ' pj__msgrow--mine' : '')}>
            <div className="pj__msg">
              <div className="pj__msghead">
                <b>{m.authorName || '—'}</b>
                <span className="chr__muted">{m.createdAt ? new Date(m.createdAt).toLocaleString('fr-FR') : ''}</span>
              </div>
              <p className="pj__msgtext">{rawView ? m.text : parseFormatted(m.text, m.id)}</p>
            </div>
            <Avatar url={avatarForMessage(m, chars)} label={m.authorName} />
          </div>
        ))}
        {!msgs.length && <p className="chr__muted">Aucun message pour l’instant.</p>}
      </div>

      <div className="pj__threadcompose">
        {(options.length > 0 || allowCustomAvatar) && (
          <div className="pj__avatarpick">
            <span className="chr__muted">Poster avec l’avatar de :</span>
            <span className="pj__avatarpick__current" title="Avatar actuel">
              <Avatar url={avatarUrl} label={authorName} />
            </span>
            {options.map((p) => (
              <button
                key={p.id} type="button" title={p.name}
                className={'pj__avatarpick__opt' + (avatarUrl === p.url ? ' is-active' : '')}
                onClick={() => choose(p.url)}
              >
                <Avatar url={p.url} label={p.name} />
              </button>
            ))}
            {allowCustomAvatar && (
              <input
                className="field field--mono pj__avatarpick__url" type="text" placeholder="ou lien d’image… (Entrée pour valider)"
                value={customDraft}
                onChange={(e) => setCustomDraft(e.target.value)}
                onBlur={commitCustomAvatar}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitCustomAvatar(); } }}
              />
            )}
          </div>
        )}
        <div className="tb-composehead">
          <FormatBar composeRef={composeRef} text={text} setText={setText} />
          <button className="tbtn" type="button" onClick={() => setComposePreview((v) => !v)}>
            {composePreview ? 'Revenir à l’édition' : 'Aperçu (affichage normal)'}
          </button>
        </div>
        {composePreview ? (
          <div className="notes tb-composepreview">
            {text.trim() ? parseFormatted(text, 'compose') : <span className="chr__muted">Rien à prévisualiser.</span>}
          </div>
        ) : (
          <textarea
            ref={composeRef} className="notes" placeholder="Écrire un message…" rows={3}
            value={text} onChange={(e) => setText(e.target.value)}
          />
        )}
        <button className="btn-primary" type="button" onClick={send}>Envoyer</button>
      </div>
    </div>
  );
}

/**
 * Forum Backstage scopé à un personnage : threads où `scopeCharId` participe.
 * Côté joueur (canCreate=true) : le joueur écrit en son nom (authorId = son
 * personnage), peut créer un thread + inviter à la création, et gérer les
 * participants en cours de route (mais pas exclure — réservé au MJ).
 * Côté MJ (canCreate=false) : le MJ ne fait que lire/répondre (authorId='mj'),
 * jamais créer de thread au nom du joueur.
 */
export default function ThreadBoard({ state, mutate, scopeCharId, authorId, authorName, canCreate, storageKey }) {
  const allThreads = state.threads || [];
  const chars = state.characters || [];
  const otherChars = chars.filter((c) => c.id !== scopeCharId && c.ownerId);
  const mine = allThreads.filter((t) => (t.participantIds || []).includes(scopeCharId) || t.createdBy === scopeCharId);
  const [selId, setSelId] = useState(lsGet(storageKey) || (mine[0] && mine[0].id) || null);
  const sel = mine.find((t) => t.id === selId) || mine[0] || null;
  const [title, setTitle] = useState('');
  const [invited, setInvited] = useState([]);

  const me = chars.find((c) => c.id === scopeCharId);
  const posterOptions = me ? [{ id: me.id, name: me.name || authorName, url: me.artUrl || '' }] : [];

  function select(id) { setSelId(id); lsSet(storageKey, id); }

  function toggleInvite(id) {
    setInvited((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function createThread() {
    const t = title.trim();
    if (!t) { toast('Titre du thread requis'); return; }
    const participantIds = [scopeCharId, ...invited];
    const accessLog = Object.fromEntries(participantIds.map((id) => [id, [{ from: 0, to: null }]]));
    const thread = { id: uid(), title: t, participantIds, accessLog, messages: [], createdBy: scopeCharId, createdAt: new Date().toISOString(), closed: false, archived: false };
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
        <ThreadMessages
          key={sel.id} thread={sel} mutate={mutate} authorId={authorId} authorName={authorName}
          chars={chars} posterOptions={posterOptions} avatarStorageKey={storageKey + '.avatar'}
          viewerCharId={scopeCharId} canManageParticipants
        />
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
