export const BUDGET_BRANCHES = ['trame', 'secondaire', 'exploration', 'combat'];
export const BRANCH_ORDER = ['trame', 'secondaire', 'exploration', 'combat', 'speciale'];

export const XP_DEFAULT_STATE = {
  total: 6809,
  levels: 25,
  exponent: 1,
  total50: 27803,
  profiles: [
    { name: 'Modéré', xp: 10 },
    { name: 'Actif', xp: 17 },
    { name: 'Intense', xp: 25 }
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
  if (typeof parsed.total === 'number') merged.total = parsed.total;
  if (typeof parsed.levels === 'number') merged.levels = parsed.levels;
  if (typeof parsed.exponent === 'number') merged.exponent = parsed.exponent;
  if (typeof parsed.total50 === 'number') merged.total50 = parsed.total50;
  if (Array.isArray(parsed.profiles) && parsed.profiles.length) merged.profiles = parsed.profiles;
  if (parsed.combat) merged.combat = Object.assign({}, merged.combat, parsed.combat);
  if (parsed.bareme) {
    BRANCH_ORDER.forEach((k) => {
      if (Array.isArray(parsed.bareme[k]) && parsed.bareme[k].length) merged.bareme[k] = parsed.bareme[k];
    });
  }
  return merged;
}
