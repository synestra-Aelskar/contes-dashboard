import { useState } from 'react';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { toast } from '../../lib/toast.js';
import { makeAmbiance, makeEmote, youtubeId, EMOTE_MAX } from '../../lib/prepsession.js';

/* Onglets « Ambiance » et « Emote » d'une séance de Prep Session. Les
 * données vivent sur la séance : session.ambiances[{id,name,url,notes}] et
 * session.emotes[{id,text}] (255 caractères max, la limite d'une ligne de chat). */

function useSessionPatch(quete, session, mutate) {
  return (fn) => mutate((s) => {
    const q = s.prepSessions.find((x) => x.id === quete.id);
    const sess = q && q.sessions.find((x) => x.id === session.id);
    if (sess) fn(sess);
  });
}

/* ---------- Ambiance : vignettes façon YouTube ---------- */

function AmbianceCard({ amb, patchSession }) {
  const [name, setName, nameRef] = useSyncedField(amb.name);
  const [url, setUrl, urlRef] = useSyncedField(amb.url);
  const [notes, setNotes, notesRef] = useSyncedField(amb.notes);
  const patch = (fn) => patchSession((s) => { const a = s.ambiances.find((x) => x.id === amb.id); if (a) fn(a); });
  const vid = youtubeId(amb.url);
  const href = /^https?:\/\//i.test(amb.url) ? amb.url : '';

  return (
    <div className="prep-amb">
      <a
        className={'prep-amb__thumb' + (vid ? '' : ' is-empty')} href={href || undefined}
        target="_blank" rel="noopener noreferrer" aria-label="Ouvrir le lien"
        onClick={(e) => { if (!href) e.preventDefault(); }}
      >
        {vid
          ? <img src={'https://img.youtube.com/vi/' + vid + '/mqdefault.jpg'} alt="" loading="lazy" />
          : <span aria-hidden="true">♪</span>}
        {href && <span className="prep-amb__play" aria-hidden="true">▶</span>}
      </a>
      <div className="prep-amb__body">
        <input
          ref={nameRef} className="finput prep-amb__name" type="text" placeholder="Nom de l’ambiance"
          value={name}
          onChange={(e) => { const v = e.target.value; setName(v); patch((a) => { a.name = v; }); }}
          onBlur={() => patch((a) => { a.name = name.trim(); })}
        />
        <input
          ref={urlRef} className="field field--mono" type="text" placeholder="https://www.youtube.com/watch?v=…"
          value={url}
          onChange={(e) => { const v = e.target.value; setUrl(v); patch((a) => { a.url = v; }); }}
          onBlur={() => patch((a) => { a.url = url.trim(); })}
        />
        <textarea
          ref={notesRef} className="finput finput--area prep-amb__notes" placeholder="Notes (quand la lancer, volume…)"
          value={notes}
          onChange={(e) => { const v = e.target.value; setNotes(v); patch((a) => { a.notes = v; }); }}
          onBlur={() => patch((a) => { a.notes = notes; })}
        />
        <button
          className="tbtn prep-amb__del" type="button"
          onClick={() => patchSession((s) => { s.ambiances = s.ambiances.filter((x) => x.id !== amb.id); })}
        >
          retirer
        </button>
      </div>
    </div>
  );
}

export function AmbiancePane({ quete, session, mutate }) {
  const patchSession = useSessionPatch(quete, session, mutate);
  const list = session.ambiances || [];
  return (
    <div className="prep-tabpane">
      <div className="chapter__head">
        <h4 className="chr__h">Ambiances sonores<span className="count"> ({list.length})</span></h4>
        <button className="tbtn" type="button" onClick={() => patchSession((s) => { s.ambiances.push(makeAmbiance()); })}>＋ ajouter une ambiance</button>
      </div>
      {list.length ? (
        <div className="prep-ambgrid">
          {list.map((a) => <AmbianceCard key={a.id} amb={a} patchSession={patchSession} />)}
        </div>
      ) : <p className="empty">Aucune ambiance pour cette séance. Ajoute un lien YouTube : la vignette s’affiche toute seule.</p>}
    </div>
  );
}

/* ---------- Emote : blocs de texte à copier ---------- */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
  }
  toast('Copié dans le presse-papiers');
}

const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

/** Lecture seule par défaut (texte entier visible) ; l'engrenage bascule en
 * édition. Un bloc neuf, encore vide, s'ouvre directement en édition. */
function EmoteBlock({ emote, patchSession }) {
  const [text, setText, textRef] = useSyncedField(emote.text);
  const [editing, setEditing] = useState(!emote.text);
  const patch = (fn) => patchSession((s) => { const e = s.emotes.find((x) => x.id === emote.id); if (e) fn(e); });
  const fit = (el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } };
  const setRefs = (el) => { textRef.current = el; fit(el); };

  return (
    <div className={'prep-emote' + (editing ? ' is-editing' : '')}>
      {editing ? (
        <textarea
          ref={setRefs} className="finput finput--area prep-emote__text" maxLength={EMOTE_MAX} autoFocus
          placeholder="Texte d’emote (255 caractères max)…"
          value={text}
          onChange={(e) => { fit(e.target); const v = e.target.value.slice(0, EMOTE_MAX); setText(v); patch((x) => { x.text = v; }); }}
          onBlur={() => patch((x) => { x.text = text; })}
        />
      ) : (
        <p className="prep-emote__read">{text || <span className="chr__muted">Bloc vide</span>}</p>
      )}
      <div className="prep-emote__foot">
        {editing && <span className={'prep-emote__count' + (text.length >= EMOTE_MAX ? ' is-max' : '')}>{text.length} / {EMOTE_MAX}</span>}
        <span className="prep-emote__tools">
          <button type="button" className="prep-emote__ico" title="Copier" aria-label="Copier" disabled={!text.trim()} onClick={() => copyText(text)}>
            <svg width="14" height="14" viewBox="0 0 24 24" {...ICON}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>
          </button>
          <button type="button" className={'prep-emote__ico' + (editing ? ' is-on' : '')} title={editing ? 'Terminer l’édition' : 'Modifier'} aria-label={editing ? 'Terminer l’édition' : 'Modifier'} onClick={() => setEditing((v) => !v)}>
            <svg width="14" height="14" viewBox="0 0 24 24" {...ICON}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {editing && (
            <button
              type="button" className="prep-emote__ico prep-emote__ico--del" title="Supprimer" aria-label="Supprimer ce bloc"
              onClick={() => {
                if (text.trim() && !window.confirm('Supprimer ce bloc ?')) return;
                patchSession((s) => { s.emotes = s.emotes.filter((x) => x.id !== emote.id); });
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" {...ICON}><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

export function EmotePane({ quete, session, mutate }) {
  const patchSession = useSessionPatch(quete, session, mutate);
  const list = session.emotes || [];
  return (
    <div className="prep-tabpane">
      <div className="chapter__head">
        <h4 className="chr__h">Emotes<span className="count"> ({list.length})</span></h4>
        <button className="tbtn" type="button" onClick={() => patchSession((s) => { s.emotes.push(makeEmote()); })}>＋ nouveau bloc</button>
      </div>
      {list.length ? (
        <div className="prep-emotes">
          {list.map((e) => <EmoteBlock key={e.id} emote={e} patchSession={patchSession} />)}
        </div>
      ) : <p className="empty">Aucun bloc. Chaque bloc tient en 255 caractères — le bouton « Copier » le met dans le presse-papiers.</p>}
    </div>
  );
}
