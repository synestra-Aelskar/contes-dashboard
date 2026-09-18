/* ================= Calendrier d'Aelskar =================
   Jour -> Cycle -> Saison -> Année. 6 x 6 x 6 = 216 jours/an.
   Source unique de vérité pour toutes les dates de l'appli
   (sauf la date réelle de séance, qui reste en notation IRL). */

export const AEL = {
  DAY:    ['Kora', 'Lume', 'Aure', 'Vire', 'Ashen', 'Veil'],
  CYCLE:  ['Feu', 'Eau', 'Terre', 'Air', 'Esprit', 'Décrépitude'],
  SEASON: ['Désordre', 'Lumière', 'Vie', 'Ordre', 'Ombre', 'Mort'],
  DAY_OF:    ['de Kora', 'de Lume', 'd’Aure', 'de Vire', 'd’Ashen', 'de Veil'],
  CYCLE_OF:  ['de Feu', 'd’Eau', 'de Terre', 'd’Air', 'd’Esprit', 'de Décrépitude'],
  SEASON_OF: ['du Désordre', 'de la Lumière', 'de la Vie', 'de l’Ordre', 'de l’Ombre', 'de la Mort'],
  KHESTIL: ['Noir', 'Blanc', 'Gris', 'Blanc', 'Noir', 'Gris'],
  ERAS: [
    { name: 'Ère des temps perdus',     start: 0 },
    { name: 'Ère des premiers hommes',  start: 1973 },
    { name: 'Ère des temps d’échanges', start: 2128 },
    { name: 'Ère de la grande guerre',  start: 2916 },
    { name: 'Ère moderne',              start: 3518 }
  ]
};

// Ancre fixe : 10 septembre 2026 (réel) = An 5984, Jour de Veil / Cycle de Terre / Saison de l'Ombre (6.3/5).
// NE JAMAIS modifier : le calendrier progresse ensuite tout seul (1 jour réel = 1 jour d'Aelskar).
const AEL_ANCHOR_UTC = Date.UTC(2026, 8, 10);
const AEL_ANCHOR_ABS = aelToAbs({ year: 5984, season: 5, cycle: 3, day: 6 });

export function aelToAbs(d) {
  return ((d.year * 6 + (d.season - 1)) * 6 + (d.cycle - 1)) * 6 + (d.day - 1);
}
export function aelFromAbs(n) {
  n = Math.round(n);
  const mod = (x) => ((x % 6) + 6) % 6;
  const day = mod(n); n = Math.floor(n / 6);
  const cycle = mod(n); n = Math.floor(n / 6);
  const season = mod(n); n = Math.floor(n / 6);
  return { year: n, season: season + 1, cycle: cycle + 1, day: day + 1 };
}
export function aelToday() {
  const t = new Date();
  const todayUTC = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return aelFromAbs(AEL_ANCHOR_ABS + Math.round((todayUTC - AEL_ANCHOR_UTC) / 86400000));
}
export function aelShift(d, n) { return aelFromAbs(aelToAbs(d) + n); }
export function aelCompare(a, b) { return aelToAbs(a) - aelToAbs(b); }
export function aelValid(d) {
  return !!d && typeof d.year === 'number' && d.year >= 0 &&
    d.season >= 1 && d.season <= 6 && d.cycle >= 1 && d.cycle <= 6 && d.day >= 1 && d.day <= 6;
}
export function aelKhestil(y) { return AEL.KHESTIL[(((y - 1) % 6) + 6) % 6]; }
export function aelEra(y) {
  let e = AEL.ERAS[0];
  for (let i = 0; i < AEL.ERAS.length; i++) if (y >= AEL.ERAS[i].start) e = AEL.ERAS[i];
  return e;
}
export function aelEraIndex(y) {
  let idx = 0;
  for (let i = 0; i < AEL.ERAS.length; i++) if (y >= AEL.ERAS[i].start) idx = i;
  return idx + 1;
}
export function aelYearInEra(y) { return y - aelEra(y).start + 1; }
export function aelOrdinal(n) { return n === 1 ? '1ʳᵉ' : n + 'ᵉ'; }
export function aelDayCycle(d) {
  return 'Jour ' + AEL.DAY_OF[d.day - 1] + ' du Cycle ' + AEL.CYCLE_OF[d.cycle - 1];
}
export function aelSeasonLine(d) {
  return 'Saison ' + AEL.SEASON_OF[d.season - 1];
}
export function aelTextLine1(d) {
  return aelDayCycle(d) + ' / ' + aelSeasonLine(d);
}
export function aelTextLine2(d) {
  return 'An ' + d.year + ' · Khestil ' + aelKhestil(d.year) + ' · ' + aelEra(d.year).name;
}
export function aelNumeric(d) {
  return aelKhestil(d.year) + '-' + aelEraIndex(d.year) + '.' + aelYearInEra(d.year) +
    ' - ' + d.day + '.' + d.cycle + '/' + d.season;
}
