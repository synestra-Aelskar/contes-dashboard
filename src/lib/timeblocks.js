import { uid } from './util.js';

export function makeTimeBlock() {
  return { id: uid(), name: '', typeId: '', h: 0, d: 0, w: 0 };
}

/** Durée réelle d'un bloc, en heures (1 jour = 24h, 1 semaine = 7 x 24h). */
export function blockHours(b) {
  return (Number(b && b.h) || 0) + (Number(b && b.d) || 0) * 24 + (Number(b && b.w) || 0) * 24 * 7;
}

export function blocksTotalHours(blocks) {
  return (blocks || []).reduce((n, b) => n + blockHours(b), 0);
}

/** "2 sem 3j 5h" — 0 si rien, n'affiche que les unités non nulles (heures toujours si tout le reste est nul). */
export function fmtDuration(hours) {
  const total = Math.round(Number(hours) || 0);
  if (total <= 0) return '0h';
  const weeks = Math.floor(total / (24 * 7));
  let rem = total % (24 * 7);
  const days = Math.floor(rem / 24);
  rem = rem % 24;
  const parts = [];
  if (weeks) parts.push(weeks + ' sem');
  if (days) parts.push(days + 'j');
  if (rem || !parts.length) parts.push(rem + 'h');
  return parts.join(' ');
}
