import { lsGet, lsSet } from './util.js';

const SCALE_KEY = 'ccm.uiScale';

/* Propre à ce navigateur/compte (localStorage) : n'affecte pas l'autre MJ.
   `zoom` (et non font-size sur :root) car la plupart des tailles du site
   sont en px — zoom grossit tout (police, inputs, espacements) sans
   réécrire chaque règle en rem. */
export const UI_SCALES = [
  { id: 'normal', label: 'Normal', value: 1 },
  { id: 'grand', label: 'Grand', value: 1.15 },
  { id: 'tresgrand', label: 'Très grand', value: 1.3 }
];

export function getUiScale() {
  const id = lsGet(SCALE_KEY);
  return UI_SCALES.some((s) => s.id === id) ? id : 'normal';
}

export function setUiScale(id) { lsSet(SCALE_KEY, id); }

export function applyUiScale(id) {
  const found = UI_SCALES.find((s) => s.id === id) || UI_SCALES[0];
  if (typeof document !== 'undefined') document.documentElement.style.zoom = String(found.value);
}
