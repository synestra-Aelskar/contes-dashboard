import { uid } from './util.js';

export const BRANCH_LABELS = { trame: 'Trame', secondaire: 'Secondaire', exploration: 'Exploration', combat: 'Combat', speciale: 'Spéciale' };
export const BRANCH_ORDER = ['trame', 'secondaire', 'exploration', 'combat', 'speciale'];

export function makeQuete() {
  return { id: uid(), name: 'Nouvelle quête', sessions: [] };
}

export function makeSession(quete) {
  const n = (quete && Array.isArray(quete.sessions) ? quete.sessions.length : 0) + 1;
  return { id: uid(), title: 'Session ' + n, description: '', xpBlocks: [] };
}

export function makeXpBlock() {
  return { id: uid(), titre: '', description: '', branchKey: '', itemName: '', xpSnapshot: 0 };
}

/** Liste à plat toutes les catégories (types d'événement) du calculateur d'XP. */
export function allBaremeOptions(xpCalibreur) {
  const out = [];
  if (!xpCalibreur || !xpCalibreur.bareme) return out;
  BRANCH_ORDER.forEach((key) => {
    (xpCalibreur.bareme[key] || []).forEach((item) => {
      const xp = Number(item.xp) || 0;
      out.push({
        branchKey: key,
        itemName: item.name || 'Type',
        xp,
        label: (BRANCH_LABELS[key] || key) + ' — ' + (item.name || 'Type') + ' (' + xp + ' XP)'
      });
    });
  });
  return out;
}

/**
 * Valeur XP courante d'un bloc : relit le barème du calculateur d'XP par nom
 * (reste « vivante » si on retouche le barème plus tard) ; retombe sur la
 * dernière valeur connue si la catégorie a été renommée/supprimée depuis.
 */
export function resolveBlockXp(block, xpCalibreur) {
  if (!block || !block.branchKey) return Number(block && block.xpSnapshot) || 0;
  const items = xpCalibreur && xpCalibreur.bareme && xpCalibreur.bareme[block.branchKey];
  const found = Array.isArray(items) && items.find((i) => i.name === block.itemName);
  return found ? (Number(found.xp) || 0) : (Number(block.xpSnapshot) || 0);
}

export function sessionTotal(session, xpCalibreur) {
  return ((session && session.xpBlocks) || []).reduce((n, b) => n + resolveBlockXp(b, xpCalibreur), 0);
}
