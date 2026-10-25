/* Compendium — Markdown « façon Obsidian » en AST, sans HTML brut.
 *
 * Le rendu (WikiMarkdown.jsx) transforme cet AST en éléments React : aucun
 * `dangerouslySetInnerHTML`, donc aucune injection possible depuis une note,
 * même collée depuis n'importe où. Les balises HTML des notes sont ignorées
 * (le texte qu'elles entourent reste), sauf <br>.
 *
 * Couvert : titres, paragraphes (retours à la ligne conservés comme dans
 * Obsidian), listes imbriquées et tâches, citations, CALLOUTS
 * (`> [!type|options]- titre`, pliables), tableaux, séparateurs, blocs de
 * code, gras/italique/barré/surligné/code, [[liens]] (alias, ancre), embeds
 * d'image `![[x.png | 400 | right]]`, liens et images Markdown.
 * Volontairement ignoré : les marqueurs du plugin Multi-Column
 * (`--- start-multi-column` …) — le contenu s'écoule en colonne unique. */

import { parseLinkInner } from './wiki.js';

/* ---------------- inline ---------------- */

const sticky = (re) => new RegExp(re.source, (re.flags || '') + 'y');
const RE = {
  code: sticky(/`([^`\n]+)`/),
  embed: sticky(/!\[\[([^\]\n]+)\]\]/),
  link: sticky(/\[\[([^\]\n]+)\]\]/),
  mdImage: sticky(/!\[([^\]\n]*)\]\(([^)\s]+)\)/),
  mdLink: sticky(/\[([^\]\n]+)\]\(([^)\s]+)\)/),
  br: sticky(/<br\s*\/?>/i),
  tag: sticky(/<\/?[a-zA-Z][^>\n]*>/),
  comment: sticky(/<!--[\s\S]*?-->/),
  boldItalic: sticky(/\*\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*\*/),
  bold: sticky(/\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/),
  italic: sticky(/\*(?=[^\s*])([^*\n]*[^\s*])\*/),
  italicU: sticky(/_(?=\S)([^_\n]*\S)_(?![\w])/),
  strike: sticky(/~~(?=\S)([\s\S]+?)(?<=\S)~~/),
  mark: sticky(/==(?=\S)([\s\S]+?)(?<=\S)==/),
  escape: sticky(/\\([\\`*_{}[\]()#+\-.!|~=<>])/)
};

function match(re, src, i) { re.lastIndex = i; return re.exec(src); }

/** Options d'un embed `![[x.png | 400 | right]]` → largeur, alignement, classes. */
export function parseEmbedOptions(raw) {
  const opts = { width: null, height: null, align: '', alt: '', classes: [] };
  for (const part of String(raw || '').split(/[|\s]+/).filter(Boolean)) {
    const wh = /^(\d+)x(\d+)$/.exec(part);
    if (/^\d+$/.test(part)) opts.width = Number(part);
    else if (wh) { opts.width = Number(wh[1]); opts.height = Number(wh[2]); }
    else if (/right/i.test(part)) opts.align = 'right';
    else if (/left/i.test(part)) opts.align = 'left';
    else if (/center/i.test(part)) opts.align = 'center';
    else opts.classes.push(part);
  }
  return opts;
}

export function parseInline(src) {
  const out = [];
  let buf = '';
  let i = 0;
  const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
  const text = String(src || '');

  while (i < text.length) {
    const c = text[i];
    let m;
    if (c === '\\' && (m = match(RE.escape, text, i))) { buf += m[1]; i += m[0].length; continue; }
    if (c === '`' && (m = match(RE.code, text, i))) { flush(); out.push({ t: 'code', v: m[1] }); i += m[0].length; continue; }
    if (c === '!' && (m = match(RE.embed, text, i))) {
      flush();
      const [targetPart, ...optParts] = m[1].split('|');
      const link = parseLinkInner(targetPart);
      out.push({ t: 'embed', target: link.target, heading: link.heading, opts: parseEmbedOptions(optParts.join('|')) });
      i += m[0].length; continue;
    }
    if (c === '!' && (m = match(RE.mdImage, text, i))) { flush(); out.push({ t: 'image', alt: m[1], url: m[2] }); i += m[0].length; continue; }
    if (c === '[' && (m = match(RE.link, text, i))) {
      flush();
      const l = parseLinkInner(m[1]);
      out.push({ t: 'link', target: l.target, heading: l.heading, label: l.alias || (l.target + (l.heading ? ' › ' + l.heading : '')) || l.heading });
      i += m[0].length; continue;
    }
    if (c === '[' && (m = match(RE.mdLink, text, i))) { flush(); out.push({ t: 'ext', url: m[2], children: parseInline(m[1]) }); i += m[0].length; continue; }
    if (c === '<') {
      if ((m = match(RE.comment, text, i))) { i += m[0].length; continue; }
      if ((m = match(RE.br, text, i))) { flush(); out.push({ t: 'br' }); i += m[0].length; continue; }
      if ((m = match(RE.tag, text, i))) { i += m[0].length; continue; } // balise HTML : ignorée, son texte reste
    }
    if (c === '*') {
      if ((m = match(RE.boldItalic, text, i))) { flush(); out.push({ t: 'b', children: [{ t: 'i', children: parseInline(m[1]) }] }); i += m[0].length; continue; }
      if ((m = match(RE.bold, text, i))) { flush(); out.push({ t: 'b', children: parseInline(m[1]) }); i += m[0].length; continue; }
      if ((m = match(RE.italic, text, i))) { flush(); out.push({ t: 'i', children: parseInline(m[1]) }); i += m[0].length; continue; }
    }
    if (c === '_' && (i === 0 || !/\w/.test(text[i - 1])) && (m = match(RE.italicU, text, i))) { flush(); out.push({ t: 'i', children: parseInline(m[1]) }); i += m[0].length; continue; }
    if (c === '~' && (m = match(RE.strike, text, i))) { flush(); out.push({ t: 's', children: parseInline(m[1]) }); i += m[0].length; continue; }
    if (c === '=' && (m = match(RE.mark, text, i))) { flush(); out.push({ t: 'mark', children: parseInline(m[1]) }); i += m[0].length; continue; }
    if (c === '\n') { flush(); out.push({ t: 'br' }); i++; continue; }
    buf += c; i++;
  }
  flush();
  return out;
}

/** Texte brut d'un arbre inline (titres, extraits, ancres). */
export function inlineText(nodes) {
  return (nodes || []).map((n) => {
    if (n.t === 'text' || n.t === 'code') return n.v;
    if (n.t === 'link') return n.label;
    if (n.t === 'br') return ' ';
    if (n.children) return inlineText(n.children);
    return '';
  }).join('');
}

export function slugHeading(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* ---------------- blocs ---------------- */

const FENCE = /^\s*(```+|~~~+)\s*([\w-]*)/;
const HR = /^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const MULTICOL = /^\s*---\s*(start-multi-column|end-column|end-multi-column)/i;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const CALLOUT = /^\[!([\w-]+)\s*([^\]]*)\]([+-]?)\s*(.*)$/;

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

function startsBlock(line, next) {
  if (!line.trim()) return true;
  return FENCE.test(line) || HR.test(line) || HEADING.test(line) || /^\s*>/.test(line) || MULTICOL.test(line)
    || LIST_ITEM.test(line) || (line.includes('|') && next !== undefined && TABLE_SEP.test(next));
}

export function parseCalloutHeader(first) {
  const m = CALLOUT.exec(first.trim());
  if (!m) return null;
  const options = m[2].split('|').join(' ').split(/\s+/).filter(Boolean);
  return { type: m[1].toLowerCase(), options, fold: m[3], title: m[4].trim() };
}

function parseList(lines, start) {
  // Liste à puces/numérotée, nesting par indentation. Renvoie [bloc, indexSuivant].
  const first = LIST_ITEM.exec(lines[start]);
  const baseIndent = first[1].replace(/\t/g, '    ').length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  let i = start;
  while (i < lines.length) {
    const m = LIST_ITEM.exec(lines[i]);
    if (!m) {
      // continuation d'item : ligne indentée non vide qui n'ouvre aucun bloc
      if (lines[i].trim() && /^\s+\S/.test(lines[i]) && items.length && !startsBlock(lines[i].trimStart())) {
        const it = items[items.length - 1];
        it.inline = (it.inline || '') + '\n' + lines[i].trim();
        i++; continue;
      }
      break;
    }
    const indent = m[1].replace(/\t/g, '    ').length;
    if (indent < baseIndent) break;
    if (indent > baseIndent) {
      const [sub, next] = parseList(lines, i);
      if (items.length) items[items.length - 1].children.push(sub);
      else items.push({ inline: '', checked: null, children: [sub] });
      i = next; continue;
    }
    let body = m[3];
    let checked = null;
    const task = /^\[([ xX])\]\s+(.*)$/.exec(body);
    if (task) { checked = task[1] !== ' '; body = task[2]; }
    items.push({ inline: body, checked, children: [] });
    i++;
  }
  return [{ t: 'list', ordered, items: items.map((it) => ({ checked: it.checked, content: parseInline(it.inline), children: it.children })) }, i];
}

export function parseBlocks(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (MULTICOL.test(line)) { i++; continue; }

    let m = FENCE.exec(line);
    if (m) {
      const fence = m[1]; const lang = m[2].toLowerCase();
      const body = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence.slice(0, 3))) { body.push(lines[i]); i++; }
      i++; // fermeture
      if (lang === 'column-settings' || lang === '') { if (lang === 'column-settings' || !body.join('').trim()) continue; }
      out.push({ t: 'code', lang, text: body.join('\n') });
      continue;
    }
    if (HR.test(line)) { out.push({ t: 'hr' }); i++; continue; }
    if ((m = HEADING.exec(line))) { out.push({ t: 'heading', level: m[1].length, content: parseInline(m[2]) }); i++; continue; }

    if (/^\s*>/.test(line)) {
      const inner = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { inner.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      const head = parseCalloutHeader(inner[0] || '');
      if (head) out.push({ t: 'callout', ...head, children: parseBlocks(inner.slice(1)) });
      else out.push({ t: 'quote', children: parseBlocks(inner) });
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : /^:-+/.test(c) ? 'left' : ''));
      const rows = []; i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) { rows.push(splitRow(lines[i])); i++; }
      out.push({ t: 'table', align, head: head.map(parseInline), rows: rows.map((r) => r.map(parseInline)) });
      continue;
    }

    if (LIST_ITEM.test(line)) { const [blk, next] = parseList(lines, i); out.push(blk); i = next; continue; }

    // paragraphe : lignes consécutives qui n'ouvrent pas un autre bloc
    const para = [line.trim()]; i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) { para.push(lines[i].trim()); i++; }
    const joined = para.join('\n');
    if (/^(<br\s*\/?>\s*)+$/i.test(joined)) continue; // ligne de <br> seule = espacement, déjà fourni par les marges
    out.push({ t: 'paragraph', content: parseInline(joined) });
  }
  return out;
}

export function parseMarkdown(body) {
  return parseBlocks(String(body || '').replace(/\r/g, '').split('\n'));
}

/** Titres du document (sommaire / ancres). */
export function outline(blocks) {
  const out = [];
  (function walk(bs) {
    for (const b of bs || []) {
      if (b.t === 'heading') out.push({ level: b.level, text: inlineText(b.content), slug: slugHeading(inlineText(b.content)) });
      else if (b.children) walk(b.children);
    }
  })(blocks);
  return out;
}

/** Extrait de texte brut (liste de résultats de recherche). */
export function excerpt(body, max = 160) {
  const text = inlineText(parseInline(
    String(body || '').replace(/```[\s\S]*?```/g, ' ').replace(/^[>#\-*\s|]+/gm, ' ').replace(/\s+/g, ' ')
  )).trim();
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}
