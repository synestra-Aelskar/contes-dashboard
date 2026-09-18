import { useState } from 'react';
import { lsGet, lsSet } from '../lib/util.js';
import { VIEW_LABEL } from '../lib/menu.js';

function abbrev(label) {
  const words = (label || '').split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join('') || (label || '').slice(0, 2)).toUpperCase();
}

function ViewItem({ node, depth, active, onSelect, compact }) {
  const label = VIEW_LABEL[node.viewKey] || node.viewKey;
  return (
    <button
      type="button"
      className={'sidebar__item' + (active ? ' is-active' : '')}
      style={{ paddingLeft: compact ? undefined : 10 + depth * 14 }}
      onClick={() => onSelect(node.viewKey)}
      title={label}
    >
      {compact ? abbrev(label) : label}
    </button>
  );
}

function GroupItem({ node, depth, view, onSelect, compact, openMap, toggleOpen }) {
  const isOpen = openMap[node.id] !== false;
  return (
    <div className="sidebar__group">
      <button
        type="button" className="sidebar__grouphead"
        style={{ paddingLeft: compact ? undefined : 10 + depth * 14 }}
        onClick={() => toggleOpen(node.id)}
        title={node.name}
      >
        <span className="sidebar__chev">{isOpen ? '▾' : '▸'}</span>
        {!compact && <span className="sidebar__groupname">{node.name}</span>}
      </button>
      {isOpen && (node.children || []).map((c) => (
        c.type === 'view'
          ? <ViewItem key={c.id} node={c} depth={depth + 1} active={view === c.viewKey} onSelect={onSelect} compact={compact} />
          : <GroupItem key={c.id} node={c} depth={depth + 1} view={view} onSelect={onSelect} compact={compact} openMap={openMap} toggleOpen={toggleOpen} />
      ))}
    </div>
  );
}

export default function Sidebar({ tree, view, setView, footerItems }) {
  const [compact, setCompact] = useState(lsGet('ccm.sidebarCompact') === '1');
  const [openMap, setOpenMap] = useState({});
  const toggleOpen = (id) => setOpenMap((m) => ({ ...m, [id]: m[id] === false ? true : false }));

  function toggleCompact() {
    const v = !compact;
    setCompact(v);
    lsSet('ccm.sidebarCompact', v ? '1' : '0');
  }

  return (
    <nav className={'sidebar' + (compact ? ' is-compact' : '')}>
      <button
        className="sidebar__toggle" type="button" onClick={toggleCompact}
        title={compact ? 'Déplier le menu' : 'Compacter le menu'}
      >
        {compact ? '›' : '‹'}
      </button>
      <div className="sidebar__items">
        {tree.map((n) => (
          n.type === 'view'
            ? <ViewItem key={n.id} node={n} depth={0} active={view === n.viewKey} onSelect={setView} compact={compact} />
            : <GroupItem key={n.id} node={n} depth={0} view={view} onSelect={setView} compact={compact} openMap={openMap} toggleOpen={toggleOpen} />
        ))}
      </div>
      {footerItems && footerItems.length > 0 && (
        <div className="sidebar__footer">
          {footerItems.map((it) => (
            <button
              key={it.key} type="button"
              className={'sidebar__item sidebar__item--action' + (it.active ? ' is-active' : '')}
              onClick={it.onClick}
              title={it.label}
            >
              {compact ? abbrev(it.label) : it.label}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
