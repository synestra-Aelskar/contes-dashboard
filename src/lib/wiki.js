/* Compendium — cœur « Obsidian » : lecture d'une note (frontmatter YAML +
 * corps Markdown), extraction des liens [[wikilinks]] et index du vault
 * (résolution des liens, rétroliens, liens non résolus).
 *
 * Logique PURE, sans React ni Supabase : testable en Node contre le vrai vault.
 *
 * Modèle d'une note : { path, title, front, body, mtime }
 *   path  : chemin relatif dans le vault, avec « / » (« Cosmologie/Ordre.md »)
 *   title : nom du fichier sans « .md » — c'est ce que les [[liens]] visent
 *   front : propriétés YAML (objet), {} s'il n'y en a pas
 *   body  : Markdown après le frontmatter */

/* ---------------- noms et clés de résolution ---------------- */

/** Clé de comparaison d'un nom de note : Obsidian ignore la casse. On
 * normalise aussi les apostrophes courbes et les espaces multiples, sans
 * toucher aux accents (clé « exacte »). */
export function nameKey(name) {
  return String(name || '').trim().replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ').toLowerCase();
}

/** Clé « tolérante » : sans accents non plus. Sert de repli quand le lien et
 * la note diffèrent seulement par un accent (« Élèments » / « Éléments »). */
export function looseKey(name) {
  return nameKey(name).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function baseName(path) {
  const f = String(path || '').split('/').pop();
  return f.replace(/\.md$/i, '');
}

export function folderOf(path) {
  const i = String(path || '').lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

/* ---------------- YAML (sous-ensemble suffisant pour les propriétés) ---------------- */

function indentOf(line) { return line.length - line.trimStart().length; }

function splitInline(s) {
  // sépare « a, b, [[c, d]], "e, f" » en respectant guillemets et crochets
  const out = []; let cur = ''; let depth = 0; let q = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '[' || c === '{') depth++;
    if (c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

function scalar(raw) {
  const v = String(raw).trim();
  if (v === '') return null;
  if ((v[0] === '"' && v.endsWith('"') && v.length > 1) || (v[0] === "'" && v.endsWith("'") && v.length > 1)) {
    return v.slice(1, -1);
  }
  if (v.startsWith('[[')) return v; // lien Obsidian non guillemeté : une chaîne, pas un tableau
  if (v[0] === '[' && v.endsWith(']')) return splitInline(v.slice(1, -1)).map(scalar);
  if (v === '{}') return {};
  if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true';
  if (/^(null|~)$/i.test(v)) return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function parseBlock(lines, start, indent) {
  // renvoie [valeur, indexSuivant]
  let i = start;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length) return [null, i];
  if (lines[i].trim().startsWith('- ') || lines[i].trim() === '-') return parseList(lines, i, indentOf(lines[i]));
  return parseMap(lines, i, indent == null ? indentOf(lines[i]) : indent);
}

function parseList(lines, start, indent) {
  const out = []; let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) { i++; continue; }
    const ind = indentOf(line);
    const t = line.trim();
    if (ind !== indent || !(t.startsWith('- ') || t === '-')) break;
    const rest = t === '-' ? '' : t.slice(2);
    if (/^[^\s"'[{][^:]*:(\s|$)/.test(rest)) {
      // « - clé: valeur » : un objet dont la 1re clé est sur la ligne du tiret
      const sub = [' '.repeat(indent + 2) + rest];
      let j = i + 1;
      while (j < lines.length && (lines[j].trim() === '' || indentOf(lines[j]) > indent)) { sub.push(lines[j]); j++; }
      const [obj] = parseMap(sub, 0, indent + 2);
      out.push(obj); i = j;
    } else {
      out.push(scalar(rest)); i++;
    }
  }
  return [out, i];
}

function parseMap(lines, start, indent) {
  const obj = {}; let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) { i++; continue; }
    const ind = indentOf(line);
    if (ind < indent) break;
    if (ind > indent) { i++; continue; } // ligne orpheline : on l'ignore plutôt que de planter
    const m = /^([^:]+?):(?:\s+(.*))?$/.exec(line.trim());
    if (!m) { i++; continue; }
    const key = m[1].trim().replace(/^["']|["']$/g, '');
    const rest = m[2] === undefined ? '' : m[2];
    i++;
    if (rest.trim() !== '' && !/^[|>][+-]?$/.test(rest.trim())) { obj[key] = scalar(rest); continue; }
    if (/^[|>][+-]?$/.test(rest.trim())) {
      // scalaire de bloc (| ou >) : on recolle les lignes plus indentées
      const parts = [];
      while (i < lines.length && (lines[i].trim() === '' || indentOf(lines[i]) > indent)) { parts.push(lines[i].trim()); i++; }
      obj[key] = parts.join(rest.trim()[0] === '|' ? '\n' : ' ').trim();
      continue;
    }
    // valeur vide : bloc imbriqué (map/liste plus indenté, ou liste au même niveau) ou simple null
    let j = i;
    while (j < lines.length && lines[j].trim() === '') j++;
    if (j < lines.length) {
      const nind = indentOf(lines[j]); const nt = lines[j].trim();
      if (nind > indent) { const [val, nx] = parseBlock(lines, j, nind); obj[key] = val; i = nx; continue; }
      if (nind === indent && nt.startsWith('- ')) { const [val, nx] = parseList(lines, j, indent); obj[key] = val; i = nx; continue; }
    }
    obj[key] = null;
  }
  return [obj, i];
}

export function parseYaml(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  try {
    const [val] = parseBlock(lines, 0, null);
    return val && typeof val === 'object' && !Array.isArray(val) ? val : {};
  } catch (_) {
    return {};
  }
}

/* ---------------- note : frontmatter + corps ---------------- */

/** `fm` est le YAML BRUT tel qu'écrit (commentaires compris) : c'est lui qu'on
 * stocke et qu'on réexporte, `front` n'en est que la lecture. Une édition ne
 * réécrit donc jamais les propriétés de l'utilisateur. */
export function splitFrontmatter(md) {
  const txt = String(md || '').replace(/^﻿/, '');
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(txt);
  if (!m) return { fm: '', front: {}, body: txt };
  return { fm: m[1].replace(/\r/g, ''), front: parseYaml(m[1]), body: txt.slice(m[0].length) };
}

export function parseNote(path, md, mtime) {
  const { fm, front, body } = splitFrontmatter(md);
  return { path, title: baseName(path), fm, front, body, mtime: mtime || 0 };
}

/** Note reconstruite depuis ce qui est stocké ({ fm, body }). */
export function noteFromStored(path, data) {
  const fm = typeof (data && data.fm) === 'string' ? data.fm : '';
  return { path, title: baseName(path), fm, front: parseYaml(fm), body: typeof (data && data.body) === 'string' ? data.body : '', mtime: Number(data && data.mtime) || 0, shared: !!(data && data.shared === true) };
}

/** Le fichier .md d'origine (export / copie vers Obsidian). */
export function toMarkdown(note) {
  const fm = String(note.fm || '').trim() ? '---\n' + note.fm.replace(/\s+$/, '') + '\n---\n' : '';
  return fm + (note.body || '');
}

/* ---------------- liens ---------------- */

/** Texte sans code (blocs et inline) ni commentaires HTML : c'est là que
 * vivent des [[ ]] qui ne sont pas des liens (scripts dataviewjs, exemples). */
export function stripCode(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/`[^`\n]*`/g, '');
}

/** Découpe l'intérieur d'un [[…]] : « Cible#Titre^bloc | Alias ». */
export function parseLinkInner(inner) {
  const [left, ...aliasParts] = String(inner).split('|');
  const alias = aliasParts.length ? aliasParts.join('|').trim() : '';
  let target = left.trim(); let heading = ''; let block = '';
  const caret = target.indexOf('^');
  if (caret >= 0) { block = target.slice(caret + 1); target = target.slice(0, caret); }
  const hash = target.indexOf('#');
  if (hash >= 0) { heading = target.slice(hash + 1); target = target.slice(0, hash); }
  return { target: target.trim().replace(/\.md$/i, ''), heading: heading.trim(), block, alias };
}

const LINK_RE = /(!?)\[\[([^\]\n]+)\]\]/g;

/** Tous les liens/embeds d'un texte. Un embed est reconnu à son « ! ». */
export function extractLinks(text) {
  const out = [];
  for (const m of stripCode(text).matchAll(LINK_RE)) {
    const l = parseLinkInner(m[2]);
    if (!l.target && !l.heading) continue;
    out.push({ embed: m[1] === '!', raw: m[2], ...l });
  }
  return out;
}

function frontStrings(v, acc = []) {
  if (typeof v === 'string') acc.push(v);
  else if (Array.isArray(v)) v.forEach((x) => frontStrings(x, acc));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => frontStrings(x, acc));
  return acc;
}

/** Liens d'une note : ceux du corps + ceux cachés dans les propriétés
 * (« image: "[[x.jpg]]" », « entities: ["[[Aelskar]]"] ») — Obsidian les
 * compte aussi comme liens. */
export function noteLinks(note) {
  const links = extractLinks(note.body);
  for (const s of frontStrings(note.front)) links.push(...extractLinks(s));
  return links;
}

/* ---------------- index du vault ---------------- */

const IMG_RE = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i;
export const isImageName = (n) => IMG_RE.test(String(n || ''));

/** `notes` : tableau de notes. Rend un index prêt à interroger : résolution
 * des liens, rétroliens, liens rouges (non résolus). */
export function buildIndex(notes) {
  const byKey = new Map();   // nameKey  → [path]
  const byLoose = new Map(); // looseKey → [path]
  const byPath = new Map();
  const push = (m, k, p) => { if (!m.has(k)) m.set(k, []); m.get(k).push(p); };

  for (const n of notes) {
    byPath.set(n.path, n);
    push(byKey, nameKey(n.title), n.path);
    push(byLoose, looseKey(n.title), n.path);
    const aliases = [].concat(n.front.aliases || n.front.alias || []).filter((a) => typeof a === 'string');
    for (const a of aliases) { push(byKey, nameKey(a), n.path); push(byLoose, looseKey(a), n.path); }
  }

  /** Plusieurs notes portent le même nom : Obsidian prend la plus proche du
   * lien (même dossier d'abord), puis le chemin le plus court. Déterministe. */
  function pick(paths, fromPath) {
    if (paths.length === 1) return paths[0];
    const from = folderOf(fromPath || '').split('/');
    const score = (p) => {
      const a = folderOf(p).split('/');
      let common = 0;
      while (common < a.length && common < from.length && a[common] === from[common]) common++;
      return [-common, p.split('/').length, p];
    };
    return paths.slice().sort((x, y) => {
      const sx = score(x); const sy = score(y);
      return sx[0] - sy[0] || sx[1] - sy[1] || (sx[2] < sy[2] ? -1 : 1);
    })[0];
  }

  /** « Dossier/Note » ou « Note » → chemin de la note, ou null. */
  function resolve(target, fromPath) {
    const t = String(target || '').trim().replace(/\.md$/i, '');
    if (!t) return fromPath || null;
    if (t.includes('/')) {
      const want = nameKey(t) + '.md';
      const hit = notes.find((n) => nameKey(n.path) === want || nameKey(n.path).endsWith('/' + want));
      if (hit) return hit.path;
    }
    const base = t.split('/').pop();
    const exact = byKey.get(nameKey(base));
    if (exact) return pick(exact, fromPath);
    const loose = byLoose.get(looseKey(base));
    if (loose) return pick(loose, fromPath);
    return null;
  }

  const backlinks = new Map();   // path → Map(from → count)
  const outgoing = new Map();    // path → Set(path)
  const unresolved = new Map();  // nameKey → { name, count, from:Set }
  let total = 0; let resolvedCount = 0;

  for (const n of notes) {
    const out = new Set();
    for (const l of noteLinks(n)) {
      if (l.embed && isImageName(l.target)) continue; // un embed d'image n'est pas un lien de note
      total++;
      const dest = resolve(l.target, n.path);
      if (dest) {
        resolvedCount++;
        if (dest !== n.path) {
          out.add(dest);
          if (!backlinks.has(dest)) backlinks.set(dest, new Map());
          const m = backlinks.get(dest);
          m.set(n.path, (m.get(n.path) || 0) + 1);
        }
      } else if (l.target) {
        const k = nameKey(l.target);
        if (!unresolved.has(k)) unresolved.set(k, { name: l.target, count: 0, from: new Set() });
        const u = unresolved.get(k); u.count++; u.from.add(n.path);
      }
    }
    outgoing.set(n.path, out);
  }

  return {
    notes, byPath, resolve,
    backlinks: (path) => [...(backlinks.get(path) || new Map()).entries()].map(([from, count]) => ({ from, count })).sort((a, b) => b.count - a.count),
    outgoing: (path) => [...(outgoing.get(path) || [])],
    unresolved: () => [...unresolved.values()].map((u) => ({ name: u.name, count: u.count, from: [...u.from] })).sort((a, b) => b.count - a.count),
    stats: { notes: notes.length, links: total, resolved: resolvedCount, unresolved: total - resolvedCount, unresolvedNames: unresolved.size }
  };
}

/** Résout un embed d'image/média vers une URL via la table `media`
 * ({ nomDeFichier en minuscules → url }). */
export function resolveMedia(media, target) {
  const base = String(target || '').split('/').pop().trim().toLowerCase();
  return (media && media[base]) || null;
}

/* ---------------- arborescence ---------------- */

/** Arbre de dossiers à partir des chemins de notes :
 * { name, path, folders: [...], notes: [...], folderNote } */
export function buildTree(notes) {
  const root = { name: '', path: '', folders: [], notes: [], folderNote: null };
  const dirs = new Map([['', root]]);
  const dirOf = (p) => {
    if (dirs.has(p)) return dirs.get(p);
    const parent = dirOf(folderOf(p));
    const d = { name: p.split('/').pop(), path: p, folders: [], notes: [], folderNote: null };
    parent.folders.push(d); dirs.set(p, d);
    return d;
  };
  for (const n of notes) {
    const d = dirOf(folderOf(n.path));
    // « folder note » (plugin Folder notes) : la note qui porte le nom de son dossier
    if (d.path && nameKey(n.title) === nameKey(d.name)) d.folderNote = n;
    else d.notes.push(n);
  }
  const sort = (d) => {
    d.folders.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    d.notes.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    d.folders.forEach(sort);
  };
  sort(root);
  return root;
}

/** Nombre de notes sous un dossier (sous-dossiers compris). */
export function countNotes(dir) {
  return dir.notes.length + (dir.folderNote ? 1 : 0) + dir.folders.reduce((n, f) => n + countNotes(f), 0);
}

/* ---------------- renommage avec réécriture des liens ---------------- */

const CODE_SPLIT = /(```[\s\S]*?```|~~~[\s\S]*?~~~|<!--[\s\S]*?-->|`[^`\n]*`)/;

/** Réécrit les [[liens]] d'un texte qui visent `oldPath`. `resolve` est celui de
 * l'index AVANT le renommage ; `rename(cible)` rend la nouvelle cible. Le code,
 * les commentaires et les liens vers une ancre seule sont laissés tels quels. */
export function rewriteLinks(text, { fromPath, resolve, oldPath, oldTitle, rename }) {
  let count = 0;
  const out = String(text || '').split(CODE_SPLIT).map((seg, i) => {
    if (i % 2) return seg;
    return seg.replace(LINK_RE, (all, bang, inner) => {
      const pipe = inner.indexOf('|');
      const left = pipe < 0 ? inner : inner.slice(0, pipe);
      const rest = pipe < 0 ? '' : inner.slice(pipe);
      const m = /^(\s*)([^#^]*?)(\s*)([#^][\s\S]*)?$/.exec(left);
      if (!m || !m[2].trim()) return all;
      const target = m[2].replace(/\.md$/i, '');
      if (resolve(target, fromPath) !== oldPath) return all;
      // un lien passé par un alias garde son sens : on ne le touche pas
      if (looseKey(target.split('/').pop()) !== looseKey(oldTitle)) return all;
      count++;
      return bang + '[[' + m[1] + rename(target) + m[3] + (m[4] || '') + rest + ']]';
    });
  });
  return { text: out.join(''), count };
}

/** Plan d'un renommage / déplacement : quelles notes changent, et combien de
 * liens sont réécrits. Un simple déplacement de dossier ne touche aucun lien. */
export function planRename(notes, index, oldPath, newPath) {
  const old = index.byPath.get(oldPath);
  const updates = new Map();
  let count = 0;
  if (!old) return { updates, count };
  const newTitle = baseName(newPath);
  if (looseKey(old.title) === looseKey(newTitle) && nameKey(old.title) === nameKey(newTitle)) return { updates, count };
  const clash = notes.some((n) => n.path !== oldPath && nameKey(n.title) === nameKey(newTitle));
  const rename = (target) => (target.includes('/') || clash ? newPath.replace(/\.md$/i, '') : newTitle);
  for (const n of notes) {
    const o = { resolve: index.resolve, oldPath, oldTitle: old.title, rename, fromPath: n.path };
    const b = rewriteLinks(n.body, o);
    const f = n.fm ? rewriteLinks(n.fm, o) : { text: n.fm, count: 0 };
    if (b.count + f.count) {
      updates.set(n.path, { ...(b.count ? { body: b.text } : {}), ...(f.count ? { fm: f.text } : {}) });
      count += b.count + f.count;
    }
  }
  return { updates, count };
}

/* ---------------- propriétés ---------------- */

function flatValues(v, acc = []) {
  if (v == null || v === '') return acc;
  if (Array.isArray(v)) v.forEach((x) => flatValues(x, acc));
  else if (typeof v === 'object') return acc;
  else acc.push(String(v).replace(/!?\[\[([^\]|#]*)(?:[#^|][^\]]*)?\]\]/g, '$1').replace(/_/g, ' ').trim());
  return acc;
}

/** Valeurs d'une propriété d'une note, à plat et nettoyées (liens dépouillés). */
export function propValues(note, key) {
  const k = Object.keys(note.front || {}).find((x) => nameKey(x) === nameKey(key));
  return k === undefined ? [] : flatValues(note.front[k]).filter(Boolean);
}

/** Inventaire des propriétés du vault : pour chaque clé (casse ignorée), ses
 * valeurs (accents et casse ignorés), leur effectif et les graphies rencontrées
 * — c'est ce qui permet de repérer « entite divine » / « entité divine ». */
export function propertyStats(notes, skip = new Set()) {
  const keys = new Map();
  for (const n of notes) {
    for (const rawKey of Object.keys(n.front || {})) {
      const kk = nameKey(rawKey);
      if (skip.has(kk)) continue;
      const vals = flatValues(n.front[rawKey]);
      if (!vals.length) continue;
      if (!keys.has(kk)) keys.set(kk, { key: rawKey, count: 0, values: new Map() });
      const e = keys.get(kk);
      e.count++;
      for (const v of new Set(vals)) {
        const vk = looseKey(v);
        if (!e.values.has(vk)) e.values.set(vk, { value: v, count: 0, paths: [], variants: new Map() });
        const ve = e.values.get(vk);
        ve.count++; ve.paths.push(n.path);
        ve.variants.set(v, (ve.variants.get(v) || 0) + 1);
      }
    }
  }
  return [...keys.values()].map((e) => ({
    key: e.key, count: e.count,
    values: [...e.values.values()].map((ve) => {
      const variants = [...ve.variants.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
      return { value: variants[0], count: ve.count, paths: ve.paths, variants };
    }).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'fr'))
  })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'fr'));
}
