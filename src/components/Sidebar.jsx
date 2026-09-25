import { useState } from 'react';
import { lsGet, lsSet } from '../lib/util.js';
import { routeKeyOf, labelForNode, groupContainsView } from '../lib/menu.js';
import SidebarIcon, { ChevronIcon, hasIcon } from './SidebarIcons.jsx';

function initials(label) {
  const words = (label || '').split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join('') || (label || '').slice(0, 2)).toUpperCase();
}

const isLeaf = (n) => n.type !== 'category' && n.type !== 'subcategory';

/** Icône de la vue, ou ses initiales dans une pastille quand elle n'en a pas. */
function Glyph({ iconKey, label }) {
  if (hasIcon(iconKey)) return <SidebarIcon name={iconKey} />;
  return <span className="sidebar__initials" aria-hidden="true">{initials(label)}</span>;
}

function ViewItem({ node, depth, active, onSelect, compact, badge, state }) {
  const label = labelForNode(node, state);
  const key = routeKeyOf(node);
  return (
    <button
      type="button"
      className={'sidebar__item' + (active ? ' is-active' : '')}
      style={compact ? undefined : { paddingLeft: 10 + depth * 14 }}
      onClick={() => onSelect(key)}
      data-label={label}
      aria-label={label}
    >
      <Glyph iconKey={node.type === 'view' ? node.viewKey : key} label={label} />
      <span className="sidebar__label">{label}</span>
      {badge > 0 && <span className="sidebar__badge">{badge}</span>}
    </button>
  );
}

function GroupItem({ node, depth, view, onSelect, compact, openMap, toggleOpen, badges, state }) {
  // Replié par défaut, sauf la catégorie qui contient la vue active — mais
  // un choix explicite de l'utilisateur (ouvert/fermé) prend toujours le pas.
  const explicit = openMap[node.id];
  const isOpen = compact || (explicit !== undefined ? explicit : groupContainsView(node, view));
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
          onClick={() => toggleOpen(node.id, isOpen)}
          aria-expanded={isOpen}
        >
          <span className={'sidebar__chev' + (isOpen ? ' is-open' : '')}><ChevronIcon dir="right" size={11} /></span>
          <span className="sidebar__groupname">{node.name}</span>
        </button>
      )}
      {isOpen && (node.children || []).map((c) => (
        isLeaf(c)
          ? <ViewItem key={c.id} node={c} depth={depth + 1} active={view === routeKeyOf(c)} onSelect={onSelect} compact={compact} badge={badges && badges[routeKeyOf(c)]} state={state} />
          : <GroupItem key={c.id} node={c} depth={depth + 1} view={view} onSelect={onSelect} compact={compact} openMap={openMap} toggleOpen={toggleOpen} badges={badges} state={state} />
      ))}
    </div>
  );
}

export default function Sidebar({ tree, view, setView, footerItems, topSlot, badges, state }) {
  const [compact, setCompact] = useState(() => {
    const v = lsGet('ccm.sidebarCompact');
    return v === null ? true : v === '1'; // replié par défaut tant que l'utilisateur n'a pas choisi
  });
  const [openMap, setOpenMap] = useState({});
  const toggleOpen = (id, current) => setOpenMap((m) => ({ ...m, [id]: !current }));

  function toggleCompact() {
    const v = !compact;
    setCompact(v);
    lsSet('ccm.sidebarCompact', v ? '1' : '0');
  }

  return (
    <nav className={'sidebar' + (compact ? ' is-compact' : '')} aria-label="Navigation">
      <button
        className="sidebar__toggle sidebar__toggle--top" type="button" onClick={toggleCompact}
        data-label={compact ? 'Déplier le menu' : 'Réduire le menu'}
        aria-label={compact ? 'Déplier le menu' : 'Réduire le menu'}
      >
        <ChevronIcon dir={compact ? 'right' : 'left'} size={13} />
        <span className="sidebar__label">Réduire</span>
      </button>
      {topSlot && <div className="sidebar__top">{topSlot}</div>}
      <div className="sidebar__items">
        {tree.map((n) => (
          isLeaf(n)
            ? <ViewItem key={n.id} node={n} depth={0} active={view === routeKeyOf(n)} onSelect={setView} compact={compact} badge={badges && badges[routeKeyOf(n)]} state={state} />
            : <GroupItem key={n.id} node={n} depth={0} view={view} onSelect={setView} compact={compact} openMap={openMap} toggleOpen={toggleOpen} badges={badges} state={state} />
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
              <Glyph iconKey={it.key} label={it.label} />
              <span className="sidebar__label">{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
