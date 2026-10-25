import { useRef, useState } from 'react';
import { resolveMedia, setFmProp } from '../lib/wiki.js';
import { uploadScreenshot } from '../lib/board.js';
import { toast } from '../lib/toast.js';

/* Catégories « à la Obsidian » : des cartes (titre + grande image) rangées sous
 * des intertitres. Une catégorie est un dossier ; son apparence vit dans les
 * propriétés de sa note de dossier (`image`, `groupe`, `ordre`, `taille`). */

const IMG_EXT = /\.(png|jpe?g|gif|svg|webp|bmp|avif)/i;

export function propOf(note, key) {
  if (!note || !note.front) return undefined;
  const k = Object.keys(note.front).find((x) => x.toLowerCase() === key);
  return k === undefined ? undefined : note.front[k];
}

/** URL de l'illustration d'une note : lien http(s), ou nom de fichier connu des médias. */
export function coverUrl(note, media) {
  const v = propOf(note, 'image');
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (/^(https?:\/\/|data:image\/)/i.test(s)) return s;
  const m = /^\s*(?:!?\[\[)?([^\]|#]+?)(?:\]\])?\s*$/.exec(s);
  return m && IMG_EXT.test(m[1]) ? resolveMedia(media, m[1].trim()) || '' : '';
}

/** Une carte de catégorie : { key, title, sub, img, ex, large, groupe, ordre, onClick }. */
export function CoverCard({ c }) {
  return (
    <button type="button" className={'wiki-cover' + (c.large ? ' is-large' : '') + (c.dim ? ' is-dim' : '')} onClick={c.onClick}>
      <span className="wiki-cover__title">{c.title}</span>
      {c.img
        ? <span className="wiki-cover__img" style={{ backgroundImage: `url("${c.img}")` }} />
        : <span className="wiki-cover__txt">{c.ex || c.sub || ''}</span>}
    </button>
  );
}

/** Cartes groupées par intertitre (`groupe`), triées par `ordre` puis par nom. */
export function CoverGrid({ items }) {
  const groups = new Map();
  for (const c of items) {
    const g = c.groupe || '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(c);
  }
  const order = [...groups.keys()].sort((a, b) => {
    const oa = Math.min(...groups.get(a).map((c) => c.ordre)); const ob = Math.min(...groups.get(b).map((c) => c.ordre));
    return (a === '') - (b === '') || oa - ob || a.localeCompare(b, 'fr');
  });
  return (
    <div className="wiki-covers">
      {order.map((g) => (
        <section key={g || '_'} className="wiki-covers__group">
          {g && <h3 className="wiki-sect">{g}</h3>}
          <div className="wiki-covers__grid">
            {groups.get(g).sort((a, b) => a.ordre - b.ordre || a.title.localeCompare(b.title, 'fr')).map((c) => <CoverCard key={c.key} c={c} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Réglage de l'apparence d'une catégorie (image, intertitre, ordre, pleine largeur). */
export function CategorySettings({ dir, wiki }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const note = dir.folderNote;
  const get = (k) => { const v = propOf(note, k); return v == null ? '' : String(v); };
  const path = note ? note.path : dir.path + '/' + dir.name + '.md';

  function patch(key, value) {
    const fm = setFmProp(note ? note.fm : 'type: catégorie', key, value);
    if (note) wiki.saveNote(path, { fm }); else wiki.createNote(path, { fm });
  }
  async function upload(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    try { patch('image', await uploadScreenshot(f)); } catch (err) { toast('Envoi impossible : ' + ((err && err.message) || err)); }
    setBusy(false);
  }

  return (
    <details className="wiki-catset">
      <summary>Apparence de cette catégorie</summary>
      <div className="wiki-catset__grid">
        <div className="wiki-catset__row">
          <span>Image</span>
          <input ref={input} type="file" accept="image/*" hidden onChange={upload} />
          <button className="tbtn" type="button" disabled={busy} onClick={() => input.current && input.current.click()}>{busy ? 'Envoi…' : 'Téléverser…'}</button>
          <button className="tbtn" type="button" onClick={() => { const u = window.prompt('Adresse de l’image (https://…) :', get('image')); if (u != null) patch('image', u); }}>Adresse…</button>
          {get('image') && <button className="tbtn" type="button" onClick={() => patch('image', '')}>Retirer</button>}
        </div>
        <label className="wiki-catset__row">
          <span>Intertitre</span>
          <input className="finput" defaultValue={get('groupe')} placeholder="ex. Univers" onBlur={(e) => { if (e.target.value !== get('groupe')) patch('groupe', e.target.value); }} />
        </label>
        <label className="wiki-catset__row">
          <span>Ordre</span>
          <input className="finput" type="number" defaultValue={get('ordre')} placeholder="1, 2, 3…" onBlur={(e) => { if (e.target.value !== get('ordre')) patch('ordre', e.target.value); }} />
        </label>
        <label className="wiki-catset__row">
          <span>Pleine largeur</span>
          <input type="checkbox" checked={get('taille').toLowerCase() === 'large'} onChange={(e) => patch('taille', e.target.checked ? 'large' : '')} />
        </label>
      </div>
      <p className="chr__muted">Ces réglages sont stockés dans la note du dossier ({dir.name}). Une note ordinaire peut aussi avoir <code>image</code>, <code>groupe</code>, <code>ordre</code> et <code>taille: large</code> dans ses propriétés.</p>
    </details>
  );
}

/** Données de carte pour un dossier ou une note. */
export function cardOf({ key, title, sub, note, fallbackNote, media, onClick, ex, dim }) {
  const src = note || null;
  const ordre = Number(propOf(src, 'ordre'));
  const g = propOf(src, 'groupe');
  return {
    key, title, sub, ex, dim, onClick,
    img: coverUrl(src, media) || coverUrl(fallbackNote, media),
    large: String(propOf(src, 'taille') || '').toLowerCase() === 'large',
    groupe: typeof g === 'string' ? g.trim() : '',
    ordre: Number.isFinite(ordre) ? ordre : 1000
  };
}
