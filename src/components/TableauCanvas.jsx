import { useEffect, useMemo, useRef, useState } from 'react';
import { uid, lsGet, lsSet } from '../lib/util.js';
import { uploadScreenshot } from '../lib/board.js';
import { toast } from '../lib/toast.js';
import { useSyncedField } from '../lib/useSyncedField.js';

/**
 * Tableau blanc infini (façon Miro) : canvas pannable/zoomable, éléments
 * texte/note/forme/image/dessin libre, connexions qui suivent leurs
 * éléments, sélection multiple, verrouillage, ordre d'affichage.
 *
 * Choix d'implémentation, pour rester dans un temps raisonnable :
 * - Le déplacement/redimensionnement se fait en aperçu LOCAL (comme les
 *   champs à brouillon du reste du site) et n'écrit dans l'état partagé
 *   qu'au relâchement — sinon chaque pixel de glisser déclencherait une
 *   sauvegarde. La collaboration simultanée fonctionne déjà « gratuitement »
 *   via la synchronisation temps réel existante du tableau de bord (chacun
 *   voit les éléments des autres dès qu'ils relâchent leur glisser) ; il n'y
 *   a en revanche pas de curseur fantôme des autres participants.
 * - Le redimensionnement/la rotation ne sont pas combinés : les poignées de
 *   redimensionnement ignorent la rotation courante (cas rare en pratique,
 *   et évite une trigonométrie compliquée pour un gain marginal).
 * - Les connexions relient le centre des éléments (pas de calcul de bord).
 */

const COLORS = ['#e7c873', '#e69a6b', '#8fb99b', '#7fa8c9', '#b58fc0', '#e8e2d6'];
const MIN_SIZE = 40;

/** `tool` est l'outil choisi dans la barre (peut être 'rect'/'ellipse'/'draw'/…),
 * `kind` est la famille d'élément qui en découle ('shape' pour les deux formes). */
const emptyElement = (tool, x, y) => {
  const kind = tool === 'rect' || tool === 'ellipse' ? 'shape' : tool;
  return {
    id: uid(), kind, x, y,
    w: kind === 'note' ? 180 : kind === 'image' ? 280 : kind === 'text' ? 220 : 160,
    h: kind === 'note' ? 140 : kind === 'image' ? 180 : kind === 'text' ? 44 : 100,
    rot: 0, z: 0, locked: false, text: '', color: COLORS[0], url: '', shape: tool === 'ellipse' ? 'ellipse' : 'rect', points: []
  };
};

function nextZ(elements) {
  return elements.reduce((m, e) => Math.max(m, e.z), 0) + 1;
}
function minZ(elements) {
  return elements.reduce((m, e) => Math.min(m, e.z), 0) - 1;
}

/* ------------------------------- éléments -------------------------------- */

function ElementBox({ el, selected, onPointerDownMove, editing, onStartEdit, onStopEdit, onTextChange, children }) {
  return (
    <div
      id={'tb-el-' + el.id}
      onMouseDown={(e) => onPointerDownMove(e, el)}
      onDoubleClick={(e) => { e.stopPropagation(); if (el.kind === 'text' || el.kind === 'note') onStartEdit(el.id); }}
      style={{
        position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h,
        transform: `rotate(${el.rot || 0}deg)`, transformOrigin: '50% 50%',
        zIndex: el.z, cursor: el.locked ? 'default' : 'move',
        outline: selected ? '2px solid #c9a05a' : 'none', outlineOffset: 2,
        userSelect: 'none'
      }}
    >
      {children}
      {editing && (el.kind === 'text' || el.kind === 'note') && (
        <textarea
          autoFocus
          defaultValue={el.text}
          onBlur={(e) => { onTextChange(el.id, e.target.value); onStopEdit(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Escape') e.target.blur(); }}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', resize: 'none',
            background: 'transparent', border: 'none', outline: 'none', padding: el.kind === 'note' ? 12 : 4,
            font: 'inherit', color: 'inherit', fontFamily: "'Spectral', Georgia, serif", fontSize: 14, lineHeight: 1.4
          }}
        />
      )}
    </div>
  );
}

function ElementVisual({ el }) {
  if (el.kind === 'note') {
    return (
      <div style={{ width: '100%', height: '100%', background: el.color || COLORS[0], color: '#221c10', padding: 12, borderRadius: 3, boxShadow: '0 6px 18px rgba(0,0,0,.35)', fontFamily: "'Spectral', Georgia, serif", fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap', overflow: 'hidden' }}>
        {el.text}
      </div>
    );
  }
  if (el.kind === 'text') {
    return (
      <div style={{ width: '100%', height: '100%', color: '#e8e2d6', padding: 4, fontFamily: "'Spectral', Georgia, serif", fontSize: 16, lineHeight: 1.4, whiteSpace: 'pre-wrap', overflow: 'hidden' }}>
        {el.text || <span style={{ opacity: 0.4 }}>Texte…</span>}
      </div>
    );
  }
  if (el.kind === 'shape') {
    return el.shape === 'ellipse' ? (
      <div style={{ width: '100%', height: '100%', borderRadius: '50%', border: '2px solid ' + (el.color || COLORS[0]), background: (el.color || COLORS[0]) + '22' }} />
    ) : (
      <div style={{ width: '100%', height: '100%', border: '2px solid ' + (el.color || COLORS[0]), background: (el.color || COLORS[0]) + '22', borderRadius: 3 }} />
    );
  }
  if (el.kind === 'image') {
    return el.url ? (
      <img src={el.url} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 3, display: 'block' }} />
    ) : (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(201,160,90,0.4)', borderRadius: 3, color: '#8c8375', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: '0.08em', textAlign: 'center', padding: 8 }}>
        IMAGE — colle un lien dans le panneau
      </div>
    );
  }
  if (el.kind === 'draw') {
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${Math.max(el.w, 1)} ${Math.max(el.h, 1)}`} style={{ display: 'block', overflow: 'visible' }}>
        <polyline points={(el.points || []).map((p) => p.join(',')).join(' ')} fill="none" stroke={el.color || COLORS[0]} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return null;
}

function Handles({ el, onResizeStart, onRotateStart }) {
  const corners = [['nw', 0, 0], ['ne', el.w, 0], ['sw', 0, el.h], ['se', el.w, el.h]];
  return (
    <>
      {corners.map(([pos, hx, hy]) => (
        <div
          key={pos}
          onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, el, pos); }}
          style={{
            position: 'absolute', left: hx - 5, top: hy - 5, width: 10, height: 10,
            background: '#c9a05a', border: '1px solid #14110d', borderRadius: 2,
            cursor: pos === 'nw' || pos === 'se' ? 'nwse-resize' : 'nesw-resize', zIndex: 2
          }}
        />
      ))}
      <div
        onMouseDown={(e) => { e.stopPropagation(); onRotateStart(e, el); }}
        style={{ position: 'absolute', left: el.w / 2 - 5, top: -26, width: 10, height: 10, borderRadius: '50%', background: '#c9a05a', border: '1px solid #14110d', cursor: 'grab', zIndex: 2 }}
      />
      <div style={{ position: 'absolute', left: el.w / 2, top: -20, width: 1, height: 20, background: 'rgba(201,160,90,0.6)' }} />
    </>
  );
}

/* ------------------------------- connexions ------------------------------ */

function ConnectionsSvg({ elements, connections, selectedConnId, onSelectConn }) {
  const byId = useMemo(() => Object.fromEntries(elements.map((e) => [e.id, e])), [elements]);
  return (
    <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} width={1} height={1}>
      <defs>
        <marker id="tb-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#c9a05a" />
        </marker>
      </defs>
      {connections.map((c) => {
        const a = byId[c.fromId], b = byId[c.toId];
        if (!a || !b) return null;
        const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
        return (
          <g key={c.id} style={{ pointerEvents: 'stroke' }}>
            <line x1={ax} y1={ay} x2={bx} y2={by} stroke="transparent" strokeWidth={16} onClick={() => onSelectConn(c.id)} style={{ cursor: 'pointer' }} />
            <line
              x1={ax} y1={ay} x2={bx} y2={by}
              stroke={selectedConnId === c.id ? '#e8c873' : '#9a7330'} strokeWidth={selectedConnId === c.id ? 3 : 2}
              markerEnd={c.kind === 'arrow' ? 'url(#tb-arrow)' : undefined}
            />
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */

const TOOLS = [
  ['select', '↖'], ['text', 'T'], ['note', '▤'], ['rect', '▭'], ['ellipse', '◯'], ['image', '🖼'], ['draw', '✎'], ['connect', '↗']
];

export default function TableauCanvas({ tableau, mutate, onBack, charId, charName }) {
  const [titre, setTitre, titreRef] = useSyncedField(tableau.titre);
  const [tool, setTool] = useState('select');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [selectedConnId, setSelectedConnId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [drawColor, setDrawColor] = useState(COLORS[0]);
  const [camera, setCamera] = useState(() => {
    try { return JSON.parse(lsGet('ccm.tabCam.' + tableau.id) || '') || { x: 200, y: 120, zoom: 1 }; }
    catch (_) { return { x: 200, y: 120, zoom: 1 }; }
  });
  const [preview, setPreview] = useState(null); // { [elId]: {x,y,w,h,rot} } pendant un glisser
  const [marquee, setMarquee] = useState(null); // {x0,y0,x1,y1} en coord monde
  const connectFromRef = useRef(null);
  const viewportRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => { lsSet('ccm.tabCam.' + tableau.id, JSON.stringify(camera)); }, [camera, tableau.id]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') { onBack(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [selectedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const elements = useMemo(() => (tableau.elements || []).map((e) => (preview && preview[e.id] ? { ...e, ...preview[e.id] } : e)), [tableau.elements, preview]);
  const connections = tableau.connections || [];

  const patchBoard = (fn) => mutate((s) => { const t = s.tableaux.find((x) => x.id === tableau.id); if (t) fn(t); });

  function toWorld(clientX, clientY) {
    const rect = viewportRef.current.getBoundingClientRect();
    return [(clientX - rect.left - camera.x) / camera.zoom, (clientY - rect.top - camera.y) / camera.zoom];
  }

  /* ---- création d'éléments ---- */
  function placeElement(placedTool, wx, wy) {
    const el = emptyElement(placedTool, wx - 80, wy - 50);
    el.z = nextZ(tableau.elements || []);
    if (el.kind === 'note') el.color = drawColor;
    patchBoard((t) => { t.elements.push(el); });
    setSelectedIds(new Set([el.id]));
    setTool('select');
    if (el.kind === 'text' || el.kind === 'note') setTimeout(() => setEditingId(el.id), 30);
  }

  /* ---- pan / zoom / marquee / draw sur le fond ---- */
  function onBackgroundMouseDown(e) {
    if (e.target !== e.currentTarget && e.target.id !== 'tb-world') return;
    const [wx, wy] = toWorld(e.clientX, e.clientY);

    if (tool === 'select') {
      if (!e.shiftKey) { setSelectedIds(new Set()); setSelectedConnId(null); }
      const start = { x: wx, y: wy };
      dragRef.current = { kind: 'marquee', start };
      setMarquee({ x0: wx, y0: wy, x1: wx, y1: wy });
      window.addEventListener('mousemove', onWindowMouseMove);
      window.addEventListener('mouseup', onWindowMouseUp);
      return;
    }
    if (['text', 'note', 'rect', 'ellipse', 'image'].includes(tool)) {
      placeElement(tool, wx, wy);
      return;
    }
    if (tool === 'draw') {
      const el = emptyElement('draw', wx, wy);
      el.z = nextZ(tableau.elements || []);
      el.color = drawColor;
      el.w = 1; el.h = 1; el.points = [[0, 0]];
      dragRef.current = { kind: 'draw', el, origin: { x: wx, y: wy } };
      setPreview({ [el.id]: el });
      setSelectedIds(new Set());
      window.addEventListener('mousemove', onWindowMouseMove);
      window.addEventListener('mouseup', onWindowMouseUp);
      return;
    }
    // pan (outil connect, ou clic milieu ailleurs)
    dragRef.current = { kind: 'pan', startClient: { x: e.clientX, y: e.clientY }, startCam: camera };
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
  }

  function onWindowMouseMove(e) {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === 'pan') {
      setCamera((c) => ({ ...c, x: d.startCam.x + (e.clientX - d.startClient.x), y: d.startCam.y + (e.clientY - d.startClient.y) }));
      return;
    }
    if (d.kind === 'marquee') {
      const [wx, wy] = toWorld(e.clientX, e.clientY);
      setMarquee({ x0: d.start.x, y0: d.start.y, x1: wx, y1: wy });
      return;
    }
    if (d.kind === 'draw') {
      const [wx, wy] = toWorld(e.clientX, e.clientY);
      const ox = d.origin.x, oy = d.origin.y;
      d.el.points.push([wx - ox, wy - oy]);
      const xs = d.el.points.map((p) => p[0]), ys = d.el.points.map((p) => p[1]);
      const minX = Math.min(0, ...xs), maxX = Math.max(0, ...xs), minY = Math.min(0, ...ys), maxY = Math.max(0, ...ys);
      const shifted = d.el.points.map((p) => [p[0] - minX, p[1] - minY]);
      setPreview({ [d.el.id]: { ...d.el, x: ox + minX, y: oy + minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY), points: shifted } });
      return;
    }
    if (d.kind === 'move') {
      const [wx, wy] = toWorld(e.clientX, e.clientY);
      const dx = wx - d.startWorld.x, dy = wy - d.startWorld.y;
      const next = {};
      d.ids.forEach((id) => { const o = d.origin[id]; next[id] = { x: o.x + dx, y: o.y + dy }; });
      setPreview(next);
      return;
    }
    if (d.kind === 'resize') {
      const [wx, wy] = toWorld(e.clientX, e.clientY);
      const dx = wx - d.startWorld.x, dy = wy - d.startWorld.y;
      const o = d.origin;
      let { x, y, w, h } = o;
      if (d.handle.includes('e')) w = Math.max(MIN_SIZE, o.w + dx);
      if (d.handle.includes('s')) h = Math.max(MIN_SIZE, o.h + dy);
      if (d.handle.includes('w')) { w = Math.max(MIN_SIZE, o.w - dx); x = o.x + (o.w - w); }
      if (d.handle.includes('n')) { h = Math.max(MIN_SIZE, o.h - dy); y = o.y + (o.h - h); }
      setPreview({ [d.id]: { x, y, w, h } });
      return;
    }
    if (d.kind === 'rotate') {
      const rect = viewportRef.current.getBoundingClientRect();
      const cx = rect.left + camera.x + (d.origin.x + d.origin.w / 2) * camera.zoom;
      const cy = rect.top + camera.y + (d.origin.y + d.origin.h / 2) * camera.zoom;
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90;
      setPreview({ [d.id]: { rot: Math.round(angle) } });
    }
  }

  function onWindowMouseUp() {
    const d = dragRef.current;
    dragRef.current = null;
    window.removeEventListener('mousemove', onWindowMouseMove);
    window.removeEventListener('mouseup', onWindowMouseUp);
    if (!d) return;

    if (d.kind === 'marquee') {
      setMarquee((m) => {
        if (m) {
          const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1), y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1);
          const hit = (tableau.elements || []).filter((e) => e.x < x1 && e.x + e.w > x0 && e.y < y1 && e.y + e.h > y0).map((e) => e.id);
          if (hit.length) setSelectedIds(new Set(hit));
        }
        return null;
      });
      return;
    }
    if (d.kind === 'draw') {
      const el = preview && preview[d.el.id];
      setPreview(null);
      if (el && el.points.length > 1) {
        patchBoard((t) => { t.elements.push({ ...emptyElement('draw', el.x, el.y), ...el }); });
      }
      setTool('select');
      return;
    }
    if (d.kind === 'move') {
      const snap = preview;
      setPreview(null);
      if (snap) {
        patchBoard((t) => {
          Object.entries(snap).forEach(([id, pos]) => {
            const e = t.elements.find((x) => x.id === id);
            if (e) { e.x = pos.x; e.y = pos.y; }
          });
        });
      }
      return;
    }
    if (d.kind === 'resize' || d.kind === 'rotate') {
      const snap = preview;
      setPreview(null);
      if (snap && snap[d.id]) {
        patchBoard((t) => {
          const e = t.elements.find((x) => x.id === d.id);
          if (e) Object.assign(e, snap[d.id]);
        });
      }
    }
  }

  /* ---- interactions élément ---- */
  function onElementMouseDown(e, el) {
    e.stopPropagation();
    if (tool === 'connect') {
      if (!connectFromRef.current) { connectFromRef.current = el.id; toast('Clique un second élément pour relier'); }
      else if (connectFromRef.current !== el.id) {
        const fromId = connectFromRef.current;
        connectFromRef.current = null;
        patchBoard((t) => { t.connections.push({ id: uid(), fromId, toId: el.id, kind: 'arrow' }); });
      }
      return;
    }
    if (tool !== 'select') return;
    if (editingId === el.id) return;
    const already = selectedIds.has(el.id);
    let ids;
    if (e.shiftKey) {
      ids = new Set(selectedIds);
      if (already) ids.delete(el.id); else ids.add(el.id);
    } else {
      ids = already && selectedIds.size > 1 ? selectedIds : new Set([el.id]);
    }
    setSelectedIds(ids);
    setSelectedConnId(null);
    if (el.locked) return;
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    const origin = {};
    ids.forEach((id) => { const src = (tableau.elements || []).find((x) => x.id === id); if (src) origin[id] = { x: src.x, y: src.y }; });
    dragRef.current = { kind: 'move', ids: Array.from(ids), startWorld: { x: wx, y: wy }, origin };
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
  }

  function onResizeStart(e, el, handle) {
    if (el.locked) return;
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    dragRef.current = { kind: 'resize', id: el.id, handle, startWorld: { x: wx, y: wy }, origin: { x: el.x, y: el.y, w: el.w, h: el.h } };
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
  }
  function onRotateStart(e, el) {
    if (el.locked) return;
    dragRef.current = { kind: 'rotate', id: el.id, origin: { x: el.x, y: el.y, w: el.w, h: el.h } };
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = viewportRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    setCamera((c) => {
      const nextZoom = Math.min(2.5, Math.max(0.2, c.zoom * (e.deltaY < 0 ? 1.08 : 0.92)));
      const wx = (mx - c.x) / c.zoom, wy = (my - c.y) / c.zoom;
      return { zoom: nextZoom, x: mx - wx * nextZoom, y: my - wy * nextZoom };
    });
  }

  /* ---- actions sur la sélection ---- */
  function removeSelected() {
    if (!selectedIds.size) return;
    patchBoard((t) => {
      t.elements = t.elements.filter((e) => !selectedIds.has(e.id));
      t.connections = t.connections.filter((c) => !selectedIds.has(c.fromId) && !selectedIds.has(c.toId));
    });
    setSelectedIds(new Set());
  }
  function duplicateSelected() {
    if (!selectedIds.size) return;
    const newIds = new Set();
    patchBoard((t) => {
      selectedIds.forEach((id) => {
        const src = t.elements.find((e) => e.id === id);
        if (!src) return;
        const copy = { ...src, id: uid(), x: src.x + 24, y: src.y + 24, z: nextZ(t.elements) };
        t.elements.push(copy);
        newIds.add(copy.id);
      });
    });
    setSelectedIds(newIds);
  }
  function toggleLockSelected() {
    patchBoard((t) => { t.elements.forEach((e) => { if (selectedIds.has(e.id)) e.locked = !e.locked; }); });
  }
  function orderSelected(dir) {
    patchBoard((t) => { t.elements.forEach((e) => { if (selectedIds.has(e.id)) e.z = dir === 'front' ? nextZ(t.elements) : minZ(t.elements); }); });
  }
  function setColorSelected(color) {
    setDrawColor(color);
    patchBoard((t) => { t.elements.forEach((e) => { if (selectedIds.has(e.id)) e.color = color; }); });
  }
  function setUrlSelected(url) {
    patchBoard((t) => { t.elements.forEach((e) => { if (selectedIds.has(e.id) && e.kind === 'image') e.url = url; }); });
  }
  function handleTextChange(id, text) {
    patchBoard((t) => { const e = t.elements.find((x) => x.id === id); if (e) e.text = text; });
  }
  async function handleImagePaste(ev) {
    const items = (ev.clipboardData && ev.clipboardData.items) || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image') === 0) {
        ev.preventDefault();
        try { const url = await uploadScreenshot(items[i].getAsFile()); setUrlSelected(url); }
        catch (_) { toast('Image illisible / envoi impossible'); }
        return;
      }
    }
  }

  const selectedEls = (tableau.elements || []).filter((e) => selectedIds.has(e.id));
  const single = selectedEls.length === 1 ? selectedEls[0] : null;
  const [urlDraft, setUrlDraft] = useState('');
  useEffect(() => { setUrlDraft(single && single.kind === 'image' ? single.url : ''); }, [single && single.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="tb-shell">
      <div className="tb-topbar">
        <button className="tbtn" type="button" onClick={onBack}>← Tableaux</button>
        <input
          ref={titreRef} className="finput tb-titleinput" type="text" placeholder="Titre du tableau"
          value={titre}
          onChange={(e) => { const v = e.target.value; setTitre(v); patchBoard((t) => { t.titre = v; }); }}
          onBlur={() => patchBoard((t) => { t.titre = titre.trim(); })}
        />
        <div className="tb-tools">
          {TOOLS.map(([key, glyph]) => (
            <button
              key={key} type="button" title={key}
              className={'tb-toolbtn' + (tool === key ? ' is-active' : '')}
              onClick={() => { setTool(key); connectFromRef.current = null; setSelectedIds(new Set()); }}
            >
              {glyph}
            </button>
          ))}
        </div>
        <div className="tb-zoom">
          <button className="tbtn" type="button" onClick={() => setCamera((c) => ({ ...c, zoom: Math.max(0.2, c.zoom * 0.85) }))}>−</button>
          <span className="chr__muted">{Math.round(camera.zoom * 100)}%</span>
          <button className="tbtn" type="button" onClick={() => setCamera((c) => ({ ...c, zoom: Math.min(2.5, c.zoom * 1.15) }))}>＋</button>
          <button className="tbtn" type="button" onClick={() => setCamera({ x: 200, y: 120, zoom: 1 })}>reset</button>
        </div>
      </div>

      <div
        ref={viewportRef} id="tb-viewport" className="tb-viewport"
        onMouseDown={onBackgroundMouseDown} onWheel={onWheel} onPaste={handleImagePaste}
      >
        <div id="tb-world" style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`, transformOrigin: '0 0' }}>
          <ConnectionsSvg elements={elements} connections={connections} selectedConnId={selectedConnId} onSelectConn={(id) => { setSelectedConnId(id); setSelectedIds(new Set()); }} />
          {elements.slice().sort((a, b) => a.z - b.z).map((el) => (
            <ElementBox
              key={el.id} el={el} selected={selectedIds.has(el.id)}
              onPointerDownMove={onElementMouseDown}
              editing={editingId === el.id}
              onStartEdit={setEditingId}
              onStopEdit={() => setEditingId(null)}
              onTextChange={handleTextChange}
            >
              <ElementVisual el={el} />
              {selectedIds.size === 1 && selectedIds.has(el.id) && !el.locked && (
                <Handles el={el} onResizeStart={onResizeStart} onRotateStart={onRotateStart} />
              )}
            </ElementBox>
          ))}
          {marquee && (
            <div style={{
              position: 'absolute', left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1),
              width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0),
              border: '1px dashed #c9a05a', background: 'rgba(201,160,90,0.08)'
            }}
            />
          )}
        </div>
      </div>

      {(selectedEls.length > 0 || selectedConnId) && (
        <div className="tb-inspector">
          {selectedConnId ? (
            <>
              <span className="chr__muted">Connexion</span>
              <button
                className="tbtn" type="button"
                onClick={() => patchBoard((t) => { const c = t.connections.find((x) => x.id === selectedConnId); if (c) c.kind = c.kind === 'arrow' ? 'line' : 'arrow'; })}
              >
                basculer flèche/ligne
              </button>
              <button className="tbtn" type="button" onClick={() => { patchBoard((t) => { t.connections = t.connections.filter((c) => c.id !== selectedConnId); }); setSelectedConnId(null); }}>
                supprimer
              </button>
            </>
          ) : (
            <>
              <span className="chr__muted">{selectedEls.length} sélectionné{selectedEls.length > 1 ? 's' : ''}</span>
              {selectedEls.some((e) => e.kind === 'note' || e.kind === 'shape' || e.kind === 'draw') && (
                <span className="tb-swatches">
                  {COLORS.map((c) => (
                    <button key={c} type="button" className="tb-swatch" style={{ background: c }} onClick={() => setColorSelected(c)} aria-label={'couleur ' + c} />
                  ))}
                </span>
              )}
              {single && single.kind === 'image' && (
                <input
                  className="field field--mono" type="text" placeholder="https://…" value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  onBlur={() => setUrlSelected(urlDraft.trim())}
                  style={{ width: 200 }}
                />
              )}
              <button className="tbtn" type="button" onClick={duplicateSelected}>dupliquer</button>
              <button className="tbtn" type="button" onClick={toggleLockSelected}>{selectedEls.every((e) => e.locked) ? 'déverrouiller' : 'verrouiller'}</button>
              <button className="tbtn" type="button" onClick={() => orderSelected('front')}>premier plan</button>
              <button className="tbtn" type="button" onClick={() => orderSelected('back')}>arrière-plan</button>
              <button className="tbtn" type="button" onClick={removeSelected}>supprimer</button>
            </>
          )}
        </div>
      )}

      <p className="tb-hint chr__muted">
        {charName} · molette pour zoomer, glisser le fond pour naviguer, majuscule+clic pour sélection multiple, ⌫ pour supprimer.
      </p>
    </div>
  );
}
