/* Compendium — graphe des liens : choix des nœuds et disposition « à ressorts »
 * (répulsion entre tous les nœuds, attraction le long des liens, léger rappel
 * vers le centre). Pur et déterministe : mêmes notes, même dessin. */

/** Voisinage d'une note (profondeur 1 ou 2) ou graphe complet (limité aux
 * notes les mieux reliées). Rend { nodes:[{id,title,deg,depth}], edges:[[a,b]] }. */
export function graphData(index, { center = null, depth = 2, max = 120 } = {}) {
  const adj = new Map();
  const link = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
  for (const n of index.notes) {
    for (const t of index.outgoing(n.path)) { link(n.path, t); link(t, n.path); }
  }
  const deg = (p) => (adj.get(p) ? adj.get(p).size : 0);
  let ids;
  const depthOf = new Map();
  if (center && index.byPath.has(center)) {
    depthOf.set(center, 0);
    let frontier = [center];
    for (let d = 1; d <= depth; d++) {
      const next = [];
      for (const p of frontier) {
        const around = [...(adj.get(p) || [])].sort((a, b) => deg(b) - deg(a));
        for (const q of around) { if (!depthOf.has(q) && depthOf.size < max) { depthOf.set(q, d); next.push(q); } }
      }
      frontier = next;
    }
    ids = [...depthOf.keys()];
  } else {
    ids = index.notes.map((n) => n.path).filter((p) => deg(p) > 0).sort((a, b) => deg(b) - deg(a)).slice(0, max);
  }
  const set = new Set(ids);
  const edges = [];
  for (const a of ids) for (const b of adj.get(a) || []) if (a < b && set.has(b)) edges.push([a, b]);
  const nodes = ids.map((id) => ({ id, title: index.byPath.get(id).title, deg: deg(id), depth: depthOf.has(id) ? depthOf.get(id) : 1 }));
  return { nodes, edges };
}

/** Place les nœuds dans [0,W]×[0,H]. Modifie et rend `nodes` avec x, y. */
export function layoutGraph(nodes, edges, W = 800, H = 600, iterations = 220) {
  const n = nodes.length;
  if (!n) return nodes;
  const pos = new Map();
  nodes.forEach((nd, i) => {
    const a = (i / n) * Math.PI * 2;
    const r = nd.depth === 0 ? 0 : 60 + 90 * nd.depth + (i % 7) * 6;
    nd.x = W / 2 + Math.cos(a) * r; nd.y = H / 2 + Math.sin(a) * r;
    pos.set(nd.id, nd);
  });
  const idx = edges.map(([a, b]) => [pos.get(a), pos.get(b)]);
  const k = Math.sqrt((W * H) / n) * 0.62;
  for (let it = 0; it < iterations; it++) {
    const t = 1 - it / iterations; // « température » qui refroidit
    for (const nd of nodes) { nd.dx = 0; nd.dy = 0; }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i]; const b = nodes[j];
        let dx = a.x - b.x; let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = (i - j) * 0.1; dy = 0.1; d2 = dx * dx + dy * dy; }
        const d = Math.sqrt(d2);
        const f = (k * k) / d;
        const fx = (dx / d) * f; const fy = (dy / d) * f;
        a.dx += fx; a.dy += fy; b.dx -= fx; b.dy -= fy;
      }
    }
    for (const [a, b] of idx) {
      const dx = a.x - b.x; const dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d * d) / k;
      const fx = (dx / d) * f; const fy = (dy / d) * f;
      a.dx -= fx; a.dy -= fy; b.dx += fx; b.dy += fy;
    }
    for (const nd of nodes) {
      nd.dx += (W / 2 - nd.x) * 0.04; nd.dy += (H / 2 - nd.y) * 0.04;
      const len = Math.sqrt(nd.dx * nd.dx + nd.dy * nd.dy) || 0.01;
      const step = Math.min(len, 40 * t + 1);
      nd.x += (nd.dx / len) * step; nd.y += (nd.dy / len) * step;
      nd.x = Math.max(30, Math.min(W - 30, nd.x)); nd.y = Math.max(30, Math.min(H - 30, nd.y));
    }
  }
  return nodes;
}

/** Teinte stable d'un nom de dossier (une couleur par grand dossier). */
export function hueOf(name) {
  let h = 0;
  for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
