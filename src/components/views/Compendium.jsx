import { useEffect, useMemo, useRef, useState } from 'react';
import { lsGet, lsSet } from '../../lib/util.js';
import { toast } from '../../lib/toast.js';
import { useWiki } from '../../lib/wikiStore.js';
import { setFmProp, buildIndex, buildTree, countNotes, folderOf, looseKey, parseYaml, propertyStats, resolveMedia, toMarkdown } from '../../lib/wiki.js';
import { applyTemplate } from '../../lib/wikiTemplates.js';
import { parseMarkdown, parseInline, outline, excerpt, slugHeading, noteTags } from '../../lib/wikiMd.js';
import WikiMarkdown, { Inline } from '../WikiMarkdown.jsx';
import WikiImportModal from '../WikiImportModal.jsx';
import WikiGraph from '../WikiGraph.jsx';
import WikiEditor from '../WikiEditor.jsx';
import WikiNewNote from '../WikiNewNote.jsx';
import WikiCollections from '../WikiCollections.jsx';
import { CoverGrid, CategorySettings, cardOf, coverUrl } from '../WikiCovers.jsx';
import { uploadScreenshot } from '../../lib/board.js';
import './wiki.css';

/* Compendium — le wiki de l'univers, façon Obsidian : notes en Markdown reliées
 * par des [[liens]], propriétés YAML, rétroliens, recherche, arborescence.
 * Les notes viennent du vault (import) et restent éditables ici (MJ). */

const LOC_KEY = 'ccm.wiki.loc';
const DIRS_KEY = 'ccm.wiki.dirs';
/* Propriétés techniques du vault, sans intérêt à l'écran. */
const HIDDEN_PROPS = new Set(['groupe', 'ordre', 'taille', 'image', 'banner', 'banner-y', 'banner_y', 'cssclasses', 'cssclass', 'weaveevents', 'narrativeweave', 'entitytype', 'title', 'aliases', 'alias']);
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

function TreeDir({ dir, depth, openDirs, toggle, cur, go, admin }) {
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
          {dir.folders.map((f) => <TreeDir key={f.path} dir={f} depth={depth + 1} openDirs={openDirs} toggle={toggle} cur={cur} go={go} admin={admin} />)}
          {dir.notes.map((n) => <TreeNote key={n.path} n={n} depth={depth + 1} cur={cur} go={go} admin={admin} />)}
        </>
      )}
    </div>
  );
}

function TreeNote({ n, depth, cur, go, admin }) {
  const empty = !n.body.trim();
  return (
    <div className={'wiki-tree__row' + (cur === 'note:' + n.path ? ' is-cur' : '')} style={{ paddingLeft: 6 + depth * 12 + 16 }}>
      <button type="button" className={'wiki-tree__name' + (empty ? ' is-empty' : '')} onClick={() => go('note:' + n.path)} title={empty ? 'Note encore vide' : n.path}>{n.title}</button>
      {admin && n.shared && <span className="wiki-tree__eye" title="Visible des joueurs">●</span>}
    </div>
  );
}

/* ---------------- édition ---------------- */

const EDIT_VIEW_KEY = 'ccm.wiki.editview';

function NoteEditor({ note, wiki, ctx, tags, onImage, onDone, onDelete }) {
  const [view, setViewRaw] = useState(() => lsGet(EDIT_VIEW_KEY) || 'split'); // split | write | read
  const setView = (v) => { setViewRaw(v); lsSet(EDIT_VIEW_KEY, v); };
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

  const previewCtx = useMemo(() => ({ ...ctx, onToggleTask: null }), [ctx]);
  const known = useMemo(() => propertyStats(wiki.notes, new Set(HIDDEN_PROPS)).slice(0, 12).map((s) => s.key), [wiki.notes]);
  const have = new Set(Object.keys(parseYaml(fm)).map((k) => k.toLowerCase()));
  const missing = known.filter((k) => !have.has(k.toLowerCase()));
  const addProp = (k) => { const next = (fm.trim() ? fm.replace(/\s+$/, '') + '\n' : '') + k + ': '; setFm(next); queue({ fm: next }); };

  return (
    <div className={'wiki-edit wiki-edit--' + view}>
      <div className="wiki-edit__bar">
        <span className="chr__muted">Édition — enregistrée automatiquement.</span>
        <span className="wiki-edit__btns">
          <span className="wiki-edit__views" role="group" aria-label="Affichage">
            {[['split', 'Côte à côte'], ['write', 'Écriture'], ['read', 'Lecture']].map(([k, l]) => <button key={k} type="button" className={view === k ? 'is-on' : ''} onClick={() => setView(k)}>{l}</button>)}
          </span>
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
            {missing.length > 0 && (
              <span className="wiki-edit__props">
                {missing.map((k) => <button key={k} type="button" className="wiki-chip wiki-chip--btn" onClick={() => addProp(k)} title="Ajouter cette propriété">+ {k}</button>)}
              </span>
            )}
          </label>
          <div className="flabel">
            Contenu (Markdown)
            <WikiEditor value={body} index={wiki.index} media={wiki.media} fromPath={note.path} tags={tags} onImage={onImage}
              placeholder={'# Titre\nDu texte, des [[liens]]… Tape / pour insérer un élément.'}
              onChange={(v) => { setBody(v); queue({ body: v }); }} onBlur={flush} onSave={flush} />
          </div>
        </div>
        <div className="wiki-edit__col wiki-edit__preview">
          <span className="card__label">Aperçu</span>
          <WikiMarkdown body={body} ctx={previewCtx} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- lecture d'une note ---------------- */

function NoteView({ note, wiki, ctx, canEdit, isAdmin, onEdit, onRename, onShare, go, index }) {
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
        <span className="wiki-note__actions">
          {isAdmin && (
            <button className={'tbtn wiki-share' + (note.shared ? ' is-on' : '')} type="button" onClick={onShare}
              title={note.shared ? 'Les joueurs voient cette note — cliquer pour la cacher' : 'Réservée au MJ — cliquer pour la montrer aux joueurs'}>
              {note.shared ? '👁 Visible des joueurs' : '🔒 MJ seulement'}
            </button>
          )}
          {canEdit && <button className="tbtn" type="button" onClick={onRename}>Renommer</button>}
          {canEdit && <button className="tbtn" type="button" onClick={onEdit}>✎ Modifier</button>}
        </span>
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
          {index.stats.links > 0 && (index.outgoing(note.path).length > 0 || back.length > 0) && (
            <div className="wiki-minigraph">
              <span className="card__label">Voisinage <button type="button" className="wiki-link wiki-link--btn" onClick={() => go('graph:' + note.path)}>agrandir</button></span>
              <WikiGraph index={index} center={note.path} depth={1} max={30} compact onOpen={(p) => go('note:' + p)} />
            </div>
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

/** Première illustration trouvée dans un dossier (repli quand il n'a pas d'image à lui). */
function firstCover(dir, media) {
  const own = dir.notes.find((n) => coverUrl(n, media));
  if (own) return own;
  for (const f of dir.folders) { const r = (f.folderNote && coverUrl(f.folderNote, media) ? f.folderNote : null) || firstCover(f, media); if (r) return r; }
  return null;
}

function dirCards(dirs, media, go) {
  return dirs.map((f) => cardOf({
    key: 'd:' + f.path, title: f.name, sub: countNotes(f) + ' note' + (countNotes(f) > 1 ? 's' : ''),
    note: f.folderNote, fallbackNote: firstCover(f, media), media, onClick: () => go('folder:' + f.path)
  }));
}

function noteCards(notes, media, go) {
  return notes.map((n) => cardOf({
    key: 'n:' + n.path, title: n.title, sub: n.body.trim() ? '' : 'Note à écrire', note: n, media,
    ex: n.body.trim() ? excerpt(n.body, 140) : 'Note à écrire', dim: !n.body.trim(), onClick: () => go('note:' + n.path)
  }));
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

function FolderPage({ dir, go, ctx, wiki, canEdit, isAdmin, onNew, onNewCategory, onShareDir }) {
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
        <span className="wiki-note__actions">
          {isAdmin && <button className="tbtn" type="button" onClick={() => onShareDir(dir, true)}>👁 Montrer le dossier aux joueurs</button>}
          {isAdmin && <button className="tbtn" type="button" onClick={() => onShareDir(dir, false)}>🔒 Le cacher</button>}
          {canEdit && <button className="tbtn" type="button" onClick={() => onNewCategory(dir.path)}>＋ Sous-catégorie</button>}
          {canEdit && <button className="tbtn" type="button" onClick={() => onNew(dir.path)}>＋ Nouvelle note ici</button>}
        </span>
      </header>
      {canEdit && <CategorySettings key={dir.path} dir={dir} wiki={wiki} />}
      {note && note.body.trim() && !/```dataview(js)?\b/.test(note.body) && <WikiMarkdown body={note.body} ctx={{ ...ctx, fromPath: note.path }} />}
      {dir.folders.length > 0 && (
        <section className="wiki-listing">
          <h4 className="chr__h">Dossiers<span className="count"> ({dir.folders.length})</span></h4>
          <CoverGrid items={dirCards(dir.folders, ctx.media, go)} />
        </section>
      )}
      {dir.notes.length > 0 && (
        <section className="wiki-listing">
          <h4 className="chr__h">Notes<span className="count"> ({dir.notes.length})</span></h4>
          <CoverGrid items={noteCards(dir.notes, ctx.media, go)} />
        </section>
      )}
      {!dir.folders.length && !dir.notes.length && !note && <p className="empty">Ce dossier est vide.</p>}
      {note && <p className="chr__muted">Page du dossier : <a href="#" className="wiki-link" onClick={(e) => { e.preventDefault(); go('note:' + note.path); }}>{note.title}</a></p>}
    </article>
  );
}

function Home({ notes, index, tree, media, ctx, go, canEdit, isAdmin, onImport, onMissing, onNewCategory, onImages, busyImages }) {
  const picker = useRef(null);
  const st = index.stats;
  const empties = notes.filter((n) => !n.body.trim()).length;
  const wanted = index.unresolved().slice(0, 14);
  const hubs = notes.map((n) => ({ n, c: index.backlinks(n.path).length })).filter((x) => x.c > 0).sort((a, b) => b.c - a.c).slice(0, 10);
  const recent = notes.slice().sort((a, b) => b.mtime - a.mtime).slice(0, 8);
  const cards = dirCards(tree.folders, media, go);
  const sections = tree.folders
    .map((f, i) => ({ f, c: cards[i] }))
    .filter(({ f }) => f.folders.length > 0)
    .sort((a, b) => a.c.ordre - b.c.ordre || a.f.name.localeCompare(b.f.name, 'fr'));
  return (
    <div className="wiki-home">
      <CoverGrid items={cards} />
      {canEdit && (
        <p className="wiki-home__tools">
          <button className="tbtn" type="button" onClick={() => onNewCategory('')}>＋ Nouvelle catégorie</button>{' '}
          <input ref={picker} type="file" accept="image/*" multiple hidden onChange={(e) => { const fl = [...e.target.files]; e.target.value = ''; if (fl.length) onImages(fl); }} />
          <button className="tbtn" type="button" disabled={!!busyImages} onClick={() => picker.current && picker.current.click()}
            title="Chaque image prend la catégorie qui porte le même nom que son fichier">{busyImages || 'Déposer des images de catégories…'}</button>
        </p>
      )}

      {sections.map(({ f, c }) => (
        <section key={f.path} className="wiki-covers__group">
          <h3 className="wiki-sect"><button type="button" className="wiki-sect__link" onClick={() => go('folder:' + f.path)}>{f.name}</button></h3>
          <CoverGrid items={dirCards(f.folders, media, go).map((x) => ({ ...x, groupe: '' }))} />
        </section>
      ))}

      <details className="wiki-overview">
        <summary>Vue d’ensemble</summary>
        <div className="wiki-stats">
          <div><b>{st.notes}</b><span>notes</span></div>
          <div><b>{st.resolved}</b><span>liens tissés</span></div>
          {isAdmin && <div><b>{index.stats.unresolvedNames}</b><span>notes à écrire</span></div>}
          {isAdmin && <div><b>{empties}</b><span>pages vides</span></div>}
        </div>
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
          {isAdmin && <section>
            <h4 className="chr__h">À écrire</h4>
            <ul className="wiki-back__list">
              {wanted.map((u) => (
                <li key={u.name}>
                  <a href="#" className="wiki-link wiki-link--red" onClick={(e) => { e.preventDefault(); onMissing(u.name); }}>{u.name}</a>
                  <span className="chr__muted"> · cité {u.count}×</span>
                </li>
              ))}
            </ul>
          </section>}
        </div>
        {isAdmin && <p className="chr__muted"><button className="tbtn" type="button" onClick={onImport}>Importer / mettre à jour depuis Obsidian</button></p>}
      </details>
    </div>
  );
}

/* ---------------- graphe ---------------- */

function GraphPage({ index, center, go }) {
  const note = center ? index.byPath.get(center) : null;
  const [depth, setDepth] = useState(2);
  return (
    <article className="wiki-note wiki-graphpage">
      <header className="wiki-note__head">
        <h1 className="wiki-note__title">{note ? 'Voisinage de ' + note.title : 'Graphe du Compendium'}</h1>
        <span className="wiki-note__actions">
          {note && <button className="tbtn" type="button" onClick={() => go('graph')}>Tout le graphe</button>}
          {note && <button className="tbtn" type="button" onClick={() => setDepth(depth === 1 ? 2 : depth === 2 ? 3 : 1)}>Profondeur {depth}</button>}
          {note && <button className="tbtn" type="button" onClick={() => go('note:' + note.path)}>Ouvrir la note</button>}
        </span>
      </header>
      <p className="chr__muted">Molette pour zoomer, glisser pour déplacer, clic sur un point pour ouvrir la note. Une couleur par grand dossier ; les plus gros points sont les mieux reliés.</p>
      <WikiGraph index={index} center={center} depth={depth} max={note ? 160 : 220} onOpen={(p) => (center === p ? go('note:' + p) : go('graph:' + p))} />
    </article>
  );
}

/* ---------------- vue ---------------- */

export default function Compendium({ userId, canEdit, role }) {
  const isAdmin = role === 'admin';
  const store = useWiki(true, userId);
  const { status } = store;
  // un joueur ne voit que les notes que le MJ a partagées, et son index ne les contient qu'elles
  const notes = useMemo(() => (isAdmin ? store.notes : store.notes.filter((n) => n.shared)), [isAdmin, store.notes]);
  const index = useMemo(() => (isAdmin ? store.index : buildIndex(notes)), [isAdmin, store.index, notes]);
  const wiki = useMemo(() => ({ ...store, notes, index }), [store, notes, index]);
  const [loc, setLocRaw] = useState(() => lsGet(LOC_KEY) || '');
  const [history, setHistory] = useState([]);
  const [mode, setMode] = useState('read');
  const [query, setQuery] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(null); // { folder, name } | null
  const [openDirs, setOpenDirs] = useState(() => { try { return new Set(JSON.parse(lsGet(DIRS_KEY) || '[]')); } catch (_) { return new Set(); } });
  const mainRef = useRef(null);

  const tree = useMemo(() => buildTree(notes), [notes]);
  const searchable = useSearchable(notes);
  const results = useMemo(() => runSearch(searchable, query), [searchable, query]);

  const note = loc.startsWith('note:') ? index.byPath.get(loc.slice(5)) || null : null;
  const dir = loc.startsWith('folder:') ? findDir(tree, loc.slice(7)) : null;
  const folderNames = useMemo(() => {
    const out = [];
    const walk = (d) => d.folders.forEach((x) => { out.push(x.path); walk(x); });
    walk(tree);
    return out;
  }, [tree]);

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
    if (heading) setTimeout(() => { const el = document.getElementById(heading.startsWith('^') ? 'b-' + heading.slice(1) : 'h-' + slugHeading(heading)); if (el) el.scrollIntoView({ block: 'start' }); }, 60);
  }

  /** Tags utilisés dans les notes visibles (propriété `tags` ou #tag), pour la complétion. */
  const tagList = useMemo(() => {
    const count = new Map();
    for (const n of notes) for (const t of noteTags(n)) count.set(t, (count.get(t) || 0) + 1);
    return [...count.entries()].map(([tag, c]) => ({ tag, count: c })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'fr'));
  }, [notes]);

  /** Image collée ou déposée dans l'éditeur : envoyée, puis enregistrée dans la table des médias. */
  async function saveImage(file) {
    const url = await uploadScreenshot(file);
    const d = new Date(); const p = (x) => String(x).padStart(2, '0');
    const name = 'Image ' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '-' + Math.random().toString(36).slice(2, 5) + '.jpg';
    await store.addMedia({ [name.toLowerCase()]: url });
    return name;
  }

  /** Coche / décoche la n-ième tâche du corps de la note affichée (lecture seule → éditable d'un clic). */
  function toggleTask(n) {
    if (!note || n == null) return;
    const lines = note.body.split('\n');
    const re = /^(\s*(?:>\s?)*(?:[-*+]|\d+[.)])\s+\[)(.)(\]\s)/;
    let fence = false; let k = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; continue; }
      if (fence) continue;
      const m = re.exec(lines[i]);
      if (!m) continue;
      if (k++ === n) {
        lines[i] = m[1] + (m[2] === ' ' ? 'x' : ' ') + lines[i].slice(m[1].length + 1);
        store.saveNote(note.path, { body: lines.join('\n') });
        return;
      }
    }
  }

  function createNote(folder, name, { template = null, andEdit = true } = {}) {
    const clean = cleanName(name);
    if (!clean) return;
    const path = (folder ? folder + '/' : '') + clean + '.md';
    const existing = index.resolve(clean, path);
    if (existing && index.byPath.get(existing).title.toLowerCase() === clean.toLowerCase()) { openNote(existing); return; }
    const start = template ? applyTemplate(template, clean) : {};
    // un éditeur non-MJ ne verrait pas sa propre note si elle restait réservée
    if (!store.createNote(path, { ...start, shared: !isAdmin })) { toast('Une note porte déjà ce nom.'); return; }
    go('note:' + path);
    if (andEdit) setMode('edit');
  }

  function renameCurrent() {
    if (!note) return;
    const cur = note.path.replace(/.md$/i, '');
    const answer = window.prompt('Nouveau nom — ou chemin complet « Dossier/Nom » pour la déplacer :', cur);
    if (answer == null) return;
    const parts = answer.split('/').map(cleanName).filter(Boolean);
    if (!parts.length) return;
    const path = parts.join('/') + '.md';
    const res = store.renameNote(note.path, path);
    if (!res.ok) { toast(res.error); return; }
    go('note:' + path, { push: false });
    toast(res.count ? res.count + ' lien' + (res.count > 1 ? 's' : '') + ' mis à jour dans ' + res.notes + ' note' + (res.notes > 1 ? 's' : '') + '.' : 'Note renommée.');
  }

  function newCategory(parent) {
    const name = cleanName(window.prompt('Nom de la nouvelle catégorie :') || '');
    if (!name) return;
    const folder = (parent ? parent + '/' : '') + name;
    if (!store.createNote(folder + '/' + name + '.md', { fm: 'type: catégorie', shared: !isAdmin })) { toast('Cette catégorie existe déjà.'); return; }
    go('folder:' + folder);
  }

  const [busyImages, setBusyImages] = useState('');

  /** Images déposées en bloc : le nom du fichier désigne la catégorie (« Cosmologie.jpg »). */
  async function assignImages(files) {
    const dirs = [];
    const walk = (d) => d.folders.forEach((x) => { dirs.push(x); walk(x); });
    walk(tree);
    const lost = []; let done = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const key = looseKey(file.name.replace(/\.[^.]+$/, ''));
      const hits = dirs.filter((d) => looseKey(d.name) === key);
      if (!hits.length) { lost.push(file.name); continue; }
      setBusyImages('Envoi ' + (i + 1) + ' / ' + files.length + '…');
      try {
        const url = await uploadScreenshot(file);
        for (const d of hits) {
          const n = d.folderNote;
          if (n) store.saveNote(n.path, { fm: setFmProp(n.fm, 'image', url) });
          else store.createNote(d.path + '/' + d.name + '.md', { fm: setFmProp('type: catégorie', 'image', url), shared: !isAdmin });
        }
        done++;
      } catch (err) { lost.push(file.name + ' (envoi impossible)'); }
    }
    setBusyImages('');
    toast(done + ' image' + (done > 1 ? 's' : '') + ' placée' + (done > 1 ? 's' : '') + (lost.length ? ' · sans catégorie : ' + lost.join(', ') : '') + '.');
  }

  /** Structure de départ : les grandes catégories de l'univers, prêtes à recevoir leur image. */
  function seedStructure() {
    const cats = [['Trame Moderne', 0, true], ['Chronologie', 1], ['Cosmologie', 2], ['Culture & Société', 3], ['Êtres vivants', 4], ['Géographie', 5], ['Objets', 6]];
    for (const [name, ordre, large] of cats) {
      const fm = ['type: catégorie', 'groupe: Univers', 'ordre: ' + ordre].concat(large ? ['taille: large'] : []).join('\n');
      store.createNote(name + '/' + name + '.md', { fm, shared: !isAdmin });
    }
    go('');
  }

  function shareDir(d, shared) {
    const paths = [];
    const walk = (x) => { x.notes.forEach((n) => paths.push(n.path)); if (x.folderNote) paths.push(x.folderNote.path); x.folders.forEach(walk); };
    walk(d);
    if (!paths.length) return;
    if (!window.confirm((shared ? 'Montrer aux joueurs ' : 'Cacher aux joueurs ') + paths.length + ' note' + (paths.length > 1 ? 's' : '') + ' de « ' + d.name + ' » ?')) return;
    store.setShared(paths, shared);
  }

  function onMissing(name) {
    if (!canEdit) { toast('Cette note n’est pas encore écrite.'); return; }
    setNewOpen({ folder: note ? folderOf(note.path) : dir ? dir.path : '', name });
  }

  function onNew(folder) {
    setNewOpen({ folder: folder == null ? (note ? folderOf(note.path) : dir ? dir.path : '') : folder, name: '' });
  }

  // `ctx` est mémoïsé (le rendu Markdown en dépend) : il passe par une ref vers
  // les dernières fonctions, sinon `go` garderait un historique périmé.
  const latest = useRef({});
  latest.current = { openNote, onMissing, toggleTask, setQuery };
  const notePath = note ? note.path : '';
  const ctx = useMemo(() => ({
    index, media: wiki.media, fromPath: notePath,
    onOpen: (p, h) => latest.current.openNote(p, h),
    onMissing: (n) => latest.current.onMissing(n),
    onTag: (t) => latest.current.setQuery('#' + t),
    onToggleTask: canEdit ? (n) => latest.current.toggleTask(n) : null,
    hideMissing: !isAdmin
  }), [index, wiki.media, notePath, isAdmin, canEdit]);

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
          <button className={'tbtn' + (loc.startsWith('graph') ? ' is-on' : '')} type="button" onClick={() => go('graph')}>Graphe</button>
          <button className={'tbtn' + (loc === 'collections' ? ' is-on' : '')} type="button" onClick={() => go('collections')}>Collections</button>
          {canEdit && <button className="tbtn" type="button" onClick={() => onNew(null)}>＋ Note</button>}
          {isAdmin && <button className="tbtn" type="button" onClick={() => setImportOpen(true)}>Importer</button>}
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
                {tree.folders.map((f) => <TreeDir key={f.path} dir={f} depth={0} openDirs={openDirs} toggle={toggleDir} cur={loc} go={go} admin={isAdmin} />)}
                {tree.notes.map((n) => <TreeNote key={n.path} n={n} depth={0} cur={loc} go={go} admin={isAdmin} />)}
              </>
            )}
          </nav>

          <div className="wiki-main">
            {status === 'loading' && !notes.length ? <p className="empty">Chargement du Compendium…</p>
              : !notes.length ? (
                <div className="wiki-empty">
                  <h2>Le Compendium est vide</h2>
                  <p className="lib__intro">{canEdit ? 'Commence par créer tes catégories (Cosmologie, Géographie, Chronologie…) : chacune devient une carte illustrée que tu pourras ensuite remplir de notes.' : 'Rien n’a été partagé ici pour l’instant.'}</p>
                  {canEdit && (
                    <p className="wiki-empty__btns">
                      <button className="btn-primary" type="button" onClick={seedStructure}>Créer la structure de départ</button>{' '}
                      <button className="tbtn" type="button" onClick={() => newCategory('')}>＋ Une catégorie</button>{' '}
                      <button className="tbtn" type="button" onClick={() => onNew(null)}>＋ Note seule</button>
                    </p>
                  )}
                </div>
              )
                : loc === 'collections' ? <WikiCollections notes={notes} go={go} />
                : loc.startsWith('graph') ? <GraphPage index={index} center={loc.startsWith('graph:') ? loc.slice(6) : null} go={go} />
                : note ? (
                  mode === 'edit' && canEdit
                    ? <NoteEditor key={note.path} note={note} wiki={wiki} ctx={ctx} tags={tagList} onImage={saveImage} onDone={() => setMode('read')}
                        onDelete={() => { if (window.confirm('Supprimer « ' + note.title + ' » ?')) { wiki.deleteNote(note.path); go(''); } }} />
                    : <NoteView note={note} wiki={wiki} ctx={ctx} canEdit={canEdit} isAdmin={isAdmin} onEdit={() => setMode('edit')} onRename={renameCurrent} onShare={() => store.setShared([note.path], !note.shared)} go={go} index={index} />
                )
                  : dir ? <FolderPage dir={dir} go={go} ctx={ctx} wiki={wiki} onNewCategory={newCategory} canEdit={canEdit} isAdmin={isAdmin} onNew={onNew} onShareDir={shareDir} />
                    : <Home notes={notes} index={index} tree={tree} media={wiki.media} ctx={ctx} onImages={assignImages} busyImages={busyImages} onNewCategory={newCategory} go={go} canEdit={canEdit} isAdmin={isAdmin} onImport={() => setImportOpen(true)} onMissing={onMissing} />}
          </div>
        </div>
      )}

      {newOpen && (
        <WikiNewNote
          folders={folderNames} initialFolder={newOpen.folder} initialName={newOpen.name}
          onClose={() => setNewOpen(null)}
          onCreate={({ name, folder, template }) => { setNewOpen(null); createNote(folder, name, { template }); }}
        />
      )}
      {importOpen && <WikiImportModal wiki={wiki} onClose={() => setImportOpen(false)} />}
    </section>
  );
}
