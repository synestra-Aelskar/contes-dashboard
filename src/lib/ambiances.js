import { uid } from './util.js';

/* Page « Ambiances » (catégorie Trames) : state.ambiances =
 *   categories : [{ id, name }]
 *   items      : [{ id, name, url, notes, categoryId, zoneId }]   — ajoutées à la main
 * À quoi s'ajoutent, SANS copie, toutes les ambiances des séances de Prep
 * Session (prepSessions[].sessions[].ambiances, qui portent aussi categoryId /
 * zoneId) : la page les agrège à la lecture, la séance reste leur source. */

const str = (v) => (typeof v === 'string' ? v : '');

export function normalizeAmbiances(out) {
  let a = out.ambiances;
  if (!a || typeof a !== 'object') a = { categories: [], items: [] };
  a.categories = (Array.isArray(a.categories) ? a.categories : []).filter((c) => c && typeof c === 'object');
  a.categories.forEach((c) => { if (!c.id) c.id = uid(); c.name = str(c.name); });
  a.items = (Array.isArray(a.items) ? a.items : []).filter((i) => i && typeof i === 'object');
  a.items.forEach((i) => {
    if (!i.id) i.id = uid();
    ['name', 'url', 'notes', 'categoryId', 'zoneId'].forEach((k) => { i[k] = str(i[k]); });
  });
  out.ambiances = a;
}

export function makeManualAmbiance(categoryId, zoneId) {
  return { id: uid(), name: '', url: '', notes: '', categoryId: categoryId || '', zoneId: zoneId || '' };
}

/** Zones à plat avec leur chemin (« Pays › Région › Zone »), dans l'ordre de l'arbre. */
export function flattenZones(nodes, trail = []) {
  const out = [];
  (nodes || []).forEach((n) => {
    const path = [...trail, n.name || 'Sans nom'];
    out.push({ id: n.id, label: path.join(' › ') });
    out.push(...flattenZones(n.children, path));
  });
  return out;
}

/** Toutes les ambiances : manuelles puis celles des séances. `source` dit où
 * les éditer ; `where` est l'étiquette « Quête › Séance » des ambiances de séance. */
export function collectAmbiances(state) {
  const out = ((state.ambiances && state.ambiances.items) || []).map((item) => ({ key: item.id, source: 'manual', item }));
  (state.prepSessions || []).forEach((q) => (q.sessions || []).forEach((s) => (s.ambiances || []).forEach((item) => {
    out.push({
      key: item.id, source: 'session', item, queteId: q.id, sessionId: s.id,
      where: (q.name || 'Sans nom') + ' › ' + (s.title || 'Sans titre')
    });
  })));
  return out;
}
