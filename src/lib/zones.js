import { uid } from './util.js';

export const ZONE_KINDS = ['pays', 'region', 'zone', 'lieu'];
export const ZONE_LABELS = { pays: 'Pays', region: 'Région', zone: 'Zone', lieu: 'Lieu' };
const DEFAULT_NAME = { pays: 'Nouveau pays', region: 'Nouvelle région', zone: 'Nouvelle zone', lieu: 'Nouveau lieu' };

export function childKindOf(kind) {
  const i = ZONE_KINDS.indexOf(kind);
  return i >= 0 && i < ZONE_KINDS.length - 1 ? ZONE_KINDS[i + 1] : null;
}

export function makeZoneNode(kind) {
  return {
    id: uid(),
    kind,
    name: DEFAULT_NAME[kind] || 'Sans nom',
    description: '',
    meteo: '',
    auras: [],
    children: []
  };
}

/** Chemin racine -> nœud (tableau de nœuds) pour l'id donné, ou null. */
export function findZonePath(nodes, id, trail) {
  trail = trail || [];
  for (const n of nodes) {
    const next = trail.concat([n]);
    if (n.id === id) return next;
    const sub = findZonePath(n.children || [], id, next);
    if (sub) return sub;
  }
  return null;
}

/** Applique fn(node) sur le nœud d'id donné, où qu'il soit dans l'arbre. */
export function mutateZoneNode(nodes, id, fn) {
  for (const n of nodes) {
    if (n.id === id) { fn(n); return true; }
    if (n.children && mutateZoneNode(n.children, id, fn)) return true;
  }
  return false;
}

/** Retire le nœud d'id donné (et ses enfants) de l'arbre. */
export function removeZoneNode(nodes, id) {
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx >= 0) { nodes.splice(idx, 1); return true; }
  for (const n of nodes) {
    if (n.children && removeZoneNode(n.children, id)) return true;
  }
  return false;
}
