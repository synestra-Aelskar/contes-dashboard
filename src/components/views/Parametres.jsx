import { useEffect, useRef, useState } from 'react';
import { uid, fmtDateLong } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';
import { supabase } from '../../supabase';
import {
  ROLES, labelForNode, listContainers, moveViewToContainer, moveNodeToPosition, addCategory, addSubcategory,
  renameNode, setNodeVisibility, removeNode, moveSibling
} from '../../lib/menu.js';
import { PLAYER_EMAIL_DOMAIN } from '../../lib/playerAuth.js';

const TABS = [['ordremenu', 'Ordre menu'], ['temps', 'Temps'], ['comptes', 'Comptes']];

function TimeTypeRow({ row, mutate }) {
  const [name, setName, nameRef] = useSyncedField(row.name);
  const patch = (fn) =>
    mutate((s) => { const t = s.settings.timeTypes.find((x) => x.id === row.id); if (t) fn(t); });
  return (
    <div className="paramline">
      <input
        className="paramline__color" type="color" value={row.color || '#9a7330'}
        onChange={(e) => patch((t) => { t.color = e.target.value; })}
        aria-label="Couleur du type"
      />
      <input
        ref={nameRef} className="finput" type="text" placeholder="Nom du type (ex. Voyage, Repos, Enquête…)"
        value={name}
        onChange={(e) => { const v = e.target.value; setName(v); patch((t) => { t.name = v; }); }}
        onBlur={() => patch((t) => { t.name = name.trim(); })}
      />
      <button
        className="tbtn" type="button" aria-label="retirer ce type"
        onClick={() => mutate((s) => { s.settings.timeTypes = s.settings.timeTypes.filter((x) => x.id !== row.id); })}
      >
        ×
      </button>
    </div>
  );
}

function TempsPane({ state, mutate }) {
  const types = (state.settings && state.settings.timeTypes) || [];
  return (
    <div className="zone-pane">
      <div className="zone-pane__head">
        <span className="card__label">Temps</span>
      </div>
      <h3 className="ssn-h">Types d’évènement temporel</h3>
      <p className="dd-hint">
        Utilisés pour colorer les blocs de la barre de temps d’une séance (nom + couleur libre).
      </p>
      <div className="paramlist">
        {types.map((t) => <TimeTypeRow key={t.id} row={t} mutate={mutate} />)}
      </div>
      <button
        className="tbtn" type="button"
        onClick={() => mutate((s) => {
          s.settings = s.settings || { timeTypes: [] };
          s.settings.timeTypes = s.settings.timeTypes || [];
          s.settings.timeTypes.push({ id: uid(), name: '', color: '#9a7330' });
        })}
      >
        ＋ ajouter un type
      </button>
    </div>
  );
}

/** Appelle l'Edge Function generate-account-link (voir supabase/functions/) —
 * seul point d'accès à l'API admin Supabase (invite/recovery/list/delete),
 * la clé service_role restant entièrement côté fonction. */
async function callAccountsFn(body, retried = false) {
  const { data, error } = await supabase.functions.invoke('generate-account-link', { body });
  if (error) {
    const detail = error.context && typeof error.context.json === 'function'
      ? await error.context.json().catch(() => null)
      : null;
    const status = error.context && error.context.status;
    // Jeton périmé (onglet resté ouvert, mot de passe changé…) : on renouvelle
    // la session une fois avant de conclure « non authentifié ».
    if (status === 401 && !retried) {
      const { data: refreshed } = await supabase.auth.refreshSession().catch(() => ({ data: null }));
      if (refreshed && refreshed.session) return callAccountsFn(body, true);
      throw new Error('Session expirée — déconnecte-toi puis reconnecte-toi.');
    }
    throw new Error((detail && detail.error) || error.message || 'Échec de la requête.');
  }
  return data;
}

/** Lien à copier-coller — jamais persisté dans l'état partagé (il donne un
 * accès complet au compte visé), juste tenu en mémoire le temps de la copie. */
function CopyLink({ link }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="account__link">
      <input className="finput field--mono" type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
      <button
        className="tbtn" type="button"
        onClick={async () => {
          try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
          catch (_) { /* copie manuelle via le champ ci-dessus si l'API presse-papier est refusée */ }
        }}
      >
        {copied ? 'copié !' : 'copier'}
      </button>
    </div>
  );
}

function AccountRow({ user, mutate, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [link, setLink] = useState('');
  const [codeMode, setCodeMode] = useState(false);
  const [newCode, setNewCode] = useState('');
  const isAdmin = user.role === 'admin';
  const isPlayerAccount = user.role === 'player' && (user.email || '').endsWith(PLAYER_EMAIL_DOMAIN);

  async function resend() {
    setBusy(true);
    setMsg('');
    setLink('');
    try {
      const { link: newLink } = await callAccountsFn({ action: 'recovery', email: user.email });
      setLink(newLink || '');
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  }

  async function saveCode() {
    if (!newCode.trim()) return;
    setBusy(true);
    setMsg('');
    try {
      await callAccountsFn({ action: 'reset_player_code', userId: user.id, code: newCode.trim() });
      setMsg('Code mis à jour.');
      setCodeMode(false);
      setNewCode('');
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  }

  async function remove() {
    if (!window.confirm('Supprimer définitivement le compte « ' + (user.displayName || user.email) + ' » ? Cette action est irréversible.')) return;
    setBusy(true);
    setMsg('');
    try {
      await callAccountsFn({ action: 'delete', userId: user.id });
      mutate((s) => { s.settings.accounts = (s.settings.accounts || []).filter((a) => a.userId !== user.id); });
      onChanged();
    } catch (e) {
      setMsg(e.message);
      setBusy(false);
    }
  }

  return (
    <div className={'paramline--account' + (isAdmin ? ' paramline--account-admin' : '')}>
      <div className="paramline paramline--account-row">
        <div className="account__id">
          <span className="account__email">{isPlayerAccount ? (user.displayName || user.email) : user.email}</span>
          <span className="account__meta">
            {(ROLES.find((r) => r[0] === user.role) || [, user.role])[1]}
            {user.createdAt ? ' · créé le ' + fmtDateLong(user.createdAt.slice(0, 10)) : ''}
            {isAdmin && ' · rôle protégé'}
          </span>
          {msg && <span className="account__msg">{msg}</span>}
        </div>
        {isAdmin && (
          <button className="tbtn" type="button" disabled={busy} onClick={resend}>
            {busy ? '…' : 'générer un lien'}
          </button>
        )}
        {isPlayerAccount && !codeMode && (
          <button className="tbtn" type="button" onClick={() => setCodeMode(true)}>changer le code</button>
        )}
        {isPlayerAccount && codeMode && (
          <div className="account__codeedit">
            <input
              className="finput" type="text" placeholder="Nouveau code" value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
            />
            <button className="tbtn" type="button" disabled={busy} onClick={saveCode}>valider</button>
            <button className="tbtn" type="button" onClick={() => { setCodeMode(false); setNewCode(''); }}>annuler</button>
          </div>
        )}
        {isAdmin ? (
          <span className="account__locked" title="Compte admin : ni rôle ni compte modifiable depuis ce répertoire">🔒</span>
        ) : (
          <button className="tbtn" type="button" aria-label="supprimer le compte" disabled={busy} onClick={remove}>
            ×
          </button>
        )}
      </div>
      {link && <CopyLink link={link} />}
    </div>
  );
}

function ComptesPane({ state, mutate }) {
  const [users, setUsers] = useState(null); // null = chargement
  const [loadErr, setLoadErr] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [role, setRole] = useState('player');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [link, setLink] = useState('');

  async function refresh() {
    setLoadErr('');
    try {
      const { users: list } = await callAccountsFn({ action: 'list' });
      setUsers(list || []);
      // Synchronise le répertoire local (utilisé par le sommaire par compte
      // de la vue Personnages) avec la liste réelle — plus besoin de les
      // ajouter à la main : userId/role viennent toujours de Supabase.
      mutate((s) => {
        s.settings.accounts = s.settings.accounts || [];
        (list || []).forEach((u) => {
          const existing = s.settings.accounts.find((a) => a.userId === u.id || a.email === u.email);
          if (existing) {
            existing.userId = u.id; existing.email = u.email; existing.role = u.role;
            if (!existing.createdAt) existing.createdAt = u.createdAt.slice(0, 10);
          } else {
            s.settings.accounts.push({ id: uid(), email: u.email, role: u.role, label: '', userId: u.id, createdAt: u.createdAt.slice(0, 10) });
          }
        });
      });
    } catch (e) {
      setLoadErr(e.message);
      setUsers([]);
    }
  }

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createAccount(e) {
    e.preventDefault();
    setLink('');
    setBusy(true);
    setMsg('');

    if (role === 'player') {
      const cleanName = name.trim();
      const cleanCode = code.trim();
      if (!cleanName || !cleanCode) { setBusy(false); return; }
      try {
        await callAccountsFn({ action: 'create_player', name: cleanName, code: cleanCode });
        setMsg('Compte créé — donne-lui juste Nom « ' + cleanName + ' » et le code choisi pour se connecter.');
        setName(''); setCode('');
        await refresh();
      } catch (e2) {
        setMsg(e2.message);
      }
      setBusy(false);
      return;
    }

    const clean = email.trim();
    if (!clean) { setBusy(false); return; }
    try {
      const { link: newLink } = await callAccountsFn({ action: 'invite', email: clean, role });
      setLink(newLink || '');
      setMsg('Compte créé pour ' + clean + '.');
      setEmail('');
      await refresh();
    } catch (e2) {
      setMsg(e2.message);
    }
    setBusy(false);
  }

  return (
    <div className="zone-pane">
      <div className="zone-pane__head">
        <span className="card__label">Comptes</span>
      </div>
      <h3 className="ssn-h">Créer un compte</h3>
      <p className="dd-hint">
        Joueur : juste un Nom et un Code — pas d’email, rien à envoyer, donne-lui les deux directement.
        Admin : un email réel, avec un lien magique à copier-coller pour qu’il/elle choisisse son mot de passe.
      </p>
      <form className="account__form" onSubmit={createAccount}>
        <select className="field account__role" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {role === 'player' ? (
          <>
            <input
              className="finput" type="text" placeholder="Nom du joueur" required
              value={name} onChange={(e) => setName(e.target.value)}
            />
            <input
              className="finput" type="text" placeholder="Code" required
              value={code} onChange={(e) => setCode(e.target.value)}
            />
          </>
        ) : (
          <input
            className="finput" type="email" placeholder="email@exemple.com" required
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        )}
        <button className="tbtn" type="submit" disabled={busy}>
          {busy ? '…' : '＋ créer le compte'}
        </button>
      </form>
      {msg && <p className="dd-hint account__status">{msg}</p>}
      {link && <CopyLink link={link} />}

      <h3 className="ssn-h">Comptes existants</h3>
      {users === null ? (
        <p className="empty">Chargement…</p>
      ) : loadErr ? (
        <p className="dd-hint account__status">{loadErr}</p>
      ) : users.length ? (
        <div className="paramlist">
          {users.map((u) => <AccountRow key={u.id} user={u} mutate={mutate} onChanged={refresh} />)}
        </div>
      ) : (
        <p className="empty">Aucun compte pour l’instant.</p>
      )}
      <p className="dd-hint">
        Liste tirée en direct de Supabase (Authentication) — toujours à jour, rien à ajouter à la
        main. Chaque lien magique généré (comptes admin) est sensible : il n’est jamais enregistré,
        seulement affiché le temps de la copie. Le code d’un compte joueur, lui, n’est jamais
        affiché après coup — seulement au moment où tu le choisis ou le changes.
      </p>
    </div>
  );
}

function VisibilityEditor({ node, onSet }) {
  const custom = !!node.visibility;
  return (
    <div className="menuedit__vis">
      <select
        className="field menuedit__vissel"
        value={custom ? 'custom' : 'inherit'}
        onChange={(e) => onSet(e.target.value === 'custom' ? ['admin'] : null)}
      >
        <option value="inherit">Hérite</option>
        <option value="custom">Personnalisé</option>
      </select>
      {custom && ROLES.map(([v, l]) => (
        <label key={v} className="menuedit__vischk">
          <input
            type="checkbox"
            checked={node.visibility.includes(v)}
            onChange={(e) => {
              const next = e.target.checked
                ? [...node.visibility, v]
                : node.visibility.filter((r) => r !== v);
              onSet(next);
            }}
          />
          {l}
        </label>
      ))}
    </div>
  );
}

function DragHandle({ node, drag }) {
  return (
    <span
      className="menuedit__handle" title="Glisser pour réordonner"
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; drag.onStart(node.id); }}
      onDragEnd={drag.onEnd}
    >
      ⠿
    </span>
  );
}

/** Calcule la cible de dépose au survol : entre deux lignes (réordonne comme
 * frère), ou en plein milieu d'une catégorie/sous-catégorie (range dedans). */
function useDropTarget(node, containerId, index, drag) {
  const isGroup = node.type === 'category' || node.type === 'subcategory';
  const isOver = drag.overRow === node.id;
  return {
    className: isOver ? (drag.overMode === 'into' ? ' is-dragover-into' : ' is-dragover') : '',
    onDragOver: (e) => {
      if (!drag.draggedId || drag.draggedId === node.id) return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const relY = (e.clientY - rect.top) / rect.height;
      if (isGroup && relY > 0.25 && relY < 0.75) {
        drag.setOver(node.id, 'into', node.id, 0);
      } else {
        drag.setOver(node.id, 'sibling', containerId, relY < 0.5 ? index : index + 1);
      }
    },
    onDrop: (e) => { e.preventDefault(); drag.onDrop(); }
  };
}

function ViewNodeRow({ node, mutate, containers, depth, currentContainer, index, isFirst, isLast, drag, state }) {
  const label = labelForNode(node, state);
  const dz = useDropTarget(node, currentContainer, index, drag);
  return (
    <div className={'menuedit__row' + dz.className} style={{ marginLeft: depth * 18 }} onDragOver={dz.onDragOver} onDrop={dz.onDrop}>
      <span className="menuedit__chev" style={{ visibility: 'hidden' }} />
      <DragHandle node={node} drag={drag} />
      <div className="menuedit__reorder">
        <button className="tbtn" type="button" disabled={isFirst} onClick={() => mutate((s) => { s.settings.menu = moveSibling(s.settings.menu, node.id, -1); })}>▲</button>
        <button className="tbtn" type="button" disabled={isLast} onClick={() => mutate((s) => { s.settings.menu = moveSibling(s.settings.menu, node.id, 1); })}>▼</button>
      </div>
      <span className="menuedit__name">{label}</span>
      <select
        className="field menuedit__container"
        value={currentContainer || ''}
        onChange={(e) => mutate((s) => { s.settings.menu = moveViewToContainer(s.settings.menu, node.id, e.target.value || null); })}
      >
        <option value="">— racine —</option>
        {containers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <VisibilityEditor node={node} onSet={(roles) => mutate((s) => { s.settings.menu = setNodeVisibility(s.settings.menu, node.id, roles); })} />
    </div>
  );
}

function GroupNodeRow({ node, mutate, depth, containerId, index, isFirst, isLast, drag, open, onToggle, hasChildren }) {
  const [name, setName, nameRef] = useSyncedField(node.name);
  const patchName = (v) => mutate((s) => { s.settings.menu = renameNode(s.settings.menu, node.id, v); });
  const dz = useDropTarget(node, containerId, index, drag);
  return (
    <div
      className={'menuedit__row menuedit__row--' + node.type + dz.className}
      style={{ marginLeft: depth * 18 }}
      onDragOver={dz.onDragOver} onDrop={dz.onDrop}
    >
      <button
        type="button" className="menuedit__chev" onClick={onToggle}
        style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        aria-label={open ? 'replier' : 'déplier'}
      >
        {open ? '▾' : '▸'}
      </button>
      <DragHandle node={node} drag={drag} />
      <div className="menuedit__reorder">
        <button className="tbtn" type="button" disabled={isFirst} onClick={() => mutate((s) => { s.settings.menu = moveSibling(s.settings.menu, node.id, -1); })}>▲</button>
        <button className="tbtn" type="button" disabled={isLast} onClick={() => mutate((s) => { s.settings.menu = moveSibling(s.settings.menu, node.id, 1); })}>▼</button>
      </div>
      <input
        ref={nameRef} className="finput menuedit__nameinput" type="text"
        placeholder={node.type === 'category' ? 'Nom de la catégorie' : 'Nom de la sous-catégorie'}
        value={name}
        onChange={(e) => { const v = e.target.value; setName(v); patchName(v); }}
        onBlur={() => patchName(name.trim())}
      />
      <VisibilityEditor node={node} onSet={(roles) => mutate((s) => { s.settings.menu = setNodeVisibility(s.settings.menu, node.id, roles); })} />
      {node.type === 'category' && (
        <button
          className="tbtn" type="button"
          onClick={() => mutate((s) => { s.settings.menu = addSubcategory(s.settings.menu, node.id, 'Nouvelle sous-catégorie'); })}
        >
          ＋ sous-catégorie
        </button>
      )}
      <button
        className="tbtn" type="button" aria-label="supprimer"
        onClick={() => {
          if (!window.confirm('Supprimer « ' + (node.name || '') + ' » ? Son contenu remonte au niveau au-dessus.')) return;
          mutate((s) => { s.settings.menu = removeNode(s.settings.menu, node.id); });
        }}
      >
        ×
      </button>
    </div>
  );
}

function OrdreMenuPane({ state, mutate }) {
  const tree = state.settings.menu || [];
  const containers = listContainers(tree);
  const [draggedId, setDraggedId] = useState(null);
  const [overRow, setOverRow] = useState(null);
  const [overMode, setOverMode] = useState(null);
  const [openMap, setOpenMap] = useState({});
  const toggleOpen = (id) => setOpenMap((m) => ({ ...m, [id]: m[id] === false ? true : false }));
  const dropRef = useRef(null);

  const drag = {
    draggedId, overRow, overMode,
    onStart: (id) => setDraggedId(id),
    onEnd: () => { setDraggedId(null); setOverRow(null); setOverMode(null); },
    setOver: (rowId, mode, containerId, index) => {
      dropRef.current = { containerId, index };
      setOverRow(rowId);
      setOverMode(mode);
    },
    onDrop: () => {
      if (draggedId && dropRef.current) {
        const { containerId, index } = dropRef.current;
        mutate((s) => { s.settings.menu = moveNodeToPosition(s.settings.menu, draggedId, containerId, index); });
      }
      setDraggedId(null); setOverRow(null); setOverMode(null);
    }
  };

  function renderNodes(nodes, depth, containerId) {
    return nodes.map((n, i) => {
      const isFirst = i === 0, isLast = i === nodes.length - 1;
      if (n.type !== 'category' && n.type !== 'subcategory') {
        return (
          <ViewNodeRow
            key={n.id} node={n} mutate={mutate} containers={containers} depth={depth}
            currentContainer={containerId} index={i} isFirst={isFirst} isLast={isLast} drag={drag} state={state}
          />
        );
      }
      const hasChildren = !!(n.children && n.children.length);
      const isOpen = openMap[n.id] !== false;
      return (
        <div key={n.id}>
          <GroupNodeRow
            node={n} mutate={mutate} depth={depth} containerId={containerId} index={i} isFirst={isFirst} isLast={isLast} drag={drag}
            open={isOpen} onToggle={() => toggleOpen(n.id)} hasChildren={hasChildren}
          />
          {isOpen && hasChildren && renderNodes(n.children, depth + 1, n.id)}
        </div>
      );
    });
  }

  return (
    <div className="zone-pane">
      <div className="zone-pane__head">
        <span className="card__label">Ordre menu</span>
      </div>
      <h3 className="ssn-h">Organisation du menu</h3>
      <p className="dd-hint">
        Glisse ⠿ pour réordonner (ou dépose en plein sur une catégorie pour y ranger), regroupe en
        catégories/sous-catégories (« ranger dans »), et choisis qui voit quoi. Une visibilité
        définie sur une catégorie prend le pas sur ses sous-catégories et leurs vues ; une
        visibilité de sous-catégorie prend le pas sur ses vues.
      </p>
      <div className="menuedit">
        {renderNodes(tree, 0, null)}
      </div>
      <button
        className="tbtn" type="button"
        onClick={() => mutate((s) => { s.settings.menu = addCategory(s.settings.menu, 'Nouvelle catégorie'); })}
      >
        ＋ nouvelle catégorie
      </button>
    </div>
  );
}

export default function Parametres({ state, mutate }) {
  const [tab, setTab] = useState(TABS[0][0]);
  return (
    <section className="chapter">
      <div className="chapter__head"><h2>Paramètres</h2></div>
      <div className="zones">
        <div className="zone-tree">
          {TABS.map(([key, label]) => (
            <div key={key} className="zone-node">
              <div className={'zone-node__row' + (tab === key ? ' is-sel' : '')}>
                <span className="zone-node__chev" style={{ visibility: 'hidden' }} />
                <button className="zone-node__label" type="button" onClick={() => setTab(key)}>
                  {label}
                </button>
              </div>
            </div>
          ))}
        </div>
        {tab === 'ordremenu' && <OrdreMenuPane state={state} mutate={mutate} />}
        {tab === 'temps' && <TempsPane state={state} mutate={mutate} />}
        {tab === 'comptes' && <ComptesPane state={state} mutate={mutate} />}
      </div>
    </section>
  );
}
