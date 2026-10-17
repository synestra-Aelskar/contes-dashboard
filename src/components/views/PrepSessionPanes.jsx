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

function EmoteBlock({ emote, patchSession }) {
  const [text, setText, textRef] = useSyncedField(emote.text);
  const patch = (fn) => patchSession((s) => { const e = s.emotes.find((x) => x.id === emote.id); if (e) fn(e); });
  return (
    <div className="prep-emote">
      <textarea
        ref={textRef} className="finput finput--area prep-emote__text" maxLength={EMOTE_MAX} rows={3}
        placeholder="Texte d’emote (255 caractères max)…"
        value={text}
        onChange={(e) => { const v = e.target.value.slice(0, EMOTE_MAX); setText(v); patch((x) => { x.text = v; }); }}
        onBlur={() => patch((x) => { x.text = text; })}
      />
      <div className="prep-emote__foot">
        <span className={'prep-emote__count' + (text.length >= EMOTE_MAX ? ' is-max' : '')}>{text.length} / {EMOTE_MAX}</span>
        <button className="btn-primary prep-emote__copy" type="button" disabled={!text.trim()} onClick={() => copyText(text)}>Copier</button>
        <button
          className="tbtn" type="button" aria-label="supprimer ce bloc"
          onClick={() => {
            if (text.trim() && !window.confirm('Supprimer ce bloc ?')) return;
            patchSession((s) => { s.emotes = s.emotes.filter((x) => x.id !== emote.id); });
          }}
        >
          supprimer
        </button>
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
