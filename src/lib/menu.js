import { uid } from './util.js';

/** Registre canonique des vues (hors Paramètres, qui reste un item fixe
 * hors arbre — jamais réordonnable/masquable, pour ne pas risquer de se
 * couper l'accès à cet écran lui-même). */
export const ALL_VIEWS = [
  ['liens', 'Liens'],
  ['journal', 'Journal de campagne'],
  ['consequences', 'Conséquences'],
  ['horloges', 'Horloges & fronts'],
  ['secrets', 'Secrets'],
  ['oublis', 'À ne pas oublier'],
  ['epreuves', 'Épreuves & infos'],
  ['personnages', 'Mes personnages'],
  ['personnages-joueurs', 'Personnages joueurs'],
  ['validations', 'Validations'],
  ['zones', 'Zone'],
  ['fichetechnique', 'Fiche Technique'],
  ['fichenarrative', 'Créateur de narration'],
  ['tableaux-perso', 'Mes tableaux'],
  ['tableaux-groupe', 'Tableaux de groupe'],
  ['tableaux-mj', 'Tableaux MJ'],
  ['xpcalibreur', "Calibreur d'XP"],
  ['equilibrage', 'Équilibrage DD'],
  ['prepsession', 'Prep Session'],
  ['backstage-mj', 'Backstage (MJ)']
];
export const VIEW_LABEL = Object.fromEntries(ALL_VIEWS);

export const ROLES = [['admin', 'Admin'], ['player', 'Joueur']];

/** Arbre par défaut : toutes les vues à plat, admin uniquement, sauf
 * « Mes personnages » (admin + joueur — c'est la fiche perso en libre-service,
 * pour son propre personnage, qu'on soit MJ ou joueur), pour reproduire
 * exactement le comportement d'avant cette fonctionnalité. */
export function defaultMenuTree() {
  return ALL_VIEWS.map(([key]) => ({
    id: uid(),
    type: 'view',
    viewKey: key,
    visibility: (key === 'personnages' || key === 'tableaux-perso' || key === 'tableaux-groupe') ? ['admin', 'player'] : ['admin']
  }));
}

function effectiveVisibility(node, ancestors) {
  for (const anc of ancestors) {
    if (anc.visibility && anc.visibility.length) return anc.visibility;
  }
  if (node.visibility && node.visibility.length) return node.visibility;
  return ['admin'];
}

/** Même logique d'héritage que la visibilité, mais pour le droit d'ÉDITER
 * le contenu d'une feuille (indépendant de qui peut la VOIR) — par défaut
 * admin seulement, même si le nœud est visible aux joueurs. */
function effectiveEditVisibility(node, ancestors) {
  for (const anc of ancestors) {
    if (anc.editVisibility && anc.editVisibility.length) return anc.editVisibility;
  }
  if (node.editVisibility && node.editVisibility.length) return node.editVisibility;
  return ['admin'];
}

/** Trouve une feuille par sa routeKey et la chaîne de ses ancêtres (pour
 * l'héritage de visibilité/édition) — parcourt l'arbre COMPLET (non élagué). */
export function findNodeAndAncestors(tree, routeKey) {
  function walk(nodes, ancestors) {
    for (const n of nodes || []) {
      if (isLeaf(n)) {
        if (routeKeyOf(n) === routeKey) return { node: n, ancestors };
      } else {
        const found = walk(n.children, [...ancestors, n]);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(tree, []);
}

/** Le rôle donné peut-il ÉDITER le contenu de la feuille visée par cette
 * routeKey ? Introuvable (vue statique hors arbre, ex. Paramètres) =
 * admin seulement. */
export function canEditRoute(tree, routeKey, role) {
  const found = findNodeAndAncestors(tree, routeKey);
  if (!found) return role === 'admin';
  return effectiveEditVisibility(found.node, found.ancestors).includes(role);
}

/** Tout nœud qui n'est pas un conteneur (catégorie/sous-catégorie) est une
 * feuille navigable — une vue statique (registre ALL_VIEWS) ou un document
 * dynamique (ex. une fiche technique précise). */
export function isLeaf(n) {
  return n.type !== 'category' && n.type !== 'subcategory';
}

/** Vrai si la vue active (`view`, une routeKey) se trouve quelque part sous
 * ce nœud — sert à déplier automatiquement la catégorie qui la contient. */
export function groupContainsView(node, view) {
  return (node.children || []).some((c) => (isLeaf(c) ? routeKeyOf(c) === view : groupContainsView(c, view)));
}

/** Clé de routage d'une feuille, utilisée comme `view` dans Dashboard :
 * la vue statique elle-même, ou `doc:<docKind>:<docId>` pour un document. */
export function routeKeyOf(n) {
  return n.type === 'view' ? n.viewKey : 'doc:' + n.docKind + ':' + n.docId;
}

/** Libellé affiché d'une feuille : registre statique pour une vue, nom du
 * document (résolu depuis `state`) pour un doc — « Sans nom » si introuvable
 * (document supprimé entre-temps, purgé au prochain normalize). */
export function labelForNode(n, state) {
  if (n.type === 'view') return VIEW_LABEL[n.viewKey] || n.viewKey;
  if (n.type === 'doc' && n.docKind === 'fichetechnique') {
    const f = (state && state.fichesTechniques || []).find((x) => x.id === n.docId);
    return (f && f.nom && f.nom.trim()) || 'Sans nom';
  }
  if (n.type === 'doc' && n.docKind === 'fichenarrative') {
    const f = (state && state.fichesNarratives || []).find((x) => x.id === n.docId);
    return (f && f.titre && f.titre.trim()) || 'Sans titre';
  }
  return n.name || 'Sans nom';
}

/** Élague l'arbre aux nœuds visibles pour ce rôle — une catégorie/sous-catégorie
 * vidée de tout enfant visible disparaît entièrement. */
export function pruneForRole(tree, role) {
  function walk(nodes, ancestors) {
    const out = [];
    for (const n of nodes || []) {
      if (isLeaf(n)) {
        if (effectiveVisibility(n, ancestors).includes(role)) out.push(n);
      } else {
        const kids = walk(n.children, [...ancestors, n]);
        if (kids.length) out.push({ ...n, children: kids });
      }
    }
    return out;
  }
  return walk(tree, []);
}

function firstLeafKey(nodes, onlyStaticViews) {
  for (const n of nodes || []) {
    if (isLeaf(n)) {
      if (!onlyStaticViews || n.type === 'view') return routeKeyOf(n);
    } else {
      const inner = firstLeafKey(n.children, onlyStaticViews);
      if (inner) return inner;
    }
  }
  return null;
}

/** Vue de secours quand la vue courante est invalide/absente (ex. après
 * fermeture d'un document, connexion). Préfère une vue statique ('view') à
 * un document ('doc') : un doc s'ouvre en plein écran par-dessus tout, donc
 * s'il devenait la vue de secours, fermer le document rechargerait
 * aussitôt ce même document (repli sur firstViewKey) — un piège dont on ne
 * peut plus sortir. Ne retombe sur un doc que si l'arbre n'a aucune vue
 * statique du tout. */
export function firstViewKey(tree) {
  return firstLeafKey(tree, true) || firstLeafKey(tree, false);
}

export function treeHasView(tree, key) {
  return (tree || []).some((n) => (isLeaf(n) ? routeKeyOf(n) === key : treeHasView(n.children, key)));
}

export function usedViewKeys(tree) {
  const set = new Set();
  (function walk(nodes) {
    (nodes || []).forEach((n) => { if (n.type === 'view') set.add(n.viewKey); else walk(n.children); });
  })(tree);
  return set;
}

/** Ids de documents d'un `docKind` donné déjà présents quelque part dans
 * l'arbre (utilisé pour n'ajouter que les documents manquants). */
export function usedDocIds(tree, docKind) {
  const set = new Set();
  (function walk(nodes) {
    (nodes || []).forEach((n) => {
      if (n.type === 'doc' && n.docKind === docKind) set.add(n.docId);
      else walk(n.children);
    });
  })(tree);
  return set;
}

/** Retire les nœuds `doc` d'un `docKind` donné dont l'id ne correspond plus à
 * un document existant (document supprimé côté source). */
export function pruneMissingDocs(tree, docKind, validIds) {
  function walk(nodes) {
    const out = [];
    for (const n of nodes || []) {
      if (n.type === 'doc' && n.docKind === docKind) {
        if (validIds.has(n.docId)) out.push(n);
        continue;
      }
      out.push(n.children ? { ...n, children: walk(n.children) } : n);
    }
    return out;
  }
  return walk(tree);
}

/* --- transformations pures de l'arbre (utilisées par l'éditeur Ordre menu) --- */

function findAndRemove(nodes, id) {
  let removed = null;
  const out = [];
  for (const n of nodes) {
    if (n.id === id) { removed = n; continue; }
    if (n.children) {
      const [r, kids] = findAndRemove(n.children, id);
      if (r) { removed = r; out.push({ ...n, children: kids }); continue; }
    }
    out.push(n);
  }
  return [removed, out];
}

function updateContainerChildren(nodes, containerId, updater) {
  if (!containerId) return updater(nodes);
  return nodes.map((n) => {
    if (n.id === containerId) return { ...n, children: updater(n.children || []) };
    if (n.children) return { ...n, children: updateContainerChildren(n.children, containerId, updater) };
    return n;
  });
}

export function moveViewToContainer(tree, viewId, containerId) {
  const [node, without] = findAndRemove(tree, viewId);
  if (!node) return tree;
  return updateContainerChildren(without, containerId || null, (kids) => [...kids, node]);
}

function findContainerAndIndex(nodes, id, containerId) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return { containerId, index: i };
    if (nodes[i].children) {
      const found = findContainerAndIndex(nodes[i].children, id, nodes[i].id);
      if (found) return found;
    }
  }
  return null;
}

/** Déplace un nœud (vue OU catégorie/sous-catégorie) à un index précis dans
 * un conteneur donné (null = racine) — utilisé par le glisser-déposer.
 * `index` est calculé par l'appelant contre l'arbre AVANT retrait du nœud
 * déplacé ; si le nœud reste dans le même conteneur et se déplace vers
 * l'avant, on corrige le décalage d'un cran causé par son propre retrait. */
export function moveNodeToPosition(tree, nodeId, containerId, index) {
  if (nodeId === containerId) return tree; // un nœud ne peut pas se contenir lui-même
  const origin = findContainerAndIndex(tree, nodeId, null);
  const [node, without] = findAndRemove(tree, nodeId);
  if (!node) return tree;
  let targetIndex = index;
  if (origin && origin.containerId === (containerId || null) && origin.index < index) {
    targetIndex -= 1;
  }
  return updateContainerChildren(without, containerId || null, (kids) => {
    const arr = kids.slice();
    arr.splice(Math.max(0, Math.min(targetIndex, arr.length)), 0, node);
    return arr;
  });
}

export function addCategory(tree, name) {
  return [...tree, { id: uid(), type: 'category', name, visibility: null, children: [] }];
}

export function addSubcategory(tree, categoryId, name) {
  return tree.map((n) => {
    if (n.id === categoryId && n.type === 'category') {
      return { ...n, children: [...(n.children || []), { id: uid(), type: 'subcategory', name, visibility: null, children: [] }] };
    }
    if (n.children) return { ...n, children: addSubcategory(n.children, categoryId, name) };
    return n;
  });
}

export function renameNode(tree, id, name) {
  return tree.map((n) => {
    if (n.id === id) return { ...n, name };
    if (n.children) return { ...n, children: renameNode(n.children, id, name) };
    return n;
  });
}

export function setNodeVisibility(tree, id, roles) {
  return tree.map((n) => {
    if (n.id === id) return { ...n, visibility: roles && roles.length ? roles : null };
    if (n.children) return { ...n, children: setNodeVisibility(n.children, id, roles) };
    return n;
  });
}

export function setNodeEditVisibility(tree, id, roles) {
  return tree.map((n) => {
    if (n.id === id) return { ...n, editVisibility: roles && roles.length ? roles : null };
    if (n.children) return { ...n, children: setNodeEditVisibility(n.children, id, roles) };
    return n;
  });
}

/** Supprime une catégorie/sous-catégorie : ses enfants remontent au niveau
 * juste au-dessus au lieu d'être perdus (jamais de suppression de vue). */
export function removeNode(tree, id) {
  function flattenChildren(nodes) {
    const out = [];
    for (const n of nodes || []) {
      if (n.type === 'category' || n.type === 'subcategory') out.push(...flattenChildren(n.children));
      else out.push(n);
    }
    return out;
  }
  function walk(nodes) {
    const out = [];
    for (const n of nodes) {
      if (n.id === id) { out.push(...flattenChildren(n.children)); continue; }
      if (n.children) out.push({ ...n, children: walk(n.children) });
      else out.push(n);
    }
    return out;
  }
  return walk(tree);
}

export function moveSibling(tree, id, dir) {
  function walk(nodes) {
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx >= 0) {
      const j = idx + dir;
      if (j < 0 || j >= nodes.length) return nodes;
      const copy = nodes.slice();
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    }
    return nodes.map((n) => (n.children ? { ...n, children: walk(n.children) } : n));
  }
  return walk(tree);
}

/** [{id,label}] pour le sélecteur "ranger dans" — catégories + sous-catégories. */
export function listContainers(tree) {
  const out = [];
  (tree || []).forEach((n) => {
    if (n.type === 'category') {
      out.push({ id: n.id, label: n.name || 'Sans nom' });
      (n.children || []).forEach((c) => {
        if (c.type === 'subcategory') out.push({ id: c.id, label: (n.name || 'Sans nom') + ' › ' + (c.name || 'Sans nom') });
      });
    }
  });
  return out;
}
