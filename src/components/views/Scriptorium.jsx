import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { lsGet, lsSet } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { uploadScreenshot } from '../../lib/board.js';
import {
  TYPES, PLACEHOLDER, GLYPH, roman, autoFin, fileBase, storyHTML,
  newBlock, newAct, normalizeStory, exportable, discordMessages, localImageCount
} from '../../lib/scriptorium.js';
import { findBook, newBook, bookTitle, shelfForSurtitre } from '../../lib/bibliotheque.js';

/* Scriptorium de la Trame — l'éditeur des livres de la Bibliothèque
 * (state.bibliotheque, partagé et synchronisé en temps réel). Le livre
 * ouvert est un choix local à ce navigateur (ccm.scriptorium.book). */
const BOOK_KEY = 'ccm.scriptorium.book';
const UNDO_MAX = 20;

function move(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

const AutoTextarea = forwardRef(function AutoTextarea(props, forwardedRef) {
  const inner = useRef(null);
  useLayoutEffect(() => {
    const t = inner.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = (t.scrollHeight + 2) + 'px';
  }, [props.value]);
  const setRefs = (el) => {
    inner.current = el;
    if (typeof forwardedRef === 'function') forwardedRef(el);
    else if (forwardedRef) forwardedRef.current = el;
  };
  return <textarea ref={setRefs} rows={2} {...props} />;
});

/** Champ texte partagé : brouillon local tant qu'il a le focus, adopte la
 * valeur distante sinon (voir useSyncedField). */
function SyncField({ value, onValue, area, ...rest }) {
  const [v, setV, ref] = useSyncedField(value);
  const Tag = area ? AutoTextarea : 'input';
  return <Tag ref={ref} value={v} onChange={(e) => { const x = e.target.value; setV(x); onValue(x); }} {...rest} />;
}

/* --- mise en forme en ligne : **gras**, *italique*, __souligné__ --- */

const FORMATS = [
  { mark: '**', key: 'b', label: 'Gras', glyph: <b>B</b> },
  { mark: '*', key: 'i', label: 'Italique', glyph: <i>I</i> },
  { mark: '__', key: 'u', label: 'Souligné', glyph: <u>U</u> }
];

/** Remplace [a, b[ dans le textarea ; passe par execCommand quand c'est
 * possible pour garder le Ctrl+Z natif, déclenche onChange dans tous les cas. */
function replaceRange(ta, a, b, text) {
  ta.focus();
  ta.setSelectionRange(a, b);
  const ok = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
  if (!ok) {
    const v = ta.value;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, v.slice(0, a) + text + v.slice(b));
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/** Bascule un style sur la sélection : l'entoure de `mark` (ligne par ligne,
 * espaces de bord laissés à l'extérieur) ou le retire si elle en est déjà
 * entourée. Les astérisques contigus sont comptés pour distinguer
 * *italique*, **gras** et ***les deux***. */
function applyMark(ta, mark) {
  const v = ta.value;
  const s = ta.selectionStart, e = ta.selectionEnd;
  const n = mark.length;
  const stars = (i, dir) => { let k = 0; while (v[i + k * dir] === '*') k += 1; return k; };
  let has;
  if (mark === '__') has = v.slice(s - 2, s) === '__' && v.slice(e, e + 2) === '__';
  else {
    const k = Math.min(stars(s - 1, -1), stars(e, 1));
    has = mark === '**' ? k >= 2 : k % 2 === 1;
  }
  if (has) {
    replaceRange(ta, s - n, e + n, v.slice(s, e));
    ta.setSelectionRange(s - n, e - n);
    return;
  }
  if (s === e) {
    replaceRange(ta, s, e, mark + mark);
    ta.setSelectionRange(s + n, s + n);
    return;
  }
  const lines = v.slice(s, e).split('\n');
  const out = lines.map((l) => {
    const m = /^(\s*)(.*?)(\s*)$/.exec(l);
    return m[2] ? m[1] + mark + m[2] + mark + m[3] : l;
  }).join('\n');
  replaceRange(ta, s, e, out);
  if (lines.length === 1) {
    const m = /^(\s*)(.*?)(\s*)$/.exec(lines[0]);
    if (m[2]) { ta.setSelectionRange(s + m[1].length + n, s + m[1].length + n + m[2].length); return; }
  }
  ta.setSelectionRange(s, s + out.length);
}

function formatShortcut(e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
  const f = FORMATS.find((x) => x.key === e.key.toLowerCase());
  if (!f) return;
  e.preventDefault();
  applyMark(e.currentTarget, f.mark);
}

function Tools({ first, last, onUp, onDown, onDelete, what }) {
  return (
    <div className="scr-tools">
      <button type="button" title="Monter" aria-label={'Monter ' + what} disabled={first} onClick={onUp}>↑</button>
      <button type="button" title="Descendre" aria-label={'Descendre ' + what} disabled={last} onClick={onDown}>↓</button>
      <button type="button" className="scr-tools__del" title="Supprimer" aria-label={'Supprimer ' + what} onClick={onDelete}>×</button>
    </div>
  );
}

function BlockEditor({ b, first, last, busy, onPatch, onType, onMove, onDelete, onImage, onFocus }) {
  const [over, setOver] = useState(false);
  const dragOn = (e) => { e.preventDefault(); setOver(true); };

  return (
    <div className={'scr-blk scr-blk--' + b.type} data-scr-b={b.id} onFocus={onFocus}>
      <div className="scr-blk__h">
        <select className="scr-blk__type" aria-label="Type de bloc" value={b.type} onChange={(e) => onType(e.target.value)}>
          {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="scr-sp" />
        {b.type !== 'image' && (
          <span className="scr-tools scr-fmt">
            {FORMATS.map((f) => (
              <button
                key={f.key} type="button" title={`${f.label} (Ctrl+${f.key.toUpperCase()})`} aria-label={f.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { const ta = e.currentTarget.closest('.scr-blk').querySelector('textarea'); if (ta) applyMark(ta, f.mark); }}
              >{f.glyph}</button>
            ))}
          </span>
        )}
        <Tools first={first} last={last} what="le bloc" onUp={() => onMove(-1)} onDown={() => onMove(1)} onDelete={onDelete} />
      </div>
      {b.type === 'image' ? (
        <>
          <label
            className={'scr-drop' + (over ? ' is-over' : '')}
            onDragEnter={dragOn} onDragOver={dragOn} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onImage(f); }}
          >
            {busy
              ? <span>Envoi de l'image…</span>
              : b.src
                ? <img src={b.src} alt="" />
                : <span>Glisser une image ici<br />ou cliquer pour choisir</span>}
            <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onImage(f); }} />
          </label>
          <SyncField
            className="finput" data-scr-src placeholder="…ou adresse URL de l'image" autoComplete="off"
            value={b.src || ''} onValue={(v) => onPatch((x) => { x.src = v.trim(); })}
          />
          <SyncField
            className="finput" placeholder="Légende" autoComplete="off"
            value={b.caption || ''} onValue={(v) => onPatch((x) => { x.caption = v; })}
          />
        </>
      ) : (
        <SyncField
          area className="finput scr-blk__text" placeholder={PLACEHOLDER[b.type]} onKeyDown={formatShortcut}
          value={b.text || ''} onValue={(v) => onPatch((x) => { x.text = v; })}
        />
      )}
    </div>
  );
}

function DiscordPanel({ story, onClose, copyText, toast }) {
  const [perAct, setPerAct] = useState(true);
  const [lim, setLim] = useState(2000);
  const [copied, setCopied] = useState(() => new Set());
  const msgs = useMemo(() => discordMessages(story, perAct, lim), [story, perAct, lim]);
  const msgsKey = msgs.join('\u0000');
  useEffect(() => { setCopied(new Set()); }, [msgsKey]);

  const clen = (t) => [...t].length;
  const total = msgs.reduce((n, m) => n + clen(m), 0);
  const imgs = localImageCount(story);

  function selectPre(li) {
    const r = document.createRange();
    r.selectNodeContents(li.querySelector('pre'));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  function copyOne(i, li) {
    const ok = () => setCopied((prev) => new Set(prev).add(i));
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msgs[i]).then(ok, () => { selectPre(li); toast('Copie refusée : texte sélectionné, faites Ctrl+C'); });
    } else { selectPre(li); toast('Texte sélectionné, faites Ctrl+C'); }
  }

  return (
    <section className="scr-dc" aria-label="Version Discord">
      <div className="scr-dc__bar">
        <div className="scr-sec__h">Version Discord</div>
        <div className="scr-dc__opts">
          <label className="scr-chk"><input type="checkbox" checked={perAct} onChange={(e) => setPerAct(e.target.checked)} />Un message par acte</label>
          <select className="finput scr-dc__lim" aria-label="Taille maximale d'un message" value={lim} onChange={(e) => setLim(+e.target.value)}>
            <option value={2000}>2 000 caractères</option>
            <option value={4000}>4 000 caractères (Nitro)</option>
          </select>
          {msgs.length > 1 && (
            <button className="scr-btn" type="button" onClick={() => copyText(msgs.join('\n\n'), 'Tout copié (à répartir sur plusieurs messages)')}>Tout copier</button>
          )}
          <button className="scr-btn scr-btn--on" type="button" onClick={onClose}>Retour au site</button>
        </div>
      </div>
      <p className="scr-hint">
        {msgs.length} message{msgs.length > 1 ? 's' : ''}, {total.toLocaleString('fr-FR')} caractères au total.
        Copiez-les dans l'ordre : chaque bouton passe à « Copié » pour suivre où vous en êtes.
        {imgs > 0 && (
          <span className="scr-dc__warn"> {imgs} illustration{imgs > 1 ? 's' : ''} sans adresse publique à joindre à la main à l'endroit indiqué.</span>
        )}
      </p>
      <ol className="scr-dc__list">
        {msgs.map((m, i) => (
          <li key={i} className={'scr-dc__item' + (copied.has(i) ? ' is-done' : '')}>
            <div className="scr-dc__h">
              <span>Message {i + 1} / {msgs.length} · {clen(m).toLocaleString('fr-FR')} car.</span>
              <button className="scr-btn" type="button" onClick={(e) => copyOne(i, e.currentTarget.closest('li'))}>
                {copied.has(i) ? 'Copié' : 'Copier'}
              </button>
            </div>
            <pre>{m}</pre>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Remplace les images en data URL (anciens exports JSON) par des images
 * hébergées, pour ne pas alourdir l'état partagé. */
async function hostDataImages(story) {
  for (const a of story.acts) {
    for (const b of a.blocks) {
      if (b.type === 'image' && b.src.startsWith('data:')) {
        const blob = await (await fetch(b.src)).blob();
        b.src = await uploadScreenshot(blob);
      }
    }
  }
  return story;
}

export default function Scriptorium({ state, mutate, setView, canEdit }) {
  const lib = state.bibliotheque;
  const [bookIdRaw, setBookIdRaw] = useState(() => lsGet(BOOK_KEY) || '');
  const book = findBook(state, bookIdRaw) || lib.books[0] || null;
  const bookId = book ? book.id : '';
  const openBook = (id) => { setBookIdRaw(id); lsSet(BOOK_KEY, id); };

  const [collapsed, setCollapsed] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [discord, setDiscord] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const [note, setNote] = useState(null);
  const [manualCopy, setManualCopy] = useState(null);
  const [uploading, setUploading] = useState(() => new Set());
  const undoStack = useRef([]);
  const rootRef = useRef(null);
  const frameRef = useRef(null);
  const lastHtml = useRef('');
  const importRef = useRef(null);
  const manualRef = useRef(null);
  const pendingFocus = useRef(null);

  const toast = (msg, undo) => setNote({ msg, undo: !!undo, at: Date.now() });

  /** Modifie le livre ouvert (fonction rejouable : recherche par id). */
  function editBook(fn) {
    const id = bookId;
    const now = new Date().toISOString();
    mutate((s) => { const b = findBook(s, id); if (b) { fn(b); b.updatedAt = now; } });
  }
  function snap(msg) {
    if (!book) return;
    undoStack.current.push(JSON.stringify(book));
    if (undoStack.current.length > UNDO_MAX) undoStack.current.shift();
    if (msg) toast(msg, true);
  }
  function undo() {
    const raw = undoStack.current.pop();
    if (!raw) return;
    const snapBook = JSON.parse(raw);
    mutate((s) => {
      const books = s.bibliotheque.books;
      const i = books.findIndex((b) => b.id === snapBook.id);
      if (i >= 0) books[i] = snapBook; else books.push(snapBook);
    });
    toast('Modification annulée');
  }

  // Aperçu fidèle : la page exportée elle-même, rechargée en gardant le
  // défilement — seulement si le rendu a réellement changé.
  useEffect(() => {
    const t = setTimeout(() => {
      const f = frameRef.current;
      if (!f || !book) return;
      const html = storyHTML(book, true);
      if (html === lastHtml.current) return;
      lastHtml.current = html;
      let y = 0;
      try { y = f.contentWindow.scrollY || 0; } catch (_) { /* ignore */ }
      f.onload = () => { try { f.contentWindow.scrollTo(0, y); } catch (_) { /* ignore */ } };
      f.srcdoc = html;
    }, 240);
    return () => clearTimeout(t);
  });

  useEffect(() => {
    if (!note) return undefined;
    const t = setTimeout(() => setNote(null), note.undo ? 6000 : 3200);
    return () => clearTimeout(t);
  }, [note]);

  // Focus différé sur un champ créé au rendu précédent (bloc ou acte ajouté).
  useEffect(() => {
    const sel = pendingFocus.current;
    if (!sel || !rootRef.current) return;
    const el = rootRef.current.querySelector(sel);
    if (!el) return;
    pendingFocus.current = null;
    el.focus();
    el.scrollIntoView({ block: 'center' });
  });

  useEffect(() => {
    if (manualCopy != null && manualRef.current) { manualRef.current.focus(); manualRef.current.select(); }
  }, [manualCopy]);

  useEffect(() => {
    function onDown(e) { if (openMenu && !e.target.closest('.scr-add')) setOpenMenu(null); }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (openMenu) setOpenMenu(null);
      else if (discord) setDiscord(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [openMenu, discord]);

  function createBook() {
    const shelf = lib.shelves.find((s) => s.id === (book && book.shelfId)) || lib.shelves[0] || null;
    const nb = newBook(shelf);
    mutate((s) => { s.bibliotheque.books.push(nb); });
    openBook(nb.id);
    pendingFocus.current = '.scr-t1';
    toast(shelf ? `Nouveau récit rangé sur « ${shelf.name || 'Sans nom'} »` : 'Nouveau récit créé');
  }

  const backToLibrary = <button className="scr-btn" type="button" onClick={() => setView && setView('bibliotheque')}>← Bibliothèque</button>;

  if (!book) {
    return (
      <section className="chapter scr">
        <div className="chapter__head"><h2>Scriptorium de la Trame</h2></div>
        <p className="empty">La bibliothèque est vide : aucun récit à ouvrir pour l'instant.</p>
        {canEdit && <div className="scr__bar"><button className="scr-btn scr-btn--on" type="button" onClick={createBook}>+ Écrire un nouveau récit</button>{backToLibrary}</div>}
      </section>
    );
  }

  /* --- édition --- */

  const actOf = (b, actId) => b.acts.find((a) => a.id === actId);
  function patchBlock(actId, blockId, fn) {
    editBook((b) => {
      const a = actOf(b, actId);
      const x = a && a.blocks.find((y) => y.id === blockId);
      if (x) fn(x);
    });
  }
  const focusSel = (id) => `[data-scr-b="${id}"] textarea, [data-scr-b="${id}"] [data-scr-src]`;
  function setBlockType(actId, blockId, type) {
    patchBlock(actId, blockId, (x) => {
      const was = x.type;
      x.type = type;
      if (type === 'image') { x.src = x.src || ''; x.caption = x.caption || ''; }
      else if (was === 'image') x.text = x.text || x.caption || '';
    });
    pendingFocus.current = focusSel(blockId);
  }
  function addBlock(actId, type) {
    const nb = newBlock(type);
    editBook((b) => { const a = actOf(b, actId); if (a) a.blocks.push(nb); });
    setOpenMenu(null);
    pendingFocus.current = focusSel(nb.id);
  }
  function deleteBlock(actId, x) {
    snap(`Bloc « ${TYPES[x.type]} » supprimé`);
    editBook((b) => { const a = actOf(b, actId); if (a) a.blocks = a.blocks.filter((y) => y.id !== x.id); });
  }
  function moveBlock(actId, blockId, dir) {
    editBook((b) => { const a = actOf(b, actId); if (a) move(a.blocks, a.blocks.findIndex((y) => y.id === blockId), dir); });
  }
  function moveAct(actId, dir) {
    editBook((b) => { move(b.acts, b.acts.findIndex((a) => a.id === actId), dir); });
  }
  function addAct() {
    const a = newAct(['p']);
    editBook((b) => { b.acts.push(a); });
    pendingFocus.current = `#scr-act-${a.id}`;
  }
  function deleteAct(a, i) {
    snap(`Acte « ${a.name || roman(i + 1)} » supprimé`);
    editBook((b) => { b.acts = b.acts.filter((x) => x.id !== a.id); });
  }
  async function takeImage(actId, blockId, file) {
    if (!/^image\//.test(file.type)) { toast("Ce fichier n'est pas une image"); return; }
    setUploading((prev) => new Set(prev).add(blockId));
    try {
      const url = await uploadScreenshot(file);
      patchBlock(actId, blockId, (x) => { x.src = url; });
      toast('Image ajoutée');
    } catch (_) {
      toast("Impossible d'envoyer cette image");
    } finally {
      setUploading((prev) => { const n = new Set(prev); n.delete(blockId); return n; });
    }
  }
  function scrollPreviewTo(id) {
    try {
      const el = frameRef.current.contentDocument.querySelector(`[data-b="${id}"]`);
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (_) { /* ignore */ }
  }

  /* --- export --- */

  function copyText(text, okMsg) {
    const manual = (msg) => { setManualCopy(text); setMobilePreview(false); toast(msg); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast(okMsg), () => manual('Copie refusée par le navigateur : texte sélectionné ci-dessous'));
    } else manual('Texte sélectionné ci-dessous');
  }
  function download(filename, data, fallbackMsg) {
    try {
      const type = filename.endsWith('.json') ? 'application/json' : 'text/html;charset=utf-8';
      const url = URL.createObjectURL(new Blob([data], { type }));
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Fichier téléchargé : ' + filename);
    } catch (_) { copyText(data, fallbackMsg); }
  }
  /** Importe un JSON exporté comme NOUVEAU livre (jamais par-dessus le livre ouvert). */
  async function importJson(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let story;
    try { story = normalizeStory(JSON.parse(await f.text())); }
    catch (_) { toast("Ce fichier n'est pas un récit exporté depuis le Scriptorium"); return; }
    try { await hostDataImages(story); }
    catch (_) { toast("Récit importé, mais certaines images n'ont pas pu être envoyées"); }
    const shelfId = shelfForSurtitre(lib.shelves, story.surtitre);
    const nb = { ...newBook(null), ...story, shelfId };
    delete nb.v;
    mutate((s) => { s.bibliotheque.books.push(nb); });
    openBook(nb.id);
    toast('Récit importé : ' + f.name);
  }

  const headField = (k, extra) => (
    <SyncField className={'finput' + (extra ? ' ' + extra : '')} autoComplete="off" value={book[k] || ''} onValue={(v) => editBook((b) => { b[k] = v; })} />
  );
  const byShelf = lib.shelves.map((s) => ({ shelf: s, books: lib.books.filter((b) => b.shelfId === s.id) }));
  const shelfIds = new Set(lib.shelves.map((s) => s.id));
  const loose = lib.books.filter((b) => !shelfIds.has(b.shelfId));

  return (
    <section className={'chapter scr' + (collapsed ? ' scr--collapsed' : '') + (mobilePreview ? ' scr--pv' : '')} ref={rootRef}>
      <div className="chapter__head">
        <h2>Scriptorium de la Trame</h2>
        <span className="scr-sub">Créer et retoucher les récits de la bibliothèque.</span>
      </div>

      <div className="scr__bar">
        <label className="scr__book">
          <span className="scr-lbl">Livre ouvert</span>
          <select className="finput" value={bookId} onChange={(e) => openBook(e.target.value)}>
            {byShelf.filter((g) => g.books.length).map((g) => (
              <optgroup key={g.shelf.id} label={g.shelf.name || 'Sans nom'}>
                {g.books.map((b) => <option key={b.id} value={b.id}>{bookTitle(b)}</option>)}
              </optgroup>
            ))}
            {loose.length > 0 && (
              <optgroup label="Non rangés">
                {loose.map((b) => <option key={b.id} value={b.id}>{bookTitle(b)}</option>)}
              </optgroup>
            )}
          </select>
        </label>
        <div className="scr__actions">
          {backToLibrary}
          {canEdit && <button className="scr-btn" type="button" onClick={createBook}>+ Nouveau récit</button>}
          <span className="scr__tabs">
            <button className="scr-btn" type="button" onClick={() => { setMobilePreview(false); setDiscord(false); }}>Édition</button>
            <button className="scr-btn" type="button" onClick={() => { setMobilePreview(true); setDiscord(false); }}>Aperçu</button>
          </span>
          <button className="scr-btn scr__collapse" type="button" onClick={() => setCollapsed((c) => !c)}>{collapsed ? 'Déplier' : 'Replier'}</button>
          {canEdit && <button className="scr-btn" type="button" onClick={() => importRef.current.click()}>Importer JSON</button>}
          <button className="scr-btn" type="button" onClick={() => download(fileBase(book) + '.json', JSON.stringify(exportable(book), null, 2), 'JSON copié dans le presse-papiers')}>Exporter JSON</button>
          <button className="scr-btn" type="button" onClick={() => copyText(storyHTML(book, false), 'HTML copié dans le presse-papiers')}>Copier le HTML</button>
          <button className={'scr-btn' + (discord ? ' scr-btn--on' : '')} type="button" aria-pressed={discord} onClick={() => setDiscord((v) => !v)}>
            {discord ? 'Version site' : 'Version Discord'}
          </button>
          <button className={'scr-btn' + (discord ? '' : ' scr-btn--on')} type="button" onClick={() => download(fileBase(book) + '.html', storyHTML(book, false), 'HTML copié dans le presse-papiers')}>Télécharger le HTML</button>
          <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={importJson} />
        </div>
      </div>

      {discord && <DiscordPanel story={book} onClose={() => setDiscord(false)} copyText={copyText} toast={toast} />}

      <div className="scr__work" hidden={discord}>
        <aside className="scr__panel" aria-label="Édition du récit">
          <fieldset key={bookId} className="scr__fs" disabled={!canEdit}>
            <section className="scr-sec">
              <div className="scr-sec__h">En-tête</div>
              <label className="scr-fld"><span className="scr-lbl">Surtitre</span>
                <SyncField className="finput" list="scr-sur-list" autoComplete="off" value={book.surtitre || ''} onValue={(v) => editBook((b) => { b.surtitre = v; })} />
                <datalist id="scr-sur-list"><option value="Prologue" /><option value="Interlude" /><option value="Épilogue" /></datalist>
              </label>
              <label className="scr-fld"><span className="scr-lbl">Titre, ligne 1</span>{headField('titre1', 'scr-t1')}</label>
              <label className="scr-fld"><span className="scr-lbl">Titre, ligne 2 (italique doré)</span>{headField('titre2', 'scr-t2')}</label>
            </section>

            {book.acts.map((a, i) => (
              <section className="scr-act" key={a.id}>
                <div className="scr-act__h">
                  <span className="scr-act__n">{roman(i + 1)}</span>
                  <SyncField
                    id={'scr-act-' + a.id} className="finput scr-act__name" placeholder="Nom de l'acte" autoComplete="off"
                    aria-label={"Nom de l'acte " + roman(i + 1)} value={a.name}
                    onValue={(v) => editBook((b) => { const x = actOf(b, a.id); if (x) x.name = v; })}
                  />
                  <Tools
                    first={i === 0} last={i === book.acts.length - 1} what="l'acte"
                    onUp={() => moveAct(a.id, -1)} onDown={() => moveAct(a.id, 1)} onDelete={() => deleteAct(a, i)}
                  />
                </div>
                <div className="scr-act__blocks">
                  {a.blocks.map((x, j) => (
                    <BlockEditor
                      key={x.id} b={x} first={j === 0} last={j === a.blocks.length - 1} busy={uploading.has(x.id)}
                      onPatch={(fn) => patchBlock(a.id, x.id, fn)}
                      onType={(t) => setBlockType(a.id, x.id, t)}
                      onMove={(dir) => moveBlock(a.id, x.id, dir)}
                      onDelete={() => deleteBlock(a.id, x)}
                      onImage={(f) => takeImage(a.id, x.id, f)}
                      onFocus={() => scrollPreviewTo(x.id)}
                    />
                  ))}
                </div>
                <div className="scr-add">
                  <button
                    type="button" className="scr-add__btn" aria-expanded={openMenu === a.id}
                    onClick={() => setOpenMenu(openMenu === a.id ? null : a.id)}
                  >Ajouter un bloc</button>
                  {openMenu === a.id && (
                    <div className="scr-add__menu">
                      {Object.entries(TYPES).map(([k, v], n) => (
                        <button key={k} type="button" autoFocus={n === 0} onClick={() => addBlock(a.id, k)}>
                          <i className={'scr-gl scr-gl--' + k} aria-hidden="true">{GLYPH[k]}</i><b>{v}</b>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            ))}
            <button className="scr-btn scr-add-act" type="button" onClick={addAct}>+ Ajouter un acte</button>

            <section className="scr-sec scr-sec--end">
              <div className="scr-sec__h">Clôture</div>
              <label className="scr-fld"><span className="scr-lbl">Mention de fin</span>
                <SyncField className="finput" autoComplete="off" placeholder={autoFin(book.surtitre).replace('’', "'")} value={book.fin || ''} onValue={(v) => editBook((b) => { b.fin = v; })} />
              </label>
              <label className="scr-fld"><span className="scr-lbl">Ligne sous la mention</span>
                <SyncField className="finput" autoComplete="off" placeholder="Facultative, ex. « La suite, vendredi à 21 h. »" value={book.finSub || ''} onValue={(v) => editBook((b) => { b.finSub = v; })} />
              </label>
              <label className="scr-fld"><span className="scr-lbl">Signature</span>
                <SyncField className="finput" autoComplete="off" placeholder="Facultative, en pied de page" value={book.signature || ''} onValue={(v) => editBook((b) => { b.signature = v; })} />
              </label>
              <label className="scr-chk">
                <input type="checkbox" checked={book.braise !== false} onChange={(e) => { const v = e.target.checked; editBook((b) => { b.braise = v; }); }} />
                Point de braise pulsant
              </label>
            </section>
          </fieldset>

          <div className="scr-foot">
            <p className="scr-hint">La typographie française est appliquée à la mise en page : espaces insécables avant ; : ! ?, guillemets « » autour des répliques, apostrophes courbes. Mise en forme : **gras**, *italique*, __souligné__ (boutons B, I, U ou Ctrl+B, Ctrl+I, Ctrl+U). Les images déposées sont réduites puis hébergées avec les autres captures du repaire.</p>
            {manualCopy != null && (
              <label className="scr-fld">
                <span className="scr-lbl">Copie manuelle</span>
                <textarea ref={manualRef} className="finput scr-copy" readOnly value={manualCopy} />
              </label>
            )}
          </div>
        </aside>

        <section className="scr__pv" aria-label="Aperçu">
          <iframe ref={frameRef} className="scr__frame" title="Aperçu du récit" />
        </section>
      </div>

      {note && (
        <div className="toast scr-toast" role="status">
          <span>{note.msg}</span>
          {note.undo && undoStack.current.length > 0 && <button type="button" onClick={() => { setNote(null); undo(); }}>Annuler</button>}
        </div>
      )}
    </section>
  );
}
