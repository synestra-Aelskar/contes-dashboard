import { parseNote, extractLinks, isImageName, nameKey } from './wiki.js';

/* Import d'un vault Obsidian choisi dans le navigateur
 * (<input type="file" webkitdirectory>) : aucun outil externe, aucune clé.
 *
 * `files` : les File du dossier choisi, avec `webkitRelativePath`
 *   « Lore Aelskar/LES CONTES MALVEILLANTS/Cosmologie/Ordre.md ».
 * On retire le 1er segment (le dossier choisi lui-même). */

/** Dossiers de 1er niveau écartés par défaut : dossiers de travail du vault,
 * pas du lore (assets, templates, spawns serveur, logos…). Décochables. */
const SKIP_TOP = /^(X - |ADDONS$|SPAWNS$|0-Vault-Logo$|\(racine\)$|\.)/i;
const SKIP_FILE = /^(nouveau dossier|sans titre|untitled)( \d+)?\.md$/i;
const IMG_EXT = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i;

const segs = (rel) => rel.split('/');

/** Lit le dossier : liste des notes (texte) et des images (File, non lues). */
export async function scanVault(files) {
  const mds = []; const images = new Map(); let ignored = 0;
  for (const f of files) {
    const full = f.webkitRelativePath || f.name;
    const rel = segs(full).slice(1).join('/'); // sans le dossier choisi
    if (!rel || segs(rel).some((s) => s === '.obsidian' || s === '.trash')) { ignored++; continue; }
    if (/\.md$/i.test(rel)) mds.push({ rel, file: f });
    else if (IMG_EXT.test(rel)) {
      const k = rel.split('/').pop().toLowerCase();
      if (!images.has(k)) images.set(k, f);
    } else ignored++;
  }
  const notes = [];
  for (const { rel, file } of mds) {
    notes.push({ rel, text: await file.text(), mtime: file.lastModified || 0 });
  }
  const tops = new Map();
  for (const n of notes) {
    const top = segs(n.rel).length > 1 ? segs(n.rel)[0] : '(racine)';
    if (!tops.has(top)) tops.set(top, { name: top, count: 0, empty: 0 });
    const t = tops.get(top); t.count++; if (!n.text.replace(/^---[\s\S]*?\n---/, '').trim()) t.empty++;
  }
  return {
    notes, images, ignored,
    folders: [...tops.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map((t) => ({ ...t, checked: !SKIP_TOP.test(t.name) }))
  };
}

function frontImageNames(front, acc) {
  const walk = (v) => {
    if (typeof v === 'string') {
      const m = /^\s*!?(?:\[\[)?([^\]|#]+?\.(?:png|jpe?g|gif|svg|webp|bmp|avif))(?:[|#][^\]]*)?(?:\]\])?\s*$/i.exec(v);
      if (m) acc.add(m[1].split('/').pop().trim().toLowerCase());
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(front);
}

/** Notes retenues (dossiers cochés), chemins à plat, images à envoyer. */
export function prepareImport(scan, checkedFolders) {
  const keep = scan.notes.filter((n) => {
    const top = segs(n.rel).length > 1 ? segs(n.rel)[0] : '(racine)';
    // « X - Templates », « X - Assets » : dossiers techniques, à n'importe quelle profondeur
    const technical = segs(n.rel).slice(0, -1).some((s) => /^X - /i.test(s));
    return checkedFolders.includes(top) && !technical && !SKIP_FILE.test(segs(n.rel).pop());
  });
  // un seul dossier de tête commun (« LES CONTES MALVEILLANTS ») : on l'ôte, il n'apporte que du bruit
  const heads = new Set(keep.map((n) => segs(n.rel)[0]));
  const strip = heads.size === 1 && keep.every((n) => segs(n.rel).length > 1) ? [...heads][0] + '/' : '';

  const notes = []; const wanted = new Set(); const seen = new Set();
  for (const n of keep) {
    const path = strip && n.rel.startsWith(strip) ? n.rel.slice(strip.length) : n.rel;
    if (seen.has(nameKey(path))) continue;
    seen.add(nameKey(path));
    const note = parseNote(path, n.text, n.mtime);
    notes.push({ path, fm: note.fm, body: note.body, mtime: n.mtime, front: note.front });
    for (const l of extractLinks(note.body)) if (l.embed && isImageName(l.target)) wanted.add(l.target.split('/').pop().trim().toLowerCase());
    frontImageNames(note.front, wanted);
  }
  const found = [...wanted].filter((k) => scan.images.has(k));
  const missing = [...wanted].filter((k) => !scan.images.has(k));
  const noteSize = notes.reduce((s, n) => s + n.body.length + n.fm.length, 0);
  return {
    notes: notes.map(({ front, ...n }) => n), strip, found, missing,
    stats: { notes: notes.length, empty: notes.filter((n) => !n.body.trim()).length, images: found.length, missing: missing.length, kb: Math.round(noteSize / 1024) }
  };
}
