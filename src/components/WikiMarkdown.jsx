import { useEffect, useMemo, useState } from 'react';
import { parseMarkdown, inlineText, slugHeading, sliceNote } from '../lib/wikiMd.js';
import { isImageName, resolveMedia } from '../lib/wiki.js';

/* Rendu de l'AST Markdown du Compendium en éléments React. Rien n'est jamais
 * injecté en HTML : le texte des notes est toujours un enfant React (échappé
 * par construction), et seuls les liens http(s)/mailto sont cliquables. Seule
 * exception : les formules, composées par KaTeX (sa sortie ne reprend jamais
 * le HTML de la source ; `trust` reste désactivé).
 *
 * `ctx` : { index, media, fromPath, onOpen(path, heading), onMissing(name),
 *           onTag(tag), onToggleTask(n), depth, seen } */

/* Types de callouts « maison » du vault (thème ITS + snippets) : pas de titre
 * par défaut, c'est un conteneur visuel. Les autres (info, warning…) ont un
 * titre = leur nom, comme dans Obsidian. */
const CONTAINER_TYPES = new Set(['blank', 'blank-container', 'recite', 'statblocks', 'statblocks-blank', 'multi-column', 'cards', 'infobox', 'quote']);
const TYPE_TITLE = { info: 'Info', note: 'Note', warning: 'Attention', bug: 'Bug', tip: 'Astuce', abstract: 'Résumé', todo: 'À faire', example: 'Exemple', danger: 'Danger', question: 'Question', success: 'Succès', failure: 'Échec' };
/* Les alias d'Obsidian (summary, hint, caution…) donnent le même rendu que leur type. */
const TYPE_ALIAS = { summary: 'abstract', tldr: 'abstract', hint: 'tip', important: 'tip', check: 'success', done: 'success', help: 'question', faq: 'question', caution: 'warning', attention: 'warning', fail: 'failure', missing: 'failure', error: 'danger', cite: 'quote' };
const TYPE_ICON = { note: '✎', info: 'ℹ', abstract: '☰', todo: '☐', tip: '✦', success: '✓', question: '?', warning: '⚠', failure: '✕', danger: '⚡', bug: '🐞', example: '❖' };
export const CALLOUT_TYPES = Object.keys(TYPE_ICON).concat(['quote']);

const SAFE_URL = /^(https?:\/\/|mailto:)/i;
const MAX_EMBED_DEPTH = 3;

export function Inline({ nodes, ctx }) {
  return (nodes || []).map((n, i) => <InlineNode key={i} n={n} ctx={ctx} />);
}

function InlineNode({ n, ctx }) {
  switch (n.t) {
    case 'text': return n.v;
    case 'br': return <br />;
    case 'code': return <code className="wiki-code">{n.v}</code>;
    case 'b': return <strong><Inline nodes={n.children} ctx={ctx} /></strong>;
    case 'i': return <em><Inline nodes={n.children} ctx={ctx} /></em>;
    case 's': return <s><Inline nodes={n.children} ctx={ctx} /></s>;
    case 'mark': return <mark className="wiki-mark"><Inline nodes={n.children} ctx={ctx} /></mark>;
    case 'html': {
      const Tag = n.tag;
      return <Tag><Inline nodes={n.children} ctx={ctx} /></Tag>;
    }
    case 'ext':
      return SAFE_URL.test(n.url)
        ? <a className="wiki-ext" href={n.url} target="_blank" rel="noopener noreferrer"><Inline nodes={n.children} ctx={ctx} /></a>
        : <Inline nodes={n.children} ctx={ctx} />;
    case 'image':
      return SAFE_URL.test(n.url) ? <img className="wiki-img" src={n.url} alt={n.alt} loading="lazy" /> : null;
    case 'link': return <WikiLink n={n} ctx={ctx} />;
    case 'embed': return <Embed n={n} ctx={ctx} />;
    case 'tag': return <Tag n={n} ctx={ctx} />;
    case 'math': return <Formula v={n.v} display={n.display} />;
    case 'fnref': return <FnRef n={n} ctx={ctx} />;
    default: return null;
  }
}

function Tag({ n, ctx }) {
  if (!ctx.onTag) return <span className="wiki-tag">#{n.v}</span>;
  return <a className="wiki-tag" href="#" title="Chercher ce tag" onClick={(e) => { e.preventDefault(); ctx.onTag(n.v); }}>#{n.v}</a>;
}

function FnRef({ n, ctx }) {
  if (!n.num) return <span className="wiki-link--plain">[^{n.id}]</span>;
  const uid = 'fn' + (ctx.depth || 0) + '-';
  return (
    <sup className="wiki-fnref">
      <a href={'#' + uid + n.num} id={uid + 'ref' + n.num}
        onClick={(e) => { e.preventDefault(); const el = document.getElementById(uid + n.num); if (el) el.scrollIntoView({ block: 'center' }); }}>{n.num}</a>
    </sup>
  );
}

let katexPromise = null;
function loadKatex() {
  if (!katexPromise) {
    katexPromise = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([k]) => k.default || k).catch(() => null);
  }
  return katexPromise;
}

function Formula({ v, display, asBlock }) {
  const [html, setHtml] = useState(null);
  useEffect(() => {
    let live = true;
    loadKatex().then((k) => {
      if (!live || !k) return;
      try { setHtml(k.renderToString(v, { displayMode: display, throwOnError: false, trust: false, output: 'html' })); } catch (_) { setHtml(null); }
    });
    return () => { live = false; };
  }, [v, display]);
  const Tag = asBlock ? 'div' : 'span'; // « <div> » interdit dans un paragraphe : en ligne, toujours un <span>
  if (html) return <Tag className={display ? 'wiki-math wiki-math--block' : 'wiki-math'} dangerouslySetInnerHTML={{ __html: html }} />;
  return <Tag className={display ? 'wiki-math wiki-math--block' : 'wiki-math'}><code className="wiki-code">{v}</code></Tag>;
}

function WikiLink({ n, ctx }) {
  const dest = n.target ? ctx.index.resolve(n.target, ctx.fromPath) : ctx.fromPath;
  if (dest) {
    return (
      <a
        className="wiki-link" href="#" title={dest}
        onClick={(e) => { e.preventDefault(); ctx.onOpen(dest, n.heading || (n.block ? '^' + n.block : '')); }}
      >
        {n.label}
      </a>
    );
  }
  // note qui n'existe pas (ou que le MJ garde pour lui) : rien à montrer aux joueurs
  if (ctx.hideMissing) return <span className="wiki-link--plain">{n.label}</span>;
  // note qui n'existe pas encore : un « lien rouge », comme dans Obsidian
  return (
    <a
      className="wiki-link wiki-link--red" href="#" title="Cette note n’existe pas encore"
      onClick={(e) => { e.preventDefault(); if (ctx.onMissing) ctx.onMissing(n.target); }}
    >
      {n.label}
    </a>
  );
}

function Embed({ n, ctx }) {
  const o = n.opts;
  if (isImageName(n.target)) {
    const url = resolveMedia(ctx.media, n.target);
    if (!url) return <span className="wiki-img-missing" title="Image non importée">▨ {n.target}</span>;
    return (
      <img
        className={'wiki-img' + (o.align ? ' wiki-img--' + o.align : '') + (o.classes.includes('circle') ? ' wiki-img--circle' : '')}
        src={url} alt={o.classes.filter((c) => c !== 'circle').join(' ') || n.target} loading="lazy"
        style={o.width ? { width: Math.min(o.width, 900), height: o.height ? Math.min(o.height, 900) : undefined } : undefined}
      />
    );
  }
  return <NoteEmbed n={n} ctx={ctx} />;
}

/** `![[Note]]`, `![[Note#Titre]]`, `![[Note^bloc]]` : le contenu s'affiche à la place du lien. */
function NoteEmbed({ n, ctx }) {
  const dest = n.target ? ctx.index.resolve(n.target, ctx.fromPath) : ctx.fromPath;
  const depth = ctx.depth || 0;
  const seen = ctx.seen || [ctx.fromPath];
  const note = dest ? ctx.index.byPath.get(dest) : null;
  const loop = !note || seen.includes(dest) || depth >= MAX_EMBED_DEPTH;
  const src = useMemo(() => (loop ? '' : sliceNote(note.body, { heading: n.heading, block: n.block })), [loop, note, n.heading, n.block]);
  if (loop) return <WikiLink n={{ target: n.target, heading: n.heading, block: n.block, label: '↳ ' + (n.target || n.heading || n.block) }} ctx={ctx} />;
  const inner = { ...ctx, fromPath: dest, depth: depth + 1, seen: seen.concat(dest), onToggleTask: null };
  return (
    <div className="wiki-embed">
      <a className="wiki-embed__title" href="#" onClick={(e) => { e.preventDefault(); ctx.onOpen(dest, n.heading || (n.block ? '^' + n.block : '')); }}>
        {note.title}{n.heading ? ' › ' + n.heading : ''}
      </a>
      {src.trim() ? <Parsed src={src} ctx={inner} /> : <p className="empty">Rien à afficher.</p>}
    </div>
  );
}

function Parsed({ src, ctx }) {
  const blocks = useMemo(() => parseMarkdown(src), [src]);
  return <Blocks blocks={blocks} ctx={ctx} />;
}

function Heading({ b, ctx }) {
  const Tag = 'h' + Math.min(6, b.level);
  return <Tag id={ctx.depth ? undefined : 'h-' + slugHeading(inlineText(b.content))} className="wiki-h"><Inline nodes={b.content} ctx={ctx} /></Tag>;
}

function List({ b, ctx }) {
  const Tag = b.ordered ? 'ol' : 'ul';
  return (
    <Tag className="wiki-list" start={b.ordered && b.start !== 1 ? b.start : undefined}>
      {b.items.map((it, i) => (
        <li key={i} id={it.id && !ctx.depth ? 'b-' + it.id : undefined} className={it.checked === null ? undefined : 'wiki-task' + (it.status === '-' ? ' is-cancelled' : it.status !== ' ' && it.status !== 'x' && it.status !== 'X' ? ' is-status' : '')}>
          {it.checked !== null && (
            <input
              type="checkbox" checked={it.checked} data-status={it.status}
              readOnly={!ctx.onToggleTask} disabled={!ctx.onToggleTask}
              aria-label="Tâche" onChange={() => ctx.onToggleTask && ctx.onToggleTask(it.task)}
            />
          )}
          <Inline nodes={it.content} ctx={ctx} />
          {it.children.map((c, j) => <List key={j} b={c} ctx={ctx} />)}
        </li>
      ))}
    </Tag>
  );
}

function Callout({ b, ctx }) {
  const type = TYPE_ALIAS[b.type] || b.type;
  const noTitle = b.options.includes('no-title');
  const container = CONTAINER_TYPES.has(type);
  const title = b.title || (container ? '' : TYPE_TITLE[type] || type);
  const icon = TYPE_ICON[type];
  const cls = ['wiki-callout', 'wiki-callout--' + type];
  b.options.forEach((o) => {
    if (o === 'right' || o === 'left') cls.push('wiki-callout--' + o);
    else if (/^bg-/.test(o)) cls.push('wiki-' + o);
    else if (o === 'text-center' || o === 'center') cls.push('wiki-text-center');
    else if (o === 'no-title') cls.push('wiki-callout--notitle');
  });
  const body = <div className="wiki-callout__body"><Blocks blocks={b.children} ctx={ctx} /></div>;
  const label = <>{icon && !container && <span className="wiki-callout__icon" aria-hidden="true">{icon}</span>}{title || '…'}</>;
  const head = !noTitle && title ? <div className="wiki-callout__title">{label}</div> : null;
  if (b.fold) {
    return (
      <details className={cls.join(' ')} open={b.fold === '+'}>
        <summary className="wiki-callout__title">{label}</summary>
        {body}
      </details>
    );
  }
  return <div className={cls.join(' ')}>{head}{body}</div>;
}

function Table({ b, ctx }) {
  return (
    <div className="wiki-table-wrap">
      <table className="wiki-table">
        <thead><tr>{b.head.map((c, i) => <th key={i} style={b.align[i] ? { textAlign: b.align[i] } : undefined}><Inline nodes={c} ctx={ctx} /></th>)}</tr></thead>
        <tbody>
          {b.rows.map((r, i) => (
            <tr key={i}>{b.head.map((_, j) => <td key={j} style={b.align[j] ? { textAlign: b.align[j] } : undefined}><Inline nodes={r[j] || []} ctx={ctx} /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({ b }) {
  const [done, setDone] = useState(false);
  function copy() {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(b.text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }, () => {});
  }
  return (
    <div className="wiki-codeblock">
      <div className="wiki-codeblock__bar">
        <span>{b.lang || 'texte'}</span>
        <button type="button" className="wiki-codeblock__copy" onClick={copy}>{done ? 'Copié ✓' : 'Copier'}</button>
      </div>
      <pre className="wiki-pre"><code>{b.text}</code></pre>
    </div>
  );
}

function Footnotes({ b, ctx }) {
  const uid = 'fn' + (ctx.depth || 0) + '-';
  return (
    <section className="wiki-footnotes" aria-label="Notes de bas de page">
      <ol>
        {b.items.map((it) => (
          <li key={it.num} id={uid + it.num}>
            <Inline nodes={it.content} ctx={ctx} />{' '}
            <a href={'#' + uid + 'ref' + it.num} className="wiki-footnotes__back" aria-label="Retour au texte"
              onClick={(e) => { e.preventDefault(); const el = document.getElementById(uid + 'ref' + it.num); if (el) el.scrollIntoView({ block: 'center' }); }}>↩</a>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Block({ b, ctx }) {
  const bid = b.id && !ctx.depth ? 'b-' + b.id : undefined;
  switch (b.t) {
    case 'heading': return <Heading b={b} ctx={ctx} />;
    case 'paragraph': {
      // une note insérée est un bloc : elle ne peut pas vivre dans un <p>
      const Wrap = b.content.some((n) => n.t === 'embed' && !isImageName(n.target)) ? 'div' : 'p';
      return <Wrap id={bid} className="wiki-p"><Inline nodes={b.content} ctx={ctx} /></Wrap>;
    }
    case 'hr': return <hr className="wiki-hr" />;
    case 'list': return <List b={b} ctx={ctx} />;
    case 'quote': return <blockquote id={bid} className="wiki-quote"><Blocks blocks={b.children} ctx={ctx} /></blockquote>;
    case 'callout': return <Callout b={b} ctx={ctx} />;
    case 'table': return <Table b={b} ctx={ctx} />;
    case 'math': return <Formula v={b.v} display asBlock />;
    case 'footnotes': return <Footnotes b={b} ctx={ctx} />;
    case 'code':
      if (b.lang === 'dataview' || b.lang === 'dataviewjs') {
        return <div className="wiki-dynamic">Index dynamique (Dataview) — la liste automatique du dossier le remplace ici.</div>;
      }
      return <CodeBlock b={b} />;
    default: return null;
  }
}

export function Blocks({ blocks, ctx }) {
  return blocks.map((b, i) => <Block key={i} b={b} ctx={ctx} />);
}

/** Corps d'une note, rendu. `body` est mémoïsé : seul un changement de texte
 * relance le parsing. */
export default function WikiMarkdown({ body, ctx }) {
  const blocks = useMemo(() => parseMarkdown(body), [body]);
  return <div className="wiki-md"><Blocks blocks={blocks} ctx={ctx} /></div>;
}
