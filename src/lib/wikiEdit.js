/* Compendium — opérations d'édition Markdown, pures et sans DOM.
 *
 * Chaque fonction reçoit le texte et la sélection (s, e) et rend une édition
 * { from, to, insert, sel: [début, fin] } : remplacer t[from..to] par `insert`,
 * puis placer la sélection `sel` (positions du texte obtenu). L'éditeur applique
 * cette édition par execCommand, ce qui garde l'historique « annuler ». */

const edit = (from, to, insert, a, b) => ({ from, to, insert, sel: [a, b === undefined ? a : b] });

export function lineStart(t, pos) { return t.lastIndexOf('\n', pos - 1) + 1; }
export function lineEnd(t, pos) { const k = t.indexOf('\n', pos); return k < 0 ? t.length : k; }

/** Lignes entières couvertes par la sélection (une sélection qui finit en début de ligne exclut cette ligne). */
function lineSpan(t, s, e) {
  const end = e > s && t[e - 1] === '\n' ? e - 1 : e;
  return [lineStart(t, s), lineEnd(t, end)];
}

/** Entoure la sélection (ou retire l'entourage s'il y est déjà). */
export function toggleWrap(t, s, e, open, close = open) {
  const sel = t.slice(s, e);
  const o = open.length; const c = close.length;
  const single = o === 1 && open === close;
  if (s >= o && t.slice(s - o, s) === open && t.slice(e, e + c) === close && !(single && (t[s - 2] === open || t[e + 1] === open))) {
    return edit(s - o, e + c, sel, s - o, e - o);
  }
  if (sel.length >= o + c && sel.startsWith(open) && sel.endsWith(close) && !(single && (sel[1] === open))) {
    const inner = sel.slice(o, sel.length - c);
    return edit(s, e, inner, s, s + inner.length);
  }
  return edit(s, e, open + sel + close, s + o, s === e ? s + o : e + o);
}

const RE_HEAD = /^(\s{0,3})(#{1,6})\s+/;
const RE_LIST = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?/;
const RE_QUOTE = /^(\s*)>\s?/;

function has(kind, line) {
  if (kind[0] === 'h') { const m = RE_HEAD.exec(line); return !!m && m[2].length === Number(kind.slice(1)); }
  if (kind === 'ul') return /^\s*[-*+]\s+(?!\[.\]\s)/.test(line);
  if (kind === 'task') return /^\s*[-*+]\s+\[.\]\s/.test(line);
  if (kind === 'ol') return /^\s*\d+[.)]\s/.test(line);
  return /^\s*>/.test(line);
}

/** Titre / puces / numéros / tâches / citation, appliqués ligne par ligne (bascule). */
export function toggleLinePrefix(t, s, e, kind) {
  const [ls, le] = lineSpan(t, s, e);
  const lines = t.slice(ls, le).split('\n');
  const live = lines.filter((l) => l.trim());
  const off = live.length > 0 && live.every((l) => has(kind, l));
  let n = 0;
  const out = lines.map((line) => {
    if (!line.trim() && lines.length > 1) return line;
    let indent = ''; let rest = line;
    if (kind[0] === 'h') { const m = RE_HEAD.exec(rest); if (m) rest = rest.slice(m[0].length); }
    else if (kind === 'quote') { const m = RE_QUOTE.exec(rest); if (m) { indent = m[1]; rest = rest.slice(m[0].length); } }
    else { const m = RE_LIST.exec(rest); if (m) { indent = m[1]; rest = rest.slice(m[0].length); } else { indent = /^\s*/.exec(rest)[0]; rest = rest.slice(indent.length); } }
    if (off) return indent + rest;
    n++;
    const mark = kind[0] === 'h' ? '#'.repeat(Number(kind.slice(1))) + ' ' : kind === 'ul' ? '- ' : kind === 'task' ? '- [ ] ' : kind === 'ol' ? n + '. ' : '> ';
    return indent + mark + rest;
  });
  const block = out.join('\n');
  if (s === e) {
    const delta = block.length - (le - ls);
    return edit(ls, le, block, Math.max(ls, s + delta));
  }
  return edit(ls, le, block, ls, ls + block.length);
}

/** Décale les lignes sélectionnées (dir > 0 : indenter, < 0 : désindenter). */
export function indentLines(t, s, e, dir) {
  const [ls, le] = lineSpan(t, s, e);
  const lines = t.slice(ls, le).split('\n');
  let first = 0;
  const out = lines.map((l, i) => {
    let r;
    if (dir > 0) r = l.trim() || lines.length === 1 ? '\t' + l : l;
    else r = l.replace(/^(\t| {1,4})/, '');
    if (i === 0) first = r.length - l.length;
    return r;
  });
  const block = out.join('\n');
  if (s === e) return edit(ls, le, block, Math.max(ls, s + first));
  return edit(ls, le, block, ls, ls + block.length);
}

/** Touche Entrée dans une liste / citation / callout : on continue le préfixe, ou on le retire s'il est vide. */
export function continueList(t, s, e) {
  if (s !== e) return null;
  if (s < t.length && t[s] !== '\n') return null; // seulement en fin de ligne
  const ls = lineStart(t, s);
  const line = t.slice(ls, s);
  if (/^\s*(```|~~~)/.test(line)) return null;
  let m = /^(\s*)((?:>\s?)*)([-*+]|\d+[.)])(\s+)(\[.\]\s+)?(.*)$/.exec(line);
  if (m) {
    const [, indent, quote, marker, gap, task, content] = m;
    if (!content.trim()) {
      if (indent) { // puce vide et indentée : on remonte d'un niveau
        const up = quote + indent.replace(/^(\t| {1,4})/, '') + marker + gap + (task || '');
        return edit(ls, s, up, ls + up.length);
      }
      return edit(ls, s, quote, ls + quote.length); // puce vide au premier niveau : on la retire
    }
    const num = /^\d+/.exec(marker);
    const next = num ? (Number(num[0]) + 1) + marker.slice(num[0].length) : marker;
    const ins = '\n' + indent + quote + next + gap + (task ? '[ ] ' : '');
    return edit(s, s, ins, s + ins.length);
  }
  m = /^(\s*)((?:>\s?)+)(.*)$/.exec(line);
  if (m) {
    const prefix = m[1] + (m[2].endsWith(' ') ? m[2] : m[2] + ' ');
    if (!m[3].trim()) return edit(ls, s, '', ls);
    const ins = '\n' + prefix;
    return edit(s, s, ins, s + ins.length);
  }
  return null;
}

/** Entoure les lignes sélectionnées d'un callout `> [!type]`. */
export function callout(t, s, e, type) {
  const [ls, le] = lineSpan(t, s, e);
  const lines = t.slice(ls, le).split('\n');
  const body = lines.some((l) => l.trim()) ? lines.map((l) => '> ' + l.replace(/^>\s?/, '')) : ['> '];
  const head = '> [!' + type + '] ';
  const block = head + '\n' + body.join('\n');
  return edit(ls, le, block, ls + head.length);
}

export function table(t, s) {
  const ls = lineStart(t, s);
  const before = t.slice(ls, s).trim() ? '\n\n' : (ls > 0 && t[ls - 2] !== '\n' ? '\n' : '');
  const text = '| Colonne 1 | Colonne 2 | Colonne 3 |\n| --- | --- | --- |\n|  |  |  |\n';
  const at = t.slice(ls, s).trim() ? lineEnd(t, s) : ls;
  const a = at + before.length + 2;
  return edit(at, at, before + text, a, a + 9);
}

export function codeBlock(t, s, e) {
  const sel = t.slice(s, e);
  const nl = s > 0 && t[s - 1] !== '\n' ? '\n' : '';
  const ins = nl + '```\n' + sel + '\n```\n';
  const a = s + nl.length + 4;
  return edit(s, e, ins, a, a + sel.length);
}

export function insertText(t, s, e, text, caret) {
  return edit(s, e, text, s + (caret === undefined ? text.length : caret));
}

export function wikiLink(t, s, e) { return toggleWrap(t, s, e, '[[', ']]'); }

export function extLink(t, s, e) {
  const sel = t.slice(s, e) || 'texte';
  const ins = '[' + sel + '](url)';
  const a = s + sel.length + 3;
  return edit(s, e, ins, a, a + 3);
}

/** Coche / décoche la tâche de la ligne du curseur ; une puce simple devient une tâche. */
export function toggleTask(t, s) {
  const ls = lineStart(t, s); const le = lineEnd(t, s);
  const line = t.slice(ls, le);
  const m = /^(\s*(?:>\s?)*(?:[-*+]|\d+[.)])\s+\[)(.)(\]\s)/.exec(line);
  if (m) {
    const at = ls + m[1].length;
    return edit(at, at + 1, m[2] === ' ' ? 'x' : ' ', s);
  }
  const b = /^(\s*(?:>\s?)*(?:[-*+]|\d+[.)])\s+)/.exec(line);
  if (b) { const at = ls + b[1].length; return edit(at, at, '[ ] ', s + 4); }
  return null;
}

const PAIRS = { '(': ')', '[': ']', '{': '}', '`': '`' };
const WRAP = new Set(['*', '_', '=', '~', '"', '$', '(', '[', '{', '`']);

/** Frappe d'un caractère : fermeture automatique, saut au-dessus du fermant, entourage de la sélection. */
export function pairKey(t, s, e, key) {
  if (key.length !== 1) return null;
  if (s !== e) {
    if (!WRAP.has(key)) return null;
    const close = PAIRS[key] || key;
    return edit(s, e, key + t.slice(s, e) + close, s + 1, e + 1);
  }
  if (')]}`'.includes(key) && t[s] === key) return edit(s, s, '', s + 1);
  if (key in PAIRS) {
    const next = t[s];
    if (key === '`' && (t[s - 1] === '`' || (next && /\w/.test(next)))) return null;
    if (next && !/[\s)\]}]/.test(next)) return null;
    return edit(s, s, key + PAIRS[key], s + 1);
  }
  return null;
}

/** Retour arrière entre deux caractères d'une paire vide : on retire les deux. */
export function pairBackspace(t, s, e) {
  if (s !== e || s < 1) return null;
  const a = t[s - 1];
  return a in PAIRS && t[s] === PAIRS[a] ? edit(s - 1, s + 1, '', s - 1) : null;
}

/** La ligne du curseur est-elle un élément de liste ? (pour décider si Tab indente) */
export function onListLine(t, s) {
  const line = t.slice(lineStart(t, s), lineEnd(t, s));
  return RE_LIST.test(line) || /^\s*(?:>\s?)+(?:[-*+]|\d+[.)])\s/.test(line);
}

/** Occurrences de `term` (insensible à la casse) → positions de début. */
export function findAll(t, term) {
  const out = [];
  if (!term) return out;
  const hay = t.toLowerCase(); const needle = term.toLowerCase();
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) out.push(i);
  return out;
}
