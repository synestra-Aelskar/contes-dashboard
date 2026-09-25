import { useEffect, useMemo, useRef, useState } from 'react';
import { uid, lsGet, lsSet } from '../lib/util.js';
import { uploadScreenshot } from '../lib/board.js';
import { toast } from '../lib/toast.js';
import { useSyncedField } from '../lib/useSyncedField.js';
import { getUiScale, applyUiScale } from '../lib/prefs.js';

/**
 * Tableau blanc infini (façon Miro) : canvas pannable/zoomable, éléments
 * texte/note/forme/image/dessin libre, connexions qui suivent leurs
 * éléments, sélection multiple, verrouillage, ordre d'affichage.
 *
 * Contrôles : clic gauche = sélectionner/déplacer/dessiner selon l'outil ;
 * clic gauche sur le fond (outil sélection) = cadre de sélection groupée ;
 * clic droit + glisser sur le fond = déplacer la caméra, quel que soit
 * l'outil actif ; clic droit sur un élément = menu contextuel.
 *
 * Choix d'implémentation :
 * - Le glisser reste en aperçu LOCAL et n'écrit dans l'état partagé qu'au
 *   relâchement (perf) — mais la valeur « live » est portée par la ref de
 *   glissement elle-même (pas par le state React) pour que le relâchement
 *   lise toujours la dernière position, jamais une valeur obsolète.
 * - Le redimensionnement n'est pas conscient de la rotation courante.
 * - Les connexions relient le centre des éléments.
 * - Le plan (z) est un rang CONTIGU 1..N parmi tous les éléments.
 */

const COLORS = ['#e7c873', '#e69a6b', '#8fb99b', '#7fa8c9', '#b58fc0', '#e8e2d6', '#c96a6a', '#6a6a6a'];
const MIN_SIZE = 40;
const FONTS = [
  ['', 'Spectral', "'Spectral', Georgia, serif"],
  ['display', 'Cormorant Garamond', "'Cormorant Garamond', Georgia, serif"],
  ['mono', 'IBM Plex Mono', "'IBM Plex Mono', monospace"],
  ['sans', 'Sans-serif', 'system-ui, sans-serif']
];
const FONT_STACK = Object.fromEntries(FONTS.map(([k, , stack]) => [k, stack]));

/** `tool` est l'outil choisi dans la barre, `kind` la famille d'élément qui
 * en découle ('shape' pour rect/ellipse). */
const emptyElement = (tool, x, y, author) => {
  const kind = tool === 'rect' || tool === 'ellipse' ? 'shape' : tool;
  const now = new Date().toISOString();
  return {
    id: uid(), kind, x, y,
    w: kind === 'note' ? 180 : kind === 'image' ? 280 : kind === 'text' ? 220 : 160,
    h: kind === 'note' ? 140 : kind === 'image' ? 180 : kind === 'text' ? 44 : 100,
    rot: 0, z: 0, locked: false, text: '', color: COLORS[0], url: '', font: '',
    shape: tool === 'ellipse' ? 'ellipse' : 'rect', points: [],
    strokeWidth: 3, dashed: false, dashGap: 8,
    createdBy: author.id, createdByName: author.name, createdAt: now,
    updatedBy: author.id, updatedByName: author.name, updatedAt: now
  };
};

function renormalizeZ(elements) {
  elements.slice().sort((a, b) => a.z - b.z).forEach((e, i) => { e.z = i + 1; });
}
function reorderZ(elements, id, targetRank) {
  const sorted = elements.slice().sort((a, b) => a.z - b.z);
  const idx = sorted.findIndex((e) => e.id === id);
  if (idx < 0) return;
  const [item] = sorted.splice(idx, 1);
  const clamped = Math.max(1, Math.min(targetRank, sorted.length + 1));
  sorted.splice(clamped - 1, 0, item);
  sorted.forEach((e, i) => { e.z = i + 1; });
}
function rankOf(elements, id) {
  const sorted = elements.slice().sort((a, b) => a.z - b.z);
  return sorted.findIndex((e) => e.id === id) + 1;
}

/* ------------------------------- éléments -------------------------------- */

function strokeDash(el) {
  if (!el.dashed) return undefined;
  const g = Math.max(1, el.dashGap || 8);
  return `${g * 1.6} ${g}`;
}

function ElementBox({ el, selected, onDown, onContext, editing, onStartEdit, onStopEdit, onTextChange }) {
  const title = `Créé par ${el.createdByName || '?'}${el.updatedByName && el.updatedByName !== el.createdByName ? ` · modifié par ${el.updatedByName}` : ''}`;
  return (
    <div
      id={'tb-el-' + el.id}
      title={title}
      onMouseDown={(e) => onDown(e, el)}
      onContextMenu={(e) => onContext(e, el)}
      onDoubleClick={(e) => { e.stopPropagation(); if (el.kind === 'text' || el.kind === 'note') onStartEdit(el.id); }}
      style={{
        position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h,
        transform: `rotate(${el.rot || 0}deg)`, transformOrigin: '50% 50%',
        zIndex: el.z, cursor: el.locked ? 'default' : 'move',
        outline: selected ? '2px solid #c9a05a' : 'none', outlineOffset: 2,
        userSelect: 'none'
      }}
    >
      <ElementVisual el={el} />
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
            font: 'inherit', color: 'inherit', fontFamily: FONT_STACK[el.font] || FONT_STACK[''], fontSize: 14, lineHeight: 1.4
          }}
        />
      )}
    </div>
  );
}

function ElementVisual({ el }) {
  const fontFamily = FONT_STACK[el.font] || FONT_STACK[''];
  if (el.kind === 'note') {
    return (
      <div style={{ width: '100%', height: '100%', background: el.color || COLORS[0], color: '#221c10', padding: 12, borderRadius: 3, boxShadow: '0 6px 18px rgba(0,0,0,.35)', fontFamily, fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap', overflow: 'hidden' }}>
        {el.text}
      </div>
    );
  }
  if (el.kind === 'text') {
    return (
      <div style={{ width: '100%', height: '100%', color: '#e8e2d6', padding: 4, fontFamily, fontSize: 16, lineHeight: 1.4, whiteSpace: 'pre-wrap', overflow: 'hidden' }}>
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
        IMAGE — clic droit › Lien, ou colle une image (Ctrl+V)
      </div>
    );
  }
  if (el.kind === 'draw') {
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${Math.max(el.w, 1)} ${Math.max(el.h, 1)}`} style={{ display: 'block', overflow: 'visible' }}>
        <polyline
          points={(el.points || []).map((p) => p.join(',')).join(' ')} fill="none"
          stroke={el.color || COLORS[0]} strokeWidth={el.strokeWidth || 3} strokeDasharray={strokeDash(el)}
          strokeLinecap="round" strokeLinejoin="round"
        />
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

/* ------------------------------- menu contextuel -------------------------- */

function ContextMenu({ menu, onClose, actions }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const x = Math.min(menu.x, window.innerWidth - 220);
  const y = Math.min(menu.y, window.innerHeight - 20);

  return (
    <div ref={ref} className="tb-ctxmenu" style={{ left: x, top: y }} onContextMenu={(e) => e.preventDefault()}>
      {menu.kind === 'connection' ? (
        <>
          <button type="button" onClick={() => { actions.toggleConnKind(); onClose(); }}>Basculer flèche/ligne</button>
          <button type="button" className="tb-ctxmenu__danger" onClick={() => { actions.deleteConn(); onClose(); }}>Supprimer</button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => { actions.duplicate(); onClose(); }}>Dupliquer</button>
          <button type="button" onClick={() => { actions.toggleLock(); onClose(); }}>{menu.allLocked ? 'Déverrouiller' : 'Verrouiller'}</button>
          <div className="tb-ctxmenu__sep" />
          <button type="button" onClick={() => { actions.order('front'); onClose(); }}>Premier plan</button>
          <button type="button" onClick={() => { actions.order('up'); onClose(); }}>Monter</button>
          <button type="button" onClick={() => { actions.order('choose'); onClose(); }}>Choisir le plan…</button>
          <button type="button" onClick={() => { actions.order('down'); onClose(); }}>Descendre</button>
          <button type="button" onClick={() => { actions.order('back'); onClose(); }}>Dernier plan</button>
          {menu.canColor && (
            <>
              <div className="tb-ctxmenu__sep" />
              <label className="tb-ctxmenu__row">
                Couleur
                <input type="color" defaultValue={menu.color || '#e7c873'} onChange={(e) => actions.setColor(e.target.value)} />
              </label>
              <span className="tb-ctxmenu__swrow">
                {COLORS.map((c) => (
                  <button key={c} type="button" className="tb-swatch" style={{ background: c }} onClick={() => { actions.setColor(c); onClose(); }} aria-label={'couleur ' + c} />
                ))}
              </span>
            </>
          )}
          {menu.canFont && (
            <label className="tb-ctxmenu__row">
              Police
              <select defaultValue={menu.font || ''} onChange={(e) => { actions.setFont(e.target.value); onClose(); }}>
                {FONTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
          )}
          <div className="tb-ctxmenu__sep" />
          <button type="button" className="tb-ctxmenu__danger" onClick={() => { actions.remove(); onClose(); }}>Supprimer</button>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const TOOLS = [
  ['select', '↖'], ['text', 'T'], ['note', '▤'], ['rect', '▭'], ['ellipse', '◯'], ['image', '🖼'], ['draw', '✎'], ['connect', '↗']
];

export default function TableauCanvas({ tableau, mutate, onBack, charId, charName }) {
  const author = { id: charId, name: charName };
  const [titre, setTitre, titreRef] = useSyncedField(tableau.titre);
  const [tool, setTool] = useState('select');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [selectedConnId, setSelectedConnId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [drawColor, setDrawColor] = useState(COLORS[0]);
  const [drawWidth, setDrawWidth] = useState(3);
  const [drawDashed, setDrawDashed] = useState(false);
  const [drawGap, setDrawGap] = useState(8);
  const [camera, setCamera] = useState(() => {
    try { return JSON.parse(lsGet('ccm.tabCam.' + tableau.id) || '') || { x: 200, y: 120, zoom: 1 }; }
    catch (_) { return { x: 200, y: 120, zoom: 1 }; }
  });
  const [preview, setPreview] = useState(null); // { [elId]: {x,y,w,h,rot} } pendant un glisser — pour l'AFFICHAGE
  const [marquee, setMarquee] = useState(null); // {x0,y0,x1,y1} en coord monde
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, kind, ids }
  const connectFromRef = useRef(null);
  const viewportRef = useRef(null);
  const dragRef = useRef(null);
  const clipboardRef = useRef(null); // éléments copiés (Ctrl+C)
  const lastWorldRef = useRef({ x: 0, y: 0 }); // dernière position souris connue, en coord monde

  useEffect(() => { lsSet('ccm.tabCam.' + tableau.id, JSON.stringify(camera)); }, [camera, tableau.id]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Le canvas a besoin de coordonnées souris pixel-perfect ; le `zoom` CSS
    // (préférence Taille d'affichage) déforme MouseEvent.clientX/Y sous un
    // élément `position:fixed` dans certaines versions de Chromium — c'est
    // ce qui causait le décalage du cadre de sélection et du menu clic
    // droit. On neutralise le zoom pendant que le tableau est ouvert, et on
    // restaure la préférence de l'utilisateur en sortant.
    document.documentElement.style.zoom = '1';
    return () => {
      document.body.style.overflow = prev;
      applyUiScale(getUiScale());
    };
  }, []);

  const elements = useMemo(() => (tableau.elements || []).map((e) => (preview && preview[e.id] ? { ...e, ...preview[e.id] } : e)), [tableau.elements, preview]);
  const connections = tableau.connections || [];

  const patchBoard = (fn) => mutate((s) => { const t = s.tableaux.find((x) => x.id === tableau.id); if (t) fn(t); });
  const patchElements = (ids, fn) => patchBoard((t) => {
    t.elements.forEach((e) => {
      if (ids.has(e.id)) { fn(e); e.updatedBy = charId; e.updatedByName = charName; e.updatedAt = new Date().toISOString(); }
    });
  });

  function toWorld(clientX, clientY) {
    const rect = viewportRef.current.getBoundingClientRect();
    return [(clientX - rect.left - camera.x) / camera.zoom, (clientY - rect.top - camera.y) / camera.zoom];
  }

  /* ---- création d'éléments ---- */
  function placeElement(placedTool, wx, wy) {
    const el = emptyElement(placedTool, wx - 80, wy - 50, author);
    el.z = (tableau.elements || []).length + 1;
    if (el.kind === 'note') el.color = drawColor;
    patchBoard((t) => { t.elements.push(el); });
    setSelectedIds(new Set([el.id]));
    setTool('select');
    if (el.kind === 'text' || el.kind === 'note') setTimeout(() => setEditingId(el.id), 30);
  }

  /* ---- pan / zoom / marquee / draw sur le fond ---- */
  function onBackgroundMouseDown(e) {
    if (e.target !== e.currentTarget && e.target.id !== 'tb-world') return;
    if (e.button === 2) {
      e.preventDefault();
      dragRef.current = { kind: 'pan', startClient: { x: e.clientX, y: e.clientY }, startCam: camera };
      window.addEventListener('mousemove', onWindowMouseMove);
      window.addEventListener('mouseup', onWindowMouseUp);
      return;
    }
    if (e.button !== 0) return;
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    setCtxMenu(null);

    if (tool === 'select') {
      if (!e.shiftKey) { setSelectedIds(new Set()); setSelectedConnId(null); }
      dragRef.current = { kind: 'marquee', start: { x: wx, y: wy } };
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
      const el = emptyElement('draw', wx, wy, author);
      el.z = (tableau.elements || []).length + 1;
      el.color = drawColor; el.strokeWidth = drawWidth; el.dashed = drawDashed; el.dashGap = drawGap;
      el.w = 1; el.h = 1; el.points = [[0, 0]];
      dragRef.current = { kind: 'draw', el, origin: { x: wx, y: wy }, live: null };
      setPreview({ [el.id]: el });
      setSelectedIds(new Set());
      window.addEventListener('mousemove', onWindowMouseMove);
      window.addEventListener('mouseup', onWindowMouseUp);
      return;
    }
    // outil connecter : clic sur le fond = rien (le clic droit gère déjà le pan)
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
      d.live = { x0: d.start.x, y0: d.start.y, x1: wx, y1: wy };
      setMarquee(d.live);
      return;
    }
    if (d.kind === 'draw') {
      const [wx, wy] = toWorld(e.clientX, e.clientY);
      const ox = d.origin.x, oy = d.origin.y;
      d.el.points.push([wx - ox, wy - oy]);
      const xs = d.el.points.map((p) => p[0]), ys = d.el.points.map((p) => p[1]);
      const minX = Math.min(0, ...xs), maxX = Math.max(0, ...xs), minY = Math.min(0, ...ys), maxY = Math.max(0, ...ys);
      const shifted = d.el.points.map((p) => [p[0] - minX, p[1] - minY]);
      const live = { ...d.el, x: ox + minX, y: oy + minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY), points: shifted };
      d.live = live;
      setPreview({ [d.el.id]: live });
      return;
    }
    if (d.kind === 'move') {
      const [wx, wy] = toWorld(e.clientX, e.clientY);
      const dx = wx - d.startWorld.x, dy = wy - d.startWorld.y;
      const next = {};
      d.ids.forEach((id) => { const o = d.origin[id]; next[id] = { x: o.x + dx, y: o.y + dy }; });
      d.live = next;
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
      d.live = { [d.id]: { x, y, w, h } };
      setPreview(d.live);
      return;
    }
    if (d.kind === 'rotate') {
      const rect = viewportRef.current.getBoundingClientRect();
      const cx = rect.left + camera.x + (d.origin.x + d.origin.w / 2) * camera.zoom;
      const cy = rect.top + camera.y + (d.origin.y + d.origin.h / 2) * camera.zoom;
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90;
      d.live = { [d.id]: { rot: Math.round(angle) } };
      setPreview(d.live);
    }
  }

  function onWindowMouseUp() {
    const d = dragRef.current;
    dragRef.current = null;
    window.removeEventListener('mousemove', onWindowMouseMove);
    window.removeEventListener('mouseup', onWindowMouseUp);
    if (!d) return;

    if (d.kind === 'pan') return;

    if (d.kind === 'marquee') {
      setMarquee(null);
      const m = d.live;
      if (m) {
        const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1), y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1);
        const hit = (tableau.elements || []).filter((e) => e.x < x1 && e.x + e.w > x0 && e.y < y1 && e.y + e.h > y0).map((e) => e.id);
        if (hit.length) setSelectedIds((prev) => new Set([...prev, ...hit]));
      }
      return;
    }
    if (d.kind === 'draw') {
      setPreview(null);
      const el = d.live;
      if (el && el.points.length > 1) {
        patchBoard((t) => { t.elements.push(el); });
      }
      setTool('select');
      return;
    }
    if (d.kind === 'move') {
      setPreview(null);
      const snap = d.live;
      if (snap) {
        patchBoard((t) => {
          Object.entries(snap).forEach(([id, pos]) => {
            const e = t.elements.find((x) => x.id === id);
            if (e) { e.x = pos.x; e.y = pos.y; e.updatedBy = charId; e.updatedByName = charName; e.updatedAt = new Date().toISOString(); }
          });
        });
      }
      return;
    }
    if (d.kind === 'resize' || d.kind === 'rotate') {
      setPreview(null);
      const snap = d.live;
      if (snap && snap[d.id]) {
        patchBoard((t) => {
          const e = t.elements.find((x) => x.id === d.id);
          if (e) { Object.assign(e, snap[d.id]); e.updatedBy = charId; e.updatedByName = charName; e.updatedAt = new Date().toISOString(); }
        });
      }
    }
  }

  /* ---- interactions élément ---- */
  function onElementMouseDown(e, el) {
    e.stopPropagation();
    if (e.button === 2) return; // géré par onContextMenu
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
    dragRef.current = { kind: 'move', ids: Array.from(ids), startWorld: { x: wx, y: wy }, origin, live: null };
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
  }

  function onElementContextMenu(e, el) {
    e.preventDefault();
    e.stopPropagation();
    const ids = selectedIds.has(el.id) && selectedIds.size > 1 ? selectedIds : new Set([el.id]);
    setSelectedIds(ids);
    setSelectedConnId(null);
    const els = (tableau.elements || []).filter((x) => ids.has(x.id));
    setCtxMenu({
      x: e.clientX, y: e.clientY, kind: 'element', ids,
      allLocked: els.every((x) => x.locked),
      canColor: els.some((x) => ['note', 'shape', 'draw'].includes(x.kind)),
      canFont: els.some((x) => ['text', 'note'].includes(x.kind)),
      color: els[0] && els[0].color, font: els[0] && els[0].font
    });
  }
  function onConnectionContextMenu(e, connId) {
    e.preventDefault();
    setSelectedConnId(connId);
    setSelectedIds(new Set());
    setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'connection', connId });
  }

  function onResizeStart(e, el, handle) {
    if (el.locked) return;
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    dragRef.current = { kind: 'resize', id: el.id, handle, startWorld: { x: wx, y: wy }, origin: { x: el.x, y: el.y, w: el.w, h: el.h }, live: null };
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
  }
  function onRotateStart(e, el) {
    if (el.locked) return;
    dragRef.current = { kind: 'rotate', id: el.id, origin: { x: el.x, y: el.y, w: el.w, h: el.h }, live: null };
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

  function onCanvasMouseMoveTrack(e) {
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    lastWorldRef.current = { x: wx, y: wy };
  }

  /* ---- actions sur la sélection ---- */
  function removeSelected() {
    if (!selectedIds.size) return;
    patchBoard((t) => {
      t.elements = t.elements.filter((e) => !selectedIds.has(e.id));
      t.connections = t.connections.filter((c) => !selectedIds.has(c.fromId) && !selectedIds.has(c.toId));
      renormalizeZ(t.elements);
    });
    setSelectedIds(new Set());
  }
  function duplicateIds(ids, atWorld) {
    const newIds = new Set();
    patchBoard((t) => {
      const srcList = t.elements.filter((e) => ids.has(e.id));
      if (!srcList.length) return;
      const minX = Math.min(...srcList.map((e) => e.x)), minY = Math.min(...srcList.map((e) => e.y));
      const now = new Date().toISOString();
      srcList.forEach((src) => {
        const copy = {
          ...src, id: uid(),
          x: atWorld ? atWorld.x + (src.x - minX) : src.x + 24,
          y: atWorld ? atWorld.y + (src.y - minY) : src.y + 24,
          z: t.elements.length + 1,
          createdBy: charId, createdByName: charName, createdAt: now,
          updatedBy: charId, updatedByName: charName, updatedAt: now
        };
        t.elements.push(copy);
        newIds.add(copy.id);
      });
    });
    setSelectedIds(newIds);
  }
  function duplicateSelected() { if (selectedIds.size) duplicateIds(selectedIds, null); }
  function toggleLockSelected() {
    const allLocked = (tableau.elements || []).filter((e) => selectedIds.has(e.id)).every((e) => e.locked);
    patchElements(selectedIds, (e) => { e.locked = !allLocked; });
  }
  function orderSelected(dir) {
    if (selectedIds.size !== 1) return;
    const id = Array.from(selectedIds)[0];
    if (dir === 'choose') {
      const current = rankOf(tableau.elements || [], id);
      const input = window.prompt('Plan (1 = arrière-plan, ' + (tableau.elements || []).length + ' = premier plan) :', String(current));
      const target = parseInt(input, 10);
      if (!Number.isFinite(target)) return;
      patchBoard((t) => { reorderZ(t.elements, id, target); });
      return;
    }
    patchBoard((t) => {
      const total = t.elements.length;
      const current = rankOf(t.elements, id);
      const target = dir === 'front' ? total : dir === 'back' ? 1 : dir === 'up' ? current + 1 : current - 1;
      reorderZ(t.elements, id, target);
    });
  }
  function setColorSelected(color) { setDrawColor(color); patchElements(selectedIds, (e) => { e.color = color; }); }
  function setFontSelected(font) { patchElements(selectedIds, (e) => { e.font = font; }); }
  function setUrlSelected(url) { patchElements(selectedIds, (e) => { if (e.kind === 'image') e.url = url; }); }
  function handleTextChange(id, text) { patchElements(new Set([id]), (e) => { e.text = text; }); }

  /* ---- copier/coller éléments (Ctrl+C / Ctrl+V), coller une image (presse-papiers OS) ---- */
  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'c' && selectedIds.size) {
        clipboardRef.current = (tableau.elements || []).filter((el) => selectedIds.has(el.id)).map((el) => ({ ...el }));
        toast('Élément' + (selectedIds.size > 1 ? 's' : '') + ' copié' + (selectedIds.size > 1 ? 's' : ''));
      } else if (mod && e.key.toLowerCase() === 'v' && clipboardRef.current && clipboardRef.current.length) {
        e.preventDefault();
        const ids = new Set(clipboardRef.current.map((el) => el.id));
        patchBoard((t) => {
          const minX = Math.min(...clipboardRef.current.map((e2) => e2.x)), minY = Math.min(...clipboardRef.current.map((e2) => e2.y));
          const now = new Date().toISOString();
          const newIds = new Set();
          clipboardRef.current.forEach((src) => {
            const copy = {
              ...src, id: uid(),
              x: lastWorldRef.current.x + (src.x - minX), y: lastWorldRef.current.y + (src.y - minY),
              z: t.elements.length + 1,
              createdBy: charId, createdByName: charName, createdAt: now,
              updatedBy: charId, updatedByName: charName, updatedAt: now
            };
            t.elements.push(copy);
            newIds.add(copy.id);
          });
          setSelectedIds(newIds);
        });
        void ids;
      } else if (e.key === 'Escape') {
        onBack();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size) {
        e.preventDefault();
        removeSelected();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }); // pas de tableau de dépendances : on veut toujours la dernière sélection/presse-papiers

  useEffect(() => {
    async function onPaste(ev) {
      const items = (ev.clipboardData && ev.clipboardData.items) || [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') === 0) {
          ev.preventDefault();
          try {
            const url = await uploadScreenshot(items[i].getAsFile());
            const singleImg = selectedIds.size === 1 && (tableau.elements || []).find((e) => selectedIds.has(e.id) && e.kind === 'image');
            if (singleImg) { setUrlSelected(url); }
            else {
              const el = emptyElement('image', lastWorldRef.current.x - 140, lastWorldRef.current.y - 90, author);
              el.url = url;
              el.z = (tableau.elements || []).length + 1;
              patchBoard((t) => { t.elements.push(el); });
              setSelectedIds(new Set([el.id]));
            }
          } catch (_) { toast('Image illisible / envoi impossible'); }
          return;
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }); // idem : toujours la dernière sélection

  const selectedEls = (tableau.elements || []).filter((e) => selectedIds.has(e.id));

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
        {tool === 'draw' && (
          <div className="tb-drawpanel">
            <span className="tb-swrow">
              {COLORS.map((c) => (
                <button key={c} type="button" className={'tb-swatch' + (drawColor === c ? ' is-active' : '')} style={{ background: c }} onClick={() => setDrawColor(c)} aria-label={'couleur ' + c} />
              ))}
              <input type="color" value={drawColor} onChange={(e) => setDrawColor(e.target.value)} title="Couleur libre" />
            </span>
            <label className="tb-drawpanel__field">
              taille
              <input type="range" min="1" max="16" value={drawWidth} onChange={(e) => setDrawWidth(Number(e.target.value))} />
            </label>
            <label className="tb-drawpanel__field">
              <input type="checkbox" checked={drawDashed} onChange={(e) => setDrawDashed(e.target.checked)} /> pointillé
            </label>
            {drawDashed && (
              <label className="tb-drawpanel__field">
                espacement
                <input type="range" min="2" max="30" value={drawGap} onChange={(e) => setDrawGap(Number(e.target.value))} />
              </label>
            )}
          </div>
        )}
        <div className="tb-zoom">
          <button className="tbtn" type="button" onClick={() => setCamera((c) => ({ ...c, zoom: Math.max(0.2, c.zoom * 0.85) }))}>−</button>
          <span className="chr__muted">{Math.round(camera.zoom * 100)}%</span>
          <button className="tbtn" type="button" onClick={() => setCamera((c) => ({ ...c, zoom: Math.min(2.5, c.zoom * 1.15) }))}>＋</button>
          <button className="tbtn" type="button" onClick={() => setCamera({ x: 200, y: 120, zoom: 1 })}>reset</button>
        </div>
      </div>

      <div
        ref={viewportRef} id="tb-viewport" className="tb-viewport"
        onMouseDown={onBackgroundMouseDown} onMouseMove={onCanvasMouseMoveTrack} onWheel={onWheel}
        onContextMenu={(e) => { if (e.target === e.currentTarget || e.target.id === 'tb-world') e.preventDefault(); }}
      >
        <div id="tb-world" style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`, transformOrigin: '0 0' }}>
          <ConnectionsSvg
            elements={elements} connections={connections} selectedConnId={selectedConnId}
            onSelectConn={(id) => { setSelectedConnId(id); setSelectedIds(new Set()); }}
          />
          {elements.slice().sort((a, b) => a.z - b.z).map((el) => (
            <ElementBox
              key={el.id} el={el} selected={selectedIds.has(el.id)}
              onDown={onElementMouseDown} onContext={onElementContextMenu}
              editing={editingId === el.id}
              onStartEdit={setEditingId}
              onStopEdit={() => setEditingId(null)}
              onTextChange={handleTextChange}
            >
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

      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          onClose={() => setCtxMenu(null)}
          actions={{
            duplicate: duplicateSelected,
            toggleLock: toggleLockSelected,
            order: orderSelected,
            setColor: setColorSelected,
            setFont: setFontSelected,
            remove: removeSelected,
            toggleConnKind: () => patchBoard((t) => { const c = t.connections.find((x) => x.id === selectedConnId); if (c) c.kind = c.kind === 'arrow' ? 'line' : 'arrow'; }),
            deleteConn: () => { patchBoard((t) => { t.connections = t.connections.filter((c) => c.id !== selectedConnId); }); setSelectedConnId(null); }
          }}
        />
      )}

      {selectedEls.length === 1 && selectedEls[0].kind === 'image' && (
        <div className="tb-imgpanel">
          <span className="chr__muted">Lien de l’image</span>
          <input
            className="field field--mono" type="text" placeholder="https://…" defaultValue={selectedEls[0].url}
            onBlur={(e) => setUrlSelected(e.target.value.trim())}
            style={{ width: 260 }}
          />
        </div>
      )}

      <p className="tb-hint chr__muted">
        {charName} · molette pour zoomer, clic droit + glisser pour naviguer, clic gauche + glisser (outil sélection) pour un cadre de sélection,
        majuscule+clic pour sélection multiple, clic droit sur un élément pour le menu, Ctrl+C/Ctrl+V pour dupliquer, ⌫ pour supprimer.
      </p>
    </div>
  );
}
