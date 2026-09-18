export const BUDGET_BRANCHES = ['trame', 'secondaire', 'exploration', 'combat'];
export const BRANCH_ORDER = ['trame', 'secondaire', 'exploration', 'combat', 'speciale'];

export const XP_DEFAULT_STATE = {
  // Le calibreur part des DURÉES cibles, pas d'un budget d'XP : le budget
  // total est un résultat du calcul, pas une entrée. Voir
  // computeCampaignCurve dans XpCalibreur.jsx pour le détail des formules
  // (w(n), coefficient K calibré sur la première période, etc.).
  startLevel: 5,
  levels: 25, // niveau maximal
  exponent: 1, // forme de croissance : w(n) = n^exponent
  sessionsPerYear: 48,
  refXpPerSession: 250, // XP moyenne/session pendant la première période (calibrage)
  // Jalons : chacun fixe un niveau cible et le nombre de SESSIONS CUMULÉES
  // depuis le niveau de départ pour l'atteindre. Le dernier jalon est
  // toujours forcé sur le niveau maximal (invariant garanti dans l'UI).
  jalons: [
    { targetLevel: 15, cumSessions: 48 },
    { targetLevel: 25, cumSessions: 96 }
  ],
  // Suivi réel optionnel (section 6) : comparer, à nombre de sessions égal,
  // l'XP réellement gagnée à l'XP attendue selon le calibrage ci-dessus.
  tracking: { sessionsSoFar: 0, xpSoFar: 0 },
  // Profils de SIMULATION (pas de calibrage) : rythmes plus lents/rapides que
  // la référence, comparés aux mêmes seuils déjà calculés, sans jamais
  // recalibrer la courbe.
  profiles: [
    { name: 'Rythme prudent', xp: 180 },
    { name: 'Rythme soutenu', xp: 320 }
  ],
  combat: { E: 2, base: 2, exp: 2, mode: 'solo' },
  bareme: {
    trame: [
      { name: 'Avancée mineure de trame', xp: 5 },
      { name: 'Jalon narratif majeur', xp: 12 }
    ],
    secondaire: [
      { name: 'Objectif secondaire mineur', xp: 3 },
      { name: 'Quête secondaire complète', xp: 8 }
    ],
    exploration: [
      { name: 'Petit indice / contribution mineure', xp: 2 },
      { name: 'Énigme ou défi standard', xp: 5 }
    ],
    combat: [
      { name: 'Mob de niveau inférieur', xp: 1 },
      { name: 'Mob de niveau équivalent (solo)', xp: 2 },
      { name: 'Mob de niveau équivalent (groupe, par joueur)', xp: 1 },
      { name: 'Mob de niveau supérieur, écart 2 (solo)', xp: 6 }
    ],
    speciale: [
      { name: 'Survivre à une créature redoutable', xp: 15 },
      { name: 'Exploit mineur', xp: 8 }
    ]
  }
};

const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

/** Fusionne un objet partiel/legacy avec la forme par défaut (mêmes règles que l'ancien loadState). */
export function normalizeXpState(raw) {
  const merged = clone(XP_DEFAULT_STATE);
  const parsed = raw && typeof raw === 'object' ? raw : {};
  if (typeof parsed.startLevel === 'number') merged.startLevel = parsed.startLevel;
  if (typeof parsed.levels === 'number') merged.levels = parsed.levels;
  if (typeof parsed.exponent === 'number') merged.exponent = parsed.exponent;
  if (typeof parsed.sessionsPerYear === 'number') merged.sessionsPerYear = parsed.sessionsPerYear;
  if (typeof parsed.refXpPerSession === 'number') merged.refXpPerSession = parsed.refXpPerSession;
  if (Array.isArray(parsed.jalons) && parsed.jalons.length) merged.jalons = parsed.jalons;
  if (parsed.tracking) merged.tracking = Object.assign({}, merged.tracking, parsed.tracking);
  if (Array.isArray(parsed.profiles) && parsed.profiles.length) merged.profiles = parsed.profiles;
  if (parsed.combat) merged.combat = Object.assign({}, merged.combat, parsed.combat);
  if (parsed.bareme) {
    BRANCH_ORDER.forEach((k) => {
      if (Array.isArray(parsed.bareme[k]) && parsed.bareme[k].length) merged.bareme[k] = parsed.bareme[k];
    });
  }
  return merged;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Déplacé depuis XpCalibreur.jsx (et exporté) pour être réutilisable ailleurs
// (ex. niveau auto d'un personnage joueur à partir de son XP cumulée) —
// voir XpCalibreur.jsx pour le détail du modèle (w(n), coefficient K, etc.).
export function computeCampaignCurve(xp) {
  const startLevel = clamp(Math.round(Number(xp.startLevel) || 5), 1, 58);
  const maxLevel = clamp(Math.round(Number(xp.levels) || 25), startLevel + 1, 60);
  const exponent = clamp(Number(xp.exponent) || 1, 0.1, 4);
  const sessionsPerYear = Math.max(1, Number(xp.sessionsPerYear) || 48);
  const refRate = Math.max(0.01, Number(xp.refXpPerSession) || 250);

  const capLevel = Math.max(maxLevel, 50);
  const T = maxLevel - startLevel;
  const Tcap = capLevel - startLevel;

  const w = new Array(Tcap + 1).fill(0);
  for (let t = 1; t <= Tcap; t++) w[t] = Math.pow(startLevel + t - 1, exponent);
  const prefix = new Array(Tcap + 1).fill(0);
  for (let t = 1; t <= Tcap; t++) prefix[t] = prefix[t - 1] + w[t];

  const rawJalons = (xp.jalons && xp.jalons.length) ? xp.jalons : [{ targetLevel: maxLevel, cumSessions: sessionsPerYear }];
  const jalons = rawJalons.map((j) => ({
    targetLevel: clamp(Math.round(Number(j.targetLevel) || (startLevel + 1)), startLevel + 1, maxLevel),
    cumSessions: Math.max(0, Number(j.cumSessions) || 0)
  }));
  jalons.sort((a, b) => a.targetLevel - b.targetLevel);
  jalons[jalons.length - 1].targetLevel = maxLevel;

  const firstT = jalons[0].targetLevel - startLevel;
  const period1Sessions = Math.max(1, jalons[0].cumSessions || sessionsPerYear);
  const budgetReference = period1Sessions * refRate;
  const sumW1 = prefix[firstT] || 1;
  const K = budgetReference / sumW1;

  const cum = new Array(Tcap + 1).fill(0);
  for (let t = 1; t <= Tcap; t++) cum[t] = Math.round(K * prefix[t]);
  cum[firstT] = Math.round(budgetReference);

  const cost = new Array(Tcap + 1).fill(0);
  for (let t = 1; t <= Tcap; t++) cost[t] = Math.max(0, cum[t] - cum[t - 1]);

  let prevT = 0, prevSessions = 0;
  const periods = jalons.map((j, i) => {
    const tCur = j.targetLevel - startLevel;
    const sessions = Math.max(1, j.cumSessions - prevSessions);
    const budget = cum[tCur] - cum[prevT];
    const avgRate = budget / sessions;
    const multiplier = refRate > 0 ? avgRate / refRate : 0;
    const period = {
      idx: i, fromLevel: startLevel + prevT, toLevel: j.targetLevel,
      fromT: prevT, toT: tCur,
      fromSession: prevSessions, toSession: j.cumSessions,
      sessions, budget, avgRate, multiplier
    };
    prevT = tCur; prevSessions = j.cumSessions;
    return period;
  });

  const periodForT = new Array(Tcap + 1).fill(null);
  periods.forEach((p) => {
    for (let t = p.fromT + 1; t <= p.toT; t++) periodForT[t] = p;
  });

  return {
    startLevel, maxLevel, capLevel, T, Tcap, exponent, sessionsPerYear, refRate,
    jalons, periods, periodForT, K, cost, cum,
    total: cum[T],
    total50: capLevel > maxLevel ? cum[Tcap] : null
  };
}

/** Niveau atteint pour un total d'XP cumulée donné (le plus haut niveau dont
 * le coût cumulé ne dépasse pas l'XP fournie), borné à [startLevel, capLevel]. */
export function levelForXp(xpState, totalXp) {
  const curve = computeCampaignCurve(xpState);
  const xp = Math.max(0, Number(totalXp) || 0);
  let t = 0;
  for (let i = 1; i <= curve.Tcap; i++) {
    if (curve.cum[i] <= xp) t = i; else break;
  }
  return curve.startLevel + t;
}
