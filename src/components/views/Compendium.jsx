import { useEffect, useMemo, useRef, useState } from 'react';
import { lsGet, lsSet } from '../../lib/util.js';
import { toast } from '../../lib/toast.js';
import { useWiki } from '../../lib/wikiStore.js';
import { buildTree, countNotes, folderOf, looseKey, resolveMedia, toMarkdown } from '../../lib/wiki.js';
import { parseMarkdown, parseInline, outline, excerpt, slugHeading } from '../../lib/wikiMd.js';
import WikiMarkdown, { Inline } from '../WikiMarkdown.jsx';
import WikiImportModal from '../WikiImportModal.jsx';
import './wiki.css';

/* Compendium — le wiki de l'univers, façon Obsidian : notes en Markdown reliées
 * par des [[liens]], propriétés YAML, rétroliens, recherche, arborescence.
 * Les notes viennent du vault (import) et restent éditables ici (MJ). */

const LOC_KEY = 'ccm.wiki.loc';
const DIRS_KEY = 'ccm.wiki.dirs';
/* Propriétés techniques du vault, sans intérêt à l'écran. */
const HIDDEN_PROPS = new Set(['image', 'banner', 'banner-y', 'banner_y', 'cssclasses', 'cssclass', 'weaveevents', 'narrativeweave', 'entitytype', 'title', 'aliases', 'alias']);
const SUMMARY_KEYS = ['resume', 'résumé', 'summary'];

const isEmptyVal = (v) => v == null || v === '' || (Array.isArray(v) && !v.length) || (v && typeof v === 'object' && !Array.isArray(v) && !Object.values(v).some((x) => !isEmptyVal(x)));
const propLabel = (k) => { const s = String(k).replace(/[_-]+/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
const cleanName = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();

function PropValue({ v, ctx }) {
  if (isEmptyVal(v)) return null;
  if (Array.isArray(v)) {
    return <span className="wiki-chips">{v.filter((x) => !isEmptyVal(x)).map((x, i) => <span className="wiki-chip" key={i}><PropValue v={x} ctx={ctx} /></span>)}</span>;
  }
  if (typeof v === 'object') {
    return (
      <span className="wiki-subprops">
        {Object.entries(v).filter(([, x]) => !isEmptyVal(x)).map(([k, x]) => <span key={k}><i>{propLabel(k)}</i> <PropValue v={x} ctx={ctx} /></span>)}
      </span>
    );
  }
  const s = String(v);
  const shown = /\s/.test(s) || s.includes('[[') ? s : s.replace(/_/g, ' ');
  return <Inline nodes={parseInline(shown)} ctx={ctx} />;
}

function imageNameOf(v) {
  const m = /^\s*(?:!?\[\[)?([^\]|#]+?\.(?:png|jpe?g|gif|svg|webp|bmp|avif))/i.exec(String(v || ''));
  return m ? m[1].trim() : '';
}

/* ---------------- recherche ---------------- */

function useSearchable(notes) {
  return useMemo(() => notes.map((n) => ({ n, t: looseKey(n.title), p: looseKey(n.path), f: looseKey(n.fm), b: looseKey(n.body) })), [notes]);
}

function runSearch(items, q) {
  const toks = looseKey(q).split(' ').filter(Boolean);
  if (!toks.length) return null;
  const out = [];
  for (const it of items) {
    let score = 0; let ok = true;
    for (const tok of toks) {
      let s = 0;
      if (it.t === tok) s += 100; else if (it.t.startsWith(tok)) s += 60; else if (it.t.includes(tok)) s += 40;
      if (it.p.includes(tok)) s += 10;
      if (it.f.includes(tok)) s += 8;
      if (it.b.includes(tok)) s += 3;
      if (!s) { ok = false; break; }
      score += s;
    }
    if (ok) out.push({ n: it.n, score });
  }
  return out.sort((a, b) => b.score - a.score || a.n.title.localeCompare(b.n.title, 'fr')).slice(0, 60).map((x) => x.n);
}

/* ---------------- arborescence ---------------- */

function TreeDir({ dir, depth, openDirs, toggle, cur, go }) {
  const open = openDirs.has(dir.path);
  const isCur = cur === 'folder:' + dir.path;
  return (
    <div className="wiki-tree__dir">
      <div className={'wiki-tree__row' + (isCur ? ' is-cur' : '')} style={{ paddingLeft: 6 + depth * 12 }}>
        <button type="button" className="wiki-tree__chev" onClick={() => toggle(dir.path)} aria-label={open ? 'replier' : 'déplier'}>{open ? '▾' : '▸'}</button>
        <button type="button" className="wiki-tree__name wiki-tree__name--dir" onClick={() => go('folder:' + dir.path)}>{dir.name}</button>
        <span className="wiki-tree__n">{countNotes(dir)}</span>
      </div>
      {open && (
        <>
          {dir.folders.map((f) => <TreeDir key={f.path} dir={f} depth={depth + 1} openDirs={openDirs} toggle={toggle} cur={cur} go={go} />)}
          {dir.notes.map((n) => <TreeNote key={n.path} n={n} depth={depth + 1} cur={cur} go={go} />)}
        </>
      )}
    </div>
  );
}

function TreeNote({ n, depth, cur, go }) {
  const empty = !n.body.trim();
  return (
    <div className={'wiki-tree__row' + (cur === 'note:' + n.path ? ' is-cur' : '')} style={{ paddingLeft: 6 + depth * 12 + 16 }}>
      <button type="button" className={'wiki-tree__name' + (empty ? ' is-empty' : '')} onClick={() => go('note:' + n.path)} title={empty ? 'Note encore vide' : n.path}>{n.title}</button>
    </div>
  );
}

/* ---------------- édition ---------------- */

function NoteEditor({ note, wiki, ctx, onDone, onDelete }) {
  const [fm, setFm] = useState(note.fm);
  const [body, setBody] = useState(note.body);
  const timer = useRef(null);
  const pending = useRef({});
  const flush = () => {
    clearTimeout(timer.current);
    if (Object.keys(pending.current).length) { wiki.saveNote(note.path, pending.current); pending.current = {}; }
  };
  const queue = (patch) => { pending.current = { ...pending.current, ...patch }; clearTimeout(timer.current); timer.current = setTimeout(flush, 500); };
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  function download() {
    const blob = new Blob([toMarkdown({ ...note, fm, body })], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = note.title + '.md';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="wiki-edit">
      <div className="wiki-edit__bar">
        <span className="chr__muted">Édition — enregistrée automatiquement. Les liens s’écrivent <code>[[Nom de la note]]</code> ou <code>[[Note|texte]]</code>.</span>
        <span className="wiki-edit__btns">
          <button className="tbtn" type="button" onClick={download}>↓ .md</button>
          <button className="tbtn" type="button" onClick={onDelete}>supprimer</button>
          <button className="btn-primary" type="button" onClick={() => { flush(); onDone(); }}>Terminer</button>
        </span>
      </div>
      <div className="wiki-edit__grid">
        <div className="wiki-edit__col">
          <label className="flabel">
            Propriétés (YAML)
            <textarea className="finput finput--area wiki-edit__fm" spellCheck={false} value={fm} placeholder={'type: lieu\ncategorie: ville'}
              onChange={(e) => { setFm(e.target.value); queue({ fm: e.target.value }); }} onBlur={flush} />
          </label>
          <label className="flabel">
            Contenu (Markdown)
            <textarea className="finput finput--area wiki-edit__body" spellCheck value={body} placeholder="# Titre&#10;Du texte, des [[liens]]…"
              onChange={(e) => { setBody(e.target.value); queue({ body: e.target.value }); }} onBlur={flush} />
          </label>
        </div>
        <div className="wiki-edit__col wiki-edit__preview">
          <span className="card__label">Aperçu</span>
          <WikiMarkdown body={body} ctx={ctx} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- lecture d'une note ---------------- */

function NoteView({ note, wiki, ctx, canEdit, onEdit, go, index }) {
  const front = note.front || {};
  const imgName = imageNameOf(front.image);
  // l'illustration du panneau n'a de sens que si le corps ne l'intègre pas déjà
  const bodyHasImg = imgName && note.body.toLowerCase().includes(imgName.toLowerCase());
  const hero = imgName && !bodyHasImg ? resolveMedia(wiki.media, imgName) : null;
  const summaryKey = Object.keys(front).find((k) => SUMMARY_KEYS.includes(k.toLowerCase()));
  const summary = summaryKey && typeof front[summaryKey] === 'string' ? front[summaryKey].replace(/_/g, ' ') : '';
  const props = Object.entries(front).filter(([k, v]) => !HIDDEN_PROPS.has(k.toLowerCase()) && !SUMMARY_KEYS.includes(k.toLowerCase()) && !isEmptyVal(v));
  const back = index.backlinks(note.path);
  const empty = !note.body.trim();
  const parts = folderOf(note.path).split('/').filter(Boolean);
  const blocks = useMemo(() => parseMarkdown(note.body), [note.body]);
  const heads = useMemo(() => outline(blocks).filter((h) => h.level <= 3), [blocks]);
  const hasDataview = /```dataview(js)?\b/.test(note.body);

  return (
    <article className="wiki-note">
      <nav className="wiki-crumbs" aria-label="Chemin">
        <button type="button" className="wiki-crumbs__a" onClick={() => go('')}>Compendium</button>
        {parts.map((p, i) => (
          <span key={i}> › <button type="button" className="wiki-crumbs__a" onClick={() => go('folder:' + parts.slice(0, i + 1).join('/'))}>{p}</button></span>
        ))}
      </nav>
      <header className="wiki-note__head">
        <h1 className="wiki-note__title">{note.title}</h1>
        {canEdit && <button className="tbtn" type="button" onClick={onEdit}>✎ Modifier</button>}
      </header>
      {summary && <p className="wiki-note__summary">{summary}</p>}

      <div className="wiki-note__cols">
        <div className="wiki-note__main">
          {empty && !hasDataview ? (
            <p className="empty">Cette note est encore vide.{canEdit ? ' Clique sur « Modifier » pour l’écrire.' : ''}</p>
          ) : <WikiMarkdown body={note.body} ctx={ctx} />}
          <FolderListing note={note} index={index} go={go} show={hasDataview} />
          {back.length > 0 && (
            <section className="wiki-back">
              <h4 className="chr__h">Mentionnée par<span className="count"> ({back.length})</span></h4>
              <ul className="wiki-back__list">
                {back.map((b) => (
                  <li key={b.from}>
                    <a href="#" className="wiki-link" onClick={(e) => { e.preventDefault(); go('note:' + b.from); }}>{index.byPath.get(b.from).title}</a>
                    <span className="chr__muted"> {folderOf(b.from).split('/').slice(-1)[0]}{b.count > 1 ? ` · ${b.count}×` : ''}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="wiki-note__side">
          {hero && <img className="wiki-hero" src={hero} alt={note.title} />}
          {props.length > 0 && (
            <dl className="wiki-props">
              {props.map(([k, v]) => (
                <div key={k} className="wiki-props__row"><dt>{propLabel(k)}</dt><dd><PropValue v={v} ctx={ctx} /></dd></div>
              ))}
            </dl>
          )}
          {heads.length > 2 && (
            <nav className="wiki-outline" aria-label="Sommaire">
              <span className="card__label">Sommaire</span>
              {heads.map((h, i) => (
                <a key={i} href={'#h-' + h.slug} className="wiki-outline__a" style={{ paddingLeft: (h.level - 1) * 10 }}
                  onClick={(e) => { e.preventDefault(); const el = document.getElementById('h-' + h.slug); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{h.text}</a>
              ))}
            </nav>
          )}
        </aside>
      </div>
    </article>
  );
}

/** Les pages d'index du vault (Villes, Domaines…) étaient des scripts Dataview,
 * qu'on ne peut pas exécuter ici : on liste à la place le contenu du dossier. */
function FolderListing({ note, index, go, show }) {
  if (!show) return null;
  const dir = folderOf(note.path);
  const kids = index.notes.filter((n) => n.path !== note.path && (folderOf(n.path) === dir || folderOf(n.path).startsWith(dir + '/')));
  if (!kids.length) return null;
  return (
    <section className="wiki-listing">
      <h4 className="chr__h">Dans ce dossier<span className="count"> ({kids.length})</span></h4>
      <NoteCards notes={kids} go={go} />
    </section>
  );
}

function NoteCards({ notes, go }) {
  return (
    <div className="wiki-cards">
      {notes.map((n) => (
        <button key={n.path} type="button" className={'wiki-card' + (n.body.trim() ? '' : ' is-empty')} onClick={() => go('note:' + n.path)}>
          <span className="wiki-card__title">{n.title}</span>
          <span className="wiki-card__path">{folderOf(n.path).split('/').slice(-1)[0] || 'racine'}</span>
          <span className="wiki-card__ex">{n.body.trim() ? excerpt(n.body, 110) : 'Note à écrire'}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------------- pages de dossier et d'accueil ---------------- */

function findDir(tree, path) {
  if (tree.path === path) return tree;
  for (const f of tree.folders) { const r = findDir(f, path); if (r) return r; }
  return null;
}

function FolderPage({ dir, go, ctx, canEdit, onNew }) {
  const parts = dir.path.split('/').filter(Boolean);
  const note = dir.folderNote;
  return (
    <article className="wiki-note">
      <nav className="wiki-crumbs">
        <button type="button" className="wiki-crumbs__a" onClick={() => go('')}>Compendium</button>
        {parts.map((p, i) => (
          <span key={i}> › <button type="button" className="wiki-crumbs__a" onClick={() => go('folder:' + parts.slice(0, i + 1).join('/'))}>{p}</button></span>
        ))}
      </nav>
      <header className="wiki-note__head">
        <h1 className="wiki-note__title">{dir.name}</h1>
        {canEdit && <button className="tbtn" type="button" onClick={() => onNew(dir.path)}>＋ Nouvelle note ici</button>}
      </header>
      {note && note.body.trim() && !/```dataview(js)?\b/.test(note.body) && <WikiMarkdown body={note.body} ctx={{ ...ctx, fromPath: note.path }} />}
      {dir.folders.length > 0 && (
        <section className="wiki-listing">
          <h4 className="chr__h">Dossiers<span className="count"> ({dir.folders.length})</span></h4>
          <div className="wiki-cards">
            {dir.folders.map((f) => (
              <button key={f.path} type="button" className="wiki-card wiki-card--dir" onClick={() => go('folder:' + f.path)}>
                <span className="wiki-card__title">{f.name}</span>
                <span className="wiki-card__path">{countNotes(f)} note{countNotes(f) > 1 ? 's' : ''}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {dir.notes.length > 0 && (
        <section className="wiki-listing">
          <h4 className="chr__h">Notes<span className="count"> ({dir.notes.length})</span></h4>
          <NoteCards notes={dir.notes} go={go} />
        </section>
      )}
      {!dir.folders.length && !dir.notes.length && !note && <p className="empty">Ce dossier est vide.</p>}
      {note && <p className="chr__muted">Page du dossier : <a href="#" className="wiki-link" onClick={(e) => { e.preventDefault(); go('note:' + note.path); }}>{note.title}</a></p>}
    </article>
  );
}

function Home({ wiki, tree, go, canEdit, onImport, onMissing }) {
  const { notes, index } = wiki;
  const st = index.stats;
  const empties = notes.filter((n) => !n.body.trim()).length;
  const wanted = index.unresolved().slice(0, 14);
  const hubs = notes.map((n) => ({ n, c: index.backlinks(n.path).length })).filter((x) => x.c > 0).sort((a, b) => b.c - a.c).slice(0, 10);
  const recent = notes.slice().sort((a, b) => b.mtime - a.mtime).slice(0, 8);
  return (
    <div className="wiki-home">
      <div className="wiki-home__hero">
        <h1 className="wiki-note__title">Compendium</h1>
        <p className="lib__intro">Le grand livre de l’univers : chaque note est reliée aux autres, cherche ou laisse-toi guider par les liens.</p>
      </div>
      <div className="wiki-stats">
        <div><b>{st.notes}</b><span>notes</span></div>
        <div><b>{st.resolved}</b><span>liens tissés</span></div>
        <div><b>{index.stats.unresolvedNames}</b><span>notes à écrire</span></div>
        <div><b>{empties}</b><span>pages vides</span></div>
      </div>
      <section className="wiki-listing">
        <h4 className="chr__h">Parcourir</h4>
        <div className="wiki-cards">
          {tree.folders.map((f) => (
            <button key={f.path} type="button" className="wiki-card wiki-card--dir" onClick={() => go('folder:' + f.path)}>
              <span className="wiki-card__title">{f.name}</span>
              <span className="wiki-card__path">{countNotes(f)} note{countNotes(f) > 1 ? 's' : ''}</span>
            </button>
          ))}
        </div>
      </section>
      <div className="wiki-home__cols">
        <section>
          <h4 className="chr__h">Les plus reliées</h4>
          <ul className="wiki-back__list">
            {hubs.map(({ n, c }) => <li key={n.path}><a href="#" className="wiki-link" onClick={(e) => { e.preventDefault(); go('note:' + n.path); }}>{n.title}</a><span className="chr__muted"> · {c} lien{c > 1 ? 's' : ''}</span></li>)}
          </ul>
        </section>
        <section>
          <h4 className="chr__h">Modifiées récemment</h4>
          <ul className="wiki-back__list">
            {recent.map((n) => <li key={n.path}><a href="#" className="wiki-link" onClick={(e) => { e.preventDefault(); go('note:' + n.path); }}>{n.title}</a></li>)}
          </ul>
        </section>
        <section>
          <h4 className="chr__h">À écrire</h4>
          <ul className="wiki-back__list">
            {wanted.map((u) => (
              <li key={u.name}>
                <a href="#" className="wiki-link wiki-link--red" onClick={(e) => { e.preventDefault(); onMissing(u.name); }}>{u.name}</a>
                <span className="chr__muted"> · cité {u.count}×</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {canEdit && <p className="chr__muted"><button className="tbtn" type="button" onClick={onImport}>Importer / mettre à jour depuis Obsidian</button></p>}
    </div>
  );
}

/* ---------------- vue ---------------- */

export default function Compendium({ userId, canEdit }) {
  const wiki = useWiki(true, userId);
  const { notes, index, status } = wiki;
  const [loc, setLocRaw] = useState(() => lsGet(LOC_KEY) || '');
  const [history, setHistory] = useState([]);
  const [mode, setMode] = useState('read');
  const [query, setQuery] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [openDirs, setOpenDirs] = useState(() => { try { return new Set(JSON.parse(lsGet(DIRS_KEY) || '[]')); } catch (_) { return new Set(); } });
  const mainRef = useRef(null);

  const tree = useMemo(() => buildTree(notes), [notes]);
  const searchable = useSearchable(notes);
  const results = useMemo(() => runSearch(searchable, query), [searchable, query]);

  const note = loc.startsWith('note:') ? index.byPath.get(loc.slice(5)) || null : null;
  const dir = loc.startsWith('folder:') ? findDir(tree, loc.slice(7)) : null;

  const persistDirs = (set) => { setOpenDirs(set); lsSet(DIRS_KEY, JSON.stringify([...set])); };
  const toggleDir = (p) => { const s = new Set(openDirs); if (s.has(p)) s.delete(p); else s.add(p); persistDirs(s); };

  function go(next, { push = true } = {}) {
    if (push && next !== loc) setHistory((h) => [...h.slice(-30), loc]);
    setLocRaw(next); lsSet(LOC_KEY, next);
    setMode('read'); setQuery('');
    // déplie les dossiers qui mènent à la note
    const p = next.startsWith('note:') ? folderOf(next.slice(5)) : next.startsWith('folder:') ? next.slice(7) : '';
    if (p) { const s = new Set(openDirs); const segs = p.split('/'); segs.forEach((_, i) => s.add(segs.slice(0, i + 1).join('/'))); persistDirs(s); }
    if (mainRef.current) mainRef.current.scrollIntoView({ block: 'start' });
  }
  const back = () => { const h = history.slice(); const prev = h.pop(); setHistory(h); go(prev === undefined ? '' : prev, { push: false }); };

  function openNote(path, heading) {
    go('note:' + path);
    if (heading) setTimeout(() => { const el = document.getElementById('h-' + slugHeading(heading)); if (el) el.scrollIntoView({ block: 'start' }); }, 60);
  }

  function createNote(folder, name, andEdit = true) {
    const clean = cleanName(name);
    if (!clean) return;
    const path = (folder ? folder + '/' : '') + clean + '.md';
    const existing = index.resolve(clean, path);
    if (existing && index.byPath.get(existing).title.toLowerCase() === clean.toLowerCase()) { openNote(existing); return; }
    if (!wiki.createNote(path)) { toast('Une note porte déjà ce nom.'); return; }
    go('note:' + path);
    if (andEdit) setMode('edit');
  }

  function onMissing(name) {
    if (!canEdit) { toast('Cette note n’est pas encore écrite.'); return; }
    if (!window.confirm('Créer la note « ' + name + ' » ?')) return;
    createNote(note ? folderOf(note.path) : dir ? dir.path : '', name);
  }

  function onNew(folder) {
    const name = window.prompt('Nom de la nouvelle note :');
    if (name) createNote(folder == null ? (note ? folderOf(note.path) : dir ? dir.path : '') : folder, name);
  }

  // `ctx` est mémoïsé (le rendu Markdown en dépend) : il passe par une ref vers
  // les dernières fonctions, sinon `go` garderait un historique périmé.
  const latest = useRef({});
  latest.current = { openNote, onMissing };
  const notePath = note ? note.path : '';
  const ctx = useMemo(() => ({
    index, media: wiki.media, fromPath: notePath,
    onOpen: (p, h) => latest.current.openNote(p, h),
    onMissing: (n) => latest.current.onMissing(n)
  }), [index, wiki.media, notePath]);

  // si la note affichée a disparu (supprimée ailleurs), retour à l'accueil
  useEffect(() => { if (status === 'ready' && loc.startsWith('note:') && !note) setLocRaw(''); }, [status, loc, note]);

  const statusLine = status === 'loading' ? 'Chargement…' : status === 'error' ? 'Hors ligne' : wiki.saving ? 'Enregistrement…' : '';

  return (
    <section className="chapter wiki" ref={mainRef}>
      <div className="wiki-top">
        <div className="wiki-top__l">
          <button className="tbtn" type="button" onClick={() => go('')} title="Accueil du Compendium">⌂</button>
          <button className="tbtn" type="button" onClick={back} disabled={!history.length} title="Revenir en arrière">←</button>
          <input type="search" className="finput wiki-top__search" placeholder="Rechercher dans le Compendium…" aria-label="Rechercher" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="wiki-top__r">
          {statusLine && <span className="chr__muted">{statusLine}</span>}
          {canEdit && <button className="tbtn" type="button" onClick={() => onNew(null)}>＋ Note</button>}
          {canEdit && <button className="tbtn" type="button" onClick={() => setImportOpen(true)}>Importer</button>}
        </div>
      </div>

      {wiki.conflicts.length > 0 && (
        <div className="wiki-conflict" role="alert">
          {wiki.conflicts.map((p) => (
            <div key={p}>
              « {p} » a été modifiée ailleurs pendant que tu écrivais.{' '}
              <button className="tbtn" type="button" onClick={() => wiki.resolveConflict(p, 'remote')}>Reprendre la version en ligne</button>{' '}
              <button className="tbtn" type="button" onClick={() => wiki.resolveConflict(p, 'local')}>Garder la mienne</button>
            </div>
          ))}
        </div>
      )}
      {status === 'error' && <p className="empty">Impossible de charger le Compendium ({wiki.error}). <button className="tbtn" type="button" onClick={wiki.reload}>Réessayer</button></p>}

      {status !== 'error' && (
        <div className="wiki-layout">
          <nav className="wiki-tree" aria-label="Arborescence">
            {results ? (
              <div className="wiki-results">
                <span className="card__label">{results.length} résultat{results.length > 1 ? 's' : ''}</span>
                {results.map((n) => (
                  <button key={n.path} type="button" className="wiki-result" onClick={() => go('note:' + n.path)}>
                    <span className="wiki-result__t">{n.title}</span>
                    <span className="wiki-result__p">{folderOf(n.path)}</span>
                    {n.body.trim() && <span className="wiki-result__x">{excerpt(n.body, 90)}</span>}
                  </button>
                ))}
                {!results.length && <p className="chr__muted">Rien ne correspond.</p>}
              </div>
            ) : (
              <>
                {tree.folders.map((f) => <TreeDir key={f.path} dir={f} depth={0} openDirs={openDirs} toggle={toggleDir} cur={loc} go={go} />)}
                {tree.notes.map((n) => <TreeNote key={n.path} n={n} depth={0} cur={loc} go={go} />)}
              </>
            )}
          </nav>

          <div className="wiki-main">
            {status === 'loading' && !notes.length ? <p className="empty">Chargement du Compendium…</p>
              : !notes.length ? (
                <div className="wiki-empty">
                  <h2>Le Compendium est vide</h2>
                  <p className="lib__intro">{canEdit ? 'Importe ton vault Obsidian pour y retrouver tout le lore, ses liens et ses images.' : 'Rien n’a encore été écrit ici.'}</p>
                  {canEdit && <button className="btn-primary" type="button" onClick={() => setImportOpen(true)}>Importer le vault Obsidian</button>}
                </div>
              )
                : note ? (
                  mode === 'edit' && canEdit
                    ? <NoteEditor key={note.path} note={note} wiki={wiki} ctx={ctx} onDone={() => setMode('read')}
                        onDelete={() => { if (window.confirm('Supprimer « ' + note.title + ' » ?')) { wiki.deleteNote(note.path); go(''); } }} />
                    : <NoteView note={note} wiki={wiki} ctx={ctx} canEdit={canEdit} onEdit={() => setMode('edit')} go={go} index={index} />
                )
                  : dir ? <FolderPage dir={dir} go={go} ctx={ctx} canEdit={canEdit} onNew={onNew} />
                    : <Home wiki={wiki} tree={tree} go={go} canEdit={canEdit} onImport={() => setImportOpen(true)} onMissing={onMissing} />}
          </div>
        </div>
      )}

      {importOpen && <WikiImportModal wiki={wiki} onClose={() => setImportOpen(false)} />}
    </section>
  );
}
