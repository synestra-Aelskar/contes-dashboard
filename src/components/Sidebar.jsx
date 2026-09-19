import { useState } from 'react';
import { lsGet, lsSet } from '../lib/util.js';
import { VIEW_LABEL } from '../lib/menu.js';
import SidebarIcon, { ChevronIcon, hasIcon } from './SidebarIcons.jsx';

function initials(label) {
  const words = (label || '').split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join('') || (label || '').slice(0, 2)).toUpperCase();
}

/** Icône de la vue, ou ses initiales dans une pastille quand elle n'en a pas. */
function Glyph({ viewKey, label }) {
  if (hasIcon(viewKey)) return <SidebarIcon name={viewKey} />;
  return <span className="sidebar__initials" aria-hidden="true">{initials(label)}</span>;
}

function ViewItem({ node, depth, active, onSelect, compact }) {
  const label = VIEW_LABEL[node.viewKey] || node.viewKey;
  return (
    <button
      type="button"
      className={'sidebar__item' + (active ? ' is-active' : '')}
      style={compact ? undefined : { paddingLeft: 10 + depth * 14 }}
      onClick={() => onSelect(node.viewKey)}
      data-label={label}
      aria-label={label}
    >
      <Glyph viewKey={node.viewKey} label={label} />
      <span className="sidebar__label">{label}</span>
    </button>
  );
}

function GroupItem({ node, depth, view, onSelect, compact, openMap, toggleOpen }) {
  const isOpen = compact || openMap[node.id] !== false;
  return (
    <div className={'sidebar__group' + (compact ? ' sidebar__group--rail' : '')}>
      {compact ? (
        // Rail : le groupe devient une fine césure légendée par ses initiales.
        <div className="sidebar__rule" data-label={node.name} aria-label={node.name}>
          <span>{initials(node.name)}</span>
        </div>
      ) : (
        <button
          type="button" className="sidebar__grouphead"
          style={{ paddingLeft: 10 + depth * 14 }}
          onClick={() => toggleOpen(node.id)}
          aria-expanded={isOpen}
        >
          <span className={'sidebar__chev' + (isOpen ? ' is-open' : '')}><ChevronIcon dir="right" size={11} /></span>
          <span className="sidebar__groupname">{node.name}</span>
        </button>
      )}
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
    <nav className={'sidebar' + (compact ? ' is-compact' : '')} aria-label="Navigation">
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
              data-label={it.label}
              aria-label={it.label}
            >
              <Glyph viewKey={it.key} label={it.label} />
              <span className="sidebar__label">{it.label}</span>
            </button>
          ))}
        </div>
      )}
      <button
        className="sidebar__toggle" type="button" onClick={toggleCompact}
        data-label={compact ? 'Déplier le menu' : 'Réduire le menu'}
        aria-label={compact ? 'Déplier le menu' : 'Réduire le menu'}
      >
        <ChevronIcon dir={compact ? 'right' : 'left'} size={13} />
        <span className="sidebar__label">Réduire</span>
      </button>
    </nav>
  );
}
