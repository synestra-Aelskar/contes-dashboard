/* ================= Calendrier du Val'Razkah =================
   Année (Vohlenn'Dreth) -> Saison -> Cycle -> Jour.
   12 Saisons (les 6 divins, 2 passages) x 4 Cycles x 8 Jours = 384 jours
   + 8 Jours de Nocturne hors-Saison en fin d'année = 392 jours.
   Module pur : la date de campagne partagée reste celle d'Aelskar
   (state.aelPin) ; celle du Val'Razkah s'en déduit par un décalage fixe
   (VR_LINK), 1 jour d'Aelskar = 1 jour du Val'Razkah. */

import { aelToAbs, aelFromAbs, aelValid } from './aelskar.js';

export const VR = {
  GODS: ['Lorah', 'Borth', 'X\'Tarl', 'Jenner', 'Zeaoriah', 'Tiraes'],
  // 4 Cycles par divin, dans l'ordre. Le Passage II reprend les mêmes noms.
  CYCLES: [
    ['Aenra', 'Brelohn', 'Fehna', 'Vohlenn'],
    ['Dath', 'Ner\'Kaet', 'Borthan', 'Teshvar'],
    ['Takarh', 'Menrakh', 'Dareth', 'Vahkra'],
    ['Prata', 'Jotgâth', 'Rotornh', 'Fit'],
    ['Vael', 'Veth', 'Farn', 'Belkomto'],
    ['Dreth', 'Jowra', 'Rënth', 'Whikl']
  ],
  // Ère en cours. Son année de départ (absolue) est réglable : voir vrEraStart.
  ERA: 'Ère des Drak\'Kra',
  DAY: ['Baggah\'Dai', 'Tok\'Dai', 'Hant\'Dai', 'Fit\'Dai', 'Thëan\'Dai', 'Zethal\'Dai', 'Songong\'Dai', 'Dros\'Dai']
};

export const VR_SEASONS = 12;
export const VR_NOCTURNE = 13;       // « saison » factice : le bloc de Jours de Nocturne
const REGULAR_DAYS = 12 * 4 * 8;     // 384
export const VR_YEAR_DAYS = REGULAR_DAYS + 8; // 392

// Ancre par défaut, tant que le MJ n'a rien réglé : ce jour d'Aelskar
// correspond à ce jour du Val'Razkah (valeurs provisoires).
export const VR_LINK = {
  ael: { year: 5984, season: 5, cycle: 3, day: 6 },
  vr:  { year: 1000, season: 1, cycle: 1, day: 1 }
};

export function vrToAbs(d) {
  const idx = d.season === VR_NOCTURNE
    ? REGULAR_DAYS + (d.day - 1)
    : ((d.season - 1) * 4 + (d.cycle - 1)) * 8 + (d.day - 1);
  return d.year * VR_YEAR_DAYS + idx;
}
export function vrFromAbs(n) {
  n = Math.round(n);
  const year = Math.floor(n / VR_YEAR_DAYS);
  const idx = n - year * VR_YEAR_DAYS;
  if (idx >= REGULAR_DAYS) return { year, season: VR_NOCTURNE, cycle: 1, day: idx - REGULAR_DAYS + 1 };
  return {
    year,
    season: Math.floor(idx / 32) + 1,
    cycle: Math.floor((idx % 32) / 8) + 1,
    day: (idx % 8) + 1
  };
}
export function vrShift(d, n) { return vrFromAbs(vrToAbs(d) + n); }
export function vrValid(d) {
  if (!d || typeof d.year !== 'number') return false;
  if (d.season === VR_NOCTURNE) return d.cycle === 1 && d.day >= 1 && d.day <= 8;
  return d.season >= 1 && d.season <= VR_SEASONS && d.cycle >= 1 && d.cycle <= 4 && d.day >= 1 && d.day <= 8;
}

/* --- Conversion avec Aelskar ---
   `link` = { ael, vr } : deux dates qui désignent le même jour. Par défaut
   VR_LINK ; la vraie ancre vit dans state.vrLink (réglable dans le sélecteur
   de date > Synchroniser), lue via vrLinkOf(state). `eraStart` (optionnel) =
   année absolue où commence l'Ère en cours ; à défaut, l'année de l'ancre :
   on est alors dans la 1ʳᵉ année de l'ère. */
export function vrLinkOf(state) {
  const l = state && state.vrLink;
  return l && aelValid(l.ael) && vrValid(l.vr) ? l : VR_LINK;
}
const delta = (link) => vrToAbs(link.vr) - aelToAbs(link.ael);
export function vrFromAel(a, link = VR_LINK) { return vrFromAbs(aelToAbs(a) + delta(link)); }
export function aelFromVr(v, link = VR_LINK) { return aelFromAbs(vrToAbs(v) - delta(link)); }

/* --- Textes --- */
const VOWEL = /^[AEIOUYÂÊÎÔÛÉÈËÏ]/i;
const de = (name) => (VOWEL.test(name) ? 'd’' : 'de ') + name;

export function vrGod(season) { return season === VR_NOCTURNE ? null : VR.GODS[(season - 1) % 6]; }
export function vrCycleNames(season) { return VR.CYCLES[(Math.max(1, season) - 1) % 6]; }
export function vrPassage(season) { return season <= 6 ? 'I' : 'II'; }

export function vrDayCycle(d) {
  const day = VR.DAY[d.day - 1];
  if (d.season === VR_NOCTURNE) return day + ' des Jours de Nocturne';
  return day + ' du Cycle ' + de(vrCycleNames(d.season)[d.cycle - 1]);
}
export function vrSeasonLine(d) {
  return d.season === VR_NOCTURNE ? 'hors-Saison' : 'Saison ' + de(vrGod(d.season));
}
export function vrEraStart(link) {
  return link && Number.isFinite(link.eraStart) ? link.eraStart : (link || VR_LINK).vr.year;
}
export function vrYearInEra(y, eraStart) { return y - eraStart + 1; }
export function vrEraLabel(y, eraStart) {
  return y >= eraStart ? VR.ERA : 'avant l’' + VR.ERA;
}
export function vrTextLine2(d, eraStart) {
  return 'An ' + d.year + ' · ' + vrEraLabel(d.year, eraStart) +
    (d.season === VR_NOCTURNE ? ' · Fin d’année' : ' · Passage ' + vrPassage(d.season));
}
export function vrNumeric(d) {
  return 'An ' + d.year + ' - ' +
    (d.season === VR_NOCTURNE ? 'N.' + d.day : d.day + '.' + d.cycle + '/' + d.season);
}
