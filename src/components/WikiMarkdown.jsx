import { useMemo } from 'react';
import { parseMarkdown, inlineText, slugHeading } from '../lib/wikiMd.js';
import { isImageName, resolveMedia } from '../lib/wiki.js';

/* Rendu de l'AST Markdown du Compendium en éléments React. Rien n'est jamais
 * injecté en HTML : le texte des notes est toujours un enfant React (échappé
 * par construction), et seuls les liens http(s)/mailto sont cliquables.
 *
 * `ctx` : { index, media, fromPath, onOpen(path, heading), onMissing(name) } */

/* Types de callouts « maison » du vault (thème ITS + snippets) : pas de titre
 * par défaut, c'est un conteneur visuel. Les autres (info, warning…) ont un
 * titre = leur nom, comme dans Obsidian. */
const CONTAINER_TYPES = new Set(['blank', 'blank-container', 'recite', 'statblocks', 'statblocks-blank', 'multi-column', 'cards', 'infobox', 'quote']);
const TYPE_TITLE = { info: 'Info', note: 'Note', warning: 'Attention', bug: 'Bug', tip: 'Astuce', abstract: 'Résumé', todo: 'À faire', example: 'Exemple', danger: 'Danger', question: 'Question', success: 'Succès', failure: 'Échec' };

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

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
    case 'ext':
      return SAFE_URL.test(n.url)
        ? <a className="wiki-ext" href={n.url} target="_blank" rel="noopener noreferrer"><Inline nodes={n.children} ctx={ctx} /></a>
        : <Inline nodes={n.children} ctx={ctx} />;
    case 'image':
      return SAFE_URL.test(n.url) ? <img className="wiki-img" src={n.url} alt={n.alt} loading="lazy" /> : null;
    case 'link': return <WikiLink n={n} ctx={ctx} />;
    case 'embed': return <Embed n={n} ctx={ctx} />;
    default: return null;
  }
}

function WikiLink({ n, ctx }) {
  const dest = n.target ? ctx.index.resolve(n.target, ctx.fromPath) : ctx.fromPath;
  if (dest) {
    return (
      <a
        className="wiki-link" href="#" title={dest}
        onClick={(e) => { e.preventDefault(); ctx.onOpen(dest, n.heading); }}
      >
        {n.label}
      </a>
    );
  }
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
        src={url} alt={n.target} loading="lazy"
        style={o.width ? { width: Math.min(o.width, 900) } : undefined}
      />
    );
  }
  // embed d'une autre note : on la présente comme un lien (pas d'inclusion récursive)
  return <WikiLink n={{ target: n.target, heading: n.heading, label: '↳ ' + n.target }} ctx={ctx} />;
}

function Heading({ b, ctx }) {
  const Tag = 'h' + Math.min(6, b.level);
  return <Tag id={'h-' + slugHeading(inlineText(b.content))} className="wiki-h"><Inline nodes={b.content} ctx={ctx} /></Tag>;
}

function List({ b, ctx }) {
  const Tag = b.ordered ? 'ol' : 'ul';
  return (
    <Tag className="wiki-list">
      {b.items.map((it, i) => (
        <li key={i} className={it.checked === null ? undefined : 'wiki-task'}>
          {it.checked !== null && <input type="checkbox" checked={it.checked} readOnly disabled />}
          <Inline nodes={it.content} ctx={ctx} />
          {it.children.map((c, j) => <List key={j} b={c} ctx={ctx} />)}
        </li>
      ))}
    </Tag>
  );
}

function Callout({ b, ctx }) {
  const noTitle = b.options.includes('no-title');
  const container = CONTAINER_TYPES.has(b.type);
  const title = b.title || (container ? '' : TYPE_TITLE[b.type] || b.type);
  const cls = ['wiki-callout', 'wiki-callout--' + b.type];
  b.options.forEach((o) => {
    if (o === 'right' || o === 'left') cls.push('wiki-callout--' + o);
    else if (/^bg-/.test(o)) cls.push('wiki-' + o);
    else if (o === 'text-center' || o === 'center') cls.push('wiki-text-center');
    else if (o === 'no-title') cls.push('wiki-callout--notitle');
  });
  const body = <div className="wiki-callout__body"><Blocks blocks={b.children} ctx={ctx} /></div>;
  const head = !noTitle && title ? <div className="wiki-callout__title">{title}</div> : null;
  if (b.fold) {
    return (
      <details className={cls.join(' ')} open={b.fold === '+'}>
        <summary className="wiki-callout__title">{title || '…'}</summary>
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

function Block({ b, ctx }) {
  switch (b.t) {
    case 'heading': return <Heading b={b} ctx={ctx} />;
    case 'paragraph': return <p className="wiki-p"><Inline nodes={b.content} ctx={ctx} /></p>;
    case 'hr': return <hr className="wiki-hr" />;
    case 'list': return <List b={b} ctx={ctx} />;
    case 'quote': return <blockquote className="wiki-quote"><Blocks blocks={b.children} ctx={ctx} /></blockquote>;
    case 'callout': return <Callout b={b} ctx={ctx} />;
    case 'table': return <Table b={b} ctx={ctx} />;
    case 'code':
      if (b.lang === 'dataview' || b.lang === 'dataviewjs') {
        return <div className="wiki-dynamic">Index dynamique (Dataview) — la liste automatique du dossier le remplace ici.</div>;
      }
      return <pre className="wiki-pre"><code>{b.text}</code></pre>;
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
