import { aelValid, aelToday } from './aelskar.js';

/** Date « présente » de la campagne (celle du sélecteur en haut à droite). */
export function campaignDate(state) {
  return aelValid(state && state.aelPin) ? state.aelPin : aelToday();
}

/** Date en jeu de la séance la plus récente qui en a une (sinon : temps réel). */
export function lastSessionAel(state) {
  const ss = (state && state.sessions) || [];
  for (let i = ss.length - 1; i >= 0; i--) if (aelValid(ss[i].aelDate)) return ss[i].aelDate;
  return aelToday();
}
