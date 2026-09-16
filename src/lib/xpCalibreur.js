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
