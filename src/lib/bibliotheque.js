import { uid } from './util.js';
import { TYPES, emptyStory } from './scriptorium.js';

/* Bibliothèque des récits (état partagé `state.bibliotheque`) :
 *   shelves : [{ id, name }]            — étagères libres, dans l'ordre d'affichage
 *   books   : [{ id, shelfId, createdAt, updatedAt, ...récit }]
 * Un « récit » a la forme du Scriptorium (surtitre, titre1, titre2, fin,
 * finSub, braise, signature, acts[{ id, name, blocks[] }]). Un livre dont
 * l'étagère n'existe plus (étagère retirée) n'est jamais perdu : il atterrit
 * dans la pile « non rangés ». */

/* Ids fixes : deux clients qui initialisent la bibliothèque en même temps
 * produisent les mêmes étagères (pas de doublons au rebase). */
const DEFAULT_SHELVES = [
  { id: 'shelf-prologues', name: 'Prologues' },
  { id: 'shelf-interludes', name: 'Interludes' },
  { id: 'shelf-epilogues', name: 'Épilogues' }
];

const str = (v) => (typeof v === 'string' ? v : '');

function normalizeBlock(b) {
  if (!b || typeof b !== 'object' || !TYPES[b.type]) return null;
  if (typeof b.id !== 'string' || !b.id) b.id = uid();
  if (b.type === 'image') { b.src = str(b.src); b.caption = str(b.caption); }
  else b.text = str(b.text);
  return b;
}

function normalizeBook(bk) {
  if (typeof bk.id !== 'string' || !bk.id) bk.id = uid();
  if (typeof bk.shelfId !== 'string') bk.shelfId = null;
  ['surtitre', 'titre1', 'titre2', 'fin', 'finSub', 'signature', 'createdAt', 'updatedAt'].forEach((k) => { bk[k] = str(bk[k]); });
  bk.braise = bk.braise !== false;
  if (!Array.isArray(bk.acts)) bk.acts = [];
  bk.acts = bk.acts.filter((a) => a && typeof a === 'object');
  bk.acts.forEach((a) => {
    if (typeof a.id !== 'string' || !a.id) a.id = uid();
    a.name = str(a.name);
    a.blocks = (Array.isArray(a.blocks) ? a.blocks : []).map(normalizeBlock).filter(Boolean);
  });
}

/** Convertit une ancienne fiche narrative (Créateur de narration, retiré)
 * en livre : chaque bloc « chapitre » ouvre un acte, les blocs qui le
 * précèdent forment un acte sans nom. Id déterministe (fn-<id fiche>) pour
 * que la conversion soit idempotente d'un client à l'autre. */
export function bookFromFicheNarrative(f, shelfId) {
  const acts = [];
  let cur = null;
  const ensure = () => { if (!cur) { cur = { id: uid(), name: '', blocks: [] }; acts.push(cur); } return cur; };
  (f.blocks || []).forEach((b) => {
    if (!b || typeof b !== 'object') return;
    if (b.kind === 'chapter') { cur = { id: uid(), name: str(b.titre), blocks: [] }; acts.push(cur); return; }
    if (b.kind === 'image') { ensure().blocks.push({ id: uid(), type: 'image', src: str(b.url), caption: str(b.caption) }); return; }
    const type = b.kind === 'heading' ? 'lead' : b.kind === 'quote' ? 'quote' : 'p';
    ensure().blocks.push({ id: uid(), type, text: str(b.text) });
  });
  if (!acts.length) acts.push({ id: uid(), name: '', blocks: [] });
  const eyebrow = str(f.eyebrow).trim();
  return {
    id: 'fn-' + f.id,
    shelfId,
    createdAt: '', updatedAt: '',
    surtitre: eyebrow ? eyebrow.charAt(0) + eyebrow.slice(1).toLowerCase() : '',
    titre1: str(f.titre), titre2: str(f.titreAccent),
    fin: '', finSub: '', braise: true, signature: '',
    acts
  };
}

/** Étagère la plus adaptée à un surtitre (« Prologue » → « Prologues »),
 * sinon la première étagère. */
export function shelfForSurtitre(shelves, surtitre) {
  const s = str(surtitre).trim().toLowerCase();
  const hit = s && shelves.find((sh) => sh.name.trim().toLowerCase().startsWith(s));
  return (hit || shelves[0] || { id: null }).id;
}

/** Normalisation à la lecture (appelée par normalize() de board.js). Absorbe
 * aussi les anciennes fiches narratives, converties en livres puis vidées. */
export function normalizeBibliotheque(out) {
  let bib = out.bibliotheque;
  if (!bib || typeof bib !== 'object') bib = { shelves: DEFAULT_SHELVES.map((s) => ({ ...s })), books: [] };
  if (!Array.isArray(bib.shelves)) bib.shelves = [];
  bib.shelves = bib.shelves.filter((s) => s && typeof s === 'object');
  bib.shelves.forEach((s) => {
    if (typeof s.id !== 'string' || !s.id) s.id = uid();
    s.name = str(s.name);
  });
  if (!Array.isArray(bib.books)) bib.books = [];
  bib.books = bib.books.filter((b) => b && typeof b === 'object');
  bib.books.forEach(normalizeBook);

  if (Array.isArray(out.fichesNarratives) && out.fichesNarratives.length) {
    const have = new Set(bib.books.map((b) => b.id));
    out.fichesNarratives.forEach((f) => {
      if (!f || typeof f !== 'object' || have.has('fn-' + f.id)) return;
      bib.books.push(bookFromFicheNarrative(f, shelfForSurtitre(bib.shelves, f.eyebrow)));
    });
  }
  delete out.fichesNarratives;
  out.bibliotheque = bib;
}

/** Nouveau livre vierge rangé sur `shelfId` ; le surtitre par défaut suit
 * le nom de l'étagère (« Prologues » → « Prologue »). */
export function newBook(shelf) {
  const now = new Date().toISOString();
  const story = emptyStory();
  const name = str(shelf && shelf.name).trim();
  if (name) story.surtitre = /s$/i.test(name) ? name.slice(0, -1) : name;
  delete story.v;
  return { id: uid(), shelfId: shelf ? shelf.id : null, createdAt: now, updatedAt: now, ...story };
}

export function findBook(state, id) {
  return (state.bibliotheque && state.bibliotheque.books || []).find((b) => b.id === id) || null;
}

/** Titre lisible d'un livre (tranche, sélecteur…). */
export function bookTitle(b) {
  return [b.titre1, b.titre2].map((s) => str(s).trim()).filter(Boolean).join(' ') || 'Sans titre';
}

/** Couleur de reliure stable, dérivée de l'id : un index dans la palette
 * de reliures définie dans styles.css (.lib-book--c0 … --c5). */
export function bindingIndex(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 6;
}

/** Épaisseur de la tranche, selon la longueur du texte (px). */
export function spineWidth(b) {
  let chars = 0;
  (b.acts || []).forEach((a) => (a.blocks || []).forEach((x) => { chars += (x.text || x.caption || '').length; }));
  return Math.round(Math.min(64, 30 + Math.sqrt(chars) / 2.2));
}

/** Petites statistiques pour le pupitre : actes, mots, minutes de lecture. */
export function bookStats(b) {
  let words = 0;
  (b.acts || []).forEach((a) => (a.blocks || []).forEach((x) => {
    const t = (x.text || '').trim();
    if (t) words += t.split(/\s+/).length;
  }));
  return { acts: (b.acts || []).length, words, minutes: Math.max(1, Math.round(words / 200)) };
}

/** Variation déterministe (0..n-1) tirée de l'id, pour la hauteur et
 * l'inclinaison des tranches. */
export function idVariant(id, n) {
  let h = 7;
  for (const ch of String(id)) h = (h * 17 + ch.charCodeAt(0)) >>> 0;
  return h % n;
}
