import { useMemo, useRef, useState } from 'react';
import { folderOf } from '../lib/wiki.js';
import { graphData, layoutGraph, hueOf } from '../lib/wikiGraph.js';

/* Graphe des liens du Compendium (SVG). Une couleur par grand dossier, la taille
 * suit le nombre de liens. Molette = zoom, glisser = déplacer, clic = ouvrir. */

const W = 800;
const H = 600;
const topFolder = (p) => folderOf(p).split('/')[0] || '(racine)';

export default function WikiGraph({ index, center, depth = 2, max = 120, compact = false, onOpen }) {
  const data = useMemo(() => {
    const g = graphData(index, { center, depth, max });
    layoutGraph(g.nodes, g.edges, W, H, compact ? 160 : 240);
    return g;
  }, [index, center, depth, max, compact]);
  const byId = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data]);
  const [view, setView] = useState({ x: 0, y: 0, w: W, h: H });
  const [hover, setHover] = useState(null);
  const drag = useRef(null);
  const svgRef = useRef(null);

  const near = useMemo(() => {
    if (!hover) return null;
    const s = new Set([hover]);
    data.edges.forEach(([a, b]) => { if (a === hover) s.add(b); if (b === hover) s.add(a); });
    return s;
  }, [hover, data]);

  function onWheel(e) {
    if (compact) return;
    e.preventDefault();
    const r = svgRef.current.getBoundingClientRect();
    const k = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const w = Math.max(120, Math.min(W * 3, view.w * k)); const h = w * (H / W);
    const px = (e.clientX - r.left) / r.width; const py = (e.clientY - r.top) / r.height;
    setView({ x: view.x + (view.w - w) * px, y: view.y + (view.h - h) * py, w, h });
  }
  function onDown(e) { if (compact || e.target.closest('.wiki-graph__node')) return; drag.current = { x: e.clientX, y: e.clientY, v: view }; }
  function onMove(e) {
    const d = drag.current; if (!d) return;
    const r = svgRef.current.getBoundingClientRect();
    setView({ ...d.v, x: d.v.x - ((e.clientX - d.x) / r.width) * d.v.w, y: d.v.y - ((e.clientY - d.y) / r.height) * d.v.h });
  }
  const onUp = () => { drag.current = null; };

  if (!data.nodes.length) return <p className="empty">Aucun lien à dessiner pour l’instant.</p>;
  const showAll = !compact && view.w < W * 0.7;

  return (
    <svg
      ref={svgRef} className={'wiki-graph' + (compact ? ' wiki-graph--compact' : '')}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} role="img" aria-label="Graphe des liens"
      onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
    >
      {data.edges.map(([a, b]) => {
        const p = byId.get(a); const q = byId.get(b);
        const on = hover && (a === hover || b === hover);
        return <line key={a + '|' + b} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className={'wiki-graph__edge' + (on ? ' is-on' : '') + (hover && !on ? ' is-dim' : '')} />;
      })}
      {data.nodes.map((n) => {
        const r = 5 + Math.min(11, Math.sqrt(n.deg) * 2.2);
        const isCenter = center === n.id;
        const dim = near && !near.has(n.id);
        const label = data.nodes.length <= 40 || isCenter || hover === n.id || (near && near.has(n.id)) || showAll || (!compact && n.deg >= 6) || (compact && n.depth <= 1);
        return (
          <g
            key={n.id} className={'wiki-graph__node' + (dim ? ' is-dim' : '') + (isCenter ? ' is-center' : '')} transform={`translate(${n.x},${n.y})`}
            onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
            onClick={() => onOpen(n.id)} tabIndex={0} role="link" aria-label={n.title}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpen(n.id); }}
          >
            <circle r={r} style={{ fill: `hsl(${hueOf(topFolder(n.id))} 45% ${isCenter ? 62 : 48}%)` }} />
            {label && <text y={r + 11} textAnchor="middle">{n.title}</text>}
            <title>{n.title + ' · ' + n.deg + ' lien' + (n.deg > 1 ? 's' : '')}</title>
          </g>
        );
      })}
    </svg>
  );
}
