import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { looseKey } from '../lib/wiki.js';
import { parseMarkdown, outline, blockIds } from '../lib/wikiMd.js';
import { WIKI_TEMPLATES } from '../lib/wikiTemplates.js';
import { CALLOUT_TYPES } from './WikiMarkdown.jsx';
import * as E from '../lib/wikiEdit.js';

/* Éditeur Markdown du Compendium, façon Obsidian : coloration de la syntaxe
 * pendant la frappe, barre d'outils, raccourcis (Ctrl+B / I / K…), listes qui
 * se poursuivent, fermeture automatique des crochets, menu « / », complétion
 * des [[liens]] (notes, #titres, ^blocs, images), des #tags et des callouts,
 * images collées ou déposées, recherche / remplacement.
 *
 * Le texte reste dans un <textarea> (clavier, sélection, correcteur natifs) ;
 * la couleur vient d'une couche <pre> placée dessous, aux mêmes mesures. */

const LINK_OPEN = /(!?)\[\[([^\]\[\n|]*)$/;
const CALLOUT_OPEN = /^(\s*>\s*)\[!([\w-]*)$/;
const TAG_OPEN = /(?:^|\s)#([\p{L}_/-][\p{L}\p{N}_/-]*)$/u;
const SLASH_OPEN = /(?:^|\s)\/([\p{L}0-9]*)$/u;

/* ---------------- coloration ---------------- */

const TOKEN = /(%%[^%\n]*%%)|(!?\[\[[^\]\n]*\]\])|(\[[^\]\n]*\]\([^)\n]*\))|(`[^`\n]+`)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(==[^=\n]+==)|(~~[^~\n]+~~)|(\$[^$\n]+\$)|((?<![\w&])#[\p{L}_/-][\p{L}\p{N}_/-]*)|(\[\^[^\]\n]+\])|((?<=\s)\^[A-Za-z0-9-]+\s*$)/gu;
const TOKEN_CLASS = ['', 'hl-cmt', 'hl-link', 'hl-ext', 'hl-code', 'hl-b', 'hl-mark', 'hl-s', 'hl-math', 'hl-tag', 'hl-fn', 'hl-id'];

function highlightLine(line, key) {
  const out = [];
  let last = 0;
  line.replace(TOKEN, (m, ...g) => {
    const at = g[g.length - 2];
    const idx = g.slice(0, 11).findIndex((x) => x !== undefined) + 1;
    if (at > last) out.push(line.slice(last, at));
    out.push(<span key={at} className={TOKEN_CLASS[idx]}>{m}</span>);
    last = at + m.length;
    return m;
  });
  if (last < line.length) out.push(line.slice(last));
  return out.length ? out : null;
}

function highlight(text) {
  const lines = text.split('\n');
  const out = [];
  let fence = false;
  lines.forEach((line, i) => {
    let cls = '';
    let inner;
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; cls = 'hl-fence'; inner = line; }
    else if (fence) { cls = 'hl-fence'; inner = line; }
    else {
      const h = /^\s{0,3}(#{1,6})\s/.exec(line);
      if (h) cls = 'hl-h hl-h' + h[1].length;
      else if (/^\s*>/.test(line)) cls = 'hl-quote';
      else if (/^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,})$/.test(line)) cls = 'hl-hr';
      const lm = /^(\s*(?:>\s?)*)([-*+]|\d+[.)])(\s+(?:\[.\]\s+)?)/.exec(line);
      if (lm && !h) {
        inner = [<span key="m" className="hl-mark-list">{lm[1] + lm[2]}</span>, lm[3], ...(highlightLine(line.slice(lm[0].length), i) || [])];
      } else inner = highlightLine(line, i);
    }
    out.push(<span key={i} className={cls || undefined}>{inner}</span>);
    out.push('\n');
  });
  out.push(' ');
  return out;
}

/* ---------------- commandes d'insertion (menu « / » et « Insérer ») ---------------- */

function buildCommands(extra) {
  const c = (id, label, hint, run) => ({ id, label, hint, run });
  const out = [
    c('h1', 'Titre 1', '# ', (t, s, e) => E.toggleLinePrefix(t, s, e, 'h1')),
    c('h2', 'Titre 2', '## ', (t, s, e) => E.toggleLinePrefix(t, s, e, 'h2')),
    c('h3', 'Titre 3', '### ', (t, s, e) => E.toggleLinePrefix(t, s, e, 'h3')),
    c('ul', 'Liste à puces', '- ', (t, s, e) => E.toggleLinePrefix(t, s, e, 'ul')),
    c('ol', 'Liste numérotée', '1. ', (t, s, e) => E.toggleLinePrefix(t, s, e, 'ol')),
    c('task', 'Liste de tâches', '- [ ]', (t, s, e) => E.toggleLinePrefix(t, s, e, 'task')),
    c('quote', 'Citation', '> ', (t, s, e) => E.toggleLinePrefix(t, s, e, 'quote')),
    c('table', 'Tableau', '| a | b |', (t, s) => E.table(t, s)),
    c('code', 'Bloc de code', '```', (t, s, e) => E.codeBlock(t, s, e)),
    c('hr', 'Séparateur', '---', (t, s) => E.insertText(t, s, s, (s > 0 && t[s - 1] !== '\n' ? '\n' : '') + '\n---\n\n')),
    c('link', 'Lien vers une note', '[[ ]]', (t, s, e) => E.wikiLink(t, s, e)),
    c('embed', 'Insérer une note ou une image', '![[ ]]', (t, s, e) => E.toggleWrap(t, s, e, '![[', ']]')),
    c('ext', 'Lien externe', '[ ]( )', (t, s, e) => E.extLink(t, s, e)),
    c('math', 'Formule (LaTeX)', '$ $', (t, s, e) => E.toggleWrap(t, s, e, '$')),
    c('mathblock', 'Bloc de formule', '$$', (t, s, e) => E.insertText(t, s, e, '$$\n' + t.slice(s, e) + '\n$$\n', 3 + (e - s))),
    c('fn', 'Note de bas de page', '[^1]', (t, s) => {
      const n = (t.match(/\[\^(\d+)\](?!:)/g) || []).length + 1;
      const tail = (t.endsWith('\n') ? '' : '\n') + '\n[^' + n + ']: ';
      return { from: s, to: t.length, insert: '[^' + n + ']' + t.slice(s) + tail, sel: [t.length + ('[^' + n + ']').length + tail.length, t.length + ('[^' + n + ']').length + tail.length] };
    }),
    c('comment', 'Commentaire (caché)', '%% %%', (t, s, e) => E.toggleWrap(t, s, e, '%%')),
    c('date', 'Date du jour', '', (t, s, e) => E.insertText(t, s, e, new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }))),
    c('tag', 'Tag', '#', (t, s, e) => E.insertText(t, s, e, '#'))
  ];
  CALLOUT_TYPES.forEach((type) => out.push(c('callout-' + type, 'Callout : ' + type, '> [!' + type + ']', (t, s, e) => E.callout(t, s, e, type))));
  WIKI_TEMPLATES.filter((x) => x.body.trim()).forEach((x) => out.push(c('tpl-' + x.id, 'Modèle : ' + x.label, x.desc, (t, s, e) => E.insertText(t, s, e, x.body))));
  return out.concat(extra || []);
}

/* ---------------- complétion ---------------- */

function noteCandidates(index, q) {
  const k = looseKey(q);
  const out = [];
  for (const n of index.notes) {
    const names = [n.title].concat([].concat(n.front.aliases || n.front.alias || []).filter((a) => typeof a === 'string'));
    for (const name of names) {
      const nk = looseKey(name);
      if (!k || nk.includes(k)) { out.push({ key: n.path + '|' + name, label: name, hint: (name !== n.title ? 'alias · ' : '') + n.path.replace(/\.md$/i, '').split('/').slice(0, -1).join(' / '), insert: name, score: nk.startsWith(k) ? 0 : 1 }); break; }
    }
  }
  return out.sort((a, b) => a.score - b.score || a.label.length - b.label.length || a.label.localeCompare(b.label, 'fr')).slice(0, 8);
}

export default function WikiEditor({ value, onChange, onBlur, onSave, index, media, fromPath, tags, onImage, className, placeholder }) {
  const ref = useRef(null);
  const mirror = useRef(null);
  const box = useRef(null);
  const fileInput = useRef(null);
  const [sug, setSug] = useState(null); // { kind, start, query, embed }
  const [sel, setSel] = useState(0);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [find, setFind] = useState(null); // { q, r } | null
  const [busy, setBusy] = useState('');
  const commands = useMemo(() => buildCommands(onImage ? [{ id: 'image', label: 'Image…', hint: 'fichier', run: () => null }] : []), [onImage]);

  /* ----- mesures : la zone grandit avec le texte, la page défile ----- */
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);
  useLayoutEffect(() => {
    const el = ref.current; if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let w = el.offsetWidth;
    const ro = new ResizeObserver(() => { if (el.offsetWidth !== w) { w = el.offsetWidth; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const colored = useMemo(() => highlight(value), [value]);
  const words = useMemo(() => (value.trim() ? value.trim().split(/\s+/).length : 0), [value]);

  /* ----- application d'une édition (garde l'historique annuler/rétablir) ----- */
  const apply = useCallback((ed) => {
    const el = ref.current; if (!el || !ed) return;
    const old = el.value;
    const expected = old.slice(0, ed.from) + ed.insert + old.slice(ed.to);
    el.focus();
    el.setSelectionRange(ed.from, ed.to);
    let ok = false;
    try { ok = ed.insert === '' ? document.execCommand('delete') : document.execCommand('insertText', false, ed.insert); } catch (_) { ok = false; }
    if (!ok || el.value !== expected) {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      set.call(el, expected);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.setSelectionRange(ed.sel[0], ed.sel[1]);
  }, []);

  const run = useCallback((fn) => {
    const el = ref.current; if (!el) return;
    apply(fn(el.value, el.selectionStart, el.selectionEnd));
    detect(el); // eslint-disable-line no-use-before-define
  }, [apply]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- suggestions ----- */
  function caretXY(el, at) {
    const m = mirror.current; if (!m) return { x: 0, y: 0 };
    m.textContent = el.value.slice(0, at);
    const span = document.createElement('span');
    span.textContent = '​';
    m.appendChild(span);
    return { x: span.offsetLeft, y: span.offsetTop, span };
  }

  function detect(el) {
    if (el.selectionStart !== el.selectionEnd) { setSug(null); return; }
    const at = el.selectionStart;
    const before = el.value.slice(E.lineStart(el.value, at), at);
    let m; let next = null;
    if ((m = LINK_OPEN.exec(before))) next = { kind: 'link', embed: !!m[1], start: at - m[2].length, query: m[2] };
    else if ((m = CALLOUT_OPEN.exec(before))) next = { kind: 'callout', start: at - m[2].length, query: m[2] };
    else if ((m = TAG_OPEN.exec(before))) next = { kind: 'tag', start: at - m[1].length, query: m[1] };
    else if ((m = SLASH_OPEN.exec(before))) next = { kind: 'slash', start: at - m[1].length - 1, query: m[1] };
    if (next) {
      const c = caretXY(el, next.start);
      setPos({ x: Math.min(c.x, Math.max(0, el.offsetWidth - 280)), y: c.y + 28 });
      setSel(0);
    }
    setSug(next);
  }

  const items = useMemo(() => {
    if (!sug) return [];
    const k = looseKey(sug.query);
    if (sug.kind === 'callout') return CALLOUT_TYPES.filter((t) => !k || t.includes(k)).map((t) => ({ key: t, label: t, hint: '', insert: t }));
    if (sug.kind === 'tag') return (tags || []).filter((t) => looseKey(t.tag).includes(k)).slice(0, 8).map((t) => ({ key: t.tag, label: '#' + t.tag, hint: t.count + '×', insert: t.tag }));
    if (sug.kind === 'slash') return commands.filter((c) => !k || looseKey(c.label).includes(k) || c.id.includes(k)).slice(0, 9).map((c) => ({ key: c.id, label: c.label, hint: c.hint, cmd: c }));
    // lien : Note | Note#Titre | Note^bloc
    const q = sug.query;
    const hash = q.indexOf('#'); const caret = q.indexOf('^');
    const cut = hash >= 0 ? hash : caret;
    if (cut >= 0) {
      const notePart = q.slice(0, cut); const sub = looseKey(q.slice(cut + 1));
      const dest = notePart ? index.resolve(notePart, fromPath) : fromPath;
      const body = notePart ? (dest && index.byPath.get(dest) ? index.byPath.get(dest).body : '') : value;
      if (hash >= 0 && (caret < 0 || hash < caret)) {
        return outline(parseMarkdown(body)).filter((h) => !sub || looseKey(h.text).includes(sub)).slice(0, 9)
          .map((h) => ({ key: h.slug + h.level, label: h.text, hint: 'h' + h.level, insert: notePart + '#' + h.text }));
      }
      return blockIds(body).filter((b) => !sub || looseKey(b.preview + b.id).includes(sub)).slice(0, 9)
        .map((b) => ({ key: b.id, label: b.preview || '^' + b.id, hint: '^' + b.id, insert: notePart + '^' + b.id }));
    }
    const notes = noteCandidates(index, q);
    if (!sug.embed) return notes;
    const imgs = Object.keys(media || {}).filter((n) => !k || looseKey(n).includes(k)).slice(0, 6).map((n) => ({ key: 'img:' + n, label: n, hint: 'image', insert: n }));
    return imgs.concat(notes).slice(0, 10);
  }, [sug, tags, commands, index, media, fromPath, value]);

  function pick(item) {
    const el = ref.current; if (!el || !sug) return;
    const t = el.value; const caret = el.selectionStart;
    if (sug.kind === 'slash') {
      // on retire « /requête » puis on exécute la commande, en une seule édition
      const t2 = t.slice(0, sug.start) + t.slice(caret);
      const removed = caret - sug.start;
      setSug(null);
      if (item.cmd.id === 'image') { apply({ from: sug.start, to: caret, insert: '', sel: [sug.start, sug.start] }); if (fileInput.current) fileInput.current.click(); return; }
      const ed = item.cmd.run(t2, sug.start, sug.start);
      apply({ ...ed, from: Math.min(ed.from, sug.start), to: Math.max(ed.to, sug.start) + removed });
      return;
    }
    const after = t.slice(caret);
    // un fermant déjà présent (fermeture automatique) est absorbé : on le réécrit après la saisie
    let insert = item.insert; let end = caret;
    if (sug.kind === 'link') { if (after.startsWith(']]')) end = caret + 2; insert += ']]'; }
    else if (sug.kind === 'callout') { if (after.startsWith(']')) end = caret + 1; insert += '] '; }
    setSug(null);
    apply({ from: sug.start, to: end, insert, sel: [sug.start + insert.length, sug.start + insert.length] });
  }

  /* ----- images ----- */
  async function addImages(files) {
    if (!onImage || !files.length) return;
    const el = ref.current;
    setBusy('Envoi de l’image…');
    const names = [];
    try {
      for (const f of files) names.push(await onImage(f));
    } catch (err) {
      setBusy('Envoi impossible : ' + ((err && err.message) || err));
      setTimeout(() => setBusy(''), 4000);
      return;
    }
    setBusy('');
    if (!names.length) return;
    const s = el.selectionStart;
    apply(E.insertText(el.value, s, el.selectionEnd, names.map((n) => '![[' + n + ']]').join('\n') + '\n'));
  }

  /* ----- clavier ----- */
  function onKeyDown(e) {
    if (e.nativeEvent.isComposing) return;
    const el = e.target; const t = el.value; const s = el.selectionStart; const en = el.selectionEnd;
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;

    if (sug && items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((x) => (x + 1) % items.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((x) => (x - 1 + items.length) % items.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(items[Math.min(sel, items.length - 1)]); return; }
    }
    if (sug && e.key === 'Escape') { e.preventDefault(); setSug(null); return; }

    if (mod) {
      const k = e.key.toLowerCase();
      let ed = null;
      if (k === 'b') ed = E.toggleWrap(t, s, en, '**');
      else if (k === 'i') ed = E.toggleWrap(t, s, en, '*');
      else if (k === 'k') ed = e.shiftKey ? E.extLink(t, s, en) : E.wikiLink(t, s, en);
      else if (k === 'e') ed = E.toggleWrap(t, s, en, '`');
      else if (k === 'h' && e.shiftKey) ed = E.toggleWrap(t, s, en, '==');
      else if (k === 'x' && e.shiftKey) ed = E.toggleWrap(t, s, en, '~~');
      else if (k === '/') ed = E.toggleWrap(t, s, en, '%%');
      else if (k === 'enter') ed = E.toggleTask(t, s);
      else if (k === ']') ed = E.indentLines(t, s, en, 1);
      else if (k === '[') ed = E.indentLines(t, s, en, -1);
      else if (k === 'f') { e.preventDefault(); setFind((f) => f || { q: t.slice(s, en).split('\n')[0] || '', r: '' }); return; }
      else if (k === 's') { e.preventDefault(); if (onSave) onSave(); return; }
      if (ed) { e.preventDefault(); apply(ed); detect(el); }
      return;
    }
    if (e.altKey && !e.ctrlKey) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      const ed = E.continueList(t, s, en);
      if (ed) { e.preventDefault(); apply(ed); setSug(null); }
      return;
    }
    if (e.key === 'Tab') {
      if (s !== en && t.slice(s, en).includes('\n')) { e.preventDefault(); apply(E.indentLines(t, s, en, e.shiftKey ? -1 : 1)); return; }
      if (E.onListLine(t, s)) { e.preventDefault(); apply(E.indentLines(t, s, en, e.shiftKey ? -1 : 1)); }
      return;
    }
    if (e.key === 'Backspace') {
      const ed = E.pairBackspace(t, s, en);
      if (ed) { e.preventDefault(); apply(ed); }
      return;
    }
    if (e.key.length === 1) {
      const ed = E.pairKey(t, s, en, e.key);
      if (ed) { e.preventDefault(); apply(ed); detect(el); }
    }
  }

  function onPaste(e) {
    const files = [...(e.clipboardData.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length && onImage) { e.preventDefault(); addImages(files); return; }
    const el = e.target;
    const txt = (e.clipboardData.getData('text') || '').trim();
    if (el.selectionStart !== el.selectionEnd && /^https?:\/\/\S+$/.test(txt)) {
      e.preventDefault();
      apply({ from: el.selectionStart, to: el.selectionEnd, insert: '[' + el.value.slice(el.selectionStart, el.selectionEnd) + '](' + txt + ')', sel: [el.selectionEnd + 3 + txt.length, el.selectionEnd + 3 + txt.length] });
    }
  }
  function onDrop(e) {
    const files = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length && onImage) { e.preventDefault(); addImages(files); }
  }

  /* ----- recherche / remplacement ----- */
  const hits = useMemo(() => (find ? E.findAll(value, find.q) : []), [find, value]);
  function goTo(dir) {
    const el = ref.current; if (!el || !hits.length) return;
    const from = dir > 0 ? el.selectionEnd : el.selectionStart - 1;
    let at = dir > 0 ? hits.find((h) => h >= from) : [...hits].reverse().find((h) => h <= from);
    if (at === undefined) at = dir > 0 ? hits[0] : hits[hits.length - 1];
    el.focus();
    el.setSelectionRange(at, at + find.q.length);
    const c = caretXY(el, at);
    if (c.span && c.span.scrollIntoView) c.span.scrollIntoView({ block: 'center' });
  }
  function replaceOne() {
    const el = ref.current; if (!el || !find.q) return;
    if (value.slice(el.selectionStart, el.selectionEnd).toLowerCase() === find.q.toLowerCase()) {
      apply({ from: el.selectionStart, to: el.selectionEnd, insert: find.r, sel: [el.selectionStart + find.r.length, el.selectionStart + find.r.length] });
    }
    setTimeout(() => goTo(1), 0);
  }
  function replaceAll() {
    if (!find.q || !hits.length) return;
    let out = ''; let last = 0;
    hits.forEach((h) => { out += value.slice(last, h) + find.r; last = h + find.q.length; });
    out += value.slice(last);
    apply({ from: 0, to: value.length, insert: out, sel: [0, 0] });
  }

  const T = (label, title, fn, cls) => (
    <button type="button" className={'wiki-ed__tb ' + (cls || '')} title={title} aria-label={title}
      onMouseDown={(e) => e.preventDefault()} onClick={fn}>{label}</button>
  );
  const insertMenu = (c) => {
    if (c.id === 'embed') return null;
    return (
      <button key={c.id} type="button" className="wiki-ed__menuitem" onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { e.currentTarget.closest('details').open = false; if (c.id === 'image') { if (fileInput.current) fileInput.current.click(); } else run(c.run); }}>
        <span>{c.label}</span><i>{c.hint}</i>
      </button>
    );
  };

  return (
    <div className="wiki-ed" ref={box}>
      <div className="wiki-ed__toolbar" role="toolbar" aria-label="Mise en forme">
        {T('H1', 'Titre 1', () => run((t, s, e) => E.toggleLinePrefix(t, s, e, 'h1')))}
        {T('H2', 'Titre 2', () => run((t, s, e) => E.toggleLinePrefix(t, s, e, 'h2')))}
        {T('H3', 'Titre 3', () => run((t, s, e) => E.toggleLinePrefix(t, s, e, 'h3')))}
        <span className="wiki-ed__sep" />
        {T('G', 'Gras (Ctrl+B)', () => run((t, s, e) => E.toggleWrap(t, s, e, '**')), 'is-b')}
        {T('I', 'Italique (Ctrl+I)', () => run((t, s, e) => E.toggleWrap(t, s, e, '*')), 'is-i')}
        {T('S', 'Barré (Ctrl+Maj+X)', () => run((t, s, e) => E.toggleWrap(t, s, e, '~~')), 'is-s')}
        {T('▮', 'Surligné (Ctrl+Maj+H)', () => run((t, s, e) => E.toggleWrap(t, s, e, '==')), 'is-mark')}
        {T('</>', 'Code (Ctrl+E)', () => run((t, s, e) => E.toggleWrap(t, s, e, '`')))}
        <span className="wiki-ed__sep" />
        {T('•', 'Liste à puces', () => run((t, s, e) => E.toggleLinePrefix(t, s, e, 'ul')))}
        {T('1.', 'Liste numérotée', () => run((t, s, e) => E.toggleLinePrefix(t, s, e, 'ol')))}
        {T('☑', 'Liste de tâches', () => run((t, s, e) => E.toggleLinePrefix(t, s, e, 'task')))}
        {T('❝', 'Citation', () => run((t, s, e) => E.toggleLinePrefix(t, s, e, 'quote')))}
        <span className="wiki-ed__sep" />
        {T('[[ ]]', 'Lien vers une note (Ctrl+K)', () => run((t, s, e) => E.wikiLink(t, s, e)))}
        {T('🔗', 'Lien externe (Ctrl+Maj+K)', () => run((t, s, e) => E.extLink(t, s, e)))}
        {onImage && T('🖼', 'Image…', () => fileInput.current && fileInput.current.click())}
        <details className="wiki-ed__menu">
          <summary className="wiki-ed__tb" title="Insérer…" onMouseDown={(e) => e.preventDefault()}>Insérer ▾</summary>
          <div className="wiki-ed__menubody">{commands.map(insertMenu)}</div>
        </details>
        <span className="wiki-ed__grow" />
        {T('⌕', 'Rechercher / remplacer (Ctrl+F)', () => setFind((f) => (f ? null : { q: '', r: '' })))}
        <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { const f = [...e.target.files]; e.target.value = ''; addImages(f); }} />
      </div>

      {find && (
        <div className="wiki-ed__find">
          <input className="finput" placeholder="Rechercher" value={find.q} autoFocus aria-label="Rechercher"
            onChange={(e) => setFind({ ...find, q: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); goTo(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') setFind(null); }} />
          <input className="finput" placeholder="Remplacer par" value={find.r} aria-label="Remplacer par" onChange={(e) => setFind({ ...find, r: e.target.value })} />
          <span className="chr__muted">{find.q ? hits.length + ' trouvé' + (hits.length > 1 ? 's' : '') : ''}</span>
          <button type="button" className="tbtn" onClick={() => goTo(-1)} disabled={!hits.length}>↑</button>
          <button type="button" className="tbtn" onClick={() => goTo(1)} disabled={!hits.length}>↓</button>
          <button type="button" className="tbtn" onClick={replaceOne} disabled={!hits.length}>Remplacer</button>
          <button type="button" className="tbtn" onClick={replaceAll} disabled={!hits.length}>Tout remplacer</button>
          <button type="button" className="tbtn" onClick={() => setFind(null)} aria-label="Fermer la recherche">✕</button>
        </div>
      )}

      <div className="wiki-ed__box">
        <pre className="wiki-ed__hl" aria-hidden="true">{colored}</pre>
        <div className="wiki-ed__mirror" ref={mirror} aria-hidden="true" />
        <textarea
          ref={ref} className={'wiki-ed__ta ' + (className || '')} spellCheck placeholder={placeholder} value={value}
          onChange={(e) => { onChange(e.target.value); detect(e.target); }}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') detect(e.target); }}
          onClick={(e) => detect(e.target)}
          onPaste={onPaste} onDrop={onDrop} onDragOver={(e) => { if (onImage && [...(e.dataTransfer.types || [])].includes('Files')) e.preventDefault(); }}
          onBlur={() => { setTimeout(() => setSug(null), 120); if (onBlur) onBlur(); }}
        />
        {sug && items.length > 0 && (
          <ul className="wiki-suggest__list wiki-ed__sug" role="listbox" aria-label="Propositions" style={{ left: pos.x, top: pos.y }}>
            {items.map((c, i) => (
              <li key={c.key} role="option" aria-selected={i === sel} className={i === sel ? 'is-sel' : ''}
                onMouseDown={(e) => { e.preventDefault(); pick(c); }} onMouseEnter={() => setSel(i)}>
                <span>{c.label}</span><i>{c.hint}</i>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="wiki-ed__status">
        <span>{words} mot{words > 1 ? 's' : ''} · {value.length} caractère{value.length > 1 ? 's' : ''}</span>
        {busy && <span className="wiki-ed__busy">{busy}</span>}
        <span className="wiki-ed__tip">« / » pour insérer · « [[ » pour lier · « #tag » · coller une image</span>
      </div>
    </div>
  );
}
